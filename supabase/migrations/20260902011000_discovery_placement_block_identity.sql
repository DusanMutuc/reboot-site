begin;

-- React must identify surrounding blocks by their durable row identity. Positions are
-- presentation order only and are not unique within a node.
create or replace function public.admin_discovery_placement_context(_actor_id uuid, _resource_id bigint)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  select jsonb_build_object(
    'placements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'nodeId', n.id, 'nodeTitle', n.title, 'nodeType', n.node_type, 'nodeState', n.state,
          'nodeDescription', coalesce(n.description,''), 'position', own.position,
          'blockCount', (select count(*) from public.content_blocks c where c.node_id = own.node_id),
          'hasProse', exists(select 1 from public.content_blocks c where c.node_id = own.node_id
            and c.block_type = 'text' and coalesce(c.text_md,'') <> ''),
          'blocks', (select jsonb_agg(jsonb_build_object(
                'blockId', c.id, 'position', c.position, 'type', c.block_type,
                'text', left(coalesce(c.text_md,''), 600),
                'label', coalesce(c.label,''), 'isThis', c.id = own.id,
                'resourceTitle', rr.title, 'resourceType', rr.type) order by c.position, c.id)
            from public.content_blocks c left join public.resources rr on rr.id = c.resource_id
            where c.node_id = own.node_id))
        order by own.node_id, own.position)
      from public.content_blocks own join public.content_nodes n on n.id = own.node_id
      where own.resource_id = _resource_id and own.block_type = 'asset'), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_discovery_placement_context(uuid,bigint) from public, anon, authenticated;
grant execute on function public.admin_discovery_placement_context(uuid,bigint) to service_role;

commit;
