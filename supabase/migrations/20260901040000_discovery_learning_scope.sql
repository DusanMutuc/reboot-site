begin;

-- A database "lesson" is not automatically a member-facing Library guide. The same type is also
-- used for course internals and for abandoned editor drafts. Discovery governs only:
--   * whole courses; and
--   * lessons placed directly inside the canonical Library collection.
-- Keep that product rule in one predicate so queues, writes and search cannot drift apart again.
create or replace function public.is_discovery_learning_node(_node_id bigint)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.content_nodes node
    where node.id = _node_id
      and (
        node.node_type = 'course'
        or (
          node.node_type = 'lesson'
          and exists (
            select 1
            from public.node_children edge
            join public.content_nodes parent on parent.id = edge.parent_id
            where edge.child_id = node.id
              and parent.node_type = 'collection'
              and parent.slug = 'library'
          )
        )
      )
  );
$$;

revoke all on function public.is_discovery_learning_node(bigint) from public, anon, authenticated;
grant execute on function public.is_discovery_learning_node(bigint) to service_role;

comment on function public.is_discovery_learning_node(bigint) is
  'True for whole courses and lessons directly inside the canonical Library collection. '
  'Course-internal, parentless, playlist and other structural nodes are not independent discovery items.';

create or replace view public.discovery_job_items as
  select 'resource'::text as kind, r.id, r.title, coalesce(r.description,'') as description,
    r.type as media_type, r.state, r.is_discoverable, r.is_browsable, r.discovery_open_mode,
    r.duration, (coalesce(r.thumbnail,'') <> '') as has_thumbnail, coalesce(r.url,'') as url,
    exists(select 1 from public.content_blocks b where b.resource_id = r.id and b.block_type = 'asset') as embedded,
    exists(select 1 from public.resource_tags rt join public.tags t on t.id = rt.tag_id
      where rt.resource_id = r.id and t.is_active and t.tag_kind = 'topic') as has_topics
  from public.resources r
  union all
  select 'node', n.id, n.title, coalesce(n.description,''), n.node_type, n.state, n.is_discoverable,
    false, 'context', null::integer, false, '',
    false,
    exists(select 1 from public.content_node_tags nt join public.tags t on t.id = nt.tag_id
      where nt.node_id = n.id and t.is_active and t.tag_kind = 'topic')
  from public.content_nodes n
  where public.is_discovery_learning_node(n.id);

revoke all on public.discovery_job_items from public, anon, authenticated;
grant select on public.discovery_job_items to service_role;

comment on view public.discovery_job_items is
  'Items governed by discovery jobs: all resources, canonical Library guides and whole courses. '
  'Course-internal lessons, parentless lessons, chapters, collections and playlists are excluded.';

-- Patch the installed functions instead of copying their large bodies into another migration. Every
-- replacement is guarded: if an earlier migration changes the expected source, this migration stops
-- rather than applying only part of the boundary.
do $migration$
declare
  definition text;
  expected text;
  replacement text;
begin
  definition := pg_get_functiondef(
    'public.admin_record_discovery_decision(uuid,text,bigint,text,text,bigint[],uuid,boolean)'::regprocedure
  );
  expected := $old$if _kind = 'node' and not exists(select 1 from public.content_nodes n
    where n.id = _id and n.node_type in ('lesson','course')) then
    raise exception 'Only lessons and courses carry discovery decisions' using errcode = '22023'; end if;$old$;
  replacement := $new$if _kind = 'node' and not public.is_discovery_learning_node(_id) then
    raise exception 'Only Library guides and whole courses carry discovery decisions' using errcode = '22023'; end if;$new$;
  if position(expected in definition) = 0 then
    raise exception 'admin_record_discovery_decision definition no longer matches the discovery-scope migration';
  end if;
  execute replace(definition, expected, replacement);

  definition := pg_get_functiondef(
    'public.admin_bulk_discovery_topics(uuid,jsonb,bigint[])'::regprocedure
  );
  expected := $old$if kind = 'node' and not exists(select 1 from public.content_nodes n
      where n.id = target and n.node_type in ('lesson','course')) then
      raise exception 'Only lessons and courses carry topics' using errcode = '22023'; end if;$old$;
  replacement := $new$if kind = 'node' and not public.is_discovery_learning_node(target) then
      raise exception 'Only Library guides and whole courses carry topics' using errcode = '22023'; end if;$new$;
  if position(expected in definition) = 0 then
    raise exception 'admin_bulk_discovery_topics definition no longer matches the discovery-scope migration';
  end if;
  execute replace(definition, expected, replacement);

  definition := pg_get_functiondef(
    'public.admin_update_discovery_items(uuid,bigint[],bigint[],bigint[],text,text,text,text[])'::regprocedure
  );
  expected := $old$or exists(select 1 from unnest(_node_ids) s(id) where s.id is null or not exists(select 1 from public.content_nodes n where n.id = s.id)) then
    raise exception 'One or more selected items no longer exist' using errcode = '22023'; end if;$old$;
  replacement := $new$or exists(select 1 from unnest(_node_ids) s(id) where s.id is null or not public.is_discovery_learning_node(s.id)) then
    raise exception 'One or more selected items no longer exist or are not a Library guide or whole course' using errcode = '22023'; end if;$new$;
  if position(expected in definition) = 0 then
    raise exception 'admin_update_discovery_items definition no longer matches the discovery-scope migration';
  end if;
  execute replace(definition, expected, replacement);

  definition := pg_get_functiondef(
    'public.admin_discovery_catalogue(uuid,text,text,text,text,integer,integer)'::regprocedure
  );
  expected := $old$from public.content_nodes n where _kind = 'guide' and n.node_type in ('lesson', 'chapter', 'course')$old$;
  replacement := $new$from public.content_nodes n where _kind = 'guide' and public.is_discovery_learning_node(n.id)$new$;
  if position(expected in definition) = 0 then
    raise exception 'admin_discovery_catalogue definition no longer matches the discovery-scope migration';
  end if;
  execute replace(definition, expected, replacement);

  definition := pg_get_functiondef(
    'public.search_discovery_catalogue(uuid,text,text,text[],bigint[],text,text,text,integer,integer,boolean,text)'::regprocedure
  );
  expected := $old$and node.node_type = 'lesson'$old$;
  replacement := $new$and public.is_discovery_learning_node(node.id)$new$;
  if position(expected in definition) = 0
     or position(expected in substring(definition from position(expected in definition) + length(expected))) > 0 then
    raise exception 'search_discovery_catalogue must contain exactly one direct learning-node eligibility clause';
  end if;
  definition := replace(definition, expected, replacement);

  -- A course still participates in the existing "guide" result family for filtering and analytics,
  -- but its member-facing format must say Course rather than Guide.
  expected := $old$'guide'::text as media_type$old$;
  replacement := $new$node.node_type::text as media_type$new$;
  if position(expected in definition) = 0
     or position(expected in substring(definition from position(expected in definition) + length(expected))) > 0 then
    raise exception 'search_discovery_catalogue must contain exactly one learning-node media label';
  end if;
  execute replace(definition, expected, replacement);
end
$migration$;

commit;
