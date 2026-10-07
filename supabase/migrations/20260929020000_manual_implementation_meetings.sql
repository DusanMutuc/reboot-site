begin;

create table public.implementation_meeting_create_requests (
  request_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  note_id bigint not null references public.coaching_notes_base(id) on delete cascade,
  requested_date date not null,
  meeting_id bigint not null references public.meetings(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.implementation_meeting_create_requests enable row level security;
revoke all on public.implementation_meeting_create_requests from public,anon,authenticated,service_role;
comment on table public.implementation_meeting_create_requests is
  'Internal retry identities for date-only manual implementation meetings. Neither creates nor starts a meeting session.';

-- Manual creation and explicit Start meeting share precisely the same bounds.
create function public.implementation_cycle_bounds(_note_id bigint)
returns table(cycle_start date,cycle_end date) language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare
  _note public.coaching_notes_base%rowtype;
  _review public.business_reviews%rowtype;
begin
  select n.* into _note from public.coaching_notes_base n where n.id=_note_id and n.deleted_at is null;
  if not found then
    raise exception 'Choose an existing coaching cycle.' using errcode='22023';
  end if;
  select r.* into _review from public.business_reviews r
    where r.coaching_note_id=_note_id order by r.review_date desc,r.id desc limit 1;
  if found then
    cycle_start := _review.review_date;
    if exists(select 1 from public.meetings m where m.id=_review.meeting_id
      and regexp_replace(lower(coalesce(m.ghl_status,'')),'[\s_-]+','','g')
        in('cancelled','canceled','deleted','invalid','noshow')) then
      raise exception 'The Business Review for this cycle is cancelled.' using errcode='22023';
    end if;
    select min(r.review_date) into cycle_end
    from public.business_reviews r left join public.meetings m on m.id=r.meeting_id
    where r.user_id=_note.user_id and (r.review_date,r.id)>(_review.review_date,_review.id)
      and regexp_replace(lower(coalesce(m.ghl_status,'')),'[\s_-]+','','g')
        not in('cancelled','canceled','deleted','invalid','noshow');
  else
    select m.date into cycle_start from public.meetings m where m.id=_note.m2_meeting_id;
    cycle_start := coalesce(cycle_start,(_note.created_at at time zone 'America/Edmonton')::date);
    if exists(select 1 from public.meetings m where m.id=_note.m2_meeting_id
      and regexp_replace(lower(coalesce(m.ghl_status,'')),'[\s_-]+','','g')
        in('cancelled','canceled','deleted','invalid','noshow')) then
      raise exception 'The M2 meeting for this cycle is cancelled.' using errcode='22023';
    end if;
    select min(c.cycle_date) into cycle_end from (
      select coalesce(r.review_date,m.date,(n.created_at at time zone 'America/Edmonton')::date) cycle_date
      from public.coaching_notes_base n
      left join public.business_reviews r on r.coaching_note_id=n.id
      left join public.meetings m on m.id=coalesce(r.meeting_id,n.m2_meeting_id)
      where n.user_id=_note.user_id and n.deleted_at is null and n.id<>_note_id
        and regexp_replace(lower(coalesce(m.ghl_status,'')),'[\s_-]+','','g')
          not in('cancelled','canceled','deleted','invalid','noshow')
    ) c where c.cycle_date>cycle_start;
  end if;
  return next;
end;
$$;
revoke all on function public.implementation_cycle_bounds(bigint) from public,anon,authenticated,service_role;

create function public.create_implementation_meeting(_user_id uuid,_note_id bigint,_meeting_date date,_request_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare
  _actor uuid := auth.uid();
  _note public.coaching_notes_base%rowtype;
  _request public.implementation_meeting_create_requests%rowtype;
  _cycle_start date;
  _cycle_end date;
  _type_id bigint;
  _meeting_id bigint;
  _existing_date date;
  _candidates bigint[];
  _created boolean := false;
begin
  select n.* into _note from public.coaching_notes_base n where n.id=_note_id for update;
  if not found or not public.can_access_implementation_workspace(_note_id)
    or not public.can_access_member_coaching_notes(_user_id) then
    raise exception 'You do not have access to this implementation workspace.' using errcode='42501';
  end if;
  if _note.user_id<>_user_id then
    raise exception 'This shared cycle belongs to the linked member. Open that member to add its implementation meeting.' using errcode='22023';
  end if;
  if _request_id is null or _meeting_date is null or not isfinite(_meeting_date) then
    raise exception 'A meeting date and unique request ID are required.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('manual-implementation:'||_request_id::text,0));
  select r.* into _request from public.implementation_meeting_create_requests r where r.request_id=_request_id;
  if found then
    if _request.user_id<>_user_id or _request.note_id<>_note_id or _request.requested_date<>_meeting_date
      or _request.created_by is distinct from _actor then
      raise exception 'This meeting request ID has already been used. Please start a new request.' using errcode='22023';
    end if;
    select m.date into _existing_date from public.meetings m join public.meeting_types mt on mt.id=m.meeting_type_id
      where m.id=_request.meeting_id and mt.code='IMPLEMENTATION_MEETING'
        and regexp_replace(lower(coalesce(m.ghl_status,'')),'[\s_-]+','','g') not in('cancelled','canceled','deleted','invalid','noshow')
        and exists(select 1 from public.meeting_attendance_base a where a.meeting_id=m.id and a.user_id=_user_id)
      for share of m;
    if not found
      or exists(select 1 from public.implementation_meeting_sessions s
        where s.meeting_id=_request.meeting_id and s.user_id=_user_id and s.note_id<>_note_id) then
      raise exception 'The existing meeting changed. Reload the workspace before adding another meeting.' using errcode='40001';
    end if;
    if not exists(select 1 from public.implementation_meeting_sessions s
      where s.meeting_id=_request.meeting_id and s.user_id=_user_id and s.note_id=_note_id) then
      begin
        select b.cycle_start,b.cycle_end into _cycle_start,_cycle_end from public.implementation_cycle_bounds(_note_id) b;
      exception when sqlstate '22023' then
        raise exception 'The coaching cycle changed. Reload the workspace before adding another meeting.' using errcode='40001';
      end;
      if _existing_date<_cycle_start or (_cycle_end is not null and _existing_date>=_cycle_end) then
        raise exception 'The existing meeting moved outside this cycle. Reload the workspace before adding another meeting.' using errcode='40001';
      end if;
    end if;
    return jsonb_build_object('meeting_id',_request.meeting_id,'created',false);
  end if;

  select b.cycle_start,b.cycle_end into _cycle_start,_cycle_end from public.implementation_cycle_bounds(_note_id) b;
  if _meeting_date<_cycle_start or (_cycle_end is not null and _meeting_date>=_cycle_end) then
    raise exception 'Choose a meeting date within the selected coaching cycle.' using errcode='22023';
  end if;
  select mt.id into _type_id from public.meeting_types mt where mt.code='IMPLEMENTATION_MEETING' and mt.is_active;
  if _type_id is null then
    raise exception 'The active implementation meeting type is unavailable.' using errcode='22023';
  end if;

  -- Match the importer lock, so an arriving GHL appointment and a manual click
  -- cannot both create the same date-only recovery slot.
  perform pg_advisory_xact_lock(hashtextextended(_user_id::text||':'||_meeting_date::text||':implementation',0));
  select array_agg(candidate.id order by candidate.id) into _candidates from (
    select m.id from public.meetings m
    where m.meeting_type_id=_type_id and m.date=_meeting_date
      and regexp_replace(lower(coalesce(m.ghl_status,'')),'[\s_-]+','','g') not in('cancelled','canceled','deleted','invalid','noshow')
      and exists(select 1 from public.meeting_attendance_base a where a.meeting_id=m.id and a.user_id=_user_id)
    for update of m
  ) candidate;
  if cardinality(_candidates)>1 then
    raise exception 'More than one implementation meeting exists on that date. Choose an existing meeting in the workspace.' using errcode='40001';
  end if;
  _meeting_id := _candidates[1];
  if _meeting_id is not null and exists(select 1 from public.implementation_meeting_sessions s
    where s.meeting_id=_meeting_id and s.user_id=_user_id and s.note_id<>_note_id) then
    raise exception 'That date already has a meeting attached to another coaching cycle.' using errcode='40001';
  end if;
  if _meeting_id is null then
    insert into public.meetings(meeting_type_id,date,created_by,title,meeting_timezone)
    values(_type_id,_meeting_date,_actor,'Implementation meeting','America/Edmonton') returning id into _meeting_id;
    insert into public.meeting_attendance_base(meeting_id,user_id,attended) values(_meeting_id,_user_id,false);
    if not exists(select 1 from public.meeting_attendance_base a where a.meeting_id=_meeting_id and a.user_id=_user_id) then
      raise exception 'Attendance is shared through a linked member. Open the linked member workspace to add this meeting.' using errcode='22023';
    end if;
    _created := true;
  end if;
  insert into public.implementation_meeting_create_requests(request_id,user_id,note_id,requested_date,meeting_id,created_by)
  values(_request_id,_user_id,_note_id,_meeting_date,_meeting_id,_actor);
  return jsonb_build_object('meeting_id',_meeting_id,'created',_created);
end;
$$;
revoke all on function public.create_implementation_meeting(uuid,bigint,date,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_implementation_meeting(uuid,bigint,date,uuid) to authenticated,service_role;

-- Refactor only the existing bounds section; keep all session progress, notes,
-- attendance and historical behavior intact. Fail loudly if prerequisites drift.
do $patch$
declare
  _definition text;
  _first integer;
  _last integer;
  _old text;
  _signature text;
begin
  _definition := replace(pg_get_functiondef('public.mutate_implementation_workspace(bigint,bigint,text,jsonb,integer)'::regprocedure),chr(13),'');
  _first := position('    select r.* into _review from public.business_reviews r' in _definition);
  _last := position('    if _meeting.date < _cycle_start or' in _definition);
  if _first=0 or _last<=_first then raise exception 'Workspace cycle bounds prerequisite does not match.'; end if;
  _old := substring(_definition from _first for _last-_first);
  _definition := replace(_definition,_old,'    select b.cycle_start,b.cycle_end into _cycle_start,_cycle_end
      from public.implementation_cycle_bounds(_note_id) b;
');
  execute _definition;

  foreach _signature in array array[
    'public.sync_implementation_appointment(text,text,timestamp with time zone,timestamp with time zone,text,text,text,uuid,uuid,date,boolean)',
    'public.sync_implementation_appointment_v2(text,text,timestamp with time zone,timestamp with time zone,text,text,text,uuid,uuid,date,boolean)'
  ] loop
    _definition := pg_get_functiondef(_signature::regprocedure);
    if position('      and candidate.starts_at is null' in _definition)=0 then
      raise exception 'Implementation appointment adoption prerequisite does not match.';
    end if;
    _definition := replace(_definition,'      and candidate.starts_at is null',
      '      and candidate.starts_at is null
      and regexp_replace(lower(coalesce(candidate.ghl_status,'''')), ''[\s_-]+'', '''', ''g'')
        not in (''cancelled'',''canceled'',''deleted'',''invalid'',''noshow'')');
    execute _definition;
  end loop;
end;
$patch$;

commit;
