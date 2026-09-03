begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'recording-contract@example.invalid',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (id, first_name, last_name)
values ('00000000-0000-0000-0000-000000000701', 'Recording', 'Contract');

insert into public.resources (id, title, type, url, state, is_discoverable)
values
  (903001, 'Recorded result one', 'video', 'https://example.invalid/recorded-one', 'published', true),
  (903002, 'Recorded result two', 'pdf', 'https://example.invalid/recorded-two', 'published', true);

set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000701';

select is(
  public.record_discovery_result_set(
    '00000000-0000-0000-0000-000000007101',
    '00000000-0000-0000-0000-000000000701',
    'catalogue',
    null,
    'home',
    'catalogue-v1',
    1,
    8,
    true,
    'generated',
    2,
    2,
    2,
    null,
    null,
    null,
    '[
      {"position":1,"item_type":"resource","resource_id":903001,"ranking_tier":"strict","rank_score":10},
      {"position":2,"item_type":"resource","resource_id":903002,"ranking_tier":"strict","rank_score":8}
    ]'::jsonb
  ),
  '00000000-0000-0000-0000-000000007101'::uuid,
  'the trusted recorder atomically creates a catalogue result set'
);

select is(
  (select count(*) from public.discovery_result_set_items
   where result_set_id = '00000000-0000-0000-0000-000000007101'),
  2::bigint,
  'the recorder stores every delivered item in order'
);

select is(
  (select item_key from public.discovery_result_set_items
   where result_set_id = '00000000-0000-0000-0000-000000007101'
     and position = 1),
  'resource:903001',
  'the recorder derives trusted item identity instead of accepting a client key'
);

select throws_ok(
  $$select public.record_discovery_result_set(
      '00000000-0000-0000-0000-000000007102',
      '00000000-0000-0000-0000-000000000701',
      'catalogue', null, 'home', 'catalogue-v1', 1, 8, true,
      'generated', 2, 2, 2, null, null, null,
      '[{"position":1,"item_type":"resource","resource_id":903001,"ranking_tier":"strict"}]'::jsonb
    )$$,
  '23514',
  null,
  'a declared returned count cannot disagree with the delivered item array'
);

select is(
  public.record_discovery_result_set(
    '00000000-0000-0000-0000-000000007101',
    '00000000-0000-0000-0000-000000000701',
    'catalogue', null, 'home', 'catalogue-v1', 1, 8, true,
    'generated', 2, 2, 2, null, null, null,
    '[
      {"position":1,"item_type":"resource","resource_id":903001,"ranking_tier":"strict","rank_score":10},
      {"position":2,"item_type":"resource","resource_id":903002,"ranking_tier":"strict","rank_score":8}
    ]'::jsonb
  ),
  '00000000-0000-0000-0000-000000007101'::uuid,
  'retrying the same result-set id is idempotent'
);

select is(
  (select count(*) from public.discovery_result_set_items
   where result_set_id = '00000000-0000-0000-0000-000000007101'),
  2::bigint,
  'an idempotent retry never duplicates delivered items'
);

select is(
  public.record_discovery_search_response(
    '00000000-0000-0000-0000-000000007201',
    '00000000-0000-0000-0000-000000007301',
    null,
    '00000000-0000-0000-0000-000000000701',
    'recording-session',
    '00000000-0000-0000-0000-000000000721',
    'database management',
    null,
    '{}'::jsonb,
    'relevance',
    'initial',
    '00000000-0000-0000-0000-000000007401',
    1,
    'lexical-v1',
    'strict',
    date_trunc('second', now()),
    date_trunc('second', now()),
    'completed',
    12,
    2,
    1,
    null,
    '00000000-0000-0000-0000-000000007501',
    'home_search',
    1,
    5,
    false,
    'generated',
    1,
    null,
    '[{"position":1,"item_type":"resource","resource_id":903001,"ranking_tier":"strict","rank_score":10}]'::jsonb
  ),
  '00000000-0000-0000-0000-000000007501'::uuid,
  'a search response safely records app timestamps with lower precision than Postgres'
);

select ok(
  (select qualified_at is null from public.logical_searches
   where id = '00000000-0000-0000-0000-000000007201'),
  'recording a response does not qualify a search before a member sees or interacts with it'
);

select is(
  public.record_discovery_search_response(
    '00000000-0000-0000-0000-000000007202',
    '00000000-0000-0000-0000-000000007301',
    '00000000-0000-0000-0000-000000007201',
    '00000000-0000-0000-0000-000000000701',
    'recording-session',
    '00000000-0000-0000-0000-000000000721',
    'database cleanup',
    null,
    '{}'::jsonb,
    'relevance',
    'query',
    '00000000-0000-0000-0000-000000007402',
    1,
    'lexical-v1',
    'strict',
    now(),
    now(),
    'completed',
    11,
    2,
    1,
    null,
    '00000000-0000-0000-0000-000000007502',
    'home_search',
    1,
    5,
    false,
    'generated',
    1,
    null,
    '[{"position":1,"item_type":"resource","resource_id":903002,"ranking_tier":"strict","rank_score":9}]'::jsonb
  ),
  '00000000-0000-0000-0000-000000007502'::uuid,
  'a reformulated query remains in the same journey with a parent state'
);

select ok(
  (select superseded_at is not null from public.logical_searches
   where id = '00000000-0000-0000-0000-000000007201'),
  'recording a reformulation marks the prior logical state as superseded'
);

select is(
  public.record_discovery_event(
    _event_id => '00000000-0000-0000-0000-000000007601'::uuid,
    _schema_version => 1::smallint,
    _user_id => '00000000-0000-0000-0000-000000000701'::uuid,
    _client_session_id => 'recording-session',
    _tab_session_id => '00000000-0000-0000-0000-000000000721'::uuid,
    _client_sequence => 1::bigint,
    _event_type => 'item_open',
    _result_set_id => '00000000-0000-0000-0000-000000007502'::uuid,
    _logical_search_id => null::uuid,
    _item_position => 1,
    _visible_fraction => null::numeric,
    _visible_ms => null::integer,
    _client_occurred_at => now(),
    _metadata => '{}'::jsonb
  ),
  true,
  'the trusted event recorder accepts valid result attribution'
);

select is(
  (select journey_ended_at from public.logical_searches
   where id = '00000000-0000-0000-0000-000000007202'),
  null::timestamptz,
  'a recorded open still does not end the search journey'
);

select is(
  public.record_discovery_event(
    _event_id => '00000000-0000-0000-0000-000000007601'::uuid,
    _schema_version => 1::smallint,
    _user_id => '00000000-0000-0000-0000-000000000701'::uuid,
    _client_session_id => 'recording-session',
    _tab_session_id => '00000000-0000-0000-0000-000000000721'::uuid,
    _client_sequence => 1::bigint,
    _event_type => 'item_open',
    _result_set_id => '00000000-0000-0000-0000-000000007502'::uuid,
    _logical_search_id => null::uuid,
    _item_position => 1,
    _visible_fraction => null::numeric,
    _visible_ms => null::integer,
    _client_occurred_at => now(),
    _metadata => '{}'::jsonb
  ),
  false,
  'replaying the same event id is a harmless no-op'
);

set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$select public.record_discovery_event(
      _event_id => '00000000-0000-0000-0000-000000007602'::uuid,
      _schema_version => 1::smallint,
      _user_id => '00000000-0000-0000-0000-000000000701'::uuid,
      _client_session_id => 'recording-session',
      _tab_session_id => '00000000-0000-0000-0000-000000000721'::uuid,
      _client_sequence => 2::bigint,
      _event_type => 'search_cleared',
      _result_set_id => null::uuid,
      _logical_search_id => '00000000-0000-0000-0000-000000007202'::uuid,
      _item_position => null::integer,
      _visible_fraction => null::numeric,
      _visible_ms => null::integer,
      _client_occurred_at => now(),
      _metadata => '{}'::jsonb
    )$$,
  '42501',
  null,
  'untrusted clients cannot write analytics tables directly through the recorder'
);

select * from finish();
rollback;
