begin;

create table public.implementation_action_checklists (
  action_step_id bigint primary key references public.coaching_note_action_steps(id) on delete restrict,
  guide_id uuid not null,
  guide_revision integer not null,
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (guide_id, guide_revision) references public.system_implementation_guide_versions(guide_id, revision)
);

create table public.implementation_meeting_sessions (
  id uuid primary key default gen_random_uuid(),
  note_id bigint not null references public.coaching_notes_base(id) on delete restrict,
  meeting_id bigint not null references public.meetings(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'completed')),
  revision integer not null default 1 check (revision > 0),
  started_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  notes text not null default '' check (length(notes) <= 30000),
  commitments text not null default '' check (length(commitments) <= 10000),
  progress_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(progress_snapshot) = 'array'),
  unique (user_id, meeting_id),
  check ((status = 'completed') = (completed_at is not null))
);
create index implementation_meeting_sessions_note_started_idx
  on public.implementation_meeting_sessions (note_id, started_at desc, id desc);

-- JSON snapshots retain content; relational references enforce history retention.
create table public.implementation_session_actions (
  session_id uuid not null references public.implementation_meeting_sessions(id) on delete restrict,
  action_step_id bigint not null references public.coaching_note_action_steps(id) on delete restrict,
  primary key (session_id, action_step_id)
);
create index implementation_session_actions_action_idx on public.implementation_session_actions(action_step_id);

create table public.implementation_step_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  action_step_id bigint not null,
  step_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (session_id, action_step_id) references public.implementation_session_actions(session_id, action_step_id)
);
create index implementation_step_notes_session_idx on public.implementation_step_notes(session_id, created_at, id);

create table public.implementation_step_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  action_step_id bigint not null,
  step_id uuid not null,
  completed boolean not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (session_id, action_step_id) references public.implementation_session_actions(session_id, action_step_id)
);
create index implementation_step_events_session_idx on public.implementation_step_events(session_id, created_at, id);

comment on table public.implementation_action_checklists is
  'One pinned guide revision per cycle action; cumulative checks survive meeting changes and guide edits.';
comment on table public.implementation_meeting_sessions is
  'Meeting-specific coach notes and immutable-as-of progress once a later session starts. Meeting IDs remain pinned through rescheduling.';
comment on table public.implementation_step_events is
  'Append-only true/false check transitions, with meeting/author/time; never implicitly marks an action complete.';

create function public.can_access_implementation_workspace(_note_id bigint)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.coaching_notes_base n
    where n.id = _note_id and n.deleted_at is null and (
      public.has_role(array['admin','superadmin']::text[])
      or (public.has_role(array['coach','implementation_coach']::text[]) and exists (
        select 1 from public.user_coaches c
        where c.user_id = n.user_id and c.coach_id = auth.uid() and c.is_active
          and (c.ended_at is null or c.ended_at > now())
      ))
    )
  );
$$;
revoke all on function public.can_access_implementation_workspace(bigint) from public, anon, authenticated, service_role;
grant execute on function public.can_access_implementation_workspace(bigint) to authenticated, service_role;

create function public.can_access_implementation_action(_action_step_id bigint)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists(select 1 from public.coaching_note_action_steps a
    where a.id = _action_step_id and public.can_access_implementation_workspace(a.coaching_note_id));
$$;
revoke all on function public.can_access_implementation_action(bigint) from public, anon, authenticated, service_role;
grant execute on function public.can_access_implementation_action(bigint) to authenticated, service_role;

alter table public.implementation_action_checklists enable row level security;
alter table public.implementation_meeting_sessions enable row level security;
alter table public.implementation_session_actions enable row level security;
alter table public.implementation_step_notes enable row level security;
alter table public.implementation_step_events enable row level security;
create policy implementation_action_checklists_staff_read on public.implementation_action_checklists
  for select to authenticated using (public.can_access_implementation_action(action_step_id));
create policy implementation_meeting_sessions_staff_read on public.implementation_meeting_sessions
  for select to authenticated using (public.can_access_implementation_workspace(note_id));
create policy implementation_session_actions_staff_read on public.implementation_session_actions
  for select to authenticated using (exists (
    select 1 from public.implementation_meeting_sessions s where s.id = session_id
      and public.can_access_implementation_workspace(s.note_id)
  ));
create policy implementation_step_notes_staff_read on public.implementation_step_notes
  for select to authenticated using (exists (
    select 1 from public.implementation_meeting_sessions s where s.id = session_id
      and public.can_access_implementation_workspace(s.note_id)
  ));
create policy implementation_step_events_staff_read on public.implementation_step_events
  for select to authenticated using (exists (
    select 1 from public.implementation_meeting_sessions s where s.id = session_id
      and public.can_access_implementation_workspace(s.note_id)
  ));
revoke all on public.implementation_action_checklists, public.implementation_meeting_sessions,
  public.implementation_session_actions, public.implementation_step_notes, public.implementation_step_events
  from public, anon, authenticated, service_role;
grant select on public.implementation_action_checklists, public.implementation_meeting_sessions,
  public.implementation_session_actions, public.implementation_step_notes, public.implementation_step_events
  to authenticated, service_role;

create function public.build_implementation_progress_snapshot(_note_id bigint)
returns jsonb language sql stable
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'actionStepId', a.id, 'label', a.label, 'status', a.status,
    'priorityPosition', p.position, 'systemKey', sys.key, 'audience', t.audience,
    'guideRevision', c.guide_revision, 'steps', coalesce(c.steps, '[]'::jsonb),
    'progress', coalesce(c.progress, '{}'::jsonb)
  ) order by p.position nulls last, a.created_at, a.id), '[]'::jsonb)
  from public.coaching_note_action_steps a
  left join public.business_review_system_priorities p on p.action_step_id = a.id
  left join public.system_scorecard_systems sys on sys.id = p.system_id
  left join public.system_scorecard_templates t on t.key = sys.template_key
  left join public.implementation_action_checklists c on c.action_step_id = a.id
  where a.coaching_note_id = _note_id;
$$;
revoke all on function public.build_implementation_progress_snapshot(bigint) from public, anon, authenticated, service_role;

create function public.mutate_implementation_workspace(
  _note_id bigint,
  _meeting_id bigint,
  _operation text,
  _payload jsonb default '{}'::jsonb,
  _expected_revision integer default 0
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  _actor_id uuid := auth.uid();
  _note public.coaching_notes_base%rowtype;
  _meeting public.meetings%rowtype;
  _session public.implementation_meeting_sessions%rowtype;
  _previous_session public.implementation_meeting_sessions%rowtype;
  _review public.business_reviews%rowtype;
  _checklist public.implementation_action_checklists%rowtype;
  _action public.coaching_note_action_steps%rowtype;
  _latest_id uuid;
  _cycle_start date;
  _cycle_end date;
  _timezone text;
  _allowed_keys text[];
  _action_id bigint;
  _step_id uuid;
  _completed boolean;
  _was_completed boolean;
  _has_prior_true boolean;
  _snapshot_action jsonb;
  _refresh_snapshot boolean := false;
  _now timestamptz := clock_timestamp();
begin
  -- Note row is the single lock shared by every session in this cycle.
  select n.* into _note from public.coaching_notes_base n where n.id = _note_id for update;
  if not found or not public.can_access_implementation_workspace(_note_id) then
    raise exception 'You do not have access to this implementation workspace.' using errcode = '42501';
  end if;
  if _operation is null or _operation not in ('start','save_notes','toggle_step','add_step_note',
    'complete_meeting','reopen_meeting','set_attendance','set_action_status')
    or _expected_revision is null or _expected_revision < 0
    or jsonb_typeof(_payload) is distinct from 'object'
  then
    raise exception 'A valid operation, payload and expected revision are required.' using errcode = '22023';
  end if;
  _allowed_keys := case _operation
    when 'save_notes' then array['notes','commitments']
    when 'toggle_step' then array['actionStepId','stepId','completed']
    when 'add_step_note' then array['actionStepId','stepId','body']
    when 'set_attendance' then array['attended']
    when 'set_action_status' then array['actionStepId','status']
    else '{}'::text[] end;
  if exists(select 1 from jsonb_object_keys(_payload) k where not k = any(_allowed_keys)) then
    raise exception 'The operation payload contains unsupported fields.' using errcode = '22023';
  end if;

  select m.* into _meeting from public.meetings m
  join public.meeting_types mt on mt.id = m.meeting_type_id
  where m.id = _meeting_id and mt.code = 'IMPLEMENTATION_MEETING'
    and regexp_replace(lower(coalesce(m.ghl_status,'')), '[\s_-]+', '', 'g')
      not in ('cancelled','canceled','deleted','invalid','noshow')
  for share of m;
  if not found then
    raise exception 'Choose a non-cancelled implementation meeting.' using errcode = '22023';
  end if;
  perform 1 from public.meeting_attendance_base ma
    where ma.meeting_id = _meeting_id and ma.user_id = _note.user_id for update;
  if not found then
    raise exception 'The member must be an attendee of this meeting.' using errcode = '22023';
  end if;
  select s.* into _session from public.implementation_meeting_sessions s
    where s.user_id = _note.user_id and s.meeting_id = _meeting_id;
  if found and _session.note_id <> _note_id then
    raise exception 'This meeting is already attached to a different coaching cycle.' using errcode = '22023';
  end if;

  if _operation = 'start' then
    if _session.id is not null then
      return to_jsonb(_session);
    end if;
    if _expected_revision <> 0 then
      raise exception 'This implementation meeting changed. Reload before saving.' using errcode = '40001';
    end if;
    select r.* into _review from public.business_reviews r
      where r.coaching_note_id = _note_id order by r.review_date desc, r.id desc limit 1;
    if found then
      _cycle_start := _review.review_date;
      if exists (select 1 from public.meetings m where m.id = _review.meeting_id
        and regexp_replace(lower(coalesce(m.ghl_status,'')), '[\s_-]+', '', 'g')
          in ('cancelled','canceled','deleted','invalid','noshow')) then
        raise exception 'The Business Review for this cycle is cancelled.' using errcode = '22023';
      end if;
      select min(r.review_date) into _cycle_end
      from public.business_reviews r left join public.meetings m on m.id = r.meeting_id
      where r.user_id = _note.user_id and (r.review_date,r.id) > (_review.review_date,_review.id)
        and regexp_replace(lower(coalesce(m.ghl_status,'')), '[\s_-]+', '', 'g')
          not in ('cancelled','canceled','deleted','invalid','noshow');
    else
      select m.date into _cycle_start from public.meetings m where m.id = _note.m2_meeting_id;
      _cycle_start := coalesce(_cycle_start, (_note.created_at at time zone 'America/Edmonton')::date);
      if exists (select 1 from public.meetings m where m.id = _note.m2_meeting_id
        and regexp_replace(lower(coalesce(m.ghl_status,'')), '[\s_-]+', '', 'g')
          in ('cancelled','canceled','deleted','invalid','noshow')) then
        raise exception 'The M2 meeting for this cycle is cancelled.' using errcode = '22023';
      end if;
      select min(c.cycle_date) into _cycle_end from (
        select coalesce(r.review_date,m.date,(n.created_at at time zone 'America/Edmonton')::date) cycle_date
        from public.coaching_notes_base n
        left join public.business_reviews r on r.coaching_note_id = n.id
        left join public.meetings m on m.id = coalesce(r.meeting_id,n.m2_meeting_id)
        where n.user_id = _note.user_id and n.deleted_at is null and n.id <> _note_id
          and regexp_replace(lower(coalesce(m.ghl_status,'')), '[\s_-]+', '', 'g')
            not in ('cancelled','canceled','deleted','invalid','noshow')
      ) c where c.cycle_date > _cycle_start;
    end if;
    if _meeting.date < _cycle_start or (_cycle_end is not null and _meeting.date >= _cycle_end) then
      raise exception 'This meeting falls outside the selected coaching cycle.' using errcode = '22023';
    end if;

    -- Capture changes made through legacy action controls while this was the live
    -- meeting. Do this before new guide instances are introduced for the next one.
    select s.* into _previous_session from public.implementation_meeting_sessions s
      where s.note_id = _note_id order by s.started_at desc,s.id desc limit 1;
    if found and _previous_session.status = 'open' then
      update public.implementation_meeting_sessions s
        set progress_snapshot=public.build_implementation_progress_snapshot(_note_id),
          revision=s.revision+1,updated_at=_now,updated_by=_actor_id
        where s.id=_previous_session.id;
      insert into public.implementation_session_actions (session_id,action_step_id)
        select _previous_session.id,a.id from public.coaching_note_action_steps a where a.coaching_note_id=_note_id
        on conflict do nothing;
    end if;

    -- Empty/missing guides deliberately produce no checklist. Existing instances
    -- never change when administrators edit a guide or a priority is removed.
    insert into public.implementation_action_checklists (action_step_id,guide_id,guide_revision,steps)
    select a.id,g.id,g.current_revision,v.steps
    from public.coaching_note_action_steps a
    join public.business_review_system_priorities p on p.action_step_id = a.id
    join public.system_scorecard_systems sys on sys.id = p.system_id
    join public.system_scorecard_templates t on t.key = sys.template_key
    join public.system_implementation_guides g on g.audience = t.audience and g.system_key = sys.key
    join public.system_implementation_guide_versions v on v.guide_id = g.id and v.revision = g.current_revision
    where a.coaching_note_id = _note_id and jsonb_array_length(v.steps) > 0
    on conflict (action_step_id) do nothing;
    insert into public.implementation_meeting_sessions (note_id,meeting_id,user_id,updated_by,progress_snapshot)
    values (_note_id,_meeting_id,_note.user_id,_actor_id,public.build_implementation_progress_snapshot(_note_id))
    returning * into _session;
    insert into public.implementation_session_actions (session_id,action_step_id)
    select _session.id,a.id from public.coaching_note_action_steps a where a.coaching_note_id = _note_id;
    return to_jsonb(_session);
  end if;

  if _session.id is null then
    raise exception 'Start this implementation meeting before editing it.' using errcode = '22023';
  end if;
  if _session.revision <> _expected_revision then
    raise exception 'This implementation meeting changed. Reload before saving.' using errcode = '40001';
  end if;
  select s.id into _latest_id from public.implementation_meeting_sessions s
    where s.note_id = _note_id order by s.started_at desc,s.id desc limit 1;
  if _operation not in ('save_notes','set_attendance') then
    if _session.id <> _latest_id then
      raise exception 'Progress can only be changed in the latest implementation meeting.' using errcode = '22023';
    end if;
    if _operation <> 'reopen_meeting' and _session.status <> 'open' then
      raise exception 'Reopen the latest meeting before changing its progress.' using errcode = '22023';
    end if;
  end if;

  if _operation in ('toggle_step','add_step_note','set_action_status') then
    if jsonb_typeof(_payload->'actionStepId') is distinct from 'number' then
      raise exception 'A valid action step is required.' using errcode = '22023';
    end if;
    if (_payload->>'actionStepId')::numeric < 1 or (_payload->>'actionStepId')::numeric > 9007199254740991
      or trunc((_payload->>'actionStepId')::numeric) <> (_payload->>'actionStepId')::numeric then
      raise exception 'A valid action step is required.' using errcode = '22023';
    end if;
    _action_id := (_payload->>'actionStepId')::bigint;
    select a.* into _action from public.coaching_note_action_steps a
      where a.id = _action_id and a.coaching_note_id = _note_id for update;
    if not found then
      raise exception 'The action step does not belong to this coaching cycle.' using errcode = '22023';
    end if;
    select value into _snapshot_action from jsonb_array_elements(_session.progress_snapshot)
      where (value->>'actionStepId')::bigint = _action_id;
    if not found and _operation <> 'set_action_status' then
      raise exception 'The action step is not part of this meeting snapshot.' using errcode = '22023';
    end if;
  end if;
  if _operation in ('toggle_step','add_step_note') then
    if jsonb_typeof(_payload->'stepId') is distinct from 'string'
      or (_payload->>'stepId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'A valid checklist step UUID is required.' using errcode = '22023';
    end if;
    _step_id := (_payload->>'stepId')::uuid;
    if not exists(select 1 from jsonb_array_elements(_snapshot_action->'steps') x
      where (x->>'id')::uuid = _step_id) then
      raise exception 'The checklist step is not part of this meeting snapshot.' using errcode = '22023';
    end if;
  end if;

  case _operation
    when 'save_notes' then
      if jsonb_typeof(_payload->'notes') is distinct from 'string'
        or jsonb_typeof(_payload->'commitments') is distinct from 'string'
        or length(_payload->>'notes') > 30000 or length(_payload->>'commitments') > 10000 then
        raise exception 'Notes and commitments must be text within their length limits.' using errcode = '22023';
      end if;
      _session.notes := _payload->>'notes';
      _session.commitments := _payload->>'commitments';
    when 'toggle_step' then
      if jsonb_typeof(_payload->'completed') is distinct from 'boolean' then
        raise exception 'The completed value must be a boolean.' using errcode = '22023';
      end if;
      _completed := (_payload->>'completed')::boolean;
      select c.* into _checklist from public.implementation_action_checklists c
        where c.action_step_id = _action_id for update;
      if not found or not exists(select 1 from jsonb_array_elements(_checklist.steps) x where (x->>'id')::uuid = _step_id) then
        raise exception 'No checklist is available for this action step.' using errcode = '22023';
      end if;
      _was_completed := coalesce((_checklist.progress->_step_id::text->>'completed')::boolean,false);
      if _was_completed is distinct from _completed then
        _timezone := coalesce(nullif(_meeting.meeting_timezone,''),'America/Edmonton');
        if not exists(select 1 from pg_timezone_names tz where tz.name = _timezone) then
          _timezone := 'America/Edmonton';
        end if;
        select exists(select 1 from public.implementation_step_events e
          where e.session_id = _session.id and e.completed
            and (e.created_at at time zone _timezone)::date = _meeting.date)
          into _has_prior_true;
        update public.implementation_action_checklists c set progress = jsonb_set(c.progress,array[_step_id::text],
          jsonb_build_object('completed',_completed,'completedAt',case when _completed then _now else null end,
            'meetingId',case when _completed then _meeting_id else null end)), updated_at = _now
          where c.action_step_id = _action_id;
        insert into public.implementation_step_events (session_id,action_step_id,step_id,completed,created_by,created_at)
          values (_session.id,_action_id,_step_id,_completed,_actor_id,_now);
        if _completed and _action.status = 'not_started' then
          update public.coaching_note_action_steps set status='in_progress' where id = _action_id;
        end if;
        if _completed and not _has_prior_true and _meeting.date = (_now at time zone _timezone)::date then
          update public.meeting_attendance_base set attended=true,updated_at=_now
            where meeting_id=_meeting_id and user_id=_note.user_id;
        end if;
      end if;
      _refresh_snapshot := true;
    when 'add_step_note' then
      if jsonb_typeof(_payload->'body') is distinct from 'string'
        or length(btrim(_payload->>'body', E' \t\r\n')) not between 1 and 4000 then
        raise exception 'A step note must contain 1-4000 characters.' using errcode = '22023';
      end if;
      insert into public.implementation_step_notes (session_id,action_step_id,step_id,body,author_id)
      values (_session.id,_action_id,_step_id,btrim(_payload->>'body', E' \t\r\n'),_actor_id);
    when 'set_attendance' then
      if jsonb_typeof(_payload->'attended') is distinct from 'boolean' then
        raise exception 'The attended value must be a boolean.' using errcode = '22023';
      end if;
      update public.meeting_attendance_base set attended=(_payload->>'attended')::boolean,updated_at=_now
        where meeting_id=_meeting_id and user_id=_note.user_id;
    when 'set_action_status' then
      if jsonb_typeof(_payload->'status') is distinct from 'string'
        or (_payload->>'status') not in ('not_started','in_progress','complete') then
        raise exception 'Choose a valid action step status.' using errcode = '22023';
      end if;
      update public.coaching_note_action_steps set status=(_payload->>'status')::public.action_step_status where id=_action_id;
      _refresh_snapshot := true;
    when 'complete_meeting' then
      _session.status := 'completed';
      _session.completed_at := _now;
      _refresh_snapshot := true;
    when 'reopen_meeting' then
      if _session.status <> 'completed' then
        raise exception 'This meeting is already open.' using errcode = '22023';
      end if;
      _session.status := 'open';
      _session.completed_at := null;
    else
      raise exception 'Unsupported implementation operation.' using errcode = '22023';
  end case;

  if _refresh_snapshot then
    _session.progress_snapshot := public.build_implementation_progress_snapshot(_note_id);
    insert into public.implementation_session_actions (session_id,action_step_id)
      select _session.id,a.id from public.coaching_note_action_steps a where a.coaching_note_id=_note_id
      on conflict do nothing;
  end if;
  update public.implementation_meeting_sessions s
  set status=_session.status,revision=s.revision+1,updated_at=_now,updated_by=_actor_id,
    completed_at=_session.completed_at,notes=_session.notes,commitments=_session.commitments,
    progress_snapshot=_session.progress_snapshot
  where s.id=_session.id returning s.* into _session;
  return to_jsonb(_session);
end;
$$;
revoke all on function public.mutate_implementation_workspace(bigint,bigint,text,jsonb,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_implementation_workspace(bigint,bigint,text,jsonb,integer)
  to authenticated, service_role;

-- A selected priority may be cleared after a meeting has captured its action.
-- Retain that action as ordinary cycle work even if no checkbox was ticked yet.
do $$
declare _definition text;
begin
  _definition := pg_get_functiondef('public.set_business_review_system_priority(bigint,bigint,boolean)'::regprocedure);
  if position('if _action_step_status = ''not_started''::public.action_step_status then' in _definition) = 0 then
    raise exception 'Priority removal function prerequisite does not match.';
  end if;
  _definition := replace(_definition,
    'if _action_step_status = ''not_started''::public.action_step_status then',
    'if _action_step_status = ''not_started''::public.action_step_status
      and not exists(select 1 from public.implementation_session_actions sa where sa.action_step_id = _action_step_id)
      and not exists(select 1 from public.implementation_action_checklists ac where ac.action_step_id = _action_step_id) then');
  execute _definition;
end;
$$;

-- Scorecard publication also clears or replaces priorities on draft reviews.
-- Preserve actions already captured by implementation history. A replacement
-- with a different system needs a fresh action so it cannot inherit old checks.
do $patch$
declare
  _definition text;
  _delete_branch text := $old$        delete from public.coaching_note_action_steps as action_step
        where action_step.id = (_priority ->> 'actionStepId')::bigint;$old$;
  _priority_insert text := $old$      insert into public.business_review_system_priorities ($old$;
begin
  _definition := replace(pg_get_functiondef('public.admin_publish_system_scorecard_version(text,uuid,jsonb)'::regprocedure),chr(13),'');
  _delete_branch := replace(_delete_branch,chr(13),'');
  if position(_delete_branch in _definition) = 0
    or position(_priority_insert in _definition) = 0
    or position('  _target public.system_scorecard_templates%rowtype;' in _definition) = 0 then
    raise exception 'Scorecard publication function prerequisite does not match.';
  end if;
  _definition := replace(_definition, '  _target public.system_scorecard_templates%rowtype;',
    '  _implementation_action_id bigint;
  _target public.system_scorecard_templates%rowtype;');
  _definition := replace(_definition, _delete_branch, $new$        delete from public.coaching_note_action_steps as action_step
        where action_step.id = (_priority ->> 'actionStepId')::bigint
          and not exists(select 1 from public.implementation_session_actions sa where sa.action_step_id = action_step.id)
          and not exists(select 1 from public.implementation_action_checklists ac where ac.action_step_id = action_step.id);$new$);
  _definition := replace(_definition, _priority_insert, $new$      if _target_system_key is distinct from _old_system_key and (
        exists(select 1 from public.implementation_session_actions sa
          where sa.action_step_id = (_priority ->> 'actionStepId')::bigint)
        or exists(select 1 from public.implementation_action_checklists ac
          where ac.action_step_id = (_priority ->> 'actionStepId')::bigint)
      ) then
        insert into public.coaching_note_action_steps (coaching_note_id,label,library_item_id,status)
        values (_review.coaching_note_id,_target_system_label,_target_library_item_id,'not_started'::public.action_step_status)
        returning id into _implementation_action_id;
        _priority := jsonb_set(_priority,'{actionStepId}',to_jsonb(_implementation_action_id));
      end if;

      insert into public.business_review_system_priorities ($new$);
  execute _definition;
end;
$patch$;

commit;
