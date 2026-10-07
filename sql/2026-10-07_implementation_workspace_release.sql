-- Implementation workspace production release, 2026-10-07.
-- Paste this ENTIRE file into the intended live project's Supabase SQL Editor
-- using the postgres role, and run it once. Do not run only a selection.
-- All six migrations and their history entries commit together or roll back.
-- Existing/partially applied releases fail before changes: investigate instead
-- of deleting history or dropping objects. If the editor leaves an aborted
-- transaction open after an error, run ROLLBACK; before investigating/retrying.
-- A lock timeout means nothing committed; retry the entire script when quieter.
-- Requires the separately deployed completion carry-forward prerequisite.
-- Does not include that prerequisite's historical data repair/backfill.
-- Generated from six canonical supabase/migrations files. Their original SQL
-- is retained in schema_migrations.statements for normal CLI history.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $release_preflight$
declare
  _name text;
  _definition text;
  _fragment text;
  _existing text;
begin
  perform pg_advisory_xact_lock(hashtextextended('implementation-workspace-release-2026-10-07',0));
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'Migration history is missing. Confirm the project and initialize normal Supabase CLI migration history before this release.';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema='supabase_migrations' and table_name='schema_migrations'
        and ((column_name in ('version','name') and udt_name='text')
          or (column_name='statements' and udt_name='_text'))) <> 3 then
    raise exception 'Migration history has an unexpected schema; expected version text, name text, statements text[].';
  end if;
  lock table supabase_migrations.schema_migrations in share row exclusive mode;
  select string_agg(version,', ' order by version) into _existing
    from supabase_migrations.schema_migrations
    where version in ('20260925010000','20260925020000','20260925030000','20260929010000','20260929020000','20260929030000');
  if _existing is not null then
    raise exception 'This release is already or partially registered (%). Do not rerun it; inspect migration history.',_existing;
  end if;

  foreach _name in array array[
    'profiles','roles','user_roles','user_coaches','resources',
    'system_scorecard_templates','system_scorecard_systems',
    'business_review_system_priorities','business_review_system_ratings',
    'business_reviews','coaching_notes_base','coaching_note_action_steps',
    'meetings','meeting_types','meeting_attendance_base'
  ] loop
    if to_regclass('public.'||_name) is null then
      raise exception 'Missing prerequisite relation public.%. Confirm earlier migrations and the selected project.',_name;
    end if;
  end loop;
  foreach _name in array array['system_scorecard_audience','action_step_status','system_scorecard_status'] loop
    if to_regtype('public.'||_name) is null then
      raise exception 'Missing prerequisite type public.%.',_name;
    end if;
  end loop;
  foreach _name in array array[
    'system_implementation_guides','system_implementation_guide_versions',
    'implementation_action_checklists','implementation_meeting_sessions',
    'implementation_session_actions','implementation_step_notes','implementation_step_events',
    'general_coaching_notes','implementation_meeting_create_requests'
  ] loop
    if to_regclass('public.'||_name) is not null then
      raise exception 'Unexpected existing release object public.%. This may be a partially applied release; inspect before proceeding.',_name;
    end if;
  end loop;
  foreach _name in array array[
    'normalize_system_implementation_guide_steps(jsonb)',
    'save_system_implementation_guide(public.system_scorecard_audience,text,integer,jsonb)',
    'can_access_implementation_workspace(bigint)','can_access_implementation_action(bigint)',
    'build_implementation_progress_snapshot(bigint)',
    'mutate_implementation_workspace(bigint,bigint,text,jsonb,integer)',
    'can_access_member_coaching_notes(uuid)','add_general_coaching_note(uuid,text,uuid)',
    'track_implementation_note_attribution()','implementation_cycle_bounds(bigint)',
    'create_implementation_meeting(uuid,bigint,date,uuid)'
  ] loop
    if to_regprocedure('public.'||_name) is not null then
      raise exception 'Unexpected existing release function public.%. Inspect a possible partial release.',_name;
    end if;
  end loop;
  foreach _name in array array[
    'has_role(text[])','carry_priority_completion_to_next_review(bigint)',
    'sync_priority_system_from_action_step_completion()',
    'set_business_review_system_priority(bigint,bigint,boolean)',
    'admin_publish_system_scorecard_version(text,uuid,jsonb)',
    'sync_implementation_appointment(text,text,timestamptz,timestamptz,text,text,text,uuid,uuid,date,boolean)',
    'sync_implementation_appointment_v2(text,text,timestamptz,timestamptz,text,text,text,uuid,uuid,date,boolean)'
  ] loop
    if to_regprocedure('public.'||_name) is null then
      raise exception 'Missing prerequisite function public.%. Check earlier migrations, including 20260925000000; this script does not apply them.',_name;
    end if;
  end loop;
  if not exists(select 1 from public.meeting_types where code='IMPLEMENTATION_MEETING' and is_active) then
    raise exception 'The active IMPLEMENTATION_MEETING meeting type is missing.';
  end if;

  _definition := pg_get_functiondef('public.sync_priority_system_from_action_step_completion()'::regprocedure);
  if position('perform public.carry_priority_completion_to_next_review(new.id);' in _definition)=0
    or not exists(select 1 from pg_trigger
      where tgrelid='public.coaching_note_action_steps'::regclass
        and tgfoid='public.sync_priority_system_from_action_step_completion()'::regprocedure
        and not tgisinternal and tgenabled in ('O','A')) then
    raise exception 'Completion carry-forward is not wired to action completion. Apply/verify prerequisite 20260925000000 first.';
  end if;
  _definition := pg_get_functiondef('public.carry_priority_completion_to_next_review(bigint)'::regprocedure);
  if position('target_template.audience = source_template.audience' in _definition)=0
    or position('target_rating.reviewed_at is null' in _definition)=0 then
    raise exception 'Completion carry-forward does not match the required guarded implementation. Inspect prerequisite 20260925000000.';
  end if;

  _definition := pg_get_functiondef('public.set_business_review_system_priority(bigint,bigint,boolean)'::regprocedure);
  if position('if _action_step_status = ''not_started''::public.action_step_status then' in _definition)=0 then
    raise exception 'Priority removal prerequisite does not match migration 20260925020000.';
  end if;
  _definition := replace(pg_get_functiondef('public.admin_publish_system_scorecard_version(text,uuid,jsonb)'::regprocedure),chr(13),'');
  foreach _fragment in array array[
    $check_fragment$        delete from public.coaching_note_action_steps as action_step
        where action_step.id = (_priority ->> 'actionStepId')::bigint;$check_fragment$,
    '      insert into public.business_review_system_priorities (',
    '  _target public.system_scorecard_templates%rowtype;'
  ] loop
    if position(_fragment in _definition)=0 then
      raise exception 'Scorecard publication prerequisite does not match migration 20260925020000.';
    end if;
  end loop;
  foreach _name in array array[
    'public.sync_implementation_appointment(text,text,timestamptz,timestamptz,text,text,text,uuid,uuid,date,boolean)',
    'public.sync_implementation_appointment_v2(text,text,timestamptz,timestamptz,text,text,text,uuid,uuid,date,boolean)'
  ] loop
    _definition := pg_get_functiondef(_name::regprocedure);
    if position('      and candidate.starts_at is null' in _definition)=0 then
      raise exception 'GHL manual-meeting adoption prerequisite does not match: %.',_name;
    end if;
  end loop;
end;
$release_preflight$;

-- Migration 20260925010000_system_implementation_guides
-- Source SHA-256 (LF): 2df68cdf91fcd80abb3612325a87792ccf70019feedf31becf2cefa2c34aa5cb
-- Guides follow a stable system key across scorecard versions. A published
-- revision is a snapshot; clearing the current checklist writes an empty revision.
create table public.system_implementation_guides (
  id uuid primary key default gen_random_uuid(),
  audience public.system_scorecard_audience not null,
  system_key text not null check (length(btrim(system_key)) between 1 and 120),
  current_revision integer not null default 0 check (current_revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (audience, system_key)
);

create table public.system_implementation_guide_versions (
  guide_id uuid not null references public.system_implementation_guides(id),
  revision integer not null check (revision > 0),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 50),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (guide_id, revision)
);

-- Deferred only to allow inserting a header and its first snapshot atomically.
alter table public.system_implementation_guides
  add constraint system_implementation_guides_current_version_fk
  foreign key (id, current_revision)
  references public.system_implementation_guide_versions(guide_id, revision)
  deferrable initially deferred;

comment on table public.system_implementation_guides is
  'Reusable implementation checklist per scorecard audience and stable system key; no member data.';
comment on table public.system_implementation_guide_versions is
  'Append-only ordered checklist snapshots. Existing revisions must never be edited by application clients.';

alter table public.system_implementation_guides enable row level security;
alter table public.system_implementation_guide_versions enable row level security;
create policy system_implementation_guides_staff_read
  on public.system_implementation_guides for select to authenticated
  using (public.has_role(array['admin', 'superadmin', 'coach', 'implementation_coach']::text[]));
create policy system_implementation_guide_versions_staff_read
  on public.system_implementation_guide_versions for select to authenticated
  using (public.has_role(array['admin', 'superadmin', 'coach', 'implementation_coach']::text[]));

-- Explicitly remove legacy default grants, including service-role direct writes.
revoke all on public.system_implementation_guides from public, anon, authenticated, service_role;
revoke all on public.system_implementation_guide_versions from public, anon, authenticated, service_role;
grant select on public.system_implementation_guides to authenticated, service_role;
grant select on public.system_implementation_guide_versions to authenticated, service_role;

create function public.normalize_system_implementation_guide_steps(_steps jsonb)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  _step jsonb;
  _source jsonb;
  _normalized_source jsonb;
  _normalized_steps jsonb := '[]'::jsonb;
  _normalized_sources jsonb;
  _step_ids uuid[] := '{}';
  _step_id uuid;
  _title text;
  _description text;
  _resource_id numeric;
  _page_start numeric;
  _page_end numeric;
begin
  if jsonb_typeof(_steps) is distinct from 'array' then
    raise exception 'Steps must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(_steps) > 50 then
    raise exception 'A guide can contain at most 50 steps.' using errcode = '22023';
  end if;

  for _step in select value from jsonb_array_elements(_steps) loop
    if jsonb_typeof(_step) is distinct from 'object' then
      raise exception 'Each step must be an object.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(_step) k where k not in ('id', 'title', 'description', 'resources'))
      or jsonb_typeof(_step -> 'id') is distinct from 'string'
      or jsonb_typeof(_step -> 'title') is distinct from 'string'
      or jsonb_typeof(_step -> 'description') is distinct from 'string'
    then
      raise exception 'Each step requires only id, title, description and optional resources.' using errcode = '22023';
    end if;
    if (_step ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Each step requires a UUID id.' using errcode = '22023';
    end if;
    _step_id := (_step ->> 'id')::uuid;
    if _step_id = any(_step_ids) then
      raise exception 'Step ids must be unique within a guide.' using errcode = '22023';
    end if;
    _step_ids := array_append(_step_ids, _step_id);
    _title := btrim(_step ->> 'title', E' \t\r\n');
    _description := btrim(_step ->> 'description', E' \t\r\n');
    if length(_title) not between 1 and 160 or length(_description) not between 1 and 8000 then
      raise exception 'Step titles must be 1-160 characters and descriptions 1-8000 characters.' using errcode = '22023';
    end if;
    if _step ? 'resources' and jsonb_typeof(_step -> 'resources') is distinct from 'array' then
      raise exception 'Step resources must be an array.' using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(_step -> 'resources', '[]'::jsonb)) > 10 then
      raise exception 'A step can reference at most 10 resources.' using errcode = '22023';
    end if;
    _normalized_sources := '[]'::jsonb;
    for _source in select value from jsonb_array_elements(coalesce(_step -> 'resources', '[]'::jsonb)) loop
      if jsonb_typeof(_source) is distinct from 'object' then
        raise exception 'Each resource reference must be an object.' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_object_keys(_source) k where k not in ('resourceId', 'pageStart', 'pageEnd'))
        or jsonb_typeof(_source -> 'resourceId') is distinct from 'number'
      then
        raise exception 'Resource references require only resourceId and optional pageStart/pageEnd.' using errcode = '22023';
      end if;
      _resource_id := (_source ->> 'resourceId')::numeric;
      if _resource_id < 1 or _resource_id > 9007199254740991 or trunc(_resource_id) <> _resource_id then
        raise exception 'Resource ids must be positive safe integers.' using errcode = '22023';
      end if;
      if (_source ? 'pageStart' and jsonb_typeof(_source -> 'pageStart') not in ('number', 'null'))
        or (_source ? 'pageEnd' and jsonb_typeof(_source -> 'pageEnd') not in ('number', 'null'))
      then
        raise exception 'Page numbers must be positive integers or null.' using errcode = '22023';
      end if;
      _page_start := (_source ->> 'pageStart')::numeric;
      _page_end := (_source ->> 'pageEnd')::numeric;
      if (_page_start is not null and (_page_start < 1 or _page_start > 2147483647 or trunc(_page_start) <> _page_start))
        or (_page_end is not null and (_page_end < 1 or _page_end > 2147483647 or trunc(_page_end) <> _page_end))
        or (_page_end is not null and (_page_start is null or _page_end < _page_start))
      then
        raise exception 'Page ranges require positive integers and an end at or after the start.' using errcode = '22023';
      end if;
      -- Validate existence, not media type: future references may be videos or docs.
      perform 1 from public.resources r where r.id = _resource_id::bigint for key share;
      if not found then
        raise exception 'Resource % does not exist.', _resource_id using errcode = '22023';
      end if;
      _normalized_source := jsonb_build_object(
        'resourceId', _resource_id::bigint,
        'pageStart', _page_start::integer,
        'pageEnd', _page_end::integer
      );
      if _normalized_sources @> jsonb_build_array(_normalized_source) then
        raise exception 'Duplicate resource and page references are not allowed within a step.' using errcode = '22023';
      end if;
      _normalized_sources := _normalized_sources || jsonb_build_array(_normalized_source);
    end loop;
    _normalized_steps := _normalized_steps || jsonb_build_array(jsonb_build_object(
      'id', _step_id, 'title', _title, 'description', _description, 'resources', _normalized_sources
    ));
  end loop;
  return _normalized_steps;
end;
$$;
revoke all on function public.normalize_system_implementation_guide_steps(jsonb)
  from public, anon, authenticated, service_role;

create function public.save_system_implementation_guide(
  _audience public.system_scorecard_audience,
  _system_key text,
  _expected_revision integer,
  _steps jsonb
)
returns table (guide_id uuid, revision integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _actor_id uuid := auth.uid();
  _guide public.system_implementation_guides%rowtype;
  _normalized_steps jsonb;
  _next_revision integer;
begin
  if _actor_id is null or not public.has_role(array['admin', 'superadmin']::text[]) then
    raise exception 'Implementation guide editing requires an administrator.' using errcode = '42501';
  end if;
  if _audience is null or _system_key is null or length(_system_key) not between 1 and 120
    or _system_key <> btrim(_system_key) or _expected_revision is null or _expected_revision < 0
  then
    raise exception 'A valid audience, system key and expected revision are required.' using errcode = '22023';
  end if;
  perform 1
  from public.system_scorecard_systems s
  join public.system_scorecard_templates t on t.key = s.template_key
  where t.audience = _audience and t.is_active and s.key = _system_key
  for share of t, s;
  if not found then
    raise exception 'The system must belong to an active scorecard for this audience.' using errcode = '22023';
  end if;
  _normalized_steps := public.normalize_system_implementation_guide_steps(_steps);

  -- A competing first insert waits here, then locks the same row and sees the
  -- winner's revision. Existing-guide edits serialize on the row lock below.
  insert into public.system_implementation_guides (audience, system_key, updated_by)
  values (_audience, _system_key, _actor_id)
  on conflict (audience, system_key) do nothing;
  select g.* into _guide from public.system_implementation_guides g
  where g.audience = _audience and g.system_key = _system_key
  for update;
  if _guide.current_revision <> _expected_revision then
    raise exception 'This implementation guide changed. Reload before saving.' using errcode = '40001';
  end if;
  _next_revision := _guide.current_revision + 1;
  insert into public.system_implementation_guide_versions (guide_id, revision, steps, created_by)
  values (_guide.id, _next_revision, _normalized_steps, _actor_id);
  update public.system_implementation_guides g
  set current_revision = _next_revision, updated_at = now(), updated_by = _actor_id
  where g.id = _guide.id;
  return query select _guide.id, _next_revision;
end;
$$;

revoke all on function public.save_system_implementation_guide(public.system_scorecard_audience, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_system_implementation_guide(public.system_scorecard_audience, text, integer, jsonb)
  to authenticated, service_role;
comment on function public.save_system_implementation_guide(public.system_scorecard_audience, text, integer, jsonb) is
  'Admin/superadmin atomic save using auth.uid(); expected revision 0 creates, [] clears while preserving history, stale saves raise 40001.';

-- Migration 20260925020000_implementation_meeting_workspaces
-- Source SHA-256 (LF): b7d02a2288dadc61fa5ca549af73931c182e4ae65590a98e489d21e341b55343
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

-- Migration 20260925030000_seed_system_implementation_guides
-- Source SHA-256 (LF): e35df47b4f85cb71f944471a65609dc811a481d48ebdcd0ed7a05388b7e52bc7
-- Generated by tools/generate-implementation-guides-seed.mjs.
-- Edit data/implementation-guides.seed.json, then regenerate before this migration is deployed.
-- Existing guide headers and revisions are never overwritten. Missing resources
-- remove only their links, not the independently curated checklist instructions.

do $seed_implementation_guides$
declare
  _sources constant jsonb := $source_identity$[
  {
    "id": 181,
    "title": "How to Hire an Assistant",
    "type": "pdf"
  },
  {
    "id": 182,
    "title": "Sample Job Ads",
    "type": "pdf"
  },
  {
    "id": 183,
    "title": "Extracting Interview Questions and Worksheet",
    "type": "pdf"
  },
  {
    "id": 185,
    "title": "Hiring the Assistant - IMPACT FILTER - Editable ",
    "type": "pdf"
  },
  {
    "id": 188,
    "title": "The Red Carpet System",
    "type": "pdf"
  },
  {
    "id": 189,
    "title": "The Magnet System",
    "type": "pdf"
  },
  {
    "id": 192,
    "title": "The Birthday System",
    "type": "pdf"
  },
  {
    "id": 193,
    "title": "Client Feedback Insulator System",
    "type": "pdf"
  },
  {
    "id": 194,
    "title": "Impact Filter - Client Feedback Insulator",
    "type": "pdf"
  },
  {
    "id": 197,
    "title": "Deal Flow Email System",
    "type": "pdf"
  },
  {
    "id": 198,
    "title": "Deal by Deal Client Experience Survey",
    "type": "pdf"
  },
  {
    "id": 199,
    "title": "IMPACT FILTER - Deal by Deal Client Survey",
    "type": "pdf"
  },
  {
    "id": 200,
    "title": "Lottery Ticket Anniversary System",
    "type": "pdf"
  },
  {
    "id": 202,
    "title": "The Beginners Guide to Newsletter Marketing for Realtors",
    "type": "pdf"
  },
  {
    "id": 203,
    "title": "IMPACT FILTER - Newsletter System",
    "type": "pdf"
  },
  {
    "id": 228,
    "title": "Letter To Fear",
    "type": "pdf"
  },
  {
    "id": 230,
    "title": "Lesson Plan - Relationship With Fear",
    "type": "pdf"
  },
  {
    "id": 237,
    "title": "Energy Audit",
    "type": "pdf"
  },
  {
    "id": 240,
    "title": "Team Offer Builder",
    "type": "pdf"
  },
  {
    "id": 277,
    "title": "Client Feedback Insulator Results Example",
    "type": "pdf"
  }
]$source_identity$::jsonb;
  _guides constant jsonb := $guide_content$[
  {
    "id": "6b8d0290-b884-52b8-bcd1-e2444467fdce",
    "audience": "foundation",
    "systemKey": "hire_first_assistant",
    "steps": [
      {
        "id": "e51b6d83-997f-5be8-b1b2-f50e8b7fcaf5",
        "title": "Choose the work your first assistant will own",
        "description": "List the tasks in your business and mark which energize you, feel neutral or drain you. Use that audit to choose a focused first role and write down what you want off your plate. The guide suggests starting with one or two tasks or a defined project when that fits your needs; keep administrative and sales responsibilities distinct.",
        "resources": [
          {
            "resourceId": 181,
            "pageStart": 2,
            "pageEnd": 2
          },
          {
            "resourceId": 181,
            "pageStart": 5,
            "pageEnd": 5
          }
        ]
      },
      {
        "id": "615f4f2b-3013-56d9-b1fb-090a60840167",
        "title": "Write the role, working arrangement and candidate criteria",
        "description": "Document the responsibilities, required skills, hours, work location and compensation you will actually offer. Complete the hiring worksheet's must-haves and ideal-person sections using criteria relevant to the work. Decide how much experience and training the role needs. Confirm the appropriate employment or contractor arrangement for your situation before advertising; the source's sample wages, hours and classification examples are not defaults for your business.",
        "resources": [
          {
            "resourceId": 181,
            "pageStart": 2,
            "pageEnd": 5
          },
          {
            "resourceId": 183,
            "pageStart": 4,
            "pageEnd": 4
          }
        ]
      },
      {
        "id": "f91b06b3-a776-5cec-8cf5-226f6de597e8",
        "title": "Create and publish the job advertisement",
        "description": "Turn the role into an advertisement with a clear title, an honest introduction to your business and culture, the work involved, your ideal candidate, hours, compensation and application questions. Use the sample ads for structure and replace their employer-specific details. Publish the finished ad through the channels you choose for this role. A draft alone does not complete this step.",
        "resources": [
          {
            "resourceId": 181,
            "pageStart": 5,
            "pageEnd": 8
          },
          {
            "resourceId": 182,
            "pageStart": 1,
            "pageEnd": 5
          }
        ]
      },
      {
        "id": "fca7886a-cda8-5418-a0a7-288d62d1ac04",
        "title": "Review applications and complete introductory calls",
        "description": "Read the applications and their answers against your role criteria. Hold the short introductory phone conversations described in the guide to assess communication and initial fit, then choose who to invite to a fuller interview. Record the shortlist and what you learned rather than checking this off when calls are only booked.",
        "resources": [
          {
            "resourceId": 181,
            "pageStart": 8,
            "pageEnd": 9
          },
          {
            "resourceId": 183,
            "pageStart": 2,
            "pageEnd": 3
          }
        ]
      },
      {
        "id": "d6e37e13-7475-554d-86c8-916f06a16297",
        "title": "Interview the shortlist and choose your candidate",
        "description": "Use a conversational interview to explore the candidate's application answers, administrative experience, problem solving, ability to learn, communication and expectations. The question bank is a set of prompts, not a requirement to ask every question. Compare what you learned with the role's must-haves and record your hiring decision.",
        "resources": [
          {
            "resourceId": 181,
            "pageStart": 9,
            "pageEnd": 9
          },
          {
            "resourceId": 183,
            "pageStart": 2,
            "pageEnd": 4
          }
        ]
      },
      {
        "id": "e07a93cc-e6f3-5c3e-8cb9-5174ba907dd1",
        "title": "Confirm the hire and arrange the two-way review",
        "description": "Confirm that the chosen person has accepted the agreed role and working arrangement. Explain that you will both review the fit after working together, and book the guide's two-week re-interview so the assistant can also give feedback on working with you. Mark this complete when the hire is confirmed and the review is arranged, not when an offer is merely planned.",
        "resources": [
          {
            "resourceId": 181,
            "pageStart": 3,
            "pageEnd": 5
          },
          {
            "resourceId": 181,
            "pageStart": 9,
            "pageEnd": 9
          }
        ]
      }
    ]
  },
  {
    "id": "27adb3a5-968f-5a68-a0a8-5daa20d4be06",
    "audience": "foundation",
    "systemKey": "red_carpet_champagne_close",
    "steps": [
      {
        "id": "25eaf601-f5dd-5a68-ab15-0b65f491b4b4",
        "title": "Assemble the red carpet closing kit",
        "description": "Get the supplies together: a red carpet, two stanchions and a traditional sold sign. The guide uses a 10-foot by 3-foot carpet. Keep the sign free of your logo, contact details or promotional copy so the moment celebrates the client. Complete this when the kit is ready to use.",
        "resources": [
          {
            "resourceId": 188,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "d9ff5919-4398-53c1-a608-135267248db0",
        "title": "Prepare the possession-day experience",
        "description": "Work through how you will arrive early, place the carpet and stanchions facing the front door, welcome the clients and photograph them holding the sold sign. Include the photo-sharing approach: send the picture to the clients promptly and ask permission before posting it yourself. Save the agreed process so everyone involved understands what will happen.",
        "resources": [
          {
            "resourceId": 188,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "ccde65e9-8cb0-5e8b-a9b3-4024329020d6",
        "title": "Deliver the closing experience and share the photo",
        "description": "Use the prepared kit at an actual possession handover, celebrate the clients and send them their photo. If they agree to a public post, tell their story and tag them only with their permission; posting is not required. Keep this step open until the experience has happened. Retain the closing photo for the 90 Day Magnet follow-up if that system is also being implemented.",
        "resources": [
          {
            "resourceId": 188,
            "pageStart": 2,
            "pageEnd": 2
          },
          {
            "resourceId": 189,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      }
    ]
  },
  {
    "id": "0e087d57-e0af-523f-bb5c-58347e913deb",
    "audience": "foundation",
    "systemKey": "ninety_day_magnet",
    "steps": [
      {
        "id": "f02a0650-ca7d-56d8-8afe-a31bb5690d0a",
        "title": "Organize the closing photos and mailing batch",
        "description": "Gather the client-focused photos from your red carpet or closing experiences and identify the clients whose follow-up is due. The source sends the keepsake about three months later or in the next quarterly batch. Match the photos to their recipients and mailing details so you know which completed closings the batch covers.",
        "resources": [
          {
            "resourceId": 189,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "c5cfb2d2-7ca4-5551-9313-ef65d632b2d5",
        "title": "Choose the print format and obtain supplies",
        "description": "Choose between a 4-by-6 photo in a magnetic sleeve and a photo printed directly onto a magnet. Obtain the supplies for your chosen version, including the prints or printing service, mailing envelopes and postage. For the sleeve version, have business cards and a metallic marker available.",
        "resources": [
          {
            "resourceId": 189,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "51dd1819-f9ac-5dbd-95fe-12c8323c08f6",
        "title": "Produce and assemble the client magnets",
        "description": "Print the selected closing photos using the chosen format. If using sleeves, place each photo inside and put your business card behind it. Add your name and phone number on the back as described in the guide, keeping the client's photo as the focus. Address and stamp the envelopes for the prepared batch.",
        "resources": [
          {
            "resourceId": 189,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "a785ff6a-9a67-5594-a50c-0e23cd8c6bd8",
        "title": "Mail the completed batch",
        "description": "Send the assembled magnets to the selected clients. Record which batch was sent and when so the next implementation meeting can distinguish work already mailed from the next quarterly batch. Preparing or ordering magnets alone does not complete this step.",
        "resources": [
          {
            "resourceId": 189,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      }
    ]
  },
  {
    "id": "d0fb97f7-6969-511a-b892-1c00f2b648b6",
    "audience": "foundation",
    "systemKey": "birthday_system",
    "steps": [
      {
        "id": "307eba0d-4d02-57ee-93b8-3a00649028df",
        "title": "Build and check the birthday client list",
        "description": "Create the working list of clients and past clients with their full names, birthdays, mailing addresses and phone numbers. Organize it by birthday month and confirm the information you will use for the first delivery batch. Note any missing details that still need to be obtained.",
        "resources": [
          {
            "resourceId": 192,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "1c4f49e2-ce8a-5697-b41c-39eb54c5926a",
        "title": "Arrange the gift supplier and delivery process",
        "description": "Select a local company that can supply and deliver your chosen birthday gift. The guide offers cookies, peanut brittle, chocolate bars and cupcakes as examples rather than required choices. Confirm how the company wants to receive the cards and delivery list, including any information it needs on the envelopes.",
        "resources": [
          {
            "resourceId": 192,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "f2a9906f-9386-591e-a2e9-d6455300e0d2",
        "title": "Prepare the next month's cards and delivery list",
        "description": "Audit the addresses for the upcoming birthday batch and prepare its cards and master delivery list. Use birthday cards or printable blank cards, include your business card and add the recipient details required by the delivery company. The guide prepares the next month's batch in the last week of the current month.",
        "resources": [
          {
            "resourceId": 192,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "dca09b95-2ec5-504e-9672-0c77850b7b0c",
        "title": "Hand off the prepared birthday batch",
        "description": "Give the completed cards and master list to the supplier for the next month's deliveries. Confirm that the company has what it needs to run the batch. This marks the handoff as done; it does not claim that birthdays or deliveries scheduled for later have already happened.",
        "resources": [
          {
            "resourceId": 192,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      }
    ]
  },
  {
    "id": "ac26559b-2901-50cf-a747-db3dca910087",
    "audience": "foundation",
    "systemKey": "deal_flow_emails_installed",
    "steps": [
      {
        "id": "516318aa-bcda-5b1c-afb8-92d4a193a7f3",
        "title": "Map the buyer and seller email milestones",
        "description": "Write down the transaction events that should prompt each email in your business. The source provides buyer emails for pending, purchased and key release, plus seller emails for newly listed, pending, sold and key release. Put them in your actual transaction order and identify who will recognize each event and send the message.",
        "resources": [
          {
            "resourceId": 197,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "d9976863-995e-5b99-b3dc-ec1fe28f806c",
        "title": "Adapt and save the buyer email templates",
        "description": "Create your three buyer templates from the pending, purchased and key-release examples. Replace the sample business identity, contacts, attachments and service promises with your own. Check that the financing, inspection, document, possession and key-release wording accurately describes the requirements, timing and arrangements for your transactions. Save the finished templates where they will be used.",
        "resources": [
          {
            "resourceId": 197,
            "pageStart": 3,
            "pageEnd": 5
          }
        ]
      },
      {
        "id": "99e08967-38b1-53d0-8be7-843036d64ada",
        "title": "Adapt and save the seller email templates",
        "description": "Create your newly listed, pending, sold and key-release templates. Use the examples to explain what the client needs to know and do at each stage. Replace sample marketing commitments, provider details, pricing claims, transaction requirements and possession arrangements with those that apply to your service. Save the completed versions with any attachments they reference.",
        "resources": [
          {
            "resourceId": 197,
            "pageStart": 6,
            "pageEnd": 10
          }
        ]
      },
      {
        "id": "079cd196-1135-5a72-8793-6db41ff3fda1",
        "title": "Hand over the templates and sending responsibilities",
        "description": "Walk the assistant or person sending the emails through the saved buyer and seller templates and the agreed milestones. Confirm which client-specific details and attachments must be added each time. Complete this when the sender has the templates and understands when to use them; a future client email does not need to be marked as already sent to finish installing the system.",
        "resources": [
          {
            "resourceId": 197,
            "pageStart": 2,
            "pageEnd": 10
          }
        ]
      }
    ]
  },
  {
    "id": "4e8f5ff5-d1ab-5ff9-a488-a3d4f8e40641",
    "audience": "legends",
    "systemKey": "deal_by_deal_feedback_tracking",
    "steps": [
      {
        "id": "0bf6c23d-6c4c-5fda-9a6e-1537356b96c6",
        "title": "Prepare the client list and choose the survey trigger",
        "description": "If you are catching up, assemble the clients who bought, sold or leased through you in the period you choose; the guide starts with the last year and allows going further back. With your coach, choose and record the transaction milestone that will trigger surveys for new deals. Make clear whether you mean conditions waived, completion or another appropriate point in your process, so the person sending surveys can act consistently.",
        "resources": [
          {
            "resourceId": 198,
            "pageStart": 2,
            "pageEnd": 4
          },
          {
            "resourceId": 199,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "b8799238-316d-571f-8287-8b7c17bb1e25",
        "title": "Build the client experience survey",
        "description": "Create the questionnaire and its shareable link. Adapt the source prompts covering client and agent identity, satisfaction, service ratings, memorable experiences, likelihood of recommendation and what could be better. Keep any marketing testimonial request optional. Review the finished questions so your invitation describes the survey you actually built.",
        "resources": [
          {
            "resourceId": 198,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "52e66d5e-e4d7-5d01-931d-f357d76b8a07",
        "title": "Prepare the invitations, reminders and sending responsibility",
        "description": "Adapt the catch-up and ongoing invitations for a solo agent, team or assistant, using the versions that fit your business. Include the survey link and leave room for a genuine personal detail. Prepare a reminder for non-responders and agree who sends each message at the trigger you selected. These are reusable templates; no invitation is counted as sent in this step.",
        "resources": [
          {
            "resourceId": 198,
            "pageStart": 3,
            "pageEnd": 6
          },
          {
            "resourceId": 199,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "ad6daab4-b0ca-5a04-896c-4ea986f7206a",
        "title": "Send the first survey invitations",
        "description": "Send personalized invitations to your selected catch-up clients or the first clients who reach the agreed transaction milestone, using their suitable communication channel. Record which clients were contacted and send the prepared reminders where needed. Keep this step open until the invitations have actually gone out.",
        "resources": [
          {
            "resourceId": 198,
            "pageStart": 3,
            "pageEnd": 6
          },
          {
            "resourceId": 199,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "c02046cd-f4fc-56b8-a483-0788ec7ba6fd",
        "title": "Review responses and complete the client thank-yous",
        "description": "Read the received feedback, capture the improvements it reveals and save any testimonial the client provided for marketing use. Send a simple thank-you card to respondents. The guide suggests a small coffee gift card if affordable; it is optional. For a team, use the feedback to identify relevant coaching. Complete this after reviewing real responses and sending the thank-yous, not merely agreeing to do so later.",
        "resources": [
          {
            "resourceId": 198,
            "pageStart": 7,
            "pageEnd": 8
          },
          {
            "resourceId": 199,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      }
    ]
  },
  {
    "id": "76f5b383-21ee-5993-83ac-319b88916a29",
    "audience": "legends",
    "systemKey": "lottery_ticket_anniversary",
    "steps": [
      {
        "id": "adfccd96-d70a-5a6e-86ad-3b1978818d3c",
        "title": "Organize the anniversary client list by month",
        "description": "Build the anniversary spreadsheet with a tab for each month. Include the clients' full names, current mailing address, the year they bought and the relationship type needed to choose a suitable message. Use the actual anniversary month to place each household in the right batch.",
        "resources": [
          {
            "resourceId": 200,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "edfa5142-a5ff-5312-8c77-14fc9d67c282",
        "title": "Adapt the anniversary messages for your clients",
        "description": "Choose and personalize the scripts for the relationship and anniversary year: the source distinguishes new buyers and personal friends, with wording for individuals, couples and families. Preserve that personal fit rather than sending every household the same message. Note the fourth-year small-gift variation and the milestone-year messages you intend to use.",
        "resources": [
          {
            "resourceId": 200,
            "pageStart": 3,
            "pageEnd": 8
          }
        ]
      },
      {
        "id": "2a843948-d5dd-57a7-a826-361399acde31",
        "title": "Prepare the anniversary cards and gifts",
        "description": "Prepare the upcoming month's batch in the last week of the current month: write the selected messages, address the cards and include the anniversary gift. The guide's standard version uses blank thank-you cards and $2 lottery tickets, with one ticket for each anniversary year; its fourth-year script includes a small-gift variation. Use the version you have chosen for each client and finish assembling the batch.",
        "resources": [
          {
            "resourceId": 200,
            "pageStart": 2,
            "pageEnd": 8
          }
        ]
      },
      {
        "id": "616d4ded-6ef3-5253-84cf-e36df1c9bef0",
        "title": "Send the prepared anniversary batch",
        "description": "Mail the completed anniversary cards and carry out any selected gift drop-offs. Record the batch and recipients so the following meeting can pick up with the next month. Ordering supplies or writing cards does not by itself complete the mailing.",
        "resources": [
          {
            "resourceId": 200,
            "pageStart": 2,
            "pageEnd": 8
          }
        ]
      }
    ]
  },
  {
    "id": "3fc7337c-bd95-5a1a-a827-e9a9dd729feb",
    "audience": "legends",
    "systemKey": "client_feedback_insulator",
    "steps": [
      {
        "id": "4cdfb101-7e16-5f42-be16-5f2a4adb6c3b",
        "title": "Prepare the client list and delegate the project",
        "description": "Review your past-client list and make straightforward updates. The guide allows a deliberate decision to proceed with the existing list if a larger cleanup would delay the project. Walk the assistant through the guide and available training, agree the intended result and use an Impact Filter if helpful to make the work and definition of done clear.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 2,
            "pageEnd": 2
          },
          {
            "resourceId": 194,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "9847843f-ef3e-5251-a355-e9a1cc9ea580",
        "title": "Create your feedback form",
        "description": "Make your own copy of the Reboot feedback-form example and adapt it to your business. Enable the form setting that sends respondents a copy of their answers, as the guide specifies. Have the final form and response link ready before creating messages around it.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "e207cdd5-df3c-5b28-b03c-660743eed969",
        "title": "Prepare the campaign messages and schedule",
        "description": "Set the launch, response deadline and prize-draw details for this campaign, then adapt the launch email, reminder email/text, countdown messages and winner announcement. Replace all blanks with your own details and form link. Decide the actual incentives before promising them in the copy. Prepare a short newsletter item explaining why you value feedback. Use your chosen dates rather than the example date on the Impact Filter.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 2,
            "pageEnd": 5
          },
          {
            "resourceId": 194,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "6f236aaa-7bf4-5e84-9208-360c6de3393a",
        "title": "Launch the feedback request and follow up",
        "description": "Send the launch email to the chosen client list and include the feedback request in your newsletter. Follow up with clients who have not responded using the prepared email or text, and send the planned countdown messages. This step records an actual campaign launch and follow-up, not simply a ready-to-send draft.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 2,
            "pageEnd": 2
          },
          {
            "resourceId": 193,
            "pageStart": 4,
            "pageEnd": 5
          }
        ]
      },
      {
        "id": "1fc88f09-49e9-5d9c-b4d7-826eceb3e80e",
        "title": "Run the draw and announce the winner",
        "description": "Carry out the prize draw you described to clients. The guide offers either a live session or a recording shared afterwards, using a digital wheel as one possible tool. Announce the actual winner with the prepared message and share the recording or result as planned. Leave this open until the draw has happened.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 3,
            "pageEnd": 3
          },
          {
            "resourceId": 193,
            "pageStart": 5,
            "pageEnd": 5
          }
        ]
      },
      {
        "id": "51b6ae6d-5673-5606-80d5-e1fcea010757",
        "title": "Write the feedback findings and improvement actions",
        "description": "Read the responses and summarize what is working and what you will change, adjust or improve. A clear list or a few honest paragraphs is enough; the goal is to show clients that their opinions affected your decisions. The results-example PDF illustrates one possible presentation, not a requirement to create a long report or copy its scores.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 3,
            "pageEnd": 3
          },
          {
            "resourceId": 277,
            "pageStart": 2,
            "pageEnd": 16
          }
        ]
      },
      {
        "id": "0ef83c9a-1a4c-5d7f-9de1-7d7aea4b5590",
        "title": "Send the thank-you cards and findings",
        "description": "Prepare and send the respondent thank-you mailout with the findings report. Personalize the card and include the appreciation gift you promised; the guide illustrates this with a small coffee gift card. Complete this only once the mailout has been sent, so the work remains visible if it carries into the next meeting.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 3,
            "pageEnd": 3
          }
        ]
      },
      {
        "id": "22bc3ba7-d221-5466-ad99-d53319a48c98",
        "title": "Put the next annual campaign on the calendar",
        "description": "Add the recurring campaign to the team's calendar and make clear who will execute it. The guide recommends a November campaign as an annual client touch; choose and save the dates for your business. This completes scheduling the next cycle without marking that future campaign as already run.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 3,
            "pageEnd": 3
          }
        ]
      }
    ]
  },
  {
    "id": "f2790895-dc78-5af1-b19a-c91b66591059",
    "audience": "legends",
    "systemKey": "newsletter_system",
    "steps": [
      {
        "id": "95c1310c-56e0-51d5-afb0-1636ad12c4a7",
        "title": "Choose the sending platform, cadence and responsibilities",
        "description": "Choose the email platform or an existing CRM that supports the newsletter. Set a weekly, fortnightly or monthly cadence that you can maintain. Agree who supplies content, prepares the draft, reviews it and sends it; if an assistant helps, set content reminders and a clear review/send arrangement. Save the schedule rather than copying the example times in the guide.",
        "resources": [
          {
            "resourceId": 202,
            "pageStart": 3,
            "pageEnd": 3
          },
          {
            "resourceId": 203,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "7c572efa-b81f-5538-bfc8-f768af4b95c9",
        "title": "Prepare and load the newsletter audience",
        "description": "Organize the contacts you intend to include, with email address, name and useful source or category information. Confirm who belongs on the mailing list, address missing or invalid details and import the prepared list into your chosen platform. Decide how new contacts will join, such as manual additions or a sign-up form. Preserve unsubscribe choices when maintaining the list.",
        "resources": [
          {
            "resourceId": 202,
            "pageStart": 4,
            "pageEnd": 5
          },
          {
            "resourceId": 202,
            "pageStart": 7,
            "pageEnd": 7
          }
        ]
      },
      {
        "id": "45a82abd-681c-531c-b1c3-66c6a7c44cac",
        "title": "Build the reusable newsletter template",
        "description": "Create a template with space for a personal photo and opening message, useful business content, a clear next action and a short introduction to you. Add a video section only if you have relevant video content. Use a recognizable sender, make replies reach the inbox you monitor and include an unsubscribe link.",
        "resources": [
          {
            "resourceId": 202,
            "pageStart": 5,
            "pageEnd": 7
          }
        ]
      },
      {
        "id": "bbad9325-2159-5024-9ad9-34ef79fc71a7",
        "title": "Write and test the first newsletter",
        "description": "Create the subject line, preview text, personal opening and useful content for the first issue. The guide suggests explaining a market insight, sharing an appropriate client story or answering a common question. Add a clear invitation to reply, book a conversation or take the relevant next step. Send yourself a test and check the content, links and display on desktop and mobile before approving it.",
        "resources": [
          {
            "resourceId": 202,
            "pageStart": 6,
            "pageEnd": 7
          }
        ]
      },
      {
        "id": "d5710450-7921-5753-8bd3-c2ad5bf5e719",
        "title": "Send the first issue using the agreed process",
        "description": "Complete the review and send the approved newsletter to the prepared audience. Record which issue was sent and confirm that the next content and sending dates are in the schedule. Keep this open while the issue is only drafted or scheduled for a future send; the checkbox confirms that the first issue has gone out.",
        "resources": [
          {
            "resourceId": 202,
            "pageStart": 3,
            "pageEnd": 3
          },
          {
            "resourceId": 203,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      }
    ]
  },
  {
    "id": "7ce7f55f-d8b3-5d63-a319-c35388349fa2",
    "audience": "legends",
    "systemKey": "four_quadrant_team_offer",
    "steps": [
      {
        "id": "cb689233-9b9e-59ee-b075-9c7dbfddcc16",
        "title": "Define the team administration offer",
        "description": "Complete the administration quadrant with the support your team actually provides or is committing to provide. The examples include paperwork, deal-flow emails, showing feedback, client-care systems, booking support and CRM management. Describe the offer clearly enough that a prospective team member can understand what work is handled for them; the example list is not a requirement to install every named system.",
        "resources": [
          {
            "resourceId": 240,
            "pageStart": 1,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "2c706979-944a-59b8-a149-0817d84a677d",
        "title": "Define the lead-flow offer",
        "description": "Complete the lead-flow quadrant with the opportunities your team can offer, using the sample as a prompt. Examples include mailouts, open houses, referral relationships, existing clients and exclusive listings. Replace the sample with your own offer and distinguish existing sources from anything you still intend to build.",
        "resources": [
          {
            "resourceId": 240,
            "pageStart": 1,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "c63472b7-e52e-58db-851a-0fc139348fc6",
        "title": "Write the culture and values offer",
        "description": "Describe the team culture and values you want members to experience. Use the five statement pillars to make the wording specific: client experience, work ethic, team character, what you will not do and what matters beyond real estate. Write your own beliefs instead of adopting the sample team's mission statement.",
        "resources": [
          {
            "resourceId": 240,
            "pageStart": 1,
            "pageEnd": 4
          }
        ]
      },
      {
        "id": "f5d56483-ecc9-5568-ac11-99b9f6d8bec3",
        "title": "Complete the coaching offer and assemble the four quadrants",
        "description": "Define the coaching and training support included in the offer, such as individual coaching, team meetings, listing training or deal reviews where those fit your team. Bring the four completed quadrants together in the offer worksheet and review the whole offer for clarity and consistency. This completes the offer document; it does not claim that every example service or a team-member hire has already been implemented.",
        "resources": [
          {
            "resourceId": 240,
            "pageStart": 1,
            "pageEnd": 2
          }
        ]
      }
    ]
  },
  {
    "id": "61bac3db-85e9-518a-81ad-f84a7013e568",
    "audience": "legends",
    "systemKey": "relationship_energy_audit",
    "steps": [
      {
        "id": "8e9bdb9a-462d-5db4-8e2d-aec38463d533",
        "title": "List and rate your influential relationships",
        "description": "Use the People in Your Life worksheet to list up to ten influential relationships, including both energizing and draining ones. Rate each from 1 to 10, where 1 is strongly draining and 10 is strongly energizing. Complete the ratings before moving to the reflection questions.",
        "resources": [
          {
            "resourceId": 237,
            "pageStart": 7,
            "pageEnd": 7
          }
        ]
      },
      {
        "id": "43364a95-8116-5cc0-97ea-369ac1554e18",
        "title": "Complete the reflection and identify what needs to change",
        "description": "Work through the prompts about defending people, filtering what you say, giving more than you receive and avoiding honest conversations. Consider whether these relationships strengthen or weaken you, then write what you want to change. Completing the audit means you have made these observations and identified changes; it does not mean a conversation or relationship change has already happened.",
        "resources": [
          {
            "resourceId": 237,
            "pageStart": 7,
            "pageEnd": 8
          }
        ]
      }
    ]
  },
  {
    "id": "33d6c92b-9c9f-53f0-9f79-d0e5ce7c2257",
    "audience": "legends",
    "systemKey": "environmental_energy_audit",
    "steps": [
      {
        "id": "a12f17b7-a936-503e-86bf-b3fac21a1e02",
        "title": "Rate the parts of your environment",
        "description": "Rate how your office location and space, brokerage, commute, car, clothes, home, city, neighbourhood and holidays affect your energy. Use 1 for draining and 10 for energizing, avoiding 5 and 7 as the worksheet instructs. Record an honest rating for each relevant area.",
        "resources": [
          {
            "resourceId": 237,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "afdcd9f7-09f1-558b-b818-f4349aac666e",
        "title": "Write the environmental changes you want to make",
        "description": "Review the ratings and answer the worksheet's question about what needs to change to improve your energy. Record specific changes in the areas that matter most to you. This completes the audit and its decisions; any subsequent move, purchase or change to your environment remains separate work.",
        "resources": [
          {
            "resourceId": 237,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      }
    ]
  },
  {
    "id": "5c7d6957-e5ad-5348-ba86-49fc379da077",
    "audience": "legends",
    "systemKey": "business_task_energy_audit",
    "steps": [
      {
        "id": "fef6c7ed-0e88-53b7-aa3d-9a2f629dde4d",
        "title": "Complete the business-task energy table",
        "description": "Work through the task table and mark each activity as Fuels Me, N/A or Drains Me. It includes activities such as booking showings, managing listings and CRM, client care, documents, negotiations, prospecting, content and bookkeeping. Use the table to distinguish the work that gives you energy from the work that takes it away.",
        "resources": [
          {
            "resourceId": 237,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "ca975aad-213a-582a-ab40-2a34caf596a4",
        "title": "Complete the work reflection and identify changes",
        "description": "Rate how much you enjoy your work from 1 to 10 and write what would make it a 10. Reflect on what else you would choose to do, which parts of the business drain you and where you gain the most energy. Finish by recording what needs to change in your work. Identifying a task to change or delegate does not mean the delegation itself is finished.",
        "resources": [
          {
            "resourceId": 237,
            "pageStart": 3,
            "pageEnd": 3
          }
        ]
      }
    ]
  },
  {
    "id": "a4642aa2-a621-5fc1-9b50-a5165c805ba5",
    "audience": "legends",
    "systemKey": "relationship_with_fear_write_letter",
    "steps": [
      {
        "id": "8817640b-c397-5897-9d73-b536260d9a1e",
        "title": "Reflect on your relationship with fear",
        "description": "Identify where fear has helped protect you and where it has been directing choices you want to make differently. Use the lesson's distinction between fear as a reference and fear as the driver to capture what your relationship has been like and what you want it to become.",
        "resources": [
          {
            "resourceId": 230,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "cf88bc13-c48e-596b-bd35-2e368573807d",
        "title": "Write the letter to fear",
        "description": "Write your own complete letter using the worksheet's three prompts: what you thank fear for, what your relationship has been over the years and what that relationship will look like going forward. Put the reflection into your own words and finish the letter. This step confirms that the letter exists; it does not claim completion of the separate training, questionnaire or growth-action assignment.",
        "resources": [
          {
            "resourceId": 228,
            "pageStart": 1,
            "pageEnd": 1
          },
          {
            "resourceId": 230,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      }
    ]
  },
  {
    "id": "480278c5-5f7d-5631-96e0-272356079269",
    "audience": "legends",
    "systemKey": "impact_filter_used_for_delegation",
    "steps": [
      {
        "id": "27444294-c392-5b25-9a4a-3e73a3dec228",
        "title": "Define the delegated project's purpose and result",
        "description": "Choose a real piece of work to delegate and complete the Impact Filter's problem, impact and completed-result fields. Describe why the work matters and what the finished output will look like. Use a completed example for the format, while writing the purpose and result for your own project.",
        "resources": [
          {
            "resourceId": 185,
            "pageStart": 1,
            "pageEnd": 1
          },
          {
            "resourceId": 194,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "1a2ab71b-9a0a-5926-a5b4-d58c1b0f286f",
        "title": "Complete the work plan and success criteria",
        "description": "Fill in the best- and worst-case outcomes, the five main chunks of work, success criteria, first actions and project completion date. Make the success criteria concrete enough to recognize when the result is complete. Choose the date for this project; do not reuse the date printed on a sample Impact Filter.",
        "resources": [
          {
            "resourceId": 185,
            "pageStart": 1,
            "pageEnd": 1
          },
          {
            "resourceId": 194,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "5771c408-265f-5aa4-8252-c16111adae27",
        "title": "Use the completed filter in the delegation conversation",
        "description": "Meet with the person taking on the work and walk them through the completed filter, supporting instructions, main steps and what done looks like. Clarify the result and next actions together. Check this off after that handoff conversation has happened; completing the form alone is not yet using it for delegation, and the delegated project may still be in progress.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 2,
            "pageEnd": 2
          },
          {
            "resourceId": 185,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      }
    ]
  }
]$guide_content$::jsonb;
  _resource_map jsonb := '{}'::jsonb;
  _source jsonb;
  _original_id bigint;
  _resolved_id bigint;
  _candidate_ids bigint[];
  _guide jsonb;
  _audience public.system_scorecard_audience;
  _system_key text;
  _guide_id uuid;
  _inserted_id uuid;
  _step jsonb;
  _reference jsonb;
  _resources jsonb;
  _steps jsonb;
  _normalized_steps jsonb;
  _inserted_count integer := 0;
begin
  -- Prevent renames/deletes or new duplicate titles during identity resolution.
  -- This lock lasts only for this small, privileged bootstrap transaction.
  lock table public.resources in share mode;

  for _source in select value from jsonb_array_elements(_sources) loop
    _original_id := (_source ->> 'id')::bigint;
    _resolved_id := null;
    select r.id into _resolved_id
    from public.resources r
    where r.id = _original_id
      and r.title = _source ->> 'title'
      and r.type::text = _source ->> 'type';

    if _resolved_id is null then
      -- An ID reused by a different local resource must never win the match.
      select array_agg(r.id order by r.id) into _candidate_ids
      from public.resources r
      where r.title = _source ->> 'title'
        and r.type::text = _source ->> 'type';
      if cardinality(_candidate_ids) = 1 then
        _resolved_id := _candidate_ids[1];
      else
        raise notice 'Implementation guide seed: omitting references to source % (%) because exact title/type matched % local resources.',
          _original_id, _source ->> 'title', coalesce(cardinality(_candidate_ids), 0);
      end if;
    end if;

    if _resolved_id is not null then
      _resource_map := _resource_map || jsonb_build_object(_original_id::text, _resolved_id);
    end if;
  end loop;

  for _guide in select value from jsonb_array_elements(_guides) loop
    _audience := (_guide ->> 'audience')::public.system_scorecard_audience;
    _system_key := _guide ->> 'systemKey';
    _guide_id := (_guide ->> 'id')::uuid;

    perform 1
    from public.system_scorecard_systems s
    join public.system_scorecard_templates t on t.key = s.template_key
    where t.audience = _audience and t.is_active and s.key = _system_key
    for share of t, s;
    if not found then
      raise notice 'Implementation guide seed: skipping %/% because no matching active scorecard system exists.', _audience, _system_key;
      continue;
    end if;

    if exists (
      select 1 from public.system_implementation_guides g
      where g.audience = _audience and g.system_key = _system_key
    ) then
      continue;
    end if;

    _steps := '[]'::jsonb;
    for _step in select value from jsonb_array_elements(_guide -> 'steps') loop
      _resources := '[]'::jsonb;
      for _reference in select value from jsonb_array_elements(_step -> 'resources') loop
        _resolved_id := (_resource_map ->> (_reference ->> 'resourceId'))::bigint;
        if _resolved_id is not null then
          _resources := _resources || jsonb_build_array(
            jsonb_set(_reference, '{resourceId}', to_jsonb(_resolved_id))
          );
        end if;
      end loop;
      _steps := _steps || jsonb_build_array(jsonb_set(_step, '{resources}', _resources));
    end loop;

    -- Use the same internal validator/normalizer as administrator saves, after
    -- remapping resource IDs. Empty reference arrays are intentionally valid.
    _normalized_steps := public.normalize_system_implementation_guide_steps(_steps);

    _inserted_id := null;
    insert into public.system_implementation_guides (id, audience, system_key, current_revision)
    values (_guide_id, _audience, _system_key, 1)
    on conflict (audience, system_key) do nothing
    returning id into _inserted_id;

    if _inserted_id is not null then
      insert into public.system_implementation_guide_versions (guide_id, revision, steps)
      values (_inserted_id, 1, _normalized_steps);
      _inserted_count := _inserted_count + 1;
    end if;
  end loop;

  raise notice 'Implementation guide seed: created % guides; preserved all pre-existing guides.', _inserted_count;
end;
$seed_implementation_guides$;

-- Migration 20260929010000_coaching_notes_history
-- Source SHA-256 (LF): 3d0e63702f7e33c1893fd3584d2dc9ff235ff0117088c6ad6cb2a64bf607c3a2
create table public.general_coaching_notes (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (length(btrim(body, E' \t\r\n')) between 1 and 30000),
  created_at timestamptz not null default clock_timestamp()
);
create index general_coaching_notes_user_idx on public.general_coaching_notes(user_id,id);
comment on table public.general_coaching_notes is 'Staff-only notes about a member, independent of coaching cycles; IDs provide idempotent creation.';

create function public.can_access_member_coaching_notes(_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=_user_id)
    and (public.has_role(array['admin','superadmin']::text[])
      or (public.has_role(array['coach','implementation_coach']::text[]) and exists (
        select 1 from public.user_coaches c where c.user_id=_user_id and c.coach_id=auth.uid()
          and c.is_active and (c.ended_at is null or c.ended_at>now())
      )));
$$;
revoke all on function public.can_access_member_coaching_notes(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_access_member_coaching_notes(uuid) to authenticated,service_role;

alter table public.general_coaching_notes enable row level security;
create policy general_coaching_notes_staff_read on public.general_coaching_notes
  for select to authenticated using(public.can_access_member_coaching_notes(user_id));
revoke all on public.general_coaching_notes from public,anon,authenticated,service_role;
grant select on public.general_coaching_notes to authenticated,service_role;

create function public.add_general_coaching_note(_user_id uuid,_body text,_request_id uuid)
returns public.general_coaching_notes language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  _actor uuid := auth.uid();
  _note public.general_coaching_notes%rowtype;
  _text text := btrim(_body,E' \t\r\n');
begin
  if not public.can_access_member_coaching_notes(_user_id) then
    raise exception 'You do not have access to these coaching notes.' using errcode='42501';
  end if;
  if _request_id is null or _text is null or length(_text) not between 1 and 30000 then
    raise exception 'A unique request ID and note of 1-30000 characters are required.' using errcode='22023';
  end if;
  insert into public.general_coaching_notes(id,user_id,author_id,body)
  values(_request_id,_user_id,_actor,_text) on conflict(id) do nothing;
  select n.* into _note from public.general_coaching_notes n where n.id=_request_id;
  if _note.user_id<>_user_id or _note.author_id is distinct from _actor or _note.body<>_text then
    raise exception 'This note request ID has already been used. Please start a new note.' using errcode='22023';
  end if;
  return _note;
end;
$$;
revoke all on function public.add_general_coaching_note(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.add_general_coaching_note(uuid,text,uuid) to authenticated,service_role;

alter table public.implementation_meeting_sessions
  add column notes_written_at timestamptz,
  add column notes_author_id uuid references public.profiles(id) on delete set null,
  add column notes_updated_at timestamptz,
  add column notes_updated_by uuid references public.profiles(id) on delete set null;
comment on column public.implementation_meeting_sessions.notes_written_at is
  'First written time for the current meeting-note content; null for pre-tracking notes with unknown provenance. Never inferred from general session updates.';

create function public.track_implementation_note_attribution()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.notes is not distinct from old.notes and new.commitments is not distinct from old.commitments then
    return new;
  end if;
  if length(btrim(old.notes,E' \t\r\n'))=0 and length(btrim(old.commitments,E' \t\r\n'))=0
    and (length(btrim(new.notes,E' \t\r\n'))>0 or length(btrim(new.commitments,E' \t\r\n'))>0) then
    new.notes_written_at := clock_timestamp();
    new.notes_author_id := auth.uid();
    new.notes_updated_at := null;
    new.notes_updated_by := null;
  else
    -- Existing nonempty notes retain their original attribution, including
    -- unknown/null legacy values. Only the subsequent edit has known provenance.
    new.notes_updated_at := clock_timestamp();
    new.notes_updated_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function public.track_implementation_note_attribution() from public,anon,authenticated,service_role;
create trigger implementation_notes_attribution before update of notes,commitments
  on public.implementation_meeting_sessions for each row
  execute function public.track_implementation_note_attribution();

-- Migration 20260929020000_manual_implementation_meetings
-- Source SHA-256 (LF): 6b6d35bf74be23acc09834d4faa0b46b2f1b0fa951a6f20b3d5ff0b000c178e1
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

-- Migration 20260929030000_implementation_next_meeting_booking
-- Source SHA-256 (LF): 6ac2f62f4b623515acbb389c47f67e046c182b0660b859424b7d41333a3acc86
alter table public.implementation_meeting_sessions
  add column next_meeting_booked boolean not null default false;
comment on column public.implementation_meeting_sessions.next_meeting_booked is
  'Coach-confirmed booking of the next meeting, recorded independently for this session. Does not imply attendance or progress.';

-- Keep all existing authorization, revision, cancellation and cycle behavior.
-- Apply only the new operation to the latest installed workspace function,
-- including changes from the earlier manual-meeting migration.
do $patch$
declare
  _definition text;
  _old text[] := array[
    $old$'complete_meeting','reopen_meeting','set_attendance','set_action_status')$old$,
    $old$    when 'set_attendance' then array['attended']$old$,
    $old$  if _operation not in ('save_notes','set_attendance') then$old$,
    $old$    when 'set_attendance' then
      if jsonb_typeof(_payload->'attended') is distinct from 'boolean' then$old$,
    $old$    completed_at=_session.completed_at,notes=_session.notes,commitments=_session.commitments,$old$
  ];
  _new text[] := array[
    $new$'complete_meeting','reopen_meeting','set_attendance','set_action_status','set_next_meeting_booked')$new$,
    $new$    when 'set_attendance' then array['attended']
    when 'set_next_meeting_booked' then array['booked']$new$,
    $new$  if _operation not in ('save_notes','set_attendance','set_next_meeting_booked') then$new$,
    $new$    when 'set_next_meeting_booked' then
      if jsonb_typeof(_payload->'booked') is distinct from 'boolean' then
        raise exception 'The booked value must be a boolean.' using errcode = '22023';
      end if;
      _session.next_meeting_booked := (_payload->>'booked')::boolean;
    when 'set_attendance' then
      if jsonb_typeof(_payload->'attended') is distinct from 'boolean' then$new$,
    $new$    completed_at=_session.completed_at,notes=_session.notes,commitments=_session.commitments,
    next_meeting_booked=_session.next_meeting_booked,$new$
  ];
  _i integer;
begin
  _definition := replace(pg_get_functiondef('public.mutate_implementation_workspace(bigint,bigint,text,jsonb,integer)'::regprocedure),chr(13),'');
  for _i in 1..array_length(_old,1) loop
    _old[_i] := replace(_old[_i],chr(13),'');
    _new[_i] := replace(_new[_i],chr(13),'');
    if (length(_definition)-length(replace(_definition,_old[_i],'')))/length(_old[_i]) <> 1 then
      raise exception 'Workspace booking operation prerequisite % does not match.',_i;
    end if;
    _definition := replace(_definition,_old[_i],_new[_i]);
  end loop;
  execute _definition;
end;
$patch$;

-- Register the exact six canonical migrations in the same transaction.
insert into supabase_migrations.schema_migrations (version,name,statements)
values
  ('20260925010000','system_implementation_guides',array[$migration_20260925010000$begin;

-- Guides follow a stable system key across scorecard versions. A published
-- revision is a snapshot; clearing the current checklist writes an empty revision.
create table public.system_implementation_guides (
  id uuid primary key default gen_random_uuid(),
  audience public.system_scorecard_audience not null,
  system_key text not null check (length(btrim(system_key)) between 1 and 120),
  current_revision integer not null default 0 check (current_revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (audience, system_key)
);

create table public.system_implementation_guide_versions (
  guide_id uuid not null references public.system_implementation_guides(id),
  revision integer not null check (revision > 0),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 50),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (guide_id, revision)
);

-- Deferred only to allow inserting a header and its first snapshot atomically.
alter table public.system_implementation_guides
  add constraint system_implementation_guides_current_version_fk
  foreign key (id, current_revision)
  references public.system_implementation_guide_versions(guide_id, revision)
  deferrable initially deferred;

comment on table public.system_implementation_guides is
  'Reusable implementation checklist per scorecard audience and stable system key; no member data.';
comment on table public.system_implementation_guide_versions is
  'Append-only ordered checklist snapshots. Existing revisions must never be edited by application clients.';

alter table public.system_implementation_guides enable row level security;
alter table public.system_implementation_guide_versions enable row level security;
create policy system_implementation_guides_staff_read
  on public.system_implementation_guides for select to authenticated
  using (public.has_role(array['admin', 'superadmin', 'coach', 'implementation_coach']::text[]));
create policy system_implementation_guide_versions_staff_read
  on public.system_implementation_guide_versions for select to authenticated
  using (public.has_role(array['admin', 'superadmin', 'coach', 'implementation_coach']::text[]));

-- Explicitly remove legacy default grants, including service-role direct writes.
revoke all on public.system_implementation_guides from public, anon, authenticated, service_role;
revoke all on public.system_implementation_guide_versions from public, anon, authenticated, service_role;
grant select on public.system_implementation_guides to authenticated, service_role;
grant select on public.system_implementation_guide_versions to authenticated, service_role;

create function public.normalize_system_implementation_guide_steps(_steps jsonb)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  _step jsonb;
  _source jsonb;
  _normalized_source jsonb;
  _normalized_steps jsonb := '[]'::jsonb;
  _normalized_sources jsonb;
  _step_ids uuid[] := '{}';
  _step_id uuid;
  _title text;
  _description text;
  _resource_id numeric;
  _page_start numeric;
  _page_end numeric;
begin
  if jsonb_typeof(_steps) is distinct from 'array' then
    raise exception 'Steps must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(_steps) > 50 then
    raise exception 'A guide can contain at most 50 steps.' using errcode = '22023';
  end if;

  for _step in select value from jsonb_array_elements(_steps) loop
    if jsonb_typeof(_step) is distinct from 'object' then
      raise exception 'Each step must be an object.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(_step) k where k not in ('id', 'title', 'description', 'resources'))
      or jsonb_typeof(_step -> 'id') is distinct from 'string'
      or jsonb_typeof(_step -> 'title') is distinct from 'string'
      or jsonb_typeof(_step -> 'description') is distinct from 'string'
    then
      raise exception 'Each step requires only id, title, description and optional resources.' using errcode = '22023';
    end if;
    if (_step ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Each step requires a UUID id.' using errcode = '22023';
    end if;
    _step_id := (_step ->> 'id')::uuid;
    if _step_id = any(_step_ids) then
      raise exception 'Step ids must be unique within a guide.' using errcode = '22023';
    end if;
    _step_ids := array_append(_step_ids, _step_id);
    _title := btrim(_step ->> 'title', E' \t\r\n');
    _description := btrim(_step ->> 'description', E' \t\r\n');
    if length(_title) not between 1 and 160 or length(_description) not between 1 and 8000 then
      raise exception 'Step titles must be 1-160 characters and descriptions 1-8000 characters.' using errcode = '22023';
    end if;
    if _step ? 'resources' and jsonb_typeof(_step -> 'resources') is distinct from 'array' then
      raise exception 'Step resources must be an array.' using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(_step -> 'resources', '[]'::jsonb)) > 10 then
      raise exception 'A step can reference at most 10 resources.' using errcode = '22023';
    end if;
    _normalized_sources := '[]'::jsonb;
    for _source in select value from jsonb_array_elements(coalesce(_step -> 'resources', '[]'::jsonb)) loop
      if jsonb_typeof(_source) is distinct from 'object' then
        raise exception 'Each resource reference must be an object.' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_object_keys(_source) k where k not in ('resourceId', 'pageStart', 'pageEnd'))
        or jsonb_typeof(_source -> 'resourceId') is distinct from 'number'
      then
        raise exception 'Resource references require only resourceId and optional pageStart/pageEnd.' using errcode = '22023';
      end if;
      _resource_id := (_source ->> 'resourceId')::numeric;
      if _resource_id < 1 or _resource_id > 9007199254740991 or trunc(_resource_id) <> _resource_id then
        raise exception 'Resource ids must be positive safe integers.' using errcode = '22023';
      end if;
      if (_source ? 'pageStart' and jsonb_typeof(_source -> 'pageStart') not in ('number', 'null'))
        or (_source ? 'pageEnd' and jsonb_typeof(_source -> 'pageEnd') not in ('number', 'null'))
      then
        raise exception 'Page numbers must be positive integers or null.' using errcode = '22023';
      end if;
      _page_start := (_source ->> 'pageStart')::numeric;
      _page_end := (_source ->> 'pageEnd')::numeric;
      if (_page_start is not null and (_page_start < 1 or _page_start > 2147483647 or trunc(_page_start) <> _page_start))
        or (_page_end is not null and (_page_end < 1 or _page_end > 2147483647 or trunc(_page_end) <> _page_end))
        or (_page_end is not null and (_page_start is null or _page_end < _page_start))
      then
        raise exception 'Page ranges require positive integers and an end at or after the start.' using errcode = '22023';
      end if;
      -- Validate existence, not media type: future references may be videos or docs.
      perform 1 from public.resources r where r.id = _resource_id::bigint for key share;
      if not found then
        raise exception 'Resource % does not exist.', _resource_id using errcode = '22023';
      end if;
      _normalized_source := jsonb_build_object(
        'resourceId', _resource_id::bigint,
        'pageStart', _page_start::integer,
        'pageEnd', _page_end::integer
      );
      if _normalized_sources @> jsonb_build_array(_normalized_source) then
        raise exception 'Duplicate resource and page references are not allowed within a step.' using errcode = '22023';
      end if;
      _normalized_sources := _normalized_sources || jsonb_build_array(_normalized_source);
    end loop;
    _normalized_steps := _normalized_steps || jsonb_build_array(jsonb_build_object(
      'id', _step_id, 'title', _title, 'description', _description, 'resources', _normalized_sources
    ));
  end loop;
  return _normalized_steps;
end;
$$;
revoke all on function public.normalize_system_implementation_guide_steps(jsonb)
  from public, anon, authenticated, service_role;

create function public.save_system_implementation_guide(
  _audience public.system_scorecard_audience,
  _system_key text,
  _expected_revision integer,
  _steps jsonb
)
returns table (guide_id uuid, revision integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _actor_id uuid := auth.uid();
  _guide public.system_implementation_guides%rowtype;
  _normalized_steps jsonb;
  _next_revision integer;
begin
  if _actor_id is null or not public.has_role(array['admin', 'superadmin']::text[]) then
    raise exception 'Implementation guide editing requires an administrator.' using errcode = '42501';
  end if;
  if _audience is null or _system_key is null or length(_system_key) not between 1 and 120
    or _system_key <> btrim(_system_key) or _expected_revision is null or _expected_revision < 0
  then
    raise exception 'A valid audience, system key and expected revision are required.' using errcode = '22023';
  end if;
  perform 1
  from public.system_scorecard_systems s
  join public.system_scorecard_templates t on t.key = s.template_key
  where t.audience = _audience and t.is_active and s.key = _system_key
  for share of t, s;
  if not found then
    raise exception 'The system must belong to an active scorecard for this audience.' using errcode = '22023';
  end if;
  _normalized_steps := public.normalize_system_implementation_guide_steps(_steps);

  -- A competing first insert waits here, then locks the same row and sees the
  -- winner's revision. Existing-guide edits serialize on the row lock below.
  insert into public.system_implementation_guides (audience, system_key, updated_by)
  values (_audience, _system_key, _actor_id)
  on conflict (audience, system_key) do nothing;
  select g.* into _guide from public.system_implementation_guides g
  where g.audience = _audience and g.system_key = _system_key
  for update;
  if _guide.current_revision <> _expected_revision then
    raise exception 'This implementation guide changed. Reload before saving.' using errcode = '40001';
  end if;
  _next_revision := _guide.current_revision + 1;
  insert into public.system_implementation_guide_versions (guide_id, revision, steps, created_by)
  values (_guide.id, _next_revision, _normalized_steps, _actor_id);
  update public.system_implementation_guides g
  set current_revision = _next_revision, updated_at = now(), updated_by = _actor_id
  where g.id = _guide.id;
  return query select _guide.id, _next_revision;
end;
$$;

revoke all on function public.save_system_implementation_guide(public.system_scorecard_audience, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_system_implementation_guide(public.system_scorecard_audience, text, integer, jsonb)
  to authenticated, service_role;
comment on function public.save_system_implementation_guide(public.system_scorecard_audience, text, integer, jsonb) is
  'Admin/superadmin atomic save using auth.uid(); expected revision 0 creates, [] clears while preserving history, stale saves raise 40001.';

commit;
$migration_20260925010000$]::text[]),
  ('20260925020000','implementation_meeting_workspaces',array[$migration_20260925020000$begin;

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
$migration_20260925020000$]::text[]),
  ('20260925030000','seed_system_implementation_guides',array[$migration_20260925030000$-- Generated by tools/generate-implementation-guides-seed.mjs.
-- Edit data/implementation-guides.seed.json, then regenerate before this migration is deployed.
-- Existing guide headers and revisions are never overwritten. Missing resources
-- remove only their links, not the independently curated checklist instructions.
begin;

do $seed_implementation_guides$
declare
  _sources constant jsonb := $source_identity$[
  {
    "id": 181,
    "title": "How to Hire an Assistant",
    "type": "pdf"
  },
  {
    "id": 182,
    "title": "Sample Job Ads",
    "type": "pdf"
  },
  {
    "id": 183,
    "title": "Extracting Interview Questions and Worksheet",
    "type": "pdf"
  },
  {
    "id": 185,
    "title": "Hiring the Assistant - IMPACT FILTER - Editable ",
    "type": "pdf"
  },
  {
    "id": 188,
    "title": "The Red Carpet System",
    "type": "pdf"
  },
  {
    "id": 189,
    "title": "The Magnet System",
    "type": "pdf"
  },
  {
    "id": 192,
    "title": "The Birthday System",
    "type": "pdf"
  },
  {
    "id": 193,
    "title": "Client Feedback Insulator System",
    "type": "pdf"
  },
  {
    "id": 194,
    "title": "Impact Filter - Client Feedback Insulator",
    "type": "pdf"
  },
  {
    "id": 197,
    "title": "Deal Flow Email System",
    "type": "pdf"
  },
  {
    "id": 198,
    "title": "Deal by Deal Client Experience Survey",
    "type": "pdf"
  },
  {
    "id": 199,
    "title": "IMPACT FILTER - Deal by Deal Client Survey",
    "type": "pdf"
  },
  {
    "id": 200,
    "title": "Lottery Ticket Anniversary System",
    "type": "pdf"
  },
  {
    "id": 202,
    "title": "The Beginners Guide to Newsletter Marketing for Realtors",
    "type": "pdf"
  },
  {
    "id": 203,
    "title": "IMPACT FILTER - Newsletter System",
    "type": "pdf"
  },
  {
    "id": 228,
    "title": "Letter To Fear",
    "type": "pdf"
  },
  {
    "id": 230,
    "title": "Lesson Plan - Relationship With Fear",
    "type": "pdf"
  },
  {
    "id": 237,
    "title": "Energy Audit",
    "type": "pdf"
  },
  {
    "id": 240,
    "title": "Team Offer Builder",
    "type": "pdf"
  },
  {
    "id": 277,
    "title": "Client Feedback Insulator Results Example",
    "type": "pdf"
  }
]$source_identity$::jsonb;
  _guides constant jsonb := $guide_content$[
  {
    "id": "6b8d0290-b884-52b8-bcd1-e2444467fdce",
    "audience": "foundation",
    "systemKey": "hire_first_assistant",
    "steps": [
      {
        "id": "e51b6d83-997f-5be8-b1b2-f50e8b7fcaf5",
        "title": "Choose the work your first assistant will own",
        "description": "List the tasks in your business and mark which energize you, feel neutral or drain you. Use that audit to choose a focused first role and write down what you want off your plate. The guide suggests starting with one or two tasks or a defined project when that fits your needs; keep administrative and sales responsibilities distinct.",
        "resources": [
          {
            "resourceId": 181,
            "pageStart": 2,
            "pageEnd": 2
          },
          {
            "resourceId": 181,
            "pageStart": 5,
            "pageEnd": 5
          }
        ]
      },
      {
        "id": "615f4f2b-3013-56d9-b1fb-090a60840167",
        "title": "Write the role, working arrangement and candidate criteria",
        "description": "Document the responsibilities, required skills, hours, work location and compensation you will actually offer. Complete the hiring worksheet's must-haves and ideal-person sections using criteria relevant to the work. Decide how much experience and training the role needs. Confirm the appropriate employment or contractor arrangement for your situation before advertising; the source's sample wages, hours and classification examples are not defaults for your business.",
        "resources": [
          {
            "resourceId": 181,
            "pageStart": 2,
            "pageEnd": 5
          },
          {
            "resourceId": 183,
            "pageStart": 4,
            "pageEnd": 4
          }
        ]
      },
      {
        "id": "f91b06b3-a776-5cec-8cf5-226f6de597e8",
        "title": "Create and publish the job advertisement",
        "description": "Turn the role into an advertisement with a clear title, an honest introduction to your business and culture, the work involved, your ideal candidate, hours, compensation and application questions. Use the sample ads for structure and replace their employer-specific details. Publish the finished ad through the channels you choose for this role. A draft alone does not complete this step.",
        "resources": [
          {
            "resourceId": 181,
            "pageStart": 5,
            "pageEnd": 8
          },
          {
            "resourceId": 182,
            "pageStart": 1,
            "pageEnd": 5
          }
        ]
      },
      {
        "id": "fca7886a-cda8-5418-a0a7-288d62d1ac04",
        "title": "Review applications and complete introductory calls",
        "description": "Read the applications and their answers against your role criteria. Hold the short introductory phone conversations described in the guide to assess communication and initial fit, then choose who to invite to a fuller interview. Record the shortlist and what you learned rather than checking this off when calls are only booked.",
        "resources": [
          {
            "resourceId": 181,
            "pageStart": 8,
            "pageEnd": 9
          },
          {
            "resourceId": 183,
            "pageStart": 2,
            "pageEnd": 3
          }
        ]
      },
      {
        "id": "d6e37e13-7475-554d-86c8-916f06a16297",
        "title": "Interview the shortlist and choose your candidate",
        "description": "Use a conversational interview to explore the candidate's application answers, administrative experience, problem solving, ability to learn, communication and expectations. The question bank is a set of prompts, not a requirement to ask every question. Compare what you learned with the role's must-haves and record your hiring decision.",
        "resources": [
          {
            "resourceId": 181,
            "pageStart": 9,
            "pageEnd": 9
          },
          {
            "resourceId": 183,
            "pageStart": 2,
            "pageEnd": 4
          }
        ]
      },
      {
        "id": "e07a93cc-e6f3-5c3e-8cb9-5174ba907dd1",
        "title": "Confirm the hire and arrange the two-way review",
        "description": "Confirm that the chosen person has accepted the agreed role and working arrangement. Explain that you will both review the fit after working together, and book the guide's two-week re-interview so the assistant can also give feedback on working with you. Mark this complete when the hire is confirmed and the review is arranged, not when an offer is merely planned.",
        "resources": [
          {
            "resourceId": 181,
            "pageStart": 3,
            "pageEnd": 5
          },
          {
            "resourceId": 181,
            "pageStart": 9,
            "pageEnd": 9
          }
        ]
      }
    ]
  },
  {
    "id": "27adb3a5-968f-5a68-a0a8-5daa20d4be06",
    "audience": "foundation",
    "systemKey": "red_carpet_champagne_close",
    "steps": [
      {
        "id": "25eaf601-f5dd-5a68-ab15-0b65f491b4b4",
        "title": "Assemble the red carpet closing kit",
        "description": "Get the supplies together: a red carpet, two stanchions and a traditional sold sign. The guide uses a 10-foot by 3-foot carpet. Keep the sign free of your logo, contact details or promotional copy so the moment celebrates the client. Complete this when the kit is ready to use.",
        "resources": [
          {
            "resourceId": 188,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "d9ff5919-4398-53c1-a608-135267248db0",
        "title": "Prepare the possession-day experience",
        "description": "Work through how you will arrive early, place the carpet and stanchions facing the front door, welcome the clients and photograph them holding the sold sign. Include the photo-sharing approach: send the picture to the clients promptly and ask permission before posting it yourself. Save the agreed process so everyone involved understands what will happen.",
        "resources": [
          {
            "resourceId": 188,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "ccde65e9-8cb0-5e8b-a9b3-4024329020d6",
        "title": "Deliver the closing experience and share the photo",
        "description": "Use the prepared kit at an actual possession handover, celebrate the clients and send them their photo. If they agree to a public post, tell their story and tag them only with their permission; posting is not required. Keep this step open until the experience has happened. Retain the closing photo for the 90 Day Magnet follow-up if that system is also being implemented.",
        "resources": [
          {
            "resourceId": 188,
            "pageStart": 2,
            "pageEnd": 2
          },
          {
            "resourceId": 189,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      }
    ]
  },
  {
    "id": "0e087d57-e0af-523f-bb5c-58347e913deb",
    "audience": "foundation",
    "systemKey": "ninety_day_magnet",
    "steps": [
      {
        "id": "f02a0650-ca7d-56d8-8afe-a31bb5690d0a",
        "title": "Organize the closing photos and mailing batch",
        "description": "Gather the client-focused photos from your red carpet or closing experiences and identify the clients whose follow-up is due. The source sends the keepsake about three months later or in the next quarterly batch. Match the photos to their recipients and mailing details so you know which completed closings the batch covers.",
        "resources": [
          {
            "resourceId": 189,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "c5cfb2d2-7ca4-5551-9313-ef65d632b2d5",
        "title": "Choose the print format and obtain supplies",
        "description": "Choose between a 4-by-6 photo in a magnetic sleeve and a photo printed directly onto a magnet. Obtain the supplies for your chosen version, including the prints or printing service, mailing envelopes and postage. For the sleeve version, have business cards and a metallic marker available.",
        "resources": [
          {
            "resourceId": 189,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "51dd1819-f9ac-5dbd-95fe-12c8323c08f6",
        "title": "Produce and assemble the client magnets",
        "description": "Print the selected closing photos using the chosen format. If using sleeves, place each photo inside and put your business card behind it. Add your name and phone number on the back as described in the guide, keeping the client's photo as the focus. Address and stamp the envelopes for the prepared batch.",
        "resources": [
          {
            "resourceId": 189,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "a785ff6a-9a67-5594-a50c-0e23cd8c6bd8",
        "title": "Mail the completed batch",
        "description": "Send the assembled magnets to the selected clients. Record which batch was sent and when so the next implementation meeting can distinguish work already mailed from the next quarterly batch. Preparing or ordering magnets alone does not complete this step.",
        "resources": [
          {
            "resourceId": 189,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      }
    ]
  },
  {
    "id": "d0fb97f7-6969-511a-b892-1c00f2b648b6",
    "audience": "foundation",
    "systemKey": "birthday_system",
    "steps": [
      {
        "id": "307eba0d-4d02-57ee-93b8-3a00649028df",
        "title": "Build and check the birthday client list",
        "description": "Create the working list of clients and past clients with their full names, birthdays, mailing addresses and phone numbers. Organize it by birthday month and confirm the information you will use for the first delivery batch. Note any missing details that still need to be obtained.",
        "resources": [
          {
            "resourceId": 192,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "1c4f49e2-ce8a-5697-b41c-39eb54c5926a",
        "title": "Arrange the gift supplier and delivery process",
        "description": "Select a local company that can supply and deliver your chosen birthday gift. The guide offers cookies, peanut brittle, chocolate bars and cupcakes as examples rather than required choices. Confirm how the company wants to receive the cards and delivery list, including any information it needs on the envelopes.",
        "resources": [
          {
            "resourceId": 192,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "f2a9906f-9386-591e-a2e9-d6455300e0d2",
        "title": "Prepare the next month's cards and delivery list",
        "description": "Audit the addresses for the upcoming birthday batch and prepare its cards and master delivery list. Use birthday cards or printable blank cards, include your business card and add the recipient details required by the delivery company. The guide prepares the next month's batch in the last week of the current month.",
        "resources": [
          {
            "resourceId": 192,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "dca09b95-2ec5-504e-9672-0c77850b7b0c",
        "title": "Hand off the prepared birthday batch",
        "description": "Give the completed cards and master list to the supplier for the next month's deliveries. Confirm that the company has what it needs to run the batch. This marks the handoff as done; it does not claim that birthdays or deliveries scheduled for later have already happened.",
        "resources": [
          {
            "resourceId": 192,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      }
    ]
  },
  {
    "id": "ac26559b-2901-50cf-a747-db3dca910087",
    "audience": "foundation",
    "systemKey": "deal_flow_emails_installed",
    "steps": [
      {
        "id": "516318aa-bcda-5b1c-afb8-92d4a193a7f3",
        "title": "Map the buyer and seller email milestones",
        "description": "Write down the transaction events that should prompt each email in your business. The source provides buyer emails for pending, purchased and key release, plus seller emails for newly listed, pending, sold and key release. Put them in your actual transaction order and identify who will recognize each event and send the message.",
        "resources": [
          {
            "resourceId": 197,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "d9976863-995e-5b99-b3dc-ec1fe28f806c",
        "title": "Adapt and save the buyer email templates",
        "description": "Create your three buyer templates from the pending, purchased and key-release examples. Replace the sample business identity, contacts, attachments and service promises with your own. Check that the financing, inspection, document, possession and key-release wording accurately describes the requirements, timing and arrangements for your transactions. Save the finished templates where they will be used.",
        "resources": [
          {
            "resourceId": 197,
            "pageStart": 3,
            "pageEnd": 5
          }
        ]
      },
      {
        "id": "99e08967-38b1-53d0-8be7-843036d64ada",
        "title": "Adapt and save the seller email templates",
        "description": "Create your newly listed, pending, sold and key-release templates. Use the examples to explain what the client needs to know and do at each stage. Replace sample marketing commitments, provider details, pricing claims, transaction requirements and possession arrangements with those that apply to your service. Save the completed versions with any attachments they reference.",
        "resources": [
          {
            "resourceId": 197,
            "pageStart": 6,
            "pageEnd": 10
          }
        ]
      },
      {
        "id": "079cd196-1135-5a72-8793-6db41ff3fda1",
        "title": "Hand over the templates and sending responsibilities",
        "description": "Walk the assistant or person sending the emails through the saved buyer and seller templates and the agreed milestones. Confirm which client-specific details and attachments must be added each time. Complete this when the sender has the templates and understands when to use them; a future client email does not need to be marked as already sent to finish installing the system.",
        "resources": [
          {
            "resourceId": 197,
            "pageStart": 2,
            "pageEnd": 10
          }
        ]
      }
    ]
  },
  {
    "id": "4e8f5ff5-d1ab-5ff9-a488-a3d4f8e40641",
    "audience": "legends",
    "systemKey": "deal_by_deal_feedback_tracking",
    "steps": [
      {
        "id": "0bf6c23d-6c4c-5fda-9a6e-1537356b96c6",
        "title": "Prepare the client list and choose the survey trigger",
        "description": "If you are catching up, assemble the clients who bought, sold or leased through you in the period you choose; the guide starts with the last year and allows going further back. With your coach, choose and record the transaction milestone that will trigger surveys for new deals. Make clear whether you mean conditions waived, completion or another appropriate point in your process, so the person sending surveys can act consistently.",
        "resources": [
          {
            "resourceId": 198,
            "pageStart": 2,
            "pageEnd": 4
          },
          {
            "resourceId": 199,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "b8799238-316d-571f-8287-8b7c17bb1e25",
        "title": "Build the client experience survey",
        "description": "Create the questionnaire and its shareable link. Adapt the source prompts covering client and agent identity, satisfaction, service ratings, memorable experiences, likelihood of recommendation and what could be better. Keep any marketing testimonial request optional. Review the finished questions so your invitation describes the survey you actually built.",
        "resources": [
          {
            "resourceId": 198,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "52e66d5e-e4d7-5d01-931d-f357d76b8a07",
        "title": "Prepare the invitations, reminders and sending responsibility",
        "description": "Adapt the catch-up and ongoing invitations for a solo agent, team or assistant, using the versions that fit your business. Include the survey link and leave room for a genuine personal detail. Prepare a reminder for non-responders and agree who sends each message at the trigger you selected. These are reusable templates; no invitation is counted as sent in this step.",
        "resources": [
          {
            "resourceId": 198,
            "pageStart": 3,
            "pageEnd": 6
          },
          {
            "resourceId": 199,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "ad6daab4-b0ca-5a04-896c-4ea986f7206a",
        "title": "Send the first survey invitations",
        "description": "Send personalized invitations to your selected catch-up clients or the first clients who reach the agreed transaction milestone, using their suitable communication channel. Record which clients were contacted and send the prepared reminders where needed. Keep this step open until the invitations have actually gone out.",
        "resources": [
          {
            "resourceId": 198,
            "pageStart": 3,
            "pageEnd": 6
          },
          {
            "resourceId": 199,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "c02046cd-f4fc-56b8-a483-0788ec7ba6fd",
        "title": "Review responses and complete the client thank-yous",
        "description": "Read the received feedback, capture the improvements it reveals and save any testimonial the client provided for marketing use. Send a simple thank-you card to respondents. The guide suggests a small coffee gift card if affordable; it is optional. For a team, use the feedback to identify relevant coaching. Complete this after reviewing real responses and sending the thank-yous, not merely agreeing to do so later.",
        "resources": [
          {
            "resourceId": 198,
            "pageStart": 7,
            "pageEnd": 8
          },
          {
            "resourceId": 199,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      }
    ]
  },
  {
    "id": "76f5b383-21ee-5993-83ac-319b88916a29",
    "audience": "legends",
    "systemKey": "lottery_ticket_anniversary",
    "steps": [
      {
        "id": "adfccd96-d70a-5a6e-86ad-3b1978818d3c",
        "title": "Organize the anniversary client list by month",
        "description": "Build the anniversary spreadsheet with a tab for each month. Include the clients' full names, current mailing address, the year they bought and the relationship type needed to choose a suitable message. Use the actual anniversary month to place each household in the right batch.",
        "resources": [
          {
            "resourceId": 200,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "edfa5142-a5ff-5312-8c77-14fc9d67c282",
        "title": "Adapt the anniversary messages for your clients",
        "description": "Choose and personalize the scripts for the relationship and anniversary year: the source distinguishes new buyers and personal friends, with wording for individuals, couples and families. Preserve that personal fit rather than sending every household the same message. Note the fourth-year small-gift variation and the milestone-year messages you intend to use.",
        "resources": [
          {
            "resourceId": 200,
            "pageStart": 3,
            "pageEnd": 8
          }
        ]
      },
      {
        "id": "2a843948-d5dd-57a7-a826-361399acde31",
        "title": "Prepare the anniversary cards and gifts",
        "description": "Prepare the upcoming month's batch in the last week of the current month: write the selected messages, address the cards and include the anniversary gift. The guide's standard version uses blank thank-you cards and $2 lottery tickets, with one ticket for each anniversary year; its fourth-year script includes a small-gift variation. Use the version you have chosen for each client and finish assembling the batch.",
        "resources": [
          {
            "resourceId": 200,
            "pageStart": 2,
            "pageEnd": 8
          }
        ]
      },
      {
        "id": "616d4ded-6ef3-5253-84cf-e36df1c9bef0",
        "title": "Send the prepared anniversary batch",
        "description": "Mail the completed anniversary cards and carry out any selected gift drop-offs. Record the batch and recipients so the following meeting can pick up with the next month. Ordering supplies or writing cards does not by itself complete the mailing.",
        "resources": [
          {
            "resourceId": 200,
            "pageStart": 2,
            "pageEnd": 8
          }
        ]
      }
    ]
  },
  {
    "id": "3fc7337c-bd95-5a1a-a827-e9a9dd729feb",
    "audience": "legends",
    "systemKey": "client_feedback_insulator",
    "steps": [
      {
        "id": "4cdfb101-7e16-5f42-be16-5f2a4adb6c3b",
        "title": "Prepare the client list and delegate the project",
        "description": "Review your past-client list and make straightforward updates. The guide allows a deliberate decision to proceed with the existing list if a larger cleanup would delay the project. Walk the assistant through the guide and available training, agree the intended result and use an Impact Filter if helpful to make the work and definition of done clear.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 2,
            "pageEnd": 2
          },
          {
            "resourceId": 194,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "9847843f-ef3e-5251-a355-e9a1cc9ea580",
        "title": "Create your feedback form",
        "description": "Make your own copy of the Reboot feedback-form example and adapt it to your business. Enable the form setting that sends respondents a copy of their answers, as the guide specifies. Have the final form and response link ready before creating messages around it.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "e207cdd5-df3c-5b28-b03c-660743eed969",
        "title": "Prepare the campaign messages and schedule",
        "description": "Set the launch, response deadline and prize-draw details for this campaign, then adapt the launch email, reminder email/text, countdown messages and winner announcement. Replace all blanks with your own details and form link. Decide the actual incentives before promising them in the copy. Prepare a short newsletter item explaining why you value feedback. Use your chosen dates rather than the example date on the Impact Filter.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 2,
            "pageEnd": 5
          },
          {
            "resourceId": 194,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "6f236aaa-7bf4-5e84-9208-360c6de3393a",
        "title": "Launch the feedback request and follow up",
        "description": "Send the launch email to the chosen client list and include the feedback request in your newsletter. Follow up with clients who have not responded using the prepared email or text, and send the planned countdown messages. This step records an actual campaign launch and follow-up, not simply a ready-to-send draft.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 2,
            "pageEnd": 2
          },
          {
            "resourceId": 193,
            "pageStart": 4,
            "pageEnd": 5
          }
        ]
      },
      {
        "id": "1fc88f09-49e9-5d9c-b4d7-826eceb3e80e",
        "title": "Run the draw and announce the winner",
        "description": "Carry out the prize draw you described to clients. The guide offers either a live session or a recording shared afterwards, using a digital wheel as one possible tool. Announce the actual winner with the prepared message and share the recording or result as planned. Leave this open until the draw has happened.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 3,
            "pageEnd": 3
          },
          {
            "resourceId": 193,
            "pageStart": 5,
            "pageEnd": 5
          }
        ]
      },
      {
        "id": "51b6ae6d-5673-5606-80d5-e1fcea010757",
        "title": "Write the feedback findings and improvement actions",
        "description": "Read the responses and summarize what is working and what you will change, adjust or improve. A clear list or a few honest paragraphs is enough; the goal is to show clients that their opinions affected your decisions. The results-example PDF illustrates one possible presentation, not a requirement to create a long report or copy its scores.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 3,
            "pageEnd": 3
          },
          {
            "resourceId": 277,
            "pageStart": 2,
            "pageEnd": 16
          }
        ]
      },
      {
        "id": "0ef83c9a-1a4c-5d7f-9de1-7d7aea4b5590",
        "title": "Send the thank-you cards and findings",
        "description": "Prepare and send the respondent thank-you mailout with the findings report. Personalize the card and include the appreciation gift you promised; the guide illustrates this with a small coffee gift card. Complete this only once the mailout has been sent, so the work remains visible if it carries into the next meeting.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 3,
            "pageEnd": 3
          }
        ]
      },
      {
        "id": "22bc3ba7-d221-5466-ad99-d53319a48c98",
        "title": "Put the next annual campaign on the calendar",
        "description": "Add the recurring campaign to the team's calendar and make clear who will execute it. The guide recommends a November campaign as an annual client touch; choose and save the dates for your business. This completes scheduling the next cycle without marking that future campaign as already run.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 3,
            "pageEnd": 3
          }
        ]
      }
    ]
  },
  {
    "id": "f2790895-dc78-5af1-b19a-c91b66591059",
    "audience": "legends",
    "systemKey": "newsletter_system",
    "steps": [
      {
        "id": "95c1310c-56e0-51d5-afb0-1636ad12c4a7",
        "title": "Choose the sending platform, cadence and responsibilities",
        "description": "Choose the email platform or an existing CRM that supports the newsletter. Set a weekly, fortnightly or monthly cadence that you can maintain. Agree who supplies content, prepares the draft, reviews it and sends it; if an assistant helps, set content reminders and a clear review/send arrangement. Save the schedule rather than copying the example times in the guide.",
        "resources": [
          {
            "resourceId": 202,
            "pageStart": 3,
            "pageEnd": 3
          },
          {
            "resourceId": 203,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "7c572efa-b81f-5538-bfc8-f768af4b95c9",
        "title": "Prepare and load the newsletter audience",
        "description": "Organize the contacts you intend to include, with email address, name and useful source or category information. Confirm who belongs on the mailing list, address missing or invalid details and import the prepared list into your chosen platform. Decide how new contacts will join, such as manual additions or a sign-up form. Preserve unsubscribe choices when maintaining the list.",
        "resources": [
          {
            "resourceId": 202,
            "pageStart": 4,
            "pageEnd": 5
          },
          {
            "resourceId": 202,
            "pageStart": 7,
            "pageEnd": 7
          }
        ]
      },
      {
        "id": "45a82abd-681c-531c-b1c3-66c6a7c44cac",
        "title": "Build the reusable newsletter template",
        "description": "Create a template with space for a personal photo and opening message, useful business content, a clear next action and a short introduction to you. Add a video section only if you have relevant video content. Use a recognizable sender, make replies reach the inbox you monitor and include an unsubscribe link.",
        "resources": [
          {
            "resourceId": 202,
            "pageStart": 5,
            "pageEnd": 7
          }
        ]
      },
      {
        "id": "bbad9325-2159-5024-9ad9-34ef79fc71a7",
        "title": "Write and test the first newsletter",
        "description": "Create the subject line, preview text, personal opening and useful content for the first issue. The guide suggests explaining a market insight, sharing an appropriate client story or answering a common question. Add a clear invitation to reply, book a conversation or take the relevant next step. Send yourself a test and check the content, links and display on desktop and mobile before approving it.",
        "resources": [
          {
            "resourceId": 202,
            "pageStart": 6,
            "pageEnd": 7
          }
        ]
      },
      {
        "id": "d5710450-7921-5753-8bd3-c2ad5bf5e719",
        "title": "Send the first issue using the agreed process",
        "description": "Complete the review and send the approved newsletter to the prepared audience. Record which issue was sent and confirm that the next content and sending dates are in the schedule. Keep this open while the issue is only drafted or scheduled for a future send; the checkbox confirms that the first issue has gone out.",
        "resources": [
          {
            "resourceId": 202,
            "pageStart": 3,
            "pageEnd": 3
          },
          {
            "resourceId": 203,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      }
    ]
  },
  {
    "id": "7ce7f55f-d8b3-5d63-a319-c35388349fa2",
    "audience": "legends",
    "systemKey": "four_quadrant_team_offer",
    "steps": [
      {
        "id": "cb689233-9b9e-59ee-b075-9c7dbfddcc16",
        "title": "Define the team administration offer",
        "description": "Complete the administration quadrant with the support your team actually provides or is committing to provide. The examples include paperwork, deal-flow emails, showing feedback, client-care systems, booking support and CRM management. Describe the offer clearly enough that a prospective team member can understand what work is handled for them; the example list is not a requirement to install every named system.",
        "resources": [
          {
            "resourceId": 240,
            "pageStart": 1,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "2c706979-944a-59b8-a149-0817d84a677d",
        "title": "Define the lead-flow offer",
        "description": "Complete the lead-flow quadrant with the opportunities your team can offer, using the sample as a prompt. Examples include mailouts, open houses, referral relationships, existing clients and exclusive listings. Replace the sample with your own offer and distinguish existing sources from anything you still intend to build.",
        "resources": [
          {
            "resourceId": 240,
            "pageStart": 1,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "c63472b7-e52e-58db-851a-0fc139348fc6",
        "title": "Write the culture and values offer",
        "description": "Describe the team culture and values you want members to experience. Use the five statement pillars to make the wording specific: client experience, work ethic, team character, what you will not do and what matters beyond real estate. Write your own beliefs instead of adopting the sample team's mission statement.",
        "resources": [
          {
            "resourceId": 240,
            "pageStart": 1,
            "pageEnd": 4
          }
        ]
      },
      {
        "id": "f5d56483-ecc9-5568-ac11-99b9f6d8bec3",
        "title": "Complete the coaching offer and assemble the four quadrants",
        "description": "Define the coaching and training support included in the offer, such as individual coaching, team meetings, listing training or deal reviews where those fit your team. Bring the four completed quadrants together in the offer worksheet and review the whole offer for clarity and consistency. This completes the offer document; it does not claim that every example service or a team-member hire has already been implemented.",
        "resources": [
          {
            "resourceId": 240,
            "pageStart": 1,
            "pageEnd": 2
          }
        ]
      }
    ]
  },
  {
    "id": "61bac3db-85e9-518a-81ad-f84a7013e568",
    "audience": "legends",
    "systemKey": "relationship_energy_audit",
    "steps": [
      {
        "id": "8e9bdb9a-462d-5db4-8e2d-aec38463d533",
        "title": "List and rate your influential relationships",
        "description": "Use the People in Your Life worksheet to list up to ten influential relationships, including both energizing and draining ones. Rate each from 1 to 10, where 1 is strongly draining and 10 is strongly energizing. Complete the ratings before moving to the reflection questions.",
        "resources": [
          {
            "resourceId": 237,
            "pageStart": 7,
            "pageEnd": 7
          }
        ]
      },
      {
        "id": "43364a95-8116-5cc0-97ea-369ac1554e18",
        "title": "Complete the reflection and identify what needs to change",
        "description": "Work through the prompts about defending people, filtering what you say, giving more than you receive and avoiding honest conversations. Consider whether these relationships strengthen or weaken you, then write what you want to change. Completing the audit means you have made these observations and identified changes; it does not mean a conversation or relationship change has already happened.",
        "resources": [
          {
            "resourceId": 237,
            "pageStart": 7,
            "pageEnd": 8
          }
        ]
      }
    ]
  },
  {
    "id": "33d6c92b-9c9f-53f0-9f79-d0e5ce7c2257",
    "audience": "legends",
    "systemKey": "environmental_energy_audit",
    "steps": [
      {
        "id": "a12f17b7-a936-503e-86bf-b3fac21a1e02",
        "title": "Rate the parts of your environment",
        "description": "Rate how your office location and space, brokerage, commute, car, clothes, home, city, neighbourhood and holidays affect your energy. Use 1 for draining and 10 for energizing, avoiding 5 and 7 as the worksheet instructs. Record an honest rating for each relevant area.",
        "resources": [
          {
            "resourceId": 237,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "afdcd9f7-09f1-558b-b818-f4349aac666e",
        "title": "Write the environmental changes you want to make",
        "description": "Review the ratings and answer the worksheet's question about what needs to change to improve your energy. Record specific changes in the areas that matter most to you. This completes the audit and its decisions; any subsequent move, purchase or change to your environment remains separate work.",
        "resources": [
          {
            "resourceId": 237,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      }
    ]
  },
  {
    "id": "5c7d6957-e5ad-5348-ba86-49fc379da077",
    "audience": "legends",
    "systemKey": "business_task_energy_audit",
    "steps": [
      {
        "id": "fef6c7ed-0e88-53b7-aa3d-9a2f629dde4d",
        "title": "Complete the business-task energy table",
        "description": "Work through the task table and mark each activity as Fuels Me, N/A or Drains Me. It includes activities such as booking showings, managing listings and CRM, client care, documents, negotiations, prospecting, content and bookkeeping. Use the table to distinguish the work that gives you energy from the work that takes it away.",
        "resources": [
          {
            "resourceId": 237,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "ca975aad-213a-582a-ab40-2a34caf596a4",
        "title": "Complete the work reflection and identify changes",
        "description": "Rate how much you enjoy your work from 1 to 10 and write what would make it a 10. Reflect on what else you would choose to do, which parts of the business drain you and where you gain the most energy. Finish by recording what needs to change in your work. Identifying a task to change or delegate does not mean the delegation itself is finished.",
        "resources": [
          {
            "resourceId": 237,
            "pageStart": 3,
            "pageEnd": 3
          }
        ]
      }
    ]
  },
  {
    "id": "a4642aa2-a621-5fc1-9b50-a5165c805ba5",
    "audience": "legends",
    "systemKey": "relationship_with_fear_write_letter",
    "steps": [
      {
        "id": "8817640b-c397-5897-9d73-b536260d9a1e",
        "title": "Reflect on your relationship with fear",
        "description": "Identify where fear has helped protect you and where it has been directing choices you want to make differently. Use the lesson's distinction between fear as a reference and fear as the driver to capture what your relationship has been like and what you want it to become.",
        "resources": [
          {
            "resourceId": 230,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      },
      {
        "id": "cf88bc13-c48e-596b-bd35-2e368573807d",
        "title": "Write the letter to fear",
        "description": "Write your own complete letter using the worksheet's three prompts: what you thank fear for, what your relationship has been over the years and what that relationship will look like going forward. Put the reflection into your own words and finish the letter. This step confirms that the letter exists; it does not claim completion of the separate training, questionnaire or growth-action assignment.",
        "resources": [
          {
            "resourceId": 228,
            "pageStart": 1,
            "pageEnd": 1
          },
          {
            "resourceId": 230,
            "pageStart": 2,
            "pageEnd": 2
          }
        ]
      }
    ]
  },
  {
    "id": "480278c5-5f7d-5631-96e0-272356079269",
    "audience": "legends",
    "systemKey": "impact_filter_used_for_delegation",
    "steps": [
      {
        "id": "27444294-c392-5b25-9a4a-3e73a3dec228",
        "title": "Define the delegated project's purpose and result",
        "description": "Choose a real piece of work to delegate and complete the Impact Filter's problem, impact and completed-result fields. Describe why the work matters and what the finished output will look like. Use a completed example for the format, while writing the purpose and result for your own project.",
        "resources": [
          {
            "resourceId": 185,
            "pageStart": 1,
            "pageEnd": 1
          },
          {
            "resourceId": 194,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "1a2ab71b-9a0a-5926-a5b4-d58c1b0f286f",
        "title": "Complete the work plan and success criteria",
        "description": "Fill in the best- and worst-case outcomes, the five main chunks of work, success criteria, first actions and project completion date. Make the success criteria concrete enough to recognize when the result is complete. Choose the date for this project; do not reuse the date printed on a sample Impact Filter.",
        "resources": [
          {
            "resourceId": 185,
            "pageStart": 1,
            "pageEnd": 1
          },
          {
            "resourceId": 194,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      },
      {
        "id": "5771c408-265f-5aa4-8252-c16111adae27",
        "title": "Use the completed filter in the delegation conversation",
        "description": "Meet with the person taking on the work and walk them through the completed filter, supporting instructions, main steps and what done looks like. Clarify the result and next actions together. Check this off after that handoff conversation has happened; completing the form alone is not yet using it for delegation, and the delegated project may still be in progress.",
        "resources": [
          {
            "resourceId": 193,
            "pageStart": 2,
            "pageEnd": 2
          },
          {
            "resourceId": 185,
            "pageStart": 1,
            "pageEnd": 1
          }
        ]
      }
    ]
  }
]$guide_content$::jsonb;
  _resource_map jsonb := '{}'::jsonb;
  _source jsonb;
  _original_id bigint;
  _resolved_id bigint;
  _candidate_ids bigint[];
  _guide jsonb;
  _audience public.system_scorecard_audience;
  _system_key text;
  _guide_id uuid;
  _inserted_id uuid;
  _step jsonb;
  _reference jsonb;
  _resources jsonb;
  _steps jsonb;
  _normalized_steps jsonb;
  _inserted_count integer := 0;
begin
  -- Prevent renames/deletes or new duplicate titles during identity resolution.
  -- This lock lasts only for this small, privileged bootstrap transaction.
  lock table public.resources in share mode;

  for _source in select value from jsonb_array_elements(_sources) loop
    _original_id := (_source ->> 'id')::bigint;
    _resolved_id := null;
    select r.id into _resolved_id
    from public.resources r
    where r.id = _original_id
      and r.title = _source ->> 'title'
      and r.type::text = _source ->> 'type';

    if _resolved_id is null then
      -- An ID reused by a different local resource must never win the match.
      select array_agg(r.id order by r.id) into _candidate_ids
      from public.resources r
      where r.title = _source ->> 'title'
        and r.type::text = _source ->> 'type';
      if cardinality(_candidate_ids) = 1 then
        _resolved_id := _candidate_ids[1];
      else
        raise notice 'Implementation guide seed: omitting references to source % (%) because exact title/type matched % local resources.',
          _original_id, _source ->> 'title', coalesce(cardinality(_candidate_ids), 0);
      end if;
    end if;

    if _resolved_id is not null then
      _resource_map := _resource_map || jsonb_build_object(_original_id::text, _resolved_id);
    end if;
  end loop;

  for _guide in select value from jsonb_array_elements(_guides) loop
    _audience := (_guide ->> 'audience')::public.system_scorecard_audience;
    _system_key := _guide ->> 'systemKey';
    _guide_id := (_guide ->> 'id')::uuid;

    perform 1
    from public.system_scorecard_systems s
    join public.system_scorecard_templates t on t.key = s.template_key
    where t.audience = _audience and t.is_active and s.key = _system_key
    for share of t, s;
    if not found then
      raise notice 'Implementation guide seed: skipping %/% because no matching active scorecard system exists.', _audience, _system_key;
      continue;
    end if;

    if exists (
      select 1 from public.system_implementation_guides g
      where g.audience = _audience and g.system_key = _system_key
    ) then
      continue;
    end if;

    _steps := '[]'::jsonb;
    for _step in select value from jsonb_array_elements(_guide -> 'steps') loop
      _resources := '[]'::jsonb;
      for _reference in select value from jsonb_array_elements(_step -> 'resources') loop
        _resolved_id := (_resource_map ->> (_reference ->> 'resourceId'))::bigint;
        if _resolved_id is not null then
          _resources := _resources || jsonb_build_array(
            jsonb_set(_reference, '{resourceId}', to_jsonb(_resolved_id))
          );
        end if;
      end loop;
      _steps := _steps || jsonb_build_array(jsonb_set(_step, '{resources}', _resources));
    end loop;

    -- Use the same internal validator/normalizer as administrator saves, after
    -- remapping resource IDs. Empty reference arrays are intentionally valid.
    _normalized_steps := public.normalize_system_implementation_guide_steps(_steps);

    _inserted_id := null;
    insert into public.system_implementation_guides (id, audience, system_key, current_revision)
    values (_guide_id, _audience, _system_key, 1)
    on conflict (audience, system_key) do nothing
    returning id into _inserted_id;

    if _inserted_id is not null then
      insert into public.system_implementation_guide_versions (guide_id, revision, steps)
      values (_inserted_id, 1, _normalized_steps);
      _inserted_count := _inserted_count + 1;
    end if;
  end loop;

  raise notice 'Implementation guide seed: created % guides; preserved all pre-existing guides.', _inserted_count;
end;
$seed_implementation_guides$;

commit;
$migration_20260925030000$]::text[]),
  ('20260929010000','coaching_notes_history',array[$migration_20260929010000$begin;

create table public.general_coaching_notes (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (length(btrim(body, E' \t\r\n')) between 1 and 30000),
  created_at timestamptz not null default clock_timestamp()
);
create index general_coaching_notes_user_idx on public.general_coaching_notes(user_id,id);
comment on table public.general_coaching_notes is 'Staff-only notes about a member, independent of coaching cycles; IDs provide idempotent creation.';

create function public.can_access_member_coaching_notes(_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=_user_id)
    and (public.has_role(array['admin','superadmin']::text[])
      or (public.has_role(array['coach','implementation_coach']::text[]) and exists (
        select 1 from public.user_coaches c where c.user_id=_user_id and c.coach_id=auth.uid()
          and c.is_active and (c.ended_at is null or c.ended_at>now())
      )));
$$;
revoke all on function public.can_access_member_coaching_notes(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_access_member_coaching_notes(uuid) to authenticated,service_role;

alter table public.general_coaching_notes enable row level security;
create policy general_coaching_notes_staff_read on public.general_coaching_notes
  for select to authenticated using(public.can_access_member_coaching_notes(user_id));
revoke all on public.general_coaching_notes from public,anon,authenticated,service_role;
grant select on public.general_coaching_notes to authenticated,service_role;

create function public.add_general_coaching_note(_user_id uuid,_body text,_request_id uuid)
returns public.general_coaching_notes language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  _actor uuid := auth.uid();
  _note public.general_coaching_notes%rowtype;
  _text text := btrim(_body,E' \t\r\n');
begin
  if not public.can_access_member_coaching_notes(_user_id) then
    raise exception 'You do not have access to these coaching notes.' using errcode='42501';
  end if;
  if _request_id is null or _text is null or length(_text) not between 1 and 30000 then
    raise exception 'A unique request ID and note of 1-30000 characters are required.' using errcode='22023';
  end if;
  insert into public.general_coaching_notes(id,user_id,author_id,body)
  values(_request_id,_user_id,_actor,_text) on conflict(id) do nothing;
  select n.* into _note from public.general_coaching_notes n where n.id=_request_id;
  if _note.user_id<>_user_id or _note.author_id is distinct from _actor or _note.body<>_text then
    raise exception 'This note request ID has already been used. Please start a new note.' using errcode='22023';
  end if;
  return _note;
end;
$$;
revoke all on function public.add_general_coaching_note(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.add_general_coaching_note(uuid,text,uuid) to authenticated,service_role;

alter table public.implementation_meeting_sessions
  add column notes_written_at timestamptz,
  add column notes_author_id uuid references public.profiles(id) on delete set null,
  add column notes_updated_at timestamptz,
  add column notes_updated_by uuid references public.profiles(id) on delete set null;
comment on column public.implementation_meeting_sessions.notes_written_at is
  'First written time for the current meeting-note content; null for pre-tracking notes with unknown provenance. Never inferred from general session updates.';

create function public.track_implementation_note_attribution()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.notes is not distinct from old.notes and new.commitments is not distinct from old.commitments then
    return new;
  end if;
  if length(btrim(old.notes,E' \t\r\n'))=0 and length(btrim(old.commitments,E' \t\r\n'))=0
    and (length(btrim(new.notes,E' \t\r\n'))>0 or length(btrim(new.commitments,E' \t\r\n'))>0) then
    new.notes_written_at := clock_timestamp();
    new.notes_author_id := auth.uid();
    new.notes_updated_at := null;
    new.notes_updated_by := null;
  else
    -- Existing nonempty notes retain their original attribution, including
    -- unknown/null legacy values. Only the subsequent edit has known provenance.
    new.notes_updated_at := clock_timestamp();
    new.notes_updated_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function public.track_implementation_note_attribution() from public,anon,authenticated,service_role;
create trigger implementation_notes_attribution before update of notes,commitments
  on public.implementation_meeting_sessions for each row
  execute function public.track_implementation_note_attribution();

commit;
$migration_20260929010000$]::text[]),
  ('20260929020000','manual_implementation_meetings',array[$migration_20260929020000$begin;

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
$migration_20260929020000$]::text[]),
  ('20260929030000','implementation_next_meeting_booking',array[$migration_20260929030000$begin;

alter table public.implementation_meeting_sessions
  add column next_meeting_booked boolean not null default false;
comment on column public.implementation_meeting_sessions.next_meeting_booked is
  'Coach-confirmed booking of the next meeting, recorded independently for this session. Does not imply attendance or progress.';

-- Keep all existing authorization, revision, cancellation and cycle behavior.
-- Apply only the new operation to the latest installed workspace function,
-- including changes from the earlier manual-meeting migration.
do $patch$
declare
  _definition text;
  _old text[] := array[
    $old$'complete_meeting','reopen_meeting','set_attendance','set_action_status')$old$,
    $old$    when 'set_attendance' then array['attended']$old$,
    $old$  if _operation not in ('save_notes','set_attendance') then$old$,
    $old$    when 'set_attendance' then
      if jsonb_typeof(_payload->'attended') is distinct from 'boolean' then$old$,
    $old$    completed_at=_session.completed_at,notes=_session.notes,commitments=_session.commitments,$old$
  ];
  _new text[] := array[
    $new$'complete_meeting','reopen_meeting','set_attendance','set_action_status','set_next_meeting_booked')$new$,
    $new$    when 'set_attendance' then array['attended']
    when 'set_next_meeting_booked' then array['booked']$new$,
    $new$  if _operation not in ('save_notes','set_attendance','set_next_meeting_booked') then$new$,
    $new$    when 'set_next_meeting_booked' then
      if jsonb_typeof(_payload->'booked') is distinct from 'boolean' then
        raise exception 'The booked value must be a boolean.' using errcode = '22023';
      end if;
      _session.next_meeting_booked := (_payload->>'booked')::boolean;
    when 'set_attendance' then
      if jsonb_typeof(_payload->'attended') is distinct from 'boolean' then$new$,
    $new$    completed_at=_session.completed_at,notes=_session.notes,commitments=_session.commitments,
    next_meeting_booked=_session.next_meeting_booked,$new$
  ];
  _i integer;
begin
  _definition := replace(pg_get_functiondef('public.mutate_implementation_workspace(bigint,bigint,text,jsonb,integer)'::regprocedure),chr(13),'');
  for _i in 1..array_length(_old,1) loop
    _old[_i] := replace(_old[_i],chr(13),'');
    _new[_i] := replace(_new[_i],chr(13),'');
    if (length(_definition)-length(replace(_definition,_old[_i],'')))/length(_old[_i]) <> 1 then
      raise exception 'Workspace booking operation prerequisite % does not match.',_i;
    end if;
    _definition := replace(_definition,_old[_i],_new[_i]);
  end loop;
  execute _definition;
end;
$patch$;

commit;
$migration_20260929030000$]::text[]);

commit;

-- READ-ONLY postflight. Expect all six versions and 15 guides / 58 total steps
-- (Foundation 5/21, Legends 10/37) and 81 resource references on a fresh release.
-- Missing active systems or sources are reported as seed NOTICEs; review those
-- if counts differ. unresolved_resource_references must be zero.
select version,name from supabase_migrations.schema_migrations
where version in ('20260925010000','20260925020000','20260925030000','20260929010000','20260929020000','20260929030000')
order by version;

select g.audience,count(*) as guides,sum(jsonb_array_length(v.steps)) as steps
from public.system_implementation_guides g
join public.system_implementation_guide_versions v
  on v.guide_id=g.id and v.revision=g.current_revision
group by g.audience order by g.audience;

select count(*) as resource_references,
  count(*) filter(where r.id is null) as unresolved_resource_references
from public.system_implementation_guides g
join public.system_implementation_guide_versions v
  on v.guide_id=g.id and v.revision=g.current_revision
cross join lateral jsonb_array_elements(v.steps) step
cross join lateral jsonb_array_elements(step->'resources') ref
left join public.resources r on r.id=(ref->>'resourceId')::bigint;

select c.relname,c.relrowsecurity as rls_enabled,
  has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as client_write_allowed
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'system_implementation_guides','system_implementation_guide_versions',
  'implementation_action_checklists','implementation_meeting_sessions',
  'implementation_session_actions','implementation_step_notes','implementation_step_events',
  'general_coaching_notes','implementation_meeting_create_requests'
) order by c.relname;

select
  to_regprocedure('public.create_implementation_meeting(uuid,bigint,date,uuid)') is not null as manual_creation,
  to_regprocedure('public.add_general_coaching_note(uuid,text,uuid)') is not null as standalone_notes,
  position('set_next_meeting_booked' in pg_get_functiondef(
    'public.mutate_implementation_workspace(bigint,bigint,text,jsonb,integer)'::regprocedure
  ))>0 as automatic_booking_support;

select column_name from information_schema.columns
where table_schema='public' and table_name='implementation_meeting_sessions'
  and column_name in ('notes_written_at','notes_author_id','notes_updated_at','notes_updated_by','next_meeting_booked')
order by column_name;
