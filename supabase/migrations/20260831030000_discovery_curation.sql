begin;

alter table public.resources add column search_names text[] not null default '{}';
alter table public.content_nodes add column search_names text[] not null default '{}';

create function public.normalize_discovery_names(_names text[])
returns text[] language plpgsql immutable set search_path = pg_catalog, public as $$
begin
  if _names is null or cardinality(_names) > 20 or exists (
    select 1 from unnest(_names) n where n is null or length(btrim(n)) not between 1 and 120
  ) then raise exception 'Use at most 20 nonempty alternate names of up to 120 characters' using errcode = '22023'; end if;
  return array(select min(btrim(n)) from unnest(_names) n group by lower(btrim(n)) order by lower(btrim(n)));
end;
$$;
create function public.guard_discovery_names() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin new.search_names := public.normalize_discovery_names(new.search_names); return new; end;
$$;
create trigger resources_discovery_names before insert or update of search_names on public.resources
for each row execute function public.guard_discovery_names();
create trigger nodes_discovery_names before insert or update of search_names on public.content_nodes
for each row execute function public.guard_discovery_names();

-- Keep content nicknames separate from topic text and recommendation topic IDs.
-- Updating names takes effect immediately, without retagging related items.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.search_discovery_catalogue(uuid,text,text,text[],bigint[],text,text,text,integer,integer,boolean,text)'::regprocedure);
  if position('resource.tsv_all as search_vector' in definition) = 0 then
    raise exception 'Alternate-name migration prerequisite does not match';
  end if;
  definition := replace(definition, 'resource.tsv_all as search_vector',
    '(resource.tsv_all || setweight(to_tsvector(''english'', array_to_string(resource.search_names, '' '')), ''A'')) as search_vector');
  definition := replace(definition, 'node.tsv_discovery as search_vector',
    '(node.tsv_discovery || setweight(to_tsvector(''english'', array_to_string(node.search_names, '' '')), ''A'')) as search_vector');
  definition := replace(definition, 'coalesce(resource.title, '''') || '' ''',
    'array_to_string(resource.search_names, '' '') || '' '' || coalesce(resource.title, '''') || '' ''');
  definition := replace(definition, 'coalesce(node.title, '''') || '' ''',
    'array_to_string(node.search_names, '' '') || '' '' || coalesce(node.title, '''') || '' ''');
  execute definition;
end;
$$;

create function public.assert_discovery_editor(_actor_id uuid, _allow_coach boolean default false)
returns void language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if _actor_id is null or (coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from _actor_id)
    or not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = _actor_id and (r.code in ('admin', 'superadmin') or (_allow_coach and r.code = 'coach')))
  then raise exception 'Discovery administration requires an authorized editor' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.assert_discovery_editor(uuid, boolean) from public, anon, authenticated;

-- Serialize vocabulary edits AND assignment validation on the same transaction
-- lock. A concurrent merge cannot strand a newly inserted old-canonical link.
create or replace function public.guard_assignable_discovery_tag() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare chosen public.tags%rowtype;
begin
  perform pg_advisory_xact_lock(60831, 300);
  select * into chosen from public.tags where id = new.tag_id;
  if not found then raise exception 'Discovery tag % does not exist', new.tag_id using errcode = '23503'; end if;
  if not chosen.is_active then raise exception 'Inactive discovery tags cannot be assigned' using errcode = '23514'; end if;
  if chosen.tag_kind = 'alias' then raise exception 'Alias tags are search vocabulary and cannot be assigned directly' using errcode = '23514'; end if;
  return new;
end;
$$;

create function public.guard_discovery_vocabulary() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare target public.tags%rowtype;
begin
  perform pg_advisory_xact_lock(60831, 300);
  new.name := btrim(new.name);
  if length(new.name) not between 1 and 120 then raise exception 'Tag names require 1 to 120 characters' using errcode = '22023'; end if;
  if exists (select 1 from public.tags t where t.id <> new.id and lower(btrim(t.name)) = lower(new.name)) then
    raise exception 'That tag name already exists; rename or merge the existing row' using errcode = '23505';
  end if;
  if new.tag_kind = 'alias' then
    select * into target from public.tags where id = new.canonical_tag_id;
    if new.canonical_tag_id = new.id or not found or target.tag_kind = 'alias'
      or (new.is_active and not target.is_active) then
      raise exception 'Aliases must point directly to an active canonical tag' using errcode = '23514';
    end if;
    if exists(select 1 from public.resource_tags where tag_id = new.id)
      or exists(select 1 from public.content_node_tags where tag_id = new.id)
      or exists(select 1 from public.tags where canonical_tag_id = new.id) then
      raise exception 'Use merge to move assignments and synonyms before converting a canonical tag' using errcode = '23514';
    end if;
    new.browse_category := null;
  elsif not new.is_active and exists(select 1 from public.tags where canonical_tag_id = new.id and is_active) then
    raise exception 'Deactivate dependent aliases first' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_discovery_vocabulary before insert or update on public.tags
for each row execute function public.guard_discovery_vocabulary();

-- Deactivation removes terms from the search index, not just from the picker.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.refresh_tag_text(bigint)'::regprocedure);
  execute replace(definition, 'where resource_tag.resource_id = _resource_id',
    'where resource_tag.resource_id = _resource_id and tag.is_active');
  definition := pg_get_functiondef('public.refresh_content_node_tag_text(bigint)'::regprocedure);
  execute replace(definition, 'where node_tag.node_id = _node_id',
    'where node_tag.node_id = _node_id and tag.is_active');
end;
$$;

create function public.admin_save_discovery_tag(_actor_id uuid, _id bigint, _name text,
  _kind text, _browse_category text, _canonical_id bigint, _active boolean)
returns bigint language plpgsql security definer set search_path = pg_catalog, public as $$
declare saved_id bigint;
begin
  perform public.assert_discovery_editor(_actor_id);
  perform pg_advisory_xact_lock(60831, 300);
  if _kind is null or _active is null then raise exception 'Tag kind and activity are required' using errcode = '22023'; end if;
  if _id is not null then
    perform 1 from public.tags where id = _id for update;
    if not found then raise exception 'Tag not found' using errcode = '22023'; end if;
    if not _active then update public.tags set is_active = false where canonical_tag_id = _id; end if;
    update public.tags set name = _name, tag_kind = _kind, browse_category = _browse_category,
      canonical_tag_id = _canonical_id, is_active = _active where id = _id returning id into saved_id;
  else
    insert into public.tags(name, slug, tag_kind, browse_category, canonical_tag_id, is_active)
    values (_name, 'managed-' || gen_random_uuid()::text, _kind, _browse_category, _canonical_id, _active)
    returning id into saved_id;
  end if;
  return saved_id;
end;
$$;

create function public.admin_merge_discovery_tags(_actor_id uuid, _source_id bigint, _target_id bigint)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare source public.tags%rowtype; target public.tags%rowtype;
begin
  perform public.assert_discovery_editor(_actor_id);
  perform pg_advisory_xact_lock(60831, 300);
  if _source_id = _target_id then raise exception 'Choose two different tags' using errcode = '22023'; end if;
  select * into source from public.tags where id = _source_id for update;
  select * into target from public.tags where id = _target_id for update;
  if source.id is null or target.id is null or source.tag_kind = 'alias' or target.tag_kind = 'alias' or not target.is_active then
    raise exception 'Merge requires two canonical tags and an active target' using errcode = '22023'; end if;
  if source.tag_kind = 'browse_category' or source.tag_kind <> target.tag_kind
    or source.browse_category is distinct from target.browse_category then
    raise exception 'Resolve kind/category differences before merging; browse-category roots cannot be merged' using errcode = '22023'; end if;
  insert into public.resource_tags(resource_id, tag_id)
    select resource_id, _target_id from public.resource_tags where tag_id = _source_id on conflict do nothing;
  insert into public.content_node_tags(node_id, tag_id)
    select node_id, _target_id from public.content_node_tags where tag_id = _source_id on conflict do nothing;
  delete from public.resource_tags where tag_id = _source_id;
  delete from public.content_node_tags where tag_id = _source_id;
  update public.tags set canonical_tag_id = _target_id where canonical_tag_id = _source_id;
  update public.tags set tag_kind = 'alias', canonical_tag_id = _target_id, browse_category = null, is_active = true
    where id = _source_id;
end;
$$;

create function public.admin_update_discovery_items(_actor_id uuid, _resource_ids bigint[] default '{}',
  _node_ids bigint[] default '{}', _tag_ids bigint[] default null, _tag_action text default 'add',
  _visibility text default null, _open_mode text default null, _search_names text[] default null)
returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare total integer;
begin
  perform public.assert_discovery_editor(_actor_id);
  perform pg_advisory_xact_lock(60831, 300);
  if _resource_ids is null or _node_ids is null then raise exception 'Select explicit item IDs' using errcode = '22023'; end if;
  _resource_ids := array(select distinct unnest(_resource_ids));
  _node_ids := array(select distinct unnest(_node_ids));
  total := cardinality(_resource_ids) + cardinality(_node_ids);
  if total not between 1 and 100 then raise exception 'Select between 1 and 100 items' using errcode = '22023'; end if;
  if exists(select 1 from unnest(_resource_ids) selected(id) where selected.id is null or not exists(select 1 from public.resources r where r.id = selected.id))
    or exists(select 1 from unnest(_node_ids) selected(id) where selected.id is null or not exists(select 1 from public.content_nodes n where n.id = selected.id)) then
    raise exception 'One or more selected items no longer exist' using errcode = '22023'; end if;
  if _tag_action is null or _tag_action not in ('add', 'remove', 'replace')
    or (_visibility is not null and _visibility not in ('hidden', 'search_only', 'browse'))
    or (_open_mode is not null and _open_mode not in ('context', 'direct')) then
    raise exception 'Invalid discovery update' using errcode = '22023'; end if;
  if cardinality(_node_ids) > 0 and (_visibility = 'browse' or _open_mode is not null) then
    raise exception 'Guides cannot be approved for homepage browse or standalone resource presentation' using errcode = '22023'; end if;
  if _search_names is not null and total <> 1 then raise exception 'Alternate names belong to one specific item' using errcode = '22023'; end if;
  if _tag_ids is not null then
    if cardinality(_tag_ids) > 100 or exists(select 1 from unnest(_tag_ids) selected(id) where selected.id is null
      or not exists(select 1 from public.tags t where t.id = selected.id and (_tag_action = 'remove' or (t.is_active and t.tag_kind <> 'alias')))) then
      raise exception 'Choose existing active canonical tag IDs' using errcode = '22023'; end if;
    if _tag_action in ('remove', 'replace') then
      delete from public.resource_tags where resource_id = any(_resource_ids)
        and (case when _tag_action = 'remove' then tag_id = any(_tag_ids) else not tag_id = any(_tag_ids) end);
      delete from public.content_node_tags where node_id = any(_node_ids)
        and (case when _tag_action = 'remove' then tag_id = any(_tag_ids) else not tag_id = any(_tag_ids) end);
    end if;
    if _tag_action in ('add', 'replace') then
      insert into public.resource_tags(resource_id, tag_id) select r, t from unnest(_resource_ids) r cross join unnest(_tag_ids) t on conflict do nothing;
      insert into public.content_node_tags(node_id, tag_id) select n, t from unnest(_node_ids) n cross join unnest(_tag_ids) t on conflict do nothing;
    end if;
  end if;
  update public.resources set
    is_discoverable = case when _visibility is null then is_discoverable else _visibility <> 'hidden' end,
    is_browsable = case when _visibility is null then is_browsable else _visibility = 'browse' end,
    discovery_open_mode = coalesce(_open_mode, discovery_open_mode),
    search_names = coalesce(_search_names, search_names)
  where id = any(_resource_ids);
  update public.content_nodes set
    is_discoverable = case when _visibility is null then is_discoverable else _visibility <> 'hidden' end,
    search_names = coalesce(_search_names, search_names)
  where id = any(_node_ids);
  return total;
end;
$$;

-- Resource creation and all supplied tags commit together. Storage remains a
-- separate service operation; the route removes only its new object on failure.
create function public.create_tagged_resource_upload(_actor_id uuid, _title text, _description text,
  _type text, _state text, _discoverable boolean, _browsable boolean, _open_mode text,
  _bucket text, _path text, _tag_ids bigint[], _search_names text[])
returns bigint language plpgsql security definer set search_path = pg_catalog, public as $$
declare resource_id bigint;
begin
  perform public.assert_discovery_editor(_actor_id, true);
  perform pg_advisory_xact_lock(60831, 300);
  if _tag_ids is null or cardinality(_tag_ids) > 100 or exists(select 1 from unnest(_tag_ids) selected(id) where selected.id is null
    or not exists(select 1 from public.tags t where t.id = selected.id and t.is_active and t.tag_kind <> 'alias')) then
    raise exception 'Choose existing active canonical tag IDs' using errcode = '22023'; end if;
  if _bucket <> 'resources' or _path is null or _type not in ('pdf', 'image') or length(btrim(_title)) not between 1 and 500 then
    raise exception 'Invalid resource upload' using errcode = '22023'; end if;
  insert into public.resources(title, description, type, source, state, is_discoverable, is_browsable,
    discovery_open_mode, created_by, storage_bucket, storage_path, search_names)
  values (btrim(_title), _description, _type, 'manual', _state, _discoverable, _browsable, _open_mode,
    _actor_id, _bucket, _path, _search_names) returning id into resource_id;
  insert into public.resource_tags(resource_id, tag_id) select resource_id, t from (select distinct unnest(_tag_ids) t) ids;
  return resource_id;
end;
$$;

-- Only the authenticated admin API exposes mutations, with the verified actor
-- supplied server-side. Explicit grants prevent anonymous RPC escalation.
revoke all on function public.admin_save_discovery_tag(uuid,bigint,text,text,text,bigint,boolean) from public, anon, authenticated;
revoke all on function public.admin_merge_discovery_tags(uuid,bigint,bigint) from public, anon, authenticated;
revoke all on function public.admin_update_discovery_items(uuid,bigint[],bigint[],bigint[],text,text,text,text[]) from public, anon, authenticated;
revoke all on function public.create_tagged_resource_upload(uuid,text,text,text,text,boolean,boolean,text,text,text,bigint[],text[]) from public, anon, authenticated;
grant execute on function public.admin_save_discovery_tag(uuid,bigint,text,text,text,bigint,boolean) to service_role;
grant execute on function public.admin_merge_discovery_tags(uuid,bigint,bigint) to service_role;
grant execute on function public.admin_update_discovery_items(uuid,bigint[],bigint[],bigint[],text,text,text,text[]) to service_role;
grant execute on function public.create_tagged_resource_upload(uuid,text,text,text,text,boolean,boolean,text,text,text,bigint[],text[]) to service_role;

create function public.admin_discovery_catalogue(_actor_id uuid, _kind text default 'resource', _q text default '',
  _media_type text default null, _filter text default 'all', _limit integer default 50, _offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  if _kind not in ('resource', 'guide') or _filter not in ('all', 'untagged', 'no_category', 'searchable_untagged', 'embedded', 'standalone', 'browse', 'hidden')
    or _limit not between 1 and 100 or _offset < 0 or length(_q) > 100 then
    raise exception 'Invalid catalogue filter or pagination' using errcode = '22023'; end if;
  with items as materialized (
    select r.id, 'resource'::text as kind, r.title, r.type as media_type, r.state, r.is_discoverable,
      r.is_browsable, r.discovery_open_mode, r.search_names,
      coalesce((select array_agg(rt.tag_id order by rt.tag_id) from public.resource_tags rt where rt.resource_id = r.id), '{}'::bigint[]) as tag_ids,
      exists(select 1 from public.content_blocks b where b.resource_id = r.id and b.block_type = 'asset') as embedded
    from public.resources r where _kind = 'resource'
    union all
    select n.id, 'guide', n.title, n.node_type, n.state, n.is_discoverable, false, 'context', n.search_names,
      coalesce((select array_agg(nt.tag_id order by nt.tag_id) from public.content_node_tags nt where nt.node_id = n.id), '{}'::bigint[]), false
    from public.content_nodes n where _kind = 'guide' and n.node_type in ('lesson', 'chapter', 'course')
  ), enriched as materialized (
    select i.*, exists(select 1 from public.tags t where t.id = any(i.tag_ids) and t.is_active and t.tag_kind <> 'alias') as tagged,
      exists(select 1 from public.tags t where t.id = any(i.tag_ids) and t.is_active and t.tag_kind <> 'alias' and t.browse_category is not null) as has_category
    from items i
  ), filtered as materialized (
    select * from enriched i where (_q = '' or position(lower(_q) in lower(i.title)) > 0)
      and (_media_type is null or i.media_type = _media_type)
      and case _filter when 'untagged' then not i.tagged when 'no_category' then not i.has_category
        when 'searchable_untagged' then i.is_discoverable and not i.tagged when 'embedded' then i.embedded
        when 'standalone' then not i.embedded when 'browse' then i.is_browsable when 'hidden' then not i.is_discoverable else true end
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by lower(page.title), page.id) from
      (select * from filtered order by lower(title), id limit _limit offset _offset) page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'progress', (select jsonb_build_object('total', count(*), 'tagged', count(*) filter(where tagged),
      'categorized', count(*) filter(where has_category), 'browseApproved', count(*) filter(where is_browsable)) from enriched)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_discovery_catalogue(uuid,text,text,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.admin_discovery_catalogue(uuid,text,text,text,text,integer,integer) to service_role;

create function public.admin_discovery_vocabulary(_actor_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  perform public.assert_discovery_editor(_actor_id);
  return (select coalesce(jsonb_agg(to_jsonb(v) order by lower(v.name), v.id), '[]'::jsonb) from (
    select t.id, t.name, t.tag_kind, t.browse_category, t.canonical_tag_id, t.is_active,
      (select count(*) from public.resource_tags rt where rt.tag_id = t.id) as resource_count,
      (select count(*) from public.content_node_tags nt where nt.tag_id = t.id) as node_count,
      (select count(*) from public.tags a where a.canonical_tag_id = t.id) as alias_count
    from public.tags t
  ) v);
end;
$$;
revoke all on function public.admin_discovery_vocabulary(uuid) from public, anon, authenticated;
grant execute on function public.admin_discovery_vocabulary(uuid) to service_role;

commit;
