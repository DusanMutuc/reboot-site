begin;

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
