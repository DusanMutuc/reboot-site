begin;

-- PostgREST executes each request in its own transaction. These recording
-- functions keep a delivered result set and all of its ordered items atomic,
-- so analytics can never contain a declared count without the corresponding
-- delivered-item rows.
create or replace function public.record_discovery_result_set(
  _result_set_id uuid,
  _user_id uuid,
  _context text,
  _context_key text,
  _surface text,
  _result_version text,
  _page_number integer,
  _page_size integer,
  _is_prefetched boolean,
  _status text,
  _eligible_candidate_count integer,
  _total_match_count integer,
  _returned_count integer,
  _error_code text,
  _logical_search_id uuid,
  _search_execution_id uuid,
  _items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  item_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Discovery result sets are recorded by the trusted server only'
      using errcode = '42501';
  end if;

  if _result_set_id is null or _user_id is null then
    raise exception 'Result-set and member ids are required'
      using errcode = '22004';
  end if;

  if jsonb_typeof(coalesce(_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Discovery result-set items must be a JSON array'
      using errcode = '22023';
  end if;

  item_count := jsonb_array_length(coalesce(_items, '[]'::jsonb));
  if item_count <> _returned_count then
    raise exception 'Returned count % does not match the % delivered items',
      _returned_count, item_count
      using errcode = '23514';
  end if;

  insert into public.discovery_result_sets (
    id,
    user_id,
    logical_search_id,
    search_execution_id,
    context,
    context_key,
    surface,
    result_version,
    page_number,
    page_size,
    is_prefetched,
    status,
    eligible_candidate_count,
    total_match_count,
    returned_count,
    error_code
  )
  values (
    _result_set_id,
    _user_id,
    _logical_search_id,
    _search_execution_id,
    _context,
    _context_key,
    _surface,
    _result_version,
    _page_number,
    _page_size,
    coalesce(_is_prefetched, false),
    _status,
    _eligible_candidate_count,
    _total_match_count,
    _returned_count,
    _error_code
  )
  on conflict (id) do nothing;

  if not found then
    if not exists (
      select 1
      from public.discovery_result_sets existing
      where existing.id = _result_set_id
        and existing.user_id = _user_id
        and existing.context = _context
        and existing.returned_count = _returned_count
    ) then
      raise exception 'Result-set retry does not match the existing record'
        using errcode = '23514';
    end if;

    return _result_set_id;
  end if;

  insert into public.discovery_result_set_items (
    result_set_id,
    position,
    item_type,
    item_key,
    resource_id,
    content_node_id,
    ranking_tier,
    rank_score,
    reason_code,
    reason_context
  )
  select
    _result_set_id,
    item.position,
    item.item_type,
    'pending',
    item.resource_id,
    item.content_node_id,
    item.ranking_tier,
    item.rank_score,
    item.reason_code,
    coalesce(item.reason_context, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(_items, '[]'::jsonb)) as item(
    position integer,
    item_type text,
    resource_id bigint,
    content_node_id bigint,
    ranking_tier text,
    rank_score numeric,
    reason_code text,
    reason_context jsonb
  );

  return _result_set_id;
end
$function$;

create or replace function public.record_discovery_search_response(
  _logical_search_id uuid,
  _journey_id uuid,
  _parent_logical_search_id uuid,
  _user_id uuid,
  _client_session_id text,
  _tab_session_id uuid,
  _query_text text,
  _browse_category text,
  _filter_state jsonb,
  _canonical_sort text,
  _change_reason text,
  _execution_id uuid,
  _execution_number integer,
  _search_version text,
  _execution_pass text,
  _requested_at timestamptz,
  _completed_at timestamptz,
  _execution_status text,
  _latency_ms integer,
  _eligible_candidate_count integer,
  _total_match_count integer,
  _execution_error_code text,
  _result_set_id uuid,
  _surface text,
  _page_number integer,
  _page_size integer,
  _is_prefetched boolean,
  _result_status text,
  _returned_count integer,
  _result_error_code text,
  _items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  normalized_query text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Search responses are recorded by the trusted server only'
      using errcode = '42501';
  end if;

  normalized_query := lower(
    regexp_replace(btrim(coalesce(_query_text, '')), '[[:space:]]+', ' ', 'g')
  );

  insert into public.logical_searches (
    id,
    user_id,
    journey_id,
    parent_logical_search_id,
    client_session_id,
    tab_session_id,
    query_text,
    browse_category,
    filter_state,
    canonical_sort,
    change_reason,
    qualified_at,
    last_interaction_at
  )
  values (
    _logical_search_id,
    _user_id,
    _journey_id,
    _parent_logical_search_id,
    _client_session_id,
    _tab_session_id,
    _query_text,
    _browse_category,
    coalesce(_filter_state, '{}'::jsonb),
    _canonical_sort,
    _change_reason,
    case when char_length(normalized_query) >= 2 then now() end,
    now()
  )
  on conflict (id) do update
  set last_interaction_at = greatest(
    public.logical_searches.last_interaction_at,
    excluded.last_interaction_at
  );

  if _parent_logical_search_id is not null then
    update public.logical_searches
    set superseded_at = coalesce(superseded_at, now())
    where id = _parent_logical_search_id;
  end if;

  insert into public.search_executions (
    id,
    logical_search_id,
    execution_number,
    search_version,
    pass,
    requested_at,
    completed_at,
    status,
    latency_ms,
    eligible_candidate_count,
    total_match_count,
    error_code
  )
  values (
    _execution_id,
    _logical_search_id,
    _execution_number,
    _search_version,
    _execution_pass,
    coalesce(_requested_at, now()),
    _completed_at,
    _execution_status,
    _latency_ms,
    _eligible_candidate_count,
    _total_match_count,
    _execution_error_code
  )
  on conflict (id) do nothing;

  perform public.record_discovery_result_set(
    _result_set_id,
    _user_id,
    'search',
    null,
    _surface,
    _search_version,
    _page_number,
    _page_size,
    _is_prefetched,
    _result_status,
    _eligible_candidate_count,
    _total_match_count,
    _returned_count,
    _result_error_code,
    _logical_search_id,
    _execution_id,
    _items
  );

  return _result_set_id;
end
$function$;

create or replace function public.record_discovery_event(
  _event_id uuid,
  _schema_version smallint,
  _user_id uuid,
  _client_session_id text,
  _tab_session_id uuid,
  _client_sequence bigint,
  _event_type text,
  _result_set_id uuid,
  _logical_search_id uuid,
  _item_position integer,
  _visible_fraction numeric,
  _visible_ms integer,
  _client_occurred_at timestamptz,
  _metadata jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Discovery events are recorded by the trusted server only'
      using errcode = '42501';
  end if;

  insert into public.discovery_events (
    event_id,
    schema_version,
    user_id,
    client_session_id,
    tab_session_id,
    client_sequence,
    event_type,
    result_set_id,
    logical_search_id,
    item_position,
    visible_fraction,
    visible_ms,
    client_occurred_at,
    metadata
  )
  values (
    _event_id,
    coalesce(_schema_version, 1),
    _user_id,
    _client_session_id,
    _tab_session_id,
    _client_sequence,
    _event_type,
    _result_set_id,
    _logical_search_id,
    _item_position,
    _visible_fraction,
    _visible_ms,
    _client_occurred_at,
    coalesce(_metadata, '{}'::jsonb)
  )
  on conflict (event_id) do nothing;

  return found;
end
$function$;

revoke all on function public.record_discovery_result_set(
  uuid, uuid, text, text, text, text, integer, integer, boolean, text,
  integer, integer, integer, text, uuid, uuid, jsonb
) from public, anon, authenticated;
revoke all on function public.record_discovery_search_response(
  uuid, uuid, uuid, uuid, text, uuid, text, text, jsonb, text, text,
  uuid, integer, text, text, timestamptz, timestamptz, text, integer,
  integer, integer, text, uuid, text, integer, integer, boolean, text,
  integer, text, jsonb
) from public, anon, authenticated;
revoke all on function public.record_discovery_event(
  uuid, smallint, uuid, text, uuid, bigint, text, uuid, uuid, integer,
  numeric, integer, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function public.record_discovery_result_set(
  uuid, uuid, text, text, text, text, integer, integer, boolean, text,
  integer, integer, integer, text, uuid, uuid, jsonb
) to service_role;
grant execute on function public.record_discovery_search_response(
  uuid, uuid, uuid, uuid, text, uuid, text, text, jsonb, text, text,
  uuid, integer, text, text, timestamptz, timestamptz, text, integer,
  integer, integer, text, uuid, text, integer, integer, boolean, text,
  integer, text, jsonb
) to service_role;
grant execute on function public.record_discovery_event(
  uuid, smallint, uuid, text, uuid, bigint, text, uuid, uuid, integer,
  numeric, integer, timestamptz, jsonb
) to service_role;

commit;
