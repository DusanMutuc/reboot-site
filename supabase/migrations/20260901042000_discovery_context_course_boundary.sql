begin;

-- Context-preserving resources inside a course used to be presented as their nearest internal
-- lesson. That recreated the very result type the eligibility rule excludes. Keep the context, but
-- promote it to the whole course; resources inside canonical Library guides still promote to the
-- guide. The resource itself remains available directly only after an explicit standalone review.
do $migration$
declare
  definition text := pg_get_functiondef(
    'public.search_discovery_catalogue(uuid,text,text,text[],bigint[],text,text,text,integer,integer,boolean,text)'::regprocedure
  );
  expected text;
  replacement text;
begin
  expected := $old$select distinct on (b.resource_id) b.resource_id, p.container_id, p.container_path
    from public.content_blocks b
    join accessible_paths p on p.node_id = b.node_id left join public.content_nodes candidate_container on candidate_container.id = p.container_id$old$;
  replacement := $new$select distinct on (b.resource_id) b.resource_id,
      case when root.node_type = 'course' then p.root_id else p.container_id end as container_id,
      case when root.node_type = 'course' then '/courses/' || root.slug else p.container_path end as container_path
    from public.content_blocks b
    join accessible_paths p on p.node_id = b.node_id
    join public.content_nodes root on root.id = p.root_id
    left join public.content_nodes candidate_container on candidate_container.id = p.container_id$new$;
  if position(expected in definition) = 0 then
    raise exception 'search_discovery_catalogue placement selection no longer matches the course-boundary migration';
  end if;
  definition := replace(definition, expected, replacement);

  expected := $old$case when presentation.in_context then 'guide' else resource.type end as media_type$old$;
  replacement := $new$case when presentation.in_context and container.node_type = 'course' then 'course'
        when presentation.in_context then 'guide' else resource.type end as media_type$new$;
  if position(expected in definition) = 0 then
    raise exception 'search_discovery_catalogue contextual media label no longer matches the course-boundary migration';
  end if;
  definition := replace(definition, expected, replacement);

  expected := $old$_surface = 'search' and container.node_type = 'lesson' and container.is_discoverable$old$;
  replacement := $new$_surface = 'search' and public.is_discovery_learning_node(container.id) and container.is_discoverable$new$;
  if position(expected in definition) = 0 then
    raise exception 'search_discovery_catalogue contextual eligibility no longer matches the course-boundary migration';
  end if;
  definition := replace(definition, expected, replacement);

  expected := $old$node.node_type::text as media_type$old$;
  replacement := $new$case when node.node_type = 'course' then 'course' else 'guide' end::text as media_type$new$;
  if position(expected in definition) = 0 then
    raise exception 'search_discovery_catalogue direct learning label no longer matches the course-boundary migration';
  end if;
  execute replace(definition, expected, replacement);
end
$migration$;

commit;
