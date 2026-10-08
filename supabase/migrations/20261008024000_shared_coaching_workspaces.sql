begin;

-- Keep historical records on their original identities. A sharing scope is the
-- current active partnership for that domain, not just its canonical write owner.
create function public.coaching_member_aliases(_user_id uuid, _domain public.share_domain)
returns table(user_id uuid) language sql stable security definer
set search_path=pg_catalog,public as $$
  select distinct alias.user_id
  from public.profiles anchor
  cross join lateral public.view_user_ids_for_owner(anchor.id,_domain) alias
  join public.profiles member on member.id=alias.user_id and member.merged_at is null
  where anchor.id=_user_id and anchor.merged_at is null;
$$;
revoke all on function public.coaching_member_aliases(uuid,public.share_domain) from public,anon,authenticated;
grant execute on function public.coaching_member_aliases(uuid,public.share_domain) to service_role;

create function public.can_manage_shared_coaching_member(_user_id uuid, _allow_implementation boolean default false)
returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
  select auth.uid() is not null
    and public.account_is_not_merged(auth.uid())
    and public.account_setup_complete(auth.uid())
    and not public.has_role(array['past_member']::text[])
    and exists(select 1 from public.profiles p where p.id=_user_id and p.merged_at is null)
    and (
      public.has_role(case when _allow_implementation then array['admin','superadmin']::text[] else array['admin']::text[] end)
      or (
        public.has_role(case when _allow_implementation then array['coach','implementation_coach']::text[] else array['coach']::text[] end)
        and exists (
          select 1 from public.user_coaches c
          join public.coaching_member_aliases(_user_id,'notes') alias on alias.user_id=c.user_id
          where c.coach_id=auth.uid() and c.is_active and (c.ended_at is null or c.ended_at>now())
        )
      )
    );
$$;
revoke all on function public.can_manage_shared_coaching_member(uuid,boolean) from public,anon;
grant execute on function public.can_manage_shared_coaching_member(uuid,boolean) to authenticated,service_role;

-- Sharing notes grants no authority over the other member's independently held
-- attendance. The actor must have an assignment in this separate domain scope.
create function public.can_manage_coaching_attendance(_user_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
  select auth.uid() is not null
    and public.account_is_not_merged(auth.uid())
    and public.account_setup_complete(auth.uid())
    and not public.has_role(array['past_member']::text[])
    and exists(select 1 from public.profiles p where p.id=_user_id and p.merged_at is null)
    and (public.has_role(array['admin','superadmin']::text[])
      or (public.has_role(array['coach','implementation_coach']::text[]) and exists(
        select 1 from public.user_coaches c
        join public.coaching_member_aliases(_user_id,'attendance') alias on alias.user_id=c.user_id
        where c.coach_id=auth.uid() and c.is_active and (c.ended_at is null or c.ended_at>now())
      )));
$$;
revoke all on function public.can_manage_coaching_attendance(uuid) from public,anon;
grant execute on function public.can_manage_coaching_attendance(uuid) to authenticated,service_role;

-- Standalone coaching notes use the same notes-sharing contract as cycles.
create or replace function public.can_access_member_coaching_notes(_user_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
  select public.can_manage_shared_coaching_member(_user_id,true);
$$;

create or replace function public.can_access_implementation_workspace(_note_id bigint)
returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
  select exists(select 1 from public.coaching_notes_base n
    where n.id=_note_id and n.deleted_at is null
      and public.can_manage_shared_coaching_member(n.user_id,true));
$$;

-- Replace only the authorization block in established review mutations, keeping
-- their template, history, priority and idempotency behavior intact. The attached
-- note determines a historical review's visibility even if review.user_id differs.
do $reviews$
declare signature text; definition text; patched text; target text;
begin
  foreach signature in array array[
    'public.create_business_review(uuid,date)',
    'public.assign_foundation_scorecard_to_business_review(bigint)',
    'public.set_business_review_system_priority(bigint,bigint,boolean)'
  ] loop
    definition := replace(pg_get_functiondef(signature::regprocedure),chr(13),'');
    target := case when signature='public.create_business_review(uuid,date)' then '_user_id'
      else '(select n.user_id from public.coaching_notes_base n where n.id=_review.coaching_note_id and n.deleted_at is null)' end;
    patched := regexp_replace(definition,
      '  if not \([\s\S]*?raise exception ''You do not have access to this student''[\s\S]*?  end if;',
      '  if not public.can_manage_shared_coaching_member('||target||',false) then
    raise exception ''You do not have access to this student'' using errcode=''42501'';
  end if;');
    if patched=definition or position('public.can_manage_shared_coaching_member(' in patched)=0 then
      raise exception 'Shared review authorization prerequisite does not match: %',signature;
    end if;
    execute patched;
  end loop;
end $reviews$;

-- Cycle boundaries must consider all currently shared histories, including rows
-- created on the other member before the partnership existed.
do $bounds$
declare definition text;
begin
  definition := replace(pg_get_functiondef('public.implementation_cycle_bounds(bigint)'::regprocedure),chr(13),'');
  if position('where r.user_id=_note.user_id' in definition)=0
    or position('where n.user_id=_note.user_id' in definition)=0 then
    raise exception 'Shared implementation cycle bounds prerequisite does not match.';
  end if;
  definition := replace(definition,'where r.user_id=_note.user_id',
    'where exists(select 1 from public.coaching_notes_base related
      join public.coaching_member_aliases(_note.user_id,''notes'') alias on alias.user_id=related.user_id
      where related.id=r.coaching_note_id and related.deleted_at is null)');
  definition := replace(definition,'where n.user_id=_note.user_id',
    'where n.user_id in(select alias.user_id from public.coaching_member_aliases(_note.user_id,''notes'') alias)');
  execute definition;
end $bounds$;

-- The selected member and the note's historical owner are different concerns.
-- New clients pass the selected member explicitly; session identity stays pinned
-- to the note owner so opening another partner does not duplicate its history.
do $workspace$
declare definition text; patched text; old_attendance text;
begin
  definition := replace(pg_get_functiondef('public.mutate_implementation_workspace(bigint,bigint,text,jsonb,integer)'::regprocedure),chr(13),'');
  patched := regexp_replace(definition,'FUNCTION public.mutate_implementation_workspace\([^)]*\)',
    'FUNCTION public.mutate_implementation_workspace(_note_id bigint, _meeting_id bigint, _operation text, _payload jsonb, _expected_revision integer, _user_id uuid)');
  if patched=definition then raise exception 'Implementation workspace signature prerequisite does not match.'; end if;
  definition := patched;
  if position('  _actor_id uuid := auth.uid();' in definition)=0
    or position('  if _operation is null or' in definition)=0
    or position('  for share of m;' in definition)=0
    or position('user_id=_note.user_id;' in definition)=0 then
    raise exception 'Implementation workspace body prerequisite does not match.';
  end if;
  definition := replace(definition,'  _actor_id uuid := auth.uid();','  _actor_id uuid := auth.uid();
  _attendance_ids uuid[];
  _may_manage_attendance boolean;');
  -- The same meeting may have independent attendance rows for both partners.
  -- Serialize starts across their different note-owner locks before checking
  -- whether this appointment is already attached to a shared coaching cycle.
  definition := replace(definition,'  for share of m;','  for update of m;');
  definition := replace(definition,'  if _operation is null or',
    '  if not exists(select 1 from public.coaching_member_aliases(_note.user_id,''notes'') alias where alias.user_id=_user_id) then
    raise exception ''This coaching cycle is not shared with the selected member.'' using errcode=''42501'';
  end if;
  if _operation is null or');
  old_attendance := '  perform 1 from public.meeting_attendance_base ma
    where ma.meeting_id = _meeting_id and ma.user_id = _note.user_id for update;
  if not found then
    raise exception ''The member must be an attendee of this meeting.'' using errcode = ''22023'';
  end if;';
  -- SQL editors may paste this migration with CRLF inside quoted literals too.
  old_attendance := replace(old_attendance,chr(13),'');
  if position(old_attendance in definition)=0 then
    raise exception 'Implementation attendance prerequisite does not match.';
  end if;
  definition := replace(definition,old_attendance,
    '  _may_manage_attendance := public.can_manage_coaching_attendance(_user_id);
  if _operation in (''start'',''set_attendance'') and not _may_manage_attendance then
    raise exception ''You do not have access to attendance for this member.'' using errcode=''42501'';
  end if;
  select array_agg(attendee.user_id) into _attendance_ids from (
    select ma.user_id from public.meeting_attendance_base ma
    where _may_manage_attendance and ma.meeting_id=_meeting_id and ma.user_id in (
      select alias.user_id from public.coaching_member_aliases(_user_id,''attendance'') alias
    ) order by ma.user_id for update
  ) attendee;
  if _operation in (''start'',''set_attendance'') and coalesce(cardinality(_attendance_ids),0)=0 then
    raise exception ''The selected member must be an attendee of this meeting.'' using errcode=''22023'';
  end if;');
  -- These are the two attendance updates, not the session-owner lookup.
  if (length(definition)-length(replace(definition,'user_id=_note.user_id;','')))/length('user_id=_note.user_id;')<>2 then
    raise exception 'Implementation attendance update prerequisite does not match.';
  end if;
  definition := replace(definition,'user_id=_note.user_id;','user_id=any(_attendance_ids);');
  -- One appointment cannot be newly attached to a different currently shared
  -- cycle just because that cycle's historic note owner is the other partner.
  if position('  if _operation = ''start'' then' in definition)=0 then
    raise exception 'Implementation session start prerequisite does not match.';
  end if;
  definition := replace(definition,'  if _operation = ''start'' then',
    '  if _operation = ''start'' then
    if _session.id is null and exists(
      select 1 from public.implementation_meeting_sessions other_session
      join public.coaching_notes_base other_note on other_note.id=other_session.note_id
      join public.coaching_member_aliases(_note.user_id,''notes'') alias on alias.user_id=other_note.user_id
      where other_session.meeting_id=_meeting_id and other_session.note_id<>_note_id
    ) then
      raise exception ''This meeting is already attached to a different coaching cycle.'' using errcode=''22023'';
    end if;');
  execute definition;
end $workspace$;
revoke all on function public.mutate_implementation_workspace(bigint,bigint,text,jsonb,integer,uuid) from public,anon;
grant execute on function public.mutate_implementation_workspace(bigint,bigint,text,jsonb,integer,uuid) to authenticated,service_role;

-- Preserve older clients using the original note-owner context. The new function
-- still applies every account, assignment, cycle, attendance and revision guard.
create or replace function public.mutate_implementation_workspace(
  _note_id bigint, _meeting_id bigint, _operation text,
  _payload jsonb default '{}'::jsonb, _expected_revision integer default 0
) returns jsonb language sql security definer set search_path=pg_catalog,public as $$
  select public.mutate_implementation_workspace(_note_id,_meeting_id,_operation,_payload,_expected_revision,
    (select n.user_id from public.coaching_notes_base n where n.id=_note_id));
$$;

do $manual_meetings$
declare definition text; old_binding text;
begin
  definition := replace(pg_get_functiondef('public.create_implementation_meeting(uuid,bigint,date,uuid)'::regprocedure),chr(13),'');
  old_binding := '  if _note.user_id<>_user_id then
    raise exception ''This shared cycle belongs to the linked member. Open that member to add its implementation meeting.'' using errcode=''22023'';
  end if;';
  old_binding := replace(old_binding,chr(13),'');
  if position(old_binding in definition)=0
    or position('public.can_access_member_coaching_notes(_user_id)' in definition)=0
    or position('values(_meeting_id,_user_id,false)' in definition)=0
    or position('  _actor uuid := auth.uid();' in definition)=0 then
    raise exception 'Shared manual implementation meeting prerequisite does not match.';
  end if;
  definition := replace(definition,'  _actor uuid := auth.uid();','  _actor uuid := auth.uid();
  _attendance_owner uuid;
  _lock_user uuid;');
  definition := replace(definition,'public.can_access_member_coaching_notes(_user_id)',
    'public.can_manage_shared_coaching_member(_user_id,true)');
  definition := replace(definition,old_binding,
    '  if not exists(select 1 from public.coaching_member_aliases(_note.user_id,''notes'') alias where alias.user_id=_user_id) then
    raise exception ''This coaching cycle is not shared with the selected member.'' using errcode=''42501'';
  end if;
  if not public.can_manage_coaching_attendance(_user_id) then
    raise exception ''You do not have access to attendance for this member.'' using errcode=''42501'';
  end if;
  _attendance_owner := public.canonical_owner_for(_user_id,''attendance'');');
  definition := replace(definition,'a.user_id=_user_id',
    'a.user_id in(select alias.user_id from public.coaching_member_aliases(_user_id,''attendance'') alias)');
  definition := replace(definition,'and s.user_id=_user_id',
    'and exists(select 1 from public.coaching_notes_base session_note
      join public.coaching_member_aliases(_note.user_id,''notes'') alias on alias.user_id=session_note.user_id
      where session_note.id=s.note_id)');
  definition := replace(definition,'values(_meeting_id,_user_id,false)','values(_meeting_id,_attendance_owner,false)');
  -- Lock every active attendance alias in a stable order, including the importer
  -- key for the selected member and the canonical owner, then recheck candidates.
  old_binding := '  perform pg_advisory_xact_lock(hashtextextended(_user_id::text||'':''||_meeting_date::text||'':implementation'',0));';
  if position(old_binding in definition)=0 then raise exception 'Manual implementation lock prerequisite does not match.'; end if;
  definition := replace(definition,old_binding,
    '  for _lock_user in select alias.user_id from public.coaching_member_aliases(_user_id,''attendance'') alias order by alias.user_id loop
    perform pg_advisory_xact_lock(hashtextextended(_lock_user::text||'':''||_meeting_date::text||'':implementation'',0));
  end loop;');
  execute definition;
end $manual_meetings$;

notify pgrst,'reload schema';
commit;
