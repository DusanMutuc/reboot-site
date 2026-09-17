begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'discovery-surfaces@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.profiles (id, first_name, last_name)
values ('00000000-0000-0000-0000-000000000701', 'Discovery', 'Surfaces');

insert into public.tags (id, name, slug, tag_kind, browse_category)
values (903001, 'Discovery surface fixture', 'discovery-surface-fixture', 'topic', 'systems');

insert into public.resources (
  id, title, type, url, state, is_discoverable, is_browsable, catalog_priority
) values
  (903101, 'Surface fixture approved replay', 'podcast', 'https://example.invalid/replay', 'published', true, true, 0),
  (903102, 'Surface fixture contract', 'pdf', 'https://example.invalid/contract', 'published', true, false, 100),
  (903103, 'Surface fixture hidden', 'video', 'https://example.invalid/hidden', 'published', false, false, 100),
  (903104, 'Surface fixture draft', 'podcast', 'https://example.invalid/draft', 'draft', true, true, 100),
  (903105, 'Surface fixture archived', 'podcast', 'https://example.invalid/archived', 'archived', true, true, 100),
  (903106, 'Surface fixture second replay', 'video', 'https://example.invalid/replay-2', 'published', true, true, -10),
  (903107, 'Surface fixture restricted replay', 'podcast', 'https://example.invalid/restricted', 'published', true, true, 100);

insert into public.content_nodes (id, node_type, title, slug, state, visibility, is_discoverable)
values
  (903201, 'lesson', 'Surface fixture guide', 'surface-fixture-guide', 'published', 'public', true),
  (903202, 'course', 'Surface fixture restricted course', 'surface-fixture-restricted', 'published', 'limited', false),
  (903203, 'lesson', 'Surface fixture restricted lesson', 'surface-fixture-restricted-lesson', 'published', 'public', true);
insert into public.node_edge_rules (parent_type, child_kind, child_type)
values ('course', 'node', 'lesson') on conflict do nothing;
insert into public.content_nodes (node_type, title, slug, state)
select 'collection', 'Library', 'library', 'published'
where not exists (select 1 from public.content_nodes where slug = 'library');
insert into public.node_edge_rules (parent_type, child_kind, child_type)
values ('collection', 'node', 'lesson') on conflict do nothing;
insert into public.node_children(parent_id, child_id, position)
select n.id, 903201, coalesce((select max(c.position) + 1 from public.node_children c where c.parent_id = n.id), 1)
from public.content_nodes n where n.slug = 'library';
update public.resources set discovery_open_mode = 'direct' where id = 903102;
insert into public.node_children (parent_id, child_id, position, is_required)
values (903202, 903203, 1, true);
insert into public.content_blocks (id, node_id, position, block_type, resource_id)
values (903301, 903203, 1, 'asset', 903107), (903302, 903201, 1, 'asset', 903102);
insert into public.resource_tags (resource_id, tag_id)
select id, 903001 from public.resources where id between 903101 and 903107;
insert into public.content_node_tags (node_id, tag_id)
values (903201, 903001), (903203, 903001);

set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000701';

create temporary table surface_search as
select * from public.search_discovery_items(
  _user_id => '00000000-0000-0000-0000-000000000701', _tag_ids => array[903001]::bigint[]
);
create temporary table surface_browse as
select * from public.search_discovery_items_for_surface(
  _user_id => '00000000-0000-0000-0000-000000000701', _tag_ids => array[903001]::bigint[],
  _surface => 'browse'
);

select is((select count(*) from surface_search), 4::bigint, 'search includes approved replays, a search-only tool and a guide');
select ok(exists(select 1 from surface_search where resource_id = 903102), 'an embedded search-only tool is retrievable');
select ok(exists(select 1 from surface_search where content_node_id = 903201), 'guides remain searchable');
select results_eq('select resource_id from surface_browse order by resource_id',
  'values (903101::bigint), (903106::bigint)', 'browse contains only approved accessible resources');
select ok(not exists(select 1 from surface_browse where item_type = 'guide'), 'guides never enter browse');
select is((select max(eligible_candidate_count) from surface_browse), 2::bigint, 'browse candidate count follows eligibility');
select is((select max(total_match_count) from surface_browse), 2::bigint, 'browse match count follows eligibility');
select is((select resource_id from public.search_discovery_items_for_surface(
  _user_id => '00000000-0000-0000-0000-000000000701', _tag_ids => array[903001]::bigint[],
  _surface => 'browse', _limit => 1
)), 903101::bigint, 'high-priority search-only or inaccessible candidates cannot consume a browse slot');
select is((select resource_id from public.search_discovery_items_for_surface(
  _user_id => '00000000-0000-0000-0000-000000000701', _tag_ids => array[903001]::bigint[],
  _surface => 'browse', _limit => 1, _offset => 1
)), 903106::bigint, 'pagination applies to the eligible browse pool');
select is((select count(*) from public.search_discovery_items_for_surface(
  _user_id => '00000000-0000-0000-0000-000000000701', _tag_ids => array[903001]::bigint[],
  _surface => 'browse', _types => array['guide']
)), 0::bigint, 'a guide format filter cannot override the browse boundary');
select throws_ok($$select * from public.search_discovery_items_for_surface(
  _user_id => '00000000-0000-0000-0000-000000000701', _surface => 'invalid'
)$$, '22023', 'Unknown discovery surface invalid', 'unknown surfaces fail explicitly');
select throws_ok($$update public.resources set is_discoverable = false where id = 903101$$,
  '23514', null, 'browse cannot be enabled without search eligibility');

insert into public.resources (id, title, type, url, state, is_discoverable)
values (903108, 'Surface fixture new publication', 'podcast', 'https://example.invalid/new-publication', 'published', true);
select is((select is_browsable from public.resources where id = 903108), false, 'new published resources do not auto-enter browse');

update public.resources set is_browsable = false where id = 903101;
select ok(exists(select 1 from public.search_discovery_items(_tag_ids => array[903001]::bigint[]) where resource_id = 903101),
  'removing browse approval preserves search');
select ok(not exists(select 1 from public.search_discovery_items_for_surface(_tag_ids => array[903001]::bigint[], _surface => 'browse') where resource_id = 903101),
  'removing browse approval removes the card immediately');

set local request.jwt.claim.role = 'authenticated';
select throws_ok($$select * from public.search_discovery_items_for_surface(
  _user_id => '00000000-0000-0000-0000-000000000702', _surface => 'browse'
)$$, '42501', 'A member can only search their own accessible catalogue', 'members cannot browse as a different user');
set local request.jwt.claim.sub = '';
select throws_ok($$select * from public.search_discovery_items_for_surface(_surface => 'browse')$$,
  '42501', 'Authentication required', 'anonymous browse is denied');
select ok(not has_function_privilege('anon', 'public.search_discovery_items_for_surface(uuid,text,text,text[],bigint[],text,text,text,integer,integer,boolean,text)', 'execute'),
  'anonymous callers cannot execute the new entry point');

select * from finish();
rollback;
