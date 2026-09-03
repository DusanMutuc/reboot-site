begin;

-- Account deletion cascades through result sets as supabase_auth_admin. This
-- deferred integrity trigger must be able to check whether the parent survives
-- without granting the auth service general read access to behavioral data.
-- It returns no data and cannot be called as an ordinary RPC.
alter function public.assert_discovery_result_set_item_count() security definer;
revoke all on function public.assert_discovery_result_set_item_count() from public, anon, authenticated;

-- Browse cards and recommendation cards must choose context consistently.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.discovery_resource_contexts(uuid,bigint[])'::regprocedure);
  if position('order by b.resource_id, (p.open_path like ''/library/%'') desc' in definition) = 0 then
    raise exception 'Context hydration migration prerequisite does not match';
  end if;
  execute replace(definition, 'order by b.resource_id, (p.open_path like ''/library/%'') desc',
    'order by b.resource_id, (n.node_type = ''lesson'' and n.is_discoverable) desc nulls last, (p.open_path like ''/library/%'') desc');
end;
$$;

commit;
