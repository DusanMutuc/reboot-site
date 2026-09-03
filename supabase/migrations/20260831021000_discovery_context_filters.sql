begin;

-- Media filters describe the delivered item, not the embedded match. A video
-- that resolves to a guide must not masquerade as a standalone video result.
do $$
declare
  definition text;
  old_clause constant text := 'and (_types is null or resource.type = any(_types))';
  new_clause constant text := 'and (_types is null or (case when presentation.in_context then ''guide'' else resource.type end) = any(_types))';
begin
  definition := pg_get_functiondef('public.search_discovery_catalogue(uuid,text,text,text[],bigint[],text,text,text,integer,integer,boolean,text)'::regprocedure);
  if position(old_clause in definition) = 0 then
    raise exception 'Context filter migration prerequisite does not match';
  end if;
  execute replace(definition, old_clause, new_clause);
end;
$$;

commit;
