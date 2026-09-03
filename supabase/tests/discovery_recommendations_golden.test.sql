begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'recommendation-golden@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000602',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'recommendation-empty@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.profiles (id, first_name, last_name)
values
  ('00000000-0000-0000-0000-000000000601', 'Recommendation', 'Golden'),
  ('00000000-0000-0000-0000-000000000602', 'No', 'Priorities');

insert into public.focus_finder_templates (key, name, version, is_active)
values ('recommendation_focus_v1', 'Recommendation fixture focus', 1, true);

insert into public.system_scorecard_templates (key, audience, name, version, is_active)
values (
  'recommendation_scorecard_v1', 'foundation', 'Recommendation fixture scorecard',
  coalesce((select max(version) from public.system_scorecard_templates where audience = 'foundation'), 0) + 1,
  false
);

insert into public.system_scorecard_categories (id, template_key, key, label, position)
values (902001, 'recommendation_scorecard_v1', 'systems', 'Systems', 1);

insert into public.tags (id, name, slug, tag_kind, browse_category, is_active)
values
  (902001, 'Database management', 'database-management', 'topic', 'systems', true),
  (902002, 'Leadership mindset', 'leadership-mindset', 'topic', 'mindset', true);

insert into public.content_nodes (
  id, node_type, title, slug, state, is_discoverable, catalog_priority
)
values
  (902011, 'lesson', 'Database management assigned guide', 'database-management-assigned', 'published', true, 10),
  (902012, 'lesson', 'Leadership mindset assigned guide', 'leadership-mindset-assigned', 'published', true, 10);

insert into public.content_node_tags (node_id, tag_id)
values
  (902011, 902001),
  (902012, 902002);

insert into public.system_scorecard_systems (
  id, template_key, category_id, key, label, position, library_item_id
)
values
  (902021, 'recommendation_scorecard_v1', 902001, 'database_management', 'Database management', 1, 902011),
  (902022, 'recommendation_scorecard_v1', 902001, 'data_hygiene', 'Data hygiene', 2, 902011),
  (902023, 'recommendation_scorecard_v1', 902001, 'leadership_mindset', 'Leadership mindset', 3, 902012);

insert into public.coaching_notes_base (id, user_id)
values (902031, '00000000-0000-0000-0000-000000000601');

insert into public.business_reviews (
  id, user_id, coaching_note_id, focus_finder_template_key, review_date,
  status, system_scorecard_template_key
)
values (
  902041,
  '00000000-0000-0000-0000-000000000601',
  902031,
  'recommendation_focus_v1',
  current_date - 1,
  'draft',
  'recommendation_scorecard_v1'
);

insert into public.coaching_note_action_steps (
  id, coaching_note_id, label, library_item_id, status
)
values
  (902051, 902031, 'Database management', 902011, 'not_started'),
  (902052, 902031, 'Data hygiene', 902011, 'in_progress'),
  (902053, 902031, 'Leadership mindset', 902012, 'complete');

insert into public.business_review_system_ratings (
  business_review_id, template_key, system_id, status
)
values
  (902041, 'recommendation_scorecard_v1', 902021, 'not_started'),
  (902041, 'recommendation_scorecard_v1', 902022, 'started'),
  (902041, 'recommendation_scorecard_v1', 902023, 'complete');

insert into public.business_review_system_priorities (
  business_review_id, system_id, position, action_step_id, starting_status
)
values
  (902041, 902021, 1, 902051, 'not_started'),
  (902041, 902022, 2, 902052, 'started'),
  (902041, 902023, 3, 902053, 'complete');

insert into public.resources (
  id, title, description, type, url, state, is_discoverable, catalog_priority, created_at
)
values
  (902101, 'The assigned database walkthrough', 'Already attached to the priority guide.', 'video', 'https://example.invalid/assigned', 'published', true, 50, now()),
  (902102, 'Clean database foundations', 'Build a reliable source of truth.', 'video', 'https://example.invalid/database-video', 'published', true, 10, now() - interval '1 minute'),
  (902103, 'Database audit checklist', 'Review the health of the system.', 'pdf', 'https://example.invalid/database-pdf', 'published', true, 9, now() - interval '2 minutes'),
  (902104, 'Contact data SOP', 'A repeatable operating process.', 'document', 'https://example.invalid/database-document', 'published', true, 8, now() - interval '3 minutes'),
  (902105, 'Data quality conversation', 'A practical discussion about reliable records.', 'podcast', 'https://example.invalid/database-podcast', 'published', true, 7, now() - interval '4 minutes'),
  (902106, 'Database cleanup briefing', 'A short audio briefing.', 'audio', 'https://example.invalid/database-audio', 'published', true, 6, now() - interval '5 minutes'),
  (902107, 'Database management', 'A strict label fallback with no guide topic tag.', 'image', 'https://example.invalid/database-label', 'published', true, 5, now() - interval '6 minutes'),
  (902108, 'Unrelated marketing calendar', 'No current priority relationship.', 'video', 'https://example.invalid/unrelated', 'published', true, 100, now() - interval '7 minutes'),
  (902109, 'Leadership reflection prompts', 'Only the completed priority points here.', 'pdf', 'https://example.invalid/completed-priority', 'published', true, 100, now() - interval '8 minutes'),
  (902110, 'Database field notes', 'Explicitly finished by this member.', 'link', 'https://example.invalid/finished', 'published', true, 100, now() - interval '9 minutes');

-- Explicit browse approval is part of the fixture, not a publication default.
update public.resources set is_browsable = true where id between 902101 and 902110;

-- More than the recommender's per-signal cap of high-ranked search-only tools
-- must not starve the eligible supplementary pool.
insert into public.resources (id, title, description, type, url, state, is_discoverable, catalog_priority)
select 902300 + series, 'Database management', 'Search-only contract fixture', 'pdf',
  'https://example.invalid/search-only-' || series, 'published', true, 100
from generate_series(1, 105) series;
insert into public.resource_tags (resource_id, tag_id)
select 902300 + series, 902001 from generate_series(1, 105) series;

insert into public.resource_tags (resource_id, tag_id)
values
  (902101, 902001),
  (902102, 902001),
  (902103, 902001),
  (902104, 902001),
  (902105, 902001),
  (902106, 902001),
  (902109, 902002),
  (902110, 902001);

insert into public.content_blocks (id, node_id, position, block_type, resource_id)
values (902201, 902011, 1, 'asset', 902101);

insert into public.user_resource_discovery_preferences (user_id, resource_id, preference)
values ('00000000-0000-0000-0000-000000000601', 902110, 'finished');

set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000601';

select ok(not exists (
  select 1 from public.recommend_discovery_resources('00000000-0000-0000-0000-000000000601', 24)
  where resource_id between 902301 and 902405
), 'search-only tools never enter recommendations, even with exact priority titles and topics');
select is((select count(*) from public.recommend_discovery_resources('00000000-0000-0000-0000-000000000601', 1)),
  1::bigint, 'browse eligibility is applied before candidate capping and the final limit');

select is(
  (
    select max(eligible_candidate_count)
    from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000601',
      8
    )
  ),
  6::bigint,
  'the recommendation pool contains only valid supplemental candidates'
);

select ok(
  not exists (
    select 1
    from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000601',
      8
    )
    where resource_id = 902101
  ),
  'a resource already embedded in the assigned guide is excluded'
);

select ok(
  not exists (
    select 1
    from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000601',
      8
    )
    where resource_id = 902110
  ),
  'explicit finished feedback suppresses that resource'
);

select ok(
  not exists (
    select 1
    from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000601',
      8
    )
    where resource_id = 902109
  ),
  'a completed scorecard priority is not treated as a current goal'
);

select is(
  (
    select reason_code
    from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000601',
      8
    )
    where resource_id = 902102
  ),
  'canonical_topic_overlap',
  'direct canonical guide-topic overlap is the strongest signal'
);

select is(
  (
    select matched_priority_count
    from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000601',
      8
    )
    where resource_id = 902102
  ),
  2,
  'one resource can relate to multiple current priorities internally'
);

select is(
  (
    select matched_priority_labels
    from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000601',
      8
    )
    where resource_id = 902102
  ),
  array['Data hygiene', 'Database management']::text[],
  'priority relationships are retained as internal evidence for later evaluation'
);

select is(
  (
    select reason_code
    from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000601',
      8
    )
    where resource_id = 902107
  ),
  'strict_priority_label',
  'strict priority-label search supplements missing guide topics'
);

select is(
  (
    with first_four as (
      select media_type
      from public.recommend_discovery_resources(
        '00000000-0000-0000-0000-000000000601',
        4
      )
    )
    select count(distinct media_type) from first_four
  ),
  4::bigint,
  'the stable recommendation order gives the first row format diversity'
);

create temporary table recommendation_snapshot on commit drop as
select array_agg(resource_id order by ordinal) as resource_ids
from (
  select resource_id, row_number() over () as ordinal
  from public.recommend_discovery_resources(
    '00000000-0000-0000-0000-000000000601',
    4
  )
) ordered;

insert into public.discovery_result_sets (
  id, user_id, context, surface, result_version, page_size, status,
  eligible_candidate_count, total_match_count, returned_count
)
values (
  '00000000-0000-0000-0000-000000006301',
  '00000000-0000-0000-0000-000000000601',
  'recommendation',
  'home',
  'recommendation-v1',
  4,
  'generated',
  6,
  6,
  4
);

insert into public.discovery_result_set_items (
  result_set_id, position, item_type, item_key, resource_id, ranking_tier, reason_code
)
select
  '00000000-0000-0000-0000-000000006301',
  row_number() over ()::integer,
  'resource',
  'ignored',
  recommendation.resource_id,
  'recommendation',
  recommendation.reason_code
from public.recommend_discovery_resources(
  '00000000-0000-0000-0000-000000000601',
  4
) recommendation;

insert into public.discovery_events (
  event_id, user_id, client_session_id, tab_session_id, client_sequence,
  event_type, result_set_id, item_position, visible_fraction, visible_ms,
  client_occurred_at, metadata
)
values
  (
    '00000000-0000-0000-0000-000000006401',
    '00000000-0000-0000-0000-000000000601',
    'recommendation-session',
    '00000000-0000-0000-0000-000000000621',
    1,
    'result_set_shown',
    '00000000-0000-0000-0000-000000006301',
    null,
    null,
    null,
    now(),
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000006402',
    '00000000-0000-0000-0000-000000000601',
    'recommendation-session',
    '00000000-0000-0000-0000-000000000621',
    2,
    'item_impression',
    '00000000-0000-0000-0000-000000006301',
    1,
    0.1,
    0,
    now(),
    '{"fast_click":true}'::jsonb
  );

insert into public.discovery_events (
  event_id, user_id, client_session_id, tab_session_id, client_sequence,
  event_type, result_set_id, item_position, client_occurred_at
)
values (
  '00000000-0000-0000-0000-000000006403',
  '00000000-0000-0000-0000-000000000601',
  'recommendation-session',
  '00000000-0000-0000-0000-000000000621',
  3,
  'item_open',
  '00000000-0000-0000-0000-000000006301',
  1,
  now()
);

select is(
  (
    select array_agg(resource_id order by ordinal)
    from (
      select resource_id, row_number() over () as ordinal
      from public.recommend_discovery_resources(
        '00000000-0000-0000-0000-000000000601',
        4
      )
    ) after_open
  ),
  (select resource_ids from recommendation_snapshot),
  'opening a recommendation does not change its ranking or suppress it'
);

insert into public.user_resource_discovery_preferences (user_id, resource_id, preference)
values ('00000000-0000-0000-0000-000000000601', 902102, 'not_interested');

select ok(
  not exists (
    select 1
    from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000601',
      8
    )
    where resource_id = 902102
  ),
  'explicit not-interested feedback suppresses that recommendation'
);

select is(
  (
    select count(*)
    from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000601',
      4
    )
  ),
  4::bigint,
  'a suppressed card is replaced when another valid candidate exists'
);

select is(
  (
    select count(*)
    from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000602',
      8
    )
  ),
  0::bigint,
  'members without current scorecard priorities receive no fabricated For You set'
);

select ok(
  not exists (
    select 1
    from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000601',
      8
    )
    where resource_id = 902108
  ),
  'high catalogue priority cannot manufacture a relationship to an unrelated resource'
);

set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000601';

select throws_ok(
  $$select * from public.recommend_discovery_resources(
      '00000000-0000-0000-0000-000000000602',
      8
    )$$,
  '42501',
  null,
  'an authenticated member cannot request another member''s recommendations'
);

select * from finish();
rollback;
