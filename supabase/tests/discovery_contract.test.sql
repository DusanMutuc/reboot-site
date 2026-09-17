begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(42);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'discovery-contract@example.invalid',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (id, first_name, last_name)
values ('00000000-0000-0000-0000-000000000101', 'Discovery', 'Contract');

select is(
  (select count(*) from public.tags where tag_kind = 'browse_category' and is_active),
  4::bigint,
  'the controlled taxonomy has exactly four active browse categories'
);

insert into public.resources (id, title, type, url)
values (900001, 'Lead generation basics', 'video', 'https://example.invalid/lead-generation');

select is(
  (select state from public.resources where id = 900001),
  'draft',
  'new manual resources default to draft'
);

select is(
  (select is_discoverable from public.resources where id = 900001),
  false,
  'new manual resources default to non-discoverable'
);

insert into public.tags (
  id,
  name,
  slug,
  tag_kind,
  browse_category,
  is_active
)
values (
  900001,
  'Lead generation',
  'lead-generation',
  'topic',
  'marketing',
  true
);

insert into public.tags (
  id,
  name,
  slug,
  tag_kind,
  canonical_tag_id,
  is_active
)
values (
  900002,
  'Customer acquisition',
  'customer-acquisition',
  'alias',
  900001,
  true
);

insert into public.resource_tags (resource_id, tag_id)
values (900001, 900001);

select ok(
  (select tag_text like '%lead generation%' from public.resources where id = 900001),
  'resource search vocabulary contains its canonical topic'
);

select ok(
  (select tag_text like '%customer acquisition%' from public.resources where id = 900001),
  'resource search vocabulary contains active aliases'
);

select throws_ok(
  $$insert into public.resource_tags (resource_id, tag_id) values (900001, 900002)$$,
  '23514',
  null,
  'alias tags cannot be assigned directly'
);

select lives_ok(
  $$insert into public.user_resource_discovery_preferences (user_id, resource_id, preference)
    values ('00000000-0000-0000-0000-000000000101', 900001, 'finished')$$,
  'explicit finished feedback is accepted'
);

select throws_ok(
  $$update public.user_resource_discovery_preferences
    set preference = 'opened'
    where user_id = '00000000-0000-0000-0000-000000000101'
      and resource_id = 900001$$,
  '23514',
  null,
  'passive open state is not accepted as recommendation feedback'
);

insert into public.logical_searches (
  id,
  user_id,
  journey_id,
  client_session_id,
  tab_session_id,
  query_text,
  browse_category,
  filter_state,
  canonical_sort,
  change_reason,
  created_at
)
values (
  '00000000-0000-0000-0000-000000001001',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000301',
  'contract-session',
  '00000000-0000-0000-0000-000000000201',
  '  Hiring   SYSTEMS  ',
  'hiring',
  '{"format":["video"]}'::jsonb,
  'relevance',
  'initial',
  now() - interval '30 minutes'
);

select is(
  (select normalized_query from public.logical_searches where id = '00000000-0000-0000-0000-000000001001'),
  'hiring systems',
  'logical searches store a normalized query state'
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
  change_reason
)
values (
  '00000000-0000-0000-0000-000000001002',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000001001',
  'contract-session',
  '00000000-0000-0000-0000-000000000201',
  'Hiring systems',
  'hiring',
  '{"format":["video"]}'::jsonb,
  'newest',
  'sort'
);

select isnt(
  (select state_hash from public.logical_searches where id = '00000000-0000-0000-0000-000000001001'),
  (select state_hash from public.logical_searches where id = '00000000-0000-0000-0000-000000001002'),
  'canonical sort state participates in the logical-search hash'
);

select throws_ok(
  $$insert into public.logical_searches (
      id, user_id, journey_id, parent_logical_search_id, client_session_id,
      tab_session_id, query_text, canonical_sort, change_reason
    ) values (
      '00000000-0000-0000-0000-000000001099',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000399',
      '00000000-0000-0000-0000-000000001001',
      'contract-session',
      '00000000-0000-0000-0000-000000000201',
      'wrong journey',
      'relevance',
      'query'
    )$$,
  '23514',
  null,
  'a child logical search cannot cross journey boundaries'
);

insert into public.search_executions (
  id, logical_search_id, execution_number, search_version, pass,
  requested_at, completed_at, status, latency_ms, eligible_candidate_count,
  total_match_count
)
values
  (
    '00000000-0000-0000-0000-000000002001',
    '00000000-0000-0000-0000-000000001001',
    1,
    'lexical-v1',
    'strict',
    now() - interval '20 minutes',
    now() - interval '20 minutes' + interval '20 milliseconds',
    'completed',
    20,
    5,
    3
  ),
  (
    '00000000-0000-0000-0000-000000002002',
    '00000000-0000-0000-0000-000000001001',
    2,
    'lexical-v1',
    'strict',
    now() - interval '5 minutes',
    now() - interval '5 minutes' + interval '20 milliseconds',
    'completed',
    20,
    5,
    3
  );

insert into public.resources (id, title, type, url, state, is_discoverable)
values
  (900002, 'Hiring scorecards', 'pdf', 'https://example.invalid/hiring-scorecards', 'published', true),
  (900003, 'Interview systems', 'video', 'https://example.invalid/interview-systems', 'published', true),
  (900004, 'Team onboarding', 'document', 'https://example.invalid/team-onboarding', 'published', true);

insert into public.discovery_result_sets (
  id, user_id, logical_search_id, search_execution_id, context, surface,
  result_version, page_number, page_size, status, eligible_candidate_count,
  total_match_count, returned_count, generated_at
)
values
  (
    '00000000-0000-0000-0000-000000003001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000001001',
    '00000000-0000-0000-0000-000000002001',
    'search',
    'library',
    'lexical-v1',
    1,
    2,
    'generated',
    5,
    3,
    2,
    now() - interval '20 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000003002',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000001001',
    '00000000-0000-0000-0000-000000002002',
    'search',
    'library',
    'lexical-v1',
    2,
    2,
    'generated',
    5,
    3,
    1,
    now() - interval '5 minutes'
  );

insert into public.discovery_result_set_items (
  result_set_id, position, item_type, item_key, resource_id, ranking_tier, rank_score
)
values
  ('00000000-0000-0000-0000-000000003001', 1, 'resource', 'ignored', 900002, 'strict', 10),
  ('00000000-0000-0000-0000-000000003001', 2, 'resource', 'ignored', 900003, 'strict', 8),
  ('00000000-0000-0000-0000-000000003002', 1, 'resource', 'ignored', 900004, 'strict', 7);

select is(
  (select count(*) from public.discovery_result_set_items where result_set_id = '00000000-0000-0000-0000-000000003001'),
  2::bigint,
  'a search response may validly deliver two results'
);

select is(
  (select status from public.discovery_result_sets where id = '00000000-0000-0000-0000-000000003001'),
  'generated',
  'small search result sets are generated, not insufficient'
);

select is(
  (select item_key from public.discovery_result_set_items
   where result_set_id = '00000000-0000-0000-0000-000000003001' and position = 1),
  'resource:900002',
  'delivered item identity is derived from the trusted resource id'
);

insert into public.discovery_result_sets (
  id, user_id, context, surface, result_version, page_size, status,
  eligible_candidate_count, total_match_count, returned_count
)
values (
  '00000000-0000-0000-0000-000000003010',
  '00000000-0000-0000-0000-000000000101',
  'recommendation',
  'home',
  'recommendation-v1',
  4,
  'insufficient',
  3,
  3,
  3
);

insert into public.discovery_result_set_items (
  result_set_id, position, item_type, item_key, resource_id, ranking_tier, reason_code
)
values
  ('00000000-0000-0000-0000-000000003010', 1, 'resource', 'ignored', 900002, 'recommendation', 'topic_overlap'),
  ('00000000-0000-0000-0000-000000003010', 2, 'resource', 'ignored', 900003, 'recommendation', 'topic_overlap'),
  ('00000000-0000-0000-0000-000000003010', 3, 'resource', 'ignored', 900004, 'recommendation', 'strict_label_match');

select is(
  (select status from public.discovery_result_sets where id = '00000000-0000-0000-0000-000000003010'),
  'insufficient',
  'one to three recommendations are explicitly insufficient for display'
);

select lives_ok(
  $$insert into public.discovery_result_sets (
      id, user_id, context, surface, result_version, page_size, status,
      eligible_candidate_count, total_match_count, returned_count
    ) values (
      '00000000-0000-0000-0000-000000003011',
      '00000000-0000-0000-0000-000000000101',
      'recommendation',
      'home',
      'recommendation-v1',
      4,
      'generated',
      3,
      3,
      3
    )$$,
  'a recommendation response may contain fewer than four items when an explicit coach suggestion is present'
);

insert into public.discovery_events (
  event_id, user_id, client_session_id, tab_session_id, client_sequence,
  event_type, result_set_id, client_occurred_at, server_received_at
)
values
  (
    '00000000-0000-0000-0000-000000004001',
    '00000000-0000-0000-0000-000000000101',
    'contract-session',
    '00000000-0000-0000-0000-000000000201',
    1,
    'result_set_shown',
    '00000000-0000-0000-0000-000000003001',
    now() - interval '20 minutes',
    now() - interval '20 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000004002',
    '00000000-0000-0000-0000-000000000101',
    'contract-session',
    '00000000-0000-0000-0000-000000000201',
    2,
    'result_set_shown',
    '00000000-0000-0000-0000-000000003002',
    now() - interval '5 minutes',
    now() - interval '5 minutes'
  );

select throws_ok(
  $$insert into public.discovery_events (
      event_id, user_id, client_session_id, tab_session_id, client_sequence,
      event_type, result_set_id, item_position, visible_fraction, visible_ms,
      client_occurred_at
    ) values (
      '00000000-0000-0000-0000-000000004003',
      '00000000-0000-0000-0000-000000000101',
      'contract-session',
      '00000000-0000-0000-0000-000000000201',
      3,
      'item_impression',
      '00000000-0000-0000-0000-000000003002',
      1,
      0.49,
      1000,
      now()
    )$$,
  '23514',
  null,
  'an ordinary impression requires at least fifty percent visibility'
);

select lives_ok(
  $$insert into public.discovery_events (
      event_id, user_id, client_session_id, tab_session_id, client_sequence,
      event_type, result_set_id, item_position, visible_fraction, visible_ms,
      client_occurred_at
    ) values (
      '00000000-0000-0000-0000-000000004004',
      '00000000-0000-0000-0000-000000000101',
      'contract-session',
      '00000000-0000-0000-0000-000000000201',
      4,
      'item_impression',
      '00000000-0000-0000-0000-000000003002',
      1,
      0.5,
      1000,
      now()
    )$$,
  'an ordinary impression is accepted after fifty percent visibility for one second'
);

select lives_ok(
  $$insert into public.discovery_events (
      event_id, user_id, client_session_id, tab_session_id, client_sequence,
      event_type, result_set_id, item_position, visible_fraction, visible_ms,
      client_occurred_at, metadata
    ) values (
      '00000000-0000-0000-0000-000000004005',
      '00000000-0000-0000-0000-000000000101',
      'contract-session',
      '00000000-0000-0000-0000-000000000201',
      5,
      'item_impression',
      '00000000-0000-0000-0000-000000003002',
      1,
      0.1,
      0,
      now(),
      '{"fast_click":true}'::jsonb
    )$$,
  'the fast-click exception emits an immediate attributed impression'
);

select throws_ok(
  $$insert into public.discovery_events (
      event_id, user_id, client_session_id, tab_session_id, client_sequence,
      event_type, result_set_id, item_position, client_occurred_at
    ) values (
      '00000000-0000-0000-0000-000000004006',
      '00000000-0000-0000-0000-000000000101',
      'contract-session',
      '00000000-0000-0000-0000-000000000201',
      6,
      'item_open',
      '00000000-0000-0000-0000-000000003002',
      99,
      now()
    )$$,
  '23514',
  null,
  'an item interaction cannot be attributed to an item that was not delivered'
);

select lives_ok(
  $$insert into public.discovery_events (
      event_id, user_id, client_session_id, tab_session_id, client_sequence,
      event_type, result_set_id, item_position, client_occurred_at,
      server_received_at
    ) values (
      '00000000-0000-0000-0000-000000004007',
      '00000000-0000-0000-0000-000000000101',
      'contract-session',
      '00000000-0000-0000-0000-000000000201',
      7,
      'item_open',
      '00000000-0000-0000-0000-000000003002',
      1,
      now() - interval '4 minutes',
      now() - interval '4 minutes'
    )$$,
  'a valid item open is accepted against its delivered result set'
);

select is(
  (select journey_ended_at from public.logical_searches where id = '00000000-0000-0000-0000-000000001001'),
  null::timestamptz,
  'opening a result does not end the search journey'
);

select lives_ok(
  $$insert into public.logical_searches (
      id, user_id, journey_id, parent_logical_search_id, client_session_id,
      tab_session_id, query_text, browse_category, canonical_sort, change_reason
    ) values (
      '00000000-0000-0000-0000-000000001003',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000001001',
      'contract-session',
      '00000000-0000-0000-0000-000000000201',
      'hiring process',
      'hiring',
      'relevance',
      'query'
    )$$,
  'a member can reformulate within the same journey after opening a result'
);

select is(
  (select engaged from public.discovery_logical_search_outcomes
   where logical_search_id = '00000000-0000-0000-0000-000000001001'),
  true,
  'an open on any displayed page engages the logical search'
);

select is(
  (select no_click from public.discovery_logical_search_outcomes
   where logical_search_id = '00000000-0000-0000-0000-000000001001'),
  false,
  'an engaged logical search is not classified as no-click'
);

insert into public.logical_searches (
  id, user_id, journey_id, client_session_id, tab_session_id, query_text,
  canonical_sort, change_reason, created_at, qualified_at
)
values (
  '00000000-0000-0000-0000-000000001010',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000310',
  'contract-session',
  '00000000-0000-0000-0000-000000000201',
  'sales pipeline',
  'relevance',
  'initial',
  now() - interval '20 minutes',
  now() - interval '20 minutes'
);

insert into public.search_executions (
  id, logical_search_id, execution_number, search_version, requested_at,
  completed_at, status, eligible_candidate_count, total_match_count
)
values (
  '00000000-0000-0000-0000-000000002010',
  '00000000-0000-0000-0000-000000001010',
  1,
  'lexical-v1',
  now() - interval '12 minutes',
  now() - interval '12 minutes' + interval '20 milliseconds',
  'completed',
  1,
  1
);

insert into public.discovery_result_sets (
  id, user_id, logical_search_id, search_execution_id, context, surface,
  result_version, page_size, status, eligible_candidate_count,
  total_match_count, returned_count, generated_at
)
values (
  '00000000-0000-0000-0000-000000003020',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000001010',
  '00000000-0000-0000-0000-000000002010',
  'search',
  'library',
  'lexical-v1',
  10,
  'generated',
  1,
  1,
  1,
  now() - interval '12 minutes'
);

insert into public.discovery_result_set_items (
  result_set_id, position, item_type, item_key, resource_id, ranking_tier
)
values ('00000000-0000-0000-0000-000000003020', 1, 'resource', 'ignored', 900002, 'strict');

insert into public.discovery_events (
  event_id, user_id, client_session_id, tab_session_id, client_sequence,
  event_type, result_set_id, client_occurred_at, server_received_at
)
values (
  '00000000-0000-0000-0000-000000004020',
  '00000000-0000-0000-0000-000000000101',
  'contract-session',
  '00000000-0000-0000-0000-000000000201',
  20,
  'result_set_shown',
  '00000000-0000-0000-0000-000000003020',
  now() - interval '11 minutes',
  now() - interval '11 minutes'
);

select is(
  (select no_click from public.discovery_logical_search_outcomes
   where logical_search_id = '00000000-0000-0000-0000-000000001010'),
  true,
  'a qualified search with a closed display window and no open is no-click'
);

select is(
  (select engaged from public.discovery_logical_search_outcomes
   where logical_search_id = '00000000-0000-0000-0000-000000001010'),
  false,
  'a mature no-click search is not engaged'
);

insert into public.logical_searches (
  id, user_id, journey_id, client_session_id, tab_session_id, query_text,
  canonical_sort, change_reason, qualified_at
)
values (
  '00000000-0000-0000-0000-000000001020',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000320',
  'contract-session',
  '00000000-0000-0000-0000-000000000201',
  'marketing plan',
  'relevance',
  'initial',
  now()
);

insert into public.search_executions (
  id, logical_search_id, execution_number, search_version, requested_at,
  completed_at, status, eligible_candidate_count, total_match_count
)
values (
  '00000000-0000-0000-0000-000000002020',
  '00000000-0000-0000-0000-000000001020',
  1,
  'lexical-v1',
  now(),
  now(),
  'completed',
  1,
  1
);

insert into public.discovery_result_sets (
  id, user_id, logical_search_id, search_execution_id, context, surface,
  result_version, page_size, is_prefetched, status,
  eligible_candidate_count, total_match_count, returned_count
)
values (
  '00000000-0000-0000-0000-000000003030',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000001020',
  '00000000-0000-0000-0000-000000002020',
  'search',
  'library',
  'lexical-v1',
  10,
  true,
  'generated',
  1,
  1,
  1
);

insert into public.discovery_result_set_items (
  result_set_id, position, item_type, item_key, resource_id, ranking_tier
)
values ('00000000-0000-0000-0000-000000003030', 1, 'resource', 'ignored', 900003, 'strict');

select is(
  (select eligible from public.discovery_logical_search_outcomes
   where logical_search_id = '00000000-0000-0000-0000-000000001020'),
  false,
  'a prefetched result set is not viewed without a corresponding shown event'
);

select lives_ok(
  $$insert into public.discovery_events (
      event_id, user_id, client_session_id, tab_session_id, client_sequence,
      event_type, logical_search_id, client_occurred_at
    ) values (
      '00000000-0000-0000-0000-000000004030',
      '00000000-0000-0000-0000-000000000101',
      'contract-session',
      '00000000-0000-0000-0000-000000000201',
      30,
      'search_cleared',
      '00000000-0000-0000-0000-000000001003',
      now()
    )$$,
  'clearing search explicitly ends its journey'
);

select is(
  (select count(*) from public.logical_searches
   where journey_id = '00000000-0000-0000-0000-000000000301'
     and journey_ended_at is not null),
  3::bigint,
  'the journey end is applied to every logical state in that journey'
);

select is(
  (select min(journey_end_reason) from public.logical_searches
   where journey_id = '00000000-0000-0000-0000-000000000301'),
  'cleared',
  'the journey records the explicit clear boundary'
);

insert into public.logical_searches (
  id, user_id, journey_id, client_session_id, tab_session_id, query_text,
  canonical_sort, change_reason
)
values (
  '00000000-0000-0000-0000-000000001040',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000340',
  'contract-session',
  '00000000-0000-0000-0000-000000000201',
  'x',
  'relevance',
  'initial'
);

select ok(
  (select expires_at < created_at + interval '31 days'
   from public.logical_searches where id = '00000000-0000-0000-0000-000000001040'),
  'unqualified logical-search state uses the thirty-day retention class'
);

select ok(
  (select expires_at >= created_at + interval '90 days'
   from public.logical_searches where id = '00000000-0000-0000-0000-000000001010'),
  'qualified logical-search state uses the ninety-day retention class'
);

select throws_ok(
  $$insert into public.discovery_events (
      event_id, user_id, client_session_id, tab_session_id, client_sequence,
      event_type, client_occurred_at
    ) values (
      '00000000-0000-0000-0000-000000004030',
      '00000000-0000-0000-0000-000000000101',
      'contract-session',
      '00000000-0000-0000-0000-000000000201',
      31,
      'full_library_opened',
      now()
    )$$,
  '23505',
  null,
  'event ids are idempotent'
);

select throws_ok(
  $$insert into public.discovery_events (
      event_id, user_id, client_session_id, tab_session_id, client_sequence,
      event_type, client_occurred_at
    ) values (
      '00000000-0000-0000-0000-000000004031',
      '00000000-0000-0000-0000-000000000101',
      'contract-session',
      '00000000-0000-0000-0000-000000000201',
      30,
      'full_library_opened',
      now()
    )$$,
  '23505',
  null,
  'client event sequence numbers are idempotent within a tab session'
);

select throws_ok(
  $$insert into public.discovery_events (
      event_id, user_id, client_session_id, tab_session_id, client_sequence,
      event_type, item_type, item_key, item_position, client_occurred_at
    ) values (
      '00000000-0000-0000-0000-000000004032',
      '00000000-0000-0000-0000-000000000101',
      'contract-session',
      '00000000-0000-0000-0000-000000000201',
      32,
      'full_library_opened',
      'resource',
      'resource:900002',
      1,
      now()
    )$$,
  '23514',
  null,
  'non-item events cannot claim item attribution'
);

select lives_ok(
  $$insert into public.discovery_events (
      event_id, user_id, client_session_id, tab_session_id, client_sequence,
      event_type, client_occurred_at
    ) values (
      '00000000-0000-0000-0000-000000004033',
      '00000000-0000-0000-0000-000000000101',
      'contract-session',
      '00000000-0000-0000-0000-000000000201',
      33,
      'full_library_opened',
      now()
    )$$,
  'full-library entry is recorded as a meaningful discovery event'
);

select is(
  (select count(*) from public.discovery_result_set_items
   where result_set_id = '00000000-0000-0000-0000-000000003010'),
  3::bigint,
  'result-set items contain only the ordered items returned in that response'
);

select ok(
  (select expires_at >= server_received_at + interval '90 days'
   from public.discovery_events where event_id = '00000000-0000-0000-0000-000000004033'),
  'person-linked behavioral events use the ninety-day retention class'
);

select has_function(
  'public',
  'maintain_discovery_analytics',
  array[]::text[],
  'discovery retention has an explicit maintenance function'
);

set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$select public.maintain_discovery_analytics()$$,
  '42501',
  null,
  'untrusted callers cannot run discovery retention maintenance'
);

set local request.jwt.claim.role = 'service_role';

select lives_ok(
  $$select public.maintain_discovery_analytics()$$,
  'the trusted maintenance job closes inactive journeys and applies retention safely'
);

select * from finish();
rollback;
