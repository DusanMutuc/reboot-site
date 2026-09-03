begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'search-golden@example.invalid',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (id, first_name, last_name)
values ('00000000-0000-0000-0000-000000000501', 'Search', 'Golden');

-- Support both an empty fixture database and the populated local clone.
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000501';
create temporary table search_golden_baseline as
select coalesce(max(eligible_candidate_count), 0)::bigint as candidate_count
from public.search_discovery_items(
  _user_id => '00000000-0000-0000-0000-000000000501', _q => '', _limit => 1
);

insert into public.tags (
  id, name, slug, tag_kind, browse_category, is_active
)
values
  (901001, 'Hiring systems', 'hiring-systems', 'topic', 'hiring', true),
  (901002, 'Recruitment process', 'recruitment-process', 'topic', 'hiring', true),
  (901003, 'Marketing operations', 'marketing-operations', 'topic', 'marketing', true);

insert into public.tags (
  id, name, slug, tag_kind, canonical_tag_id, is_active
)
values
  (901010, 'Talent acquisition', 'talent-acquisition', 'alias', 901002, true),
  (901011, 'People ops', 'people-ops', 'alias', 901001, true);

insert into public.resources (
  id, title, description, type, url, state, is_discoverable, catalog_priority, created_at
)
values
  (901101, 'Hiring systems', 'The exact guide to a reliable hiring system.', 'video', 'https://example.invalid/exact', 'published', true, 20, now() - interval '10 days'),
  (901102, 'Hiring systems for growing teams', 'A deeper operating playbook.', 'pdf', 'https://example.invalid/prefix', 'published', true, 10, now() - interval '9 days'),
  (901103, 'Build a repeatable interview loop', 'Recruit consistently as the team grows.', 'document', 'https://example.invalid/alias', 'published', true, 5, now() - interval '8 days'),
  (901104, 'Interview scorecard template', 'A practical hiring workflow for consistent interviews.', 'pdf', 'https://example.invalid/related', 'published', true, 0, now() - interval '7 days'),
  (901105, 'Hiring systems hidden', 'Published but deliberately not discoverable.', 'video', 'https://example.invalid/hidden', 'published', false, 100, now() - interval '6 days'),
  (901106, 'Hiring systems draft', 'Discoverable flag cannot publish a draft.', 'video', 'https://example.invalid/draft', 'draft', true, 100, now() - interval '5 days'),
  (901107, 'Marketing systems dashboard', 'A marketing operations control panel.', 'video', 'https://example.invalid/marketing', 'published', true, 0, now() - interval '4 days'),
  (901108, 'Hiring systems restricted course', 'This member cannot access its course.', 'video', 'https://example.invalid/restricted', 'published', true, 100, now() - interval '3 days'),
  (901109, 'Hiring operations checklist', 'Turn recruiting into a dependable system.', 'video', 'https://example.invalid/public-course', 'published', true, 3, now() - interval '2 days'),
  (901110, 'CourseContextNeedle handout', 'A context-only resource inside a course lesson.', 'pdf', 'https://example.invalid/course-context', 'published', true, 1, now() - interval '1 day');

insert into public.resource_tags (resource_id, tag_id)
-- This fixture is an explicitly reviewed standalone tool, regardless of media.
-- Context-preserving lesson behavior has its own regression suite.
values
  (901101, 901001),
  (901102, 901001),
  (901103, 901002),
  (901104, 901002),
  (901105, 901001),
  (901106, 901001),
  (901107, 901003),
  (901108, 901001),
  (901109, 901001),
  (901110, 901001);

update public.resources set discovery_open_mode = 'direct' where id = 901109;

insert into public.content_nodes (
  id, node_type, title, slug, state, visibility, is_discoverable, catalog_priority
)
values
  (901201, 'course', 'Restricted hiring course', 'restricted-hiring-course', 'published', 'limited', false, 0),
  (901203, 'chapter', 'Restricted hiring chapter', 'restricted-hiring-chapter', 'published', 'public', false, 0),
  (901202, 'lesson', 'Hiring systems restricted guide', 'restricted-hiring-guide', 'published', 'public', true, 100),
  (901211, 'course', 'Public hiring course', 'public-hiring-course', 'published', 'public', true, 0),
  (901213, 'chapter', 'Public hiring chapter', 'public-hiring-chapter', 'published', 'public', false, 0),
  (901212, 'lesson', 'Hiring systems field guide', 'hiring-systems-field-guide', 'published', 'public', true, 8);

insert into public.node_edge_rules (parent_type, child_kind, child_type)
values
  ('course', 'node', 'chapter'),
  ('chapter', 'node', 'lesson');

insert into public.node_children (parent_id, child_id, position, is_required)
values
  (901201, 901203, 1, true),
  (901203, 901202, 1, true),
  (901211, 901213, 1, true),
  (901213, 901212, 1, true);

insert into public.content_node_tags (node_id, tag_id)
values
  (901202, 901001),
  (901212, 901001),
  (901211, 901001);

insert into public.content_blocks (id, node_id, position, block_type, resource_id)
values
  (901301, 901202, 1, 'asset', 901108),
  (901302, 901212, 1, 'asset', 901109),
  (901303, 901212, 2, 'asset', 901110);

set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000501';

select is(
  (
    select resource_id
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'hiring systems',
      _limit => 50
    )
    limit 1
  ),
  901101::bigint,
  'an exact title is the first result'
);

select ok(
  exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'hiring systems',
      _limit => 50
    )
    where content_node_id = 901211
      and item_type = 'guide'
      and media_type = 'course'
      and ranking_tier = 'strict'
  ) and not exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'hiring systems',
      _limit => 50
    )
    where content_node_id = 901212
  ),
  'the whole course is searchable and its internal lesson is not a separate result'
);

select ok(
  exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'coursecontextneedle',
      _include_related => false,
      _limit => 50
    )
    where content_node_id = 901211
      and resource_id is null
      and media_type = 'course'
  ) and not exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'coursecontextneedle',
      _include_related => false,
      _limit => 50
    )
    where content_node_id = 901212
  ),
  'a context-only resource inside a course points to the whole course, never its internal lesson'
);

select ok(
  not exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'hiring systems',
      _limit => 50
    )
    where resource_id in (901105, 901106)
  ),
  'draft and explicitly non-discoverable resources are excluded'
);

select ok(
  not exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'hiring systems',
      _limit => 50
    )
    where resource_id = 901108 or content_node_id = 901202
  ),
  'resources and guides inside an inaccessible course do not leak'
);

select ok(
  exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'hiring systems',
      _limit => 50
    )
    where resource_id = 901109
  ),
  'a resource inside a public course remains searchable'
);

select ok(
  exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'talent acquisition',
      _limit => 50
    )
    where resource_id = 901103
      and ranking_tier = 'strict'
  ),
  'hidden aliases expand search vocabulary without direct assignment'
);

select ok(
  not exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'talent acquisition',
      _limit => 50
    ) result
    cross join lateral jsonb_array_elements(result.tags) visible_tag
    where visible_tag ->> 'name' = 'Talent acquisition'
  ),
  'aliases remain hidden from member-facing tag data'
);

select is(
  (
    with ordered as (
      select ranking_tier, row_number() over () as ordinal
      from public.search_discovery_items(
        _user_id => '00000000-0000-0000-0000-000000000501',
        _q => 'hiring systems',
        _limit => 50
      )
    )
    select max(ordinal) filter (where ranking_tier = 'strict')
      < min(ordinal) filter (where ranking_tier = 'related')
    from ordered
  ),
  true,
  'every strict match is ordered before the related pass'
);

select ok(
  exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'hiring systems',
      _limit => 50
    )
    where resource_id = 901104
      and ranking_tier = 'related'
  ),
  'a partial topical match is labelled related instead of silently mixed in'
);

select ok(
  not exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'hiring systems',
      _limit => 50,
      _include_related => false
    )
    where ranking_tier = 'related'
  ),
  'the related pass can be disabled without changing strict results'
);

select ok(
  not exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => '',
      _browse_category => 'hiring',
      _limit => 50
    )
    where not ('hiring' = any(categories))
  ),
  'the hiring chip returns only items assigned to the hiring taxonomy'
);

select ok(
  exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => '',
      _browse_category => 'marketing',
      _limit => 50
    )
    where resource_id = 901107
  ),
  'the marketing chip resolves through canonical browse-category metadata'
);

select ok(
  not exists (
    select 1
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'hiring systems',
      _types => array['video']::text[],
      _limit => 50
    )
    where media_type <> 'video' or item_type = 'guide'
  ),
  'media filters do not accidentally mix guides into resource-only results'
);

select is(
  (
    select max(eligible_candidate_count)
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => '',
      _limit => 50
    )
  ),
  (select candidate_count + 7 from search_golden_baseline),
  'eligible candidate count excludes unpublished, non-discoverable, and inaccessible items'
);

select is(
  (
    select max(total_match_count)
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'hiring systems',
      _limit => 50
    )
  ),
  (
    select count(*)
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'hiring systems',
      _limit => 50
    )
  ),
  'total match count describes all available matches across pages'
);

select is(
  (
    with first_page as (
      select coalesce(resource_id, content_node_id) as item_id
      from public.search_discovery_items(
        _user_id => '00000000-0000-0000-0000-000000000501',
        _q => 'hiring systems',
        _limit => 2,
        _offset => 0
      )
    ),
    second_page as (
      select coalesce(resource_id, content_node_id) as item_id
      from public.search_discovery_items(
        _user_id => '00000000-0000-0000-0000-000000000501',
        _q => 'hiring systems',
        _limit => 2,
        _offset => 2
      )
    )
    select count(*) from first_page join second_page using (item_id)
  ),
  0::bigint,
  'stable ordering prevents duplicates across adjacent pages'
);

select is(
  (
    select count(*)
    from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'definitely absent phrase',
      _include_related => false,
      _limit => 50
    )
  ),
  0::bigint,
  'a query with no strict match returns an empty result set'
);

select lives_ok(
  $$select * from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _q => 'owner''s hiring manual',
      _limit => 10
    )$$,
  'punctuation and apostrophes are parsed safely'
);

select throws_ok(
  $$select * from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000501',
      _browse_category => 'finance'
    )$$,
  '22023',
  null,
  'unknown category filters fail closed'
);

set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000501';

select throws_ok(
  $$select * from public.search_discovery_items(
      _user_id => '00000000-0000-0000-0000-000000000599',
      _q => 'hiring'
    )$$,
  '42501',
  null,
  'an authenticated member cannot search another member''s access context'
);

select * from finish();
rollback;
