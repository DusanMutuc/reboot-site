begin;

-- Placement review uses the same product boundary as discovery itself. A block inside a
-- course chapter or lesson belongs to the whole course; a block directly inside a canonical
-- Library guide belongs to that guide. Other structural/editor nodes are not review groups.
create or replace function public.discovery_placement_container(_node_id bigint)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with recursive ancestors(id, depth) as (
    select _node_id, 0
    union all
    select edge.parent_id, ancestors.depth + 1
    from ancestors
    join public.node_children edge on edge.child_id = ancestors.id
    where ancestors.depth < 12
  )
  select ancestors.id
  from ancestors
  where public.is_discovery_learning_node(ancestors.id)
  order by ancestors.depth, ancestors.id
  limit 1;
$$;

revoke all on function public.discovery_placement_container(bigint) from public, anon, authenticated;
grant execute on function public.discovery_placement_container(bigint) to service_role;

comment on function public.discovery_placement_container(bigint) is
  'Returns the canonical Library guide or whole-course container for a placement node. '
  'Course-internal nodes roll up to the course; unrelated structural nodes return null.';

create or replace function public.discovery_container_home(_node_id bigint)
returns jsonb language sql stable set search_path = pg_catalog, public as $$
  select case node.node_type
    when 'lesson' then jsonb_build_object('editor', 'library', 'rootId', null)
    when 'course' then jsonb_build_object('editor', 'course', 'rootId', node.id)
  end
  from public.content_nodes node
  where node.id = _node_id and public.is_discovery_learning_node(node.id);
$$;

revoke all on function public.discovery_container_home(bigint) from public, anon, authenticated;

-- The review inbox is grouped at the member-facing boundary, not by implementation nodes.
-- Keep the immediate placement node on each resource so a future builder deep-link can still
-- select the exact nested lesson and block inside a course.
create or replace function public.admin_discovery_placement_groups(_actor_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  with rows as materialized (select * from public.discovery_queue_rows('placement')),
  blocks as materialized (
    select b.node_id as placement_node_id, b.id as block_id, b.position, b.resource_id,
      public.discovery_placement_container(b.node_id) as container_id
    from public.content_blocks b
    where b.block_type = 'asset' and b.resource_id is not null
  ),
  scoped_blocks as materialized (select * from blocks where container_id is not null),
  scoped_rows as materialized (
    select r.* from rows r
    where exists (select 1 from scoped_blocks block where block.resource_id = r.id)
  ),
  joined as (
    select block.container_id, block.placement_node_id, block.block_id, block.position, r.*
    from scoped_blocks block join scoped_rows r on r.id = block.resource_id
  )
  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(g order by g->>'nodeTitle')
      from (
        select jsonb_build_object(
          'nodeId', j.container_id,
          'nodeTitle', container.title,
          'nodeType', container.node_type,
          'nodeState', container.state,
          'home', public.discovery_container_home(j.container_id),
          'total', count(*),
          'decided', count(*) filter (where j.decided),
          'needs', count(*) filter (where j.needs),
          'reopened', count(*) filter (where j.stale),
          'resources', jsonb_agg(jsonb_build_object(
              'id', j.id, 'blockId', j.block_id, 'position', j.position,
              'placementNodeId', j.placement_node_id, 'placementNodeTitle', placement.title,
              'title', j.title, 'mediaType', j.media_type, 'state', j.state,
              'answer', j.answer, 'token', j.token, 'stale', j.stale,
              'decided', j.decided, 'needs', j.needs,
              'decidedLabel', j.decided_label, 'decidedAt', j.decided_at,
              'placementCount', (select count(*) from blocks b2 where b2.resource_id = j.id))
            order by placement.title, j.position, j.block_id)
        ) as g
        from joined j
        join public.content_nodes container on container.id = j.container_id
        join public.content_nodes placement on placement.id = j.placement_node_id
        group by j.container_id, container.title, container.node_type, container.state
      ) grouped), '[]'::jsonb),
    'progress', (select jsonb_build_object(
        'decided', count(*) filter (where decided),
        'population', count(*),
        'needs', count(*) filter (where needs),
        'reopened', count(*) filter (where stale))
      from scoped_rows where needs or decided)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_discovery_placement_groups(uuid) from public, anon, authenticated;
grant execute on function public.admin_discovery_placement_groups(uuid) to service_role;

commit;
