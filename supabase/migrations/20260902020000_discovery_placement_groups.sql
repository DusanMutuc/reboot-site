-- Standalone-use review, reorganised around the guide rather than the resource.
--
-- 104 embedded resources sit in 43 containers, and the top four hold nearly half of them:
-- Red Carpet System alone holds 14, nine of which are "Red Carpet — Example 1…9". Deciding those
-- one at a time reloads the same context fourteen times and hides the pattern that makes the
-- decision obvious. So the review inbox groups by container, and the decision itself is made in
-- the builder, where the guide is already rendered properly.

-- Where a container lives, so a link can open the right editor. A Library guide is a lesson
-- directly beneath a collection; anything else is reached through the course builder.
create or replace function public.discovery_container_home(_node_id bigint)
returns jsonb language sql stable set search_path = pg_catalog, public as $$
  with roots as (
    with recursive up(id, parent_id, node_type, depth) as (
      select n.id, nc.parent_id, n.node_type, 0
      from public.content_nodes n
      left join public.node_children nc on nc.child_id = n.id
      where n.id = _node_id
      union all
      select p.id, pc.parent_id, p.node_type, up.depth + 1
      from up
      join public.content_nodes p on p.id = up.parent_id
      left join public.node_children pc on pc.child_id = p.id
      where up.depth < 12
    )
    select * from up
  )
  select case
    when exists (select 1 from roots where node_type = 'collection')
      then jsonb_build_object('editor', 'library', 'rootId', null)
    else jsonb_build_object('editor', 'course',
      'rootId', (select id from roots where node_type = 'course' order by depth desc limit 1))
  end;
$$;
revoke all on function public.discovery_container_home(bigint) from public, anon, authenticated;

-- One item's decision state, for the control inside the builder's properties panel.
create or replace function public.admin_discovery_item_decision(_actor_id uuid, _kind text, _id bigint, _question text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  if _kind not in ('resource','node') or _question not in ('topics','placement','visibility') then
    raise exception 'Invalid decision lookup' using errcode = '22023'; end if;

  select jsonb_build_object(
    'kind', _kind, 'id', _id, 'question', _question,
    'answer', d.answer, 'token', d.token, 'decidedAt', d.decided_at, 'decidedLabel', d.decided_label,
    'stale', (d.answer is not null and d.evidence is distinct from public.discovery_evidence(_kind, _id, _question)),
    -- The two resources that sit in more than one guide: an answer given in one applies to both,
    -- and the control has to say so where the admin can see it.
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object('nodeId', b.node_id, 'nodeTitle', n.title, 'position', b.position)
        order by b.node_id, b.position)
      from public.content_blocks b join public.content_nodes n on n.id = b.node_id
      where _kind = 'resource' and b.resource_id = _id and b.block_type = 'asset'), '[]'::jsonb)
  ) into result
  from (select 1) probe
  left join public.discovery_decisions d
    on d.item_kind = _kind and d.item_id = _id and d.question = _question;
  return result;
end;
$$;
revoke all on function public.admin_discovery_item_decision(uuid,text,bigint,text) from public, anon, authenticated;
grant execute on function public.admin_discovery_item_decision(uuid,text,bigint,text) to service_role;

-- The review inbox: every container holding an embedded resource, with per-resource status.
create or replace function public.admin_discovery_placement_groups(_actor_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  with rows as materialized (select * from public.discovery_queue_rows('placement')),
  blocks as materialized (
    select b.node_id, b.id as block_id, b.position, b.resource_id
    from public.content_blocks b where b.block_type = 'asset' and b.resource_id is not null
  ),
  joined as (
    select bl.node_id, bl.block_id, bl.position, r.*
    from blocks bl join rows r on r.id = bl.resource_id
  )
  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(g order by g->>'nodeTitle')
      from (
        select jsonb_build_object(
          'nodeId', j.node_id,
          'nodeTitle', n.title,
          'nodeType', n.node_type,
          'nodeState', n.state,
          'home', public.discovery_container_home(j.node_id),
          'total', count(*),
          'decided', count(*) filter (where j.decided),
          'needs', count(*) filter (where j.needs),
          'reopened', count(*) filter (where j.stale),
          'resources', jsonb_agg(jsonb_build_object(
              'id', j.id, 'blockId', j.block_id, 'position', j.position,
              'title', j.title, 'mediaType', j.media_type, 'state', j.state,
              'answer', j.answer, 'token', j.token, 'stale', j.stale,
              'decided', j.decided, 'needs', j.needs,
              'decidedLabel', j.decided_label, 'decidedAt', j.decided_at,
              'placementCount', (select count(*) from blocks b2 where b2.resource_id = j.id))
            order by j.position)
        ) as g
        from joined j join public.content_nodes n on n.id = j.node_id
        group by j.node_id, n.title, n.node_type, n.state
      ) grouped), '[]'::jsonb),
    'progress', (select jsonb_build_object(
        'decided', count(*) filter (where decided),
        'population', count(*),
        'needs', count(*) filter (where needs),
        'reopened', count(*) filter (where stale))
      from rows where needs or decided)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_discovery_placement_groups(uuid) from public, anon, authenticated;
grant execute on function public.admin_discovery_placement_groups(uuid) to service_role;
