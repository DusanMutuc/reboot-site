begin;
-- For context-preserving matches, prefer an eligible learning experience when
-- the same resource also belongs to a non-discoverable guide. Neither flag can
-- override publication or caller access, which have already filtered the paths.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.search_discovery_catalogue(uuid,text,text,text[],bigint[],text,text,text,integer,integer,boolean,text)'::regprocedure);
  if position('join accessible_paths p on p.node_id = b.node_id' in definition) = 0 then
    raise exception 'Placement migration prerequisite does not match';
  end if;
  definition := replace(definition, 'join accessible_paths p on p.node_id = b.node_id',
    'join accessible_paths p on p.node_id = b.node_id left join public.content_nodes candidate_container on candidate_container.id = p.container_id');
  definition := replace(definition, 'order by b.resource_id, (p.open_path like ''/library/%'') desc,',
    'order by b.resource_id, (candidate_container.node_type = ''lesson'' and candidate_container.is_discoverable) desc nulls last, (p.open_path like ''/library/%'') desc,');
  execute definition;
end;
$$;
commit;
