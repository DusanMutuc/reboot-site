begin;

create or replace function public.maintain_discovery_analytics()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  closed_journeys integer := 0;
  deleted_events integer := 0;
  deleted_result_sets integer := 0;
  deleted_executions integer := 0;
  deleted_logical_searches integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Discovery retention is maintained by the trusted server only'
      using errcode = '42501';
  end if;

  closed_journeys := public.close_inactive_search_journeys(now() - interval '10 minutes');

  delete from public.discovery_events
  where expires_at <= now();
  get diagnostics deleted_events = row_count;

  delete from public.discovery_result_sets
  where expires_at <= now();
  get diagnostics deleted_result_sets = row_count;

  delete from public.search_executions
  where expires_at <= now();
  get diagnostics deleted_executions = row_count;

  delete from public.logical_searches
  where expires_at <= now();
  get diagnostics deleted_logical_searches = row_count;

  return jsonb_build_object(
    'closedJourneys', closed_journeys,
    'deletedEvents', deleted_events,
    'deletedResultSets', deleted_result_sets,
    'deletedExecutions', deleted_executions,
    'deletedLogicalSearches', deleted_logical_searches
  );
end
$function$;

revoke all on function public.maintain_discovery_analytics() from public, anon, authenticated;
grant execute on function public.maintain_discovery_analytics() to service_role;

comment on function public.maintain_discovery_analytics() is
  'Closes ten-minute-inactive journeys and enforces the 30/90-day discovery analytics retention classes.';

commit;
