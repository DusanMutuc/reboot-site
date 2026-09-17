begin;

-- Review is an explicit decision, separate from both tagging and browse approval.
-- Do not backfill a human review from a pre-existing safe default.
alter table public.resources
  add column discovery_reviewed_at timestamptz,
  add column discovery_reviewed_by uuid references auth.users(id) on delete set null;

-- An older editor may still change the presentation directly. It must not carry
-- a previous human review over to a different decision.
create function public.guard_discovery_review_change() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.discovery_open_mode is distinct from old.discovery_open_mode
    and new.discovery_reviewed_at is not distinct from old.discovery_reviewed_at then
    new.discovery_reviewed_at := null;
    new.discovery_reviewed_by := null;
  end if;
  return new;
end;
$$;
create trigger resources_discovery_review_change before update of discovery_open_mode on public.resources
for each row execute function public.guard_discovery_review_change();

create or replace function public.guard_assignable_discovery_tag() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare chosen public.tags%rowtype;
begin
  perform pg_advisory_xact_lock(60831, 300);
  select * into chosen from public.tags where id = new.tag_id;
  if not found then raise exception 'Discovery tag % does not exist', new.tag_id using errcode = '23503'; end if;
  if not chosen.is_active then raise exception 'Inactive discovery tags cannot be assigned' using errcode = '23514'; end if;
  if chosen.tag_kind <> 'topic' then
    raise exception 'Assign topics to content; categories are inherited and synonyms are search vocabulary' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Keep existing links intact. Closed pickers and new assignments accept topics only.
-- Owner SQL remains available for deliberate legacy clean-up after an audit.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.guard_discovery_vocabulary()'::regprocedure);
  if position('target.tag_kind = ''alias''' in definition) = 0 then
    raise exception 'Vocabulary guard prerequisite does not match'; end if;
  execute replace(definition, 'target.tag_kind = ''alias''', 'target.tag_kind <> ''topic''');

  definition := pg_get_functiondef('public.admin_save_discovery_tag(uuid,bigint,text,text,text,bigint,boolean)'::regprocedure);
  definition := replace(definition, 'if _kind is null or _active is null then',
    'if _kind is null or _kind not in (''topic'', ''alias'') or _active is null then');
  definition := replace(definition, 'if _id is not null then',
    'if _id is not null and exists(select 1 from public.tags where id = _id and tag_kind not in (''topic'', ''alias'')) then
       raise exception ''The four category sections and legacy terms are read-only'' using errcode = ''22023'';
     end if;
     if _id is not null then');
  execute definition;

  definition := pg_get_functiondef('public.create_tagged_resource_upload(uuid,text,text,text,text,boolean,boolean,text,text,text,bigint[],text[])'::regprocedure);
  execute replace(definition, 't.tag_kind <> ''alias''', 't.tag_kind = ''topic''');
end;
$$;

-- Replace the signature (rather than overload default arguments, which makes RPC
-- dispatch ambiguous). Existing eight-argument callers still use the new default.
drop function public.admin_update_discovery_items(uuid,bigint[],bigint[],bigint[],text,text,text,text[]);
create function public.admin_update_discovery_items(_actor_id uuid, _resource_ids bigint[] default '{}',
  _node_ids bigint[] default '{}', _tag_ids bigint[] default null, _tag_action text default 'add',
  _visibility text default null, _open_mode text default null, _search_names text[] default null,
  _review_status text default null)
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
  if exists(select 1 from unnest(_resource_ids) s(id) where s.id is null or not exists(select 1 from public.resources r where r.id = s.id))
    or exists(select 1 from unnest(_node_ids) s(id) where s.id is null or not exists(select 1 from public.content_nodes n where n.id = s.id)) then
    raise exception 'One or more selected items no longer exist' using errcode = '22023'; end if;
  if _tag_action is null or _tag_action not in ('add', 'remove', 'replace')
    or (_visibility is not null and _visibility not in ('hidden', 'search_only', 'browse'))
    or (_open_mode is not null and _open_mode not in ('context', 'direct'))
    or (_review_status is not null and _review_status not in ('pending', 'context', 'direct'))
    or (_review_status is not null and _open_mode is not null) then
    raise exception 'Invalid discovery update' using errcode = '22023'; end if;
  if cardinality(_node_ids) > 0 and (_visibility = 'browse' or _open_mode is not null or _review_status is not null) then
    raise exception 'Guides cannot be approved for homepage browse or standalone resource presentation' using errcode = '22023'; end if;
  if _search_names is not null and total <> 1 then raise exception 'Alternate names belong to one specific item' using errcode = '22023'; end if;
  if _tag_ids is not null then
    if cardinality(_tag_ids) > 100 or exists(select 1 from unnest(_tag_ids) s(id) where s.id is null
      or not exists(select 1 from public.tags t where t.id = s.id and (_tag_action = 'remove' or (t.is_active and t.tag_kind = 'topic')))) then
      raise exception 'Choose existing active canonical tag IDs' using errcode = '22023'; end if;
    if _tag_action in ('remove', 'replace') then
      delete from public.resource_tags rt where rt.resource_id = any(_resource_ids)
        and case when _tag_action = 'remove' then rt.tag_id = any(_tag_ids)
          else not rt.tag_id = any(_tag_ids) and exists(select 1 from public.tags t where t.id = rt.tag_id and t.tag_kind = 'topic') end;
      delete from public.content_node_tags nt where nt.node_id = any(_node_ids)
        and case when _tag_action = 'remove' then nt.tag_id = any(_tag_ids)
          else not nt.tag_id = any(_tag_ids) and exists(select 1 from public.tags t where t.id = nt.tag_id and t.tag_kind = 'topic') end;
    end if;
    if _tag_action in ('add', 'replace') then
      insert into public.resource_tags(resource_id, tag_id) select r, t from unnest(_resource_ids) r cross join unnest(_tag_ids) t on conflict do nothing;
      insert into public.content_node_tags(node_id, tag_id) select n, t from unnest(_node_ids) n cross join unnest(_tag_ids) t on conflict do nothing;
    end if;
  end if;
  update public.resources set
    is_discoverable = case when _visibility is null then is_discoverable else _visibility <> 'hidden' end,
    is_browsable = case when _visibility is null then is_browsable else _visibility = 'browse' end,
    discovery_open_mode = case when _review_status = 'pending' then 'context' else coalesce(_review_status, _open_mode, discovery_open_mode) end,
    discovery_reviewed_at = case when _review_status = 'pending' then null
      when _review_status in ('context', 'direct') then clock_timestamp()
      when _open_mode is not null and _open_mode <> discovery_open_mode then null else discovery_reviewed_at end,
    discovery_reviewed_by = case when _review_status = 'pending' then null
      when _review_status in ('context', 'direct') then _actor_id
      when _open_mode is not null and _open_mode <> discovery_open_mode then null else discovery_reviewed_by end,
    search_names = coalesce(_search_names, search_names)
  where id = any(_resource_ids);
  update public.content_nodes set
    is_discoverable = case when _visibility is null then is_discoverable else _visibility <> 'hidden' end,
    search_names = coalesce(_search_names, search_names)
  where id = any(_node_ids);
  return total;
end;
$$;
revoke all on function public.admin_update_discovery_items(uuid,bigint[],bigint[],bigint[],text,text,text,text[],text) from public, anon, authenticated;
grant execute on function public.admin_update_discovery_items(uuid,bigint[],bigint[],bigint[],text,text,text,text[],text) to service_role;

create or replace function public.admin_discovery_catalogue(_actor_id uuid, _kind text default 'resource', _q text default '',
  _media_type text default null, _filter text default 'all', _limit integer default 50, _offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  if _kind not in ('resource', 'guide') or _filter not in ('all', 'untagged', 'no_category', 'searchable_untagged', 'embedded', 'standalone', 'browse', 'hidden', 'needs_review', 'reviewed_context', 'reviewed_direct')
    or _limit not between 1 and 100 or _offset < 0 or length(_q) > 100 then
    raise exception 'Invalid catalogue filter or pagination' using errcode = '22023'; end if;
  with items as materialized (
    select r.id, 'resource'::text as kind, r.title, r.type as media_type, r.state, r.is_discoverable,
      r.is_browsable, r.discovery_open_mode, r.search_names, r.discovery_reviewed_at,
      coalesce((select array_agg(rt.tag_id order by rt.tag_id) from public.resource_tags rt where rt.resource_id = r.id), '{}'::bigint[]) as tag_ids,
      exists(select 1 from public.content_blocks b where b.resource_id = r.id and b.block_type = 'asset') as embedded,
      placement.node_title as placement_title, placement.node_type as placement_type,
      coalesce((select count(*) from public.resource_block_locations b2 where b2.resource_id = r.id), 0) as placement_count
    from public.resources r left join public.resource_primary_location placement on placement.resource_id = r.id
    where _kind = 'resource'
    union all
    select n.id, 'guide', n.title, n.node_type, n.state, n.is_discoverable, false, 'context', n.search_names, null::timestamptz,
      coalesce((select array_agg(nt.tag_id order by nt.tag_id) from public.content_node_tags nt where nt.node_id = n.id), '{}'::bigint[]), false,
      null::text, null::text, 0::bigint
    from public.content_nodes n where _kind = 'guide' and n.node_type in ('lesson', 'chapter', 'course')
  ), enriched as materialized (
    select i.*, exists(select 1 from public.tags t where t.id = any(i.tag_ids) and t.is_active and t.tag_kind = 'topic') as tagged,
      exists(select 1 from public.tags t where t.id = any(i.tag_ids) and t.is_active and t.tag_kind <> 'alias' and t.browse_category is not null) as has_category
    from items i
  ), filtered as materialized (
    select * from enriched i where (_q = '' or position(lower(_q) in lower(i.title)) > 0)
      and (_media_type is null or i.media_type = _media_type)
      and case _filter when 'untagged' then not i.tagged when 'no_category' then not i.has_category
        when 'searchable_untagged' then i.is_discoverable and not i.tagged when 'embedded' then i.embedded
        when 'needs_review' then i.embedded and i.discovery_reviewed_at is null
        when 'reviewed_context' then i.embedded and i.discovery_reviewed_at is not null and i.discovery_open_mode = 'context'
        when 'reviewed_direct' then i.embedded and i.discovery_reviewed_at is not null and i.discovery_open_mode = 'direct'
        when 'standalone' then not i.embedded when 'browse' then i.is_browsable when 'hidden' then not i.is_discoverable else true end
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by lower(page.title), page.id) from
      (select * from filtered order by lower(title), id limit _limit offset _offset) page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'progress', (select jsonb_build_object('total', count(*), 'tagged', count(*) filter(where tagged),
      'categorized', count(*) filter(where has_category), 'browseApproved', count(*) filter(where is_browsable),
      'embedded', count(*) filter(where embedded), 'needsReview', count(*) filter(where embedded and discovery_reviewed_at is null),
      'hidden', count(*) filter(where not is_discoverable)) from enriched)
  ) into result;
  return result;
end;
$$;

-- Dismissals belong to the signed-in admin and are reversible. Signatures contain
-- IDs + current names/categories, so later vocabulary changes can be reviewed again.
create table public.discovery_duplicate_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  signature text not null check(length(signature) between 1 and 8000),
  created_at timestamptz not null default now(),
  primary key(user_id, signature)
);
alter table public.discovery_duplicate_dismissals enable row level security;
revoke all on public.discovery_duplicate_dismissals from public, anon, authenticated;
grant all on public.discovery_duplicate_dismissals to service_role;

commit;
