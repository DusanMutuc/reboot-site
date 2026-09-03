begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(27);

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'context-fixture@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'context-owner@example.invalid', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, first_name, last_name)
values ('00000000-0000-0000-0000-000000000801', 'Context', 'Fixture'),
  ('00000000-0000-0000-0000-000000000802', 'Context', 'Owner');
insert into public.tags(id, name, slug, tag_kind)
values (904001, 'Context fixture vocabulary', 'context-fixture-vocabulary', 'topic');
insert into public.content_nodes(node_type, title, slug, state)
select 'collection', 'Library', 'library', 'published'
where not exists (select 1 from public.content_nodes where slug = 'library');
insert into public.content_nodes(id, node_type, title, slug, state, visibility, is_discoverable, owner_id)
values
  (904190, 'lesson', 'Context unlisted placement', 'context-unlisted-guide', 'published', 'public', false, null),
  (904201, 'lesson', 'Context fixture guide', 'context-fixture-guide', 'published', 'public', true, null),
  (904202, 'chapter', 'Context fixture chapter', 'context-fixture-chapter', 'published', 'public', false, null),
  (904210, 'course', 'SECRET restricted parent title', 'context-restricted-course', 'published', 'limited', false, null),
  (904211, 'lesson', 'SECRET restricted lesson', 'context-restricted-lesson', 'published', 'public', true, null),
  (904220, 'lesson', 'Context orphan', 'context-orphan', 'published', 'public', true, null),
  (904230, 'lesson', 'Context draft parent', 'context-draft-parent', 'draft', 'public', true, null),
  (904231, 'chapter', 'Context published child', 'context-published-child', 'published', 'public', true, null),
  (904240, 'lesson', 'SECRET private guide', 'context-private-guide', 'published', 'public', true,
    '00000000-0000-0000-0000-000000000802');
insert into public.node_edge_rules(parent_type, child_kind, child_type)
values ('collection', 'node', 'lesson'), ('lesson', 'node', 'chapter'), ('course', 'node', 'lesson') on conflict do nothing;
insert into public.node_children(parent_id, child_id, position)
select n.id, v.id, coalesce((select max(c.position) from public.node_children c where c.parent_id = n.id), 0) + v.pos
from public.content_nodes n cross join (values (904201, 1), (904230, 2), (904240, 3), (904190, 4)) v(id, pos)
where n.slug = 'library';
insert into public.node_children(parent_id, child_id, position)
values (904201, 904202, 1), (904210, 904211, 1), (904230, 904231, 1);
insert into public.resources(id, title, type, url, state, is_discoverable, is_browsable, discovery_open_mode)
values
  (904101, 'Context fixture contract', 'pdf', 'https://example.invalid/context-contract', 'published', true, false, 'direct'),
  (904102, 'Context fixture lesson needle', 'video', 'https://example.invalid/context-video', 'published', true, true, 'context'),
  (904103, 'Context fixture shared tool', 'document', 'https://example.invalid/context-shared', 'published', true, true, 'direct'),
  (904104, 'Context fixture orphan tool', 'pdf', 'https://example.invalid/context-orphan', 'published', true, false, 'direct'),
  (904105, 'Context fixture replay', 'podcast', 'https://example.invalid/context-replay', 'published', true, true, 'context'),
  (904106, 'Context fixture private tool', 'pdf', 'https://example.invalid/context-private', 'published', true, false, 'direct'),
  (904107, 'Context fixture draft-parent tool', 'pdf', 'https://example.invalid/context-draft-parent', 'published', true, false, 'direct'),
  (904108, 'Context fixture hidden tool', 'pdf', 'https://example.invalid/context-hidden', 'published', false, false, 'direct'),
  (904109, 'Context fixture draft tool', 'pdf', 'https://example.invalid/context-draft', 'draft', true, false, 'direct'),
  (904110, 'Context fixture restricted tool', 'pdf', 'https://example.invalid/context-restricted', 'published', true, false, 'direct');
insert into public.content_blocks(node_id, position, block_type, resource_id)
values (904202, 1, 'asset', 904101), (904202, 2, 'asset', 904102), (904202, 3, 'asset', 904103),
  (904190, 1, 'asset', 904102),
  (904211, 1, 'asset', 904103), (904220, 1, 'asset', 904104), (904240, 1, 'asset', 904106),
  (904231, 1, 'asset', 904107), (904201, 1, 'asset', 904108), (904201, 2, 'asset', 904109),
  (904211, 2, 'asset', 904110);
insert into public.resource_tags(resource_id, tag_id) select id, 904001 from public.resources where id between 904101 and 904110;
insert into public.content_node_tags(node_id, tag_id) values (904201, 904001), (904211, 904001), (904220, 904001), (904240, 904001);
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000801';

create temp table context_results as select * from public.search_discovery_catalogue(_tag_ids => array[904001]::bigint[]);
select is((select count(*) from context_results), 4::bigint, 'unique learning destinations, direct tools, and standalone replay');
select is((select count(*) from context_results where content_node_id = 904201), 1::bigint, 'guide and its embedded lesson are deduplicated');
select is((select open_path from context_results where resource_id = 904101), '/r/904101', 'approved tool primary action uses guarded direct open');
select is((select container_title from context_results where resource_id = 904101), 'Context fixture guide', 'tool labels its guide, not its nearest chapter');
select is((select container_path from context_results where resource_id = 904101), '/library/context-fixture-guide', 'separate guide destination');
select is((select container_title from context_results where resource_id = 904103), 'Context fixture guide', 'multiple placements choose accessible context');
select ok(not exists(select 1 from context_results where container_title like '%SECRET%'), 'restricted parent titles never leak into results');
select is((select max(total_match_count) from context_results), 4::bigint, 'match count is deduplicated before pagination');
select is((select max(eligible_candidate_count) from context_results), 4::bigint, 'candidate count is unique accessible presentation units');
select is((select content_node_id from public.search_discovery_catalogue(_q => 'needle', _tag_ids => array[904001]::bigint[], _include_related => false)),
  904201::bigint, 'embedded lesson match retrieves its learning experience');
select ok(not exists(select 1 from context_results where resource_id = 904102), 'unreviewed embedded video is not a separate result');
select results_eq($$select resource_id from public.search_discovery_catalogue(_tag_ids => array[904001]::bigint[], _surface => 'browse') order by resource_id$$,
  $$values (904103::bigint), (904105::bigint)$$, 'browse never turns contextual lessons into extracted video cards');
select is((select count(*) from public.search_discovery_catalogue(_tag_ids => array[904001]::bigint[], _limit => 2, _offset => 2)),
  2::bigint, 'second page is filled after deduplication');
select ok(public.can_access_discovery_resource(auth.uid(), 904108), 'discovery-hidden resource remains available inside an allowed guide');
select ok(not public.can_access_discovery_resource(auth.uid(), 904109), 'draft resource cannot be opened');
select ok(not public.can_access_discovery_resource(auth.uid(), 904110), 'restricted course direct open is denied');
select ok(not public.can_access_discovery_resource(auth.uid(), 904107), 'published child under draft parent cannot be opened');
select ok(not public.can_access_discovery_resource(auth.uid(), 904106), 'another member private guide cannot grant direct access');
select ok(public.can_access_discovery_resource(auth.uid(), 904103), 'accessible second placement grants access');
select ok(not public.can_access_discovery_resource(auth.uid(), 904104), 'orphaned learning component has no member destination');

set local request.jwt.claim.role = 'authenticated';
select ok(not public.can_access_discovery_resource('00000000-0000-0000-0000-000000000802', 904106), 'members cannot impersonate resource owners');
select throws_ok($$select * from public.accessible_discovery_nodes('00000000-0000-0000-0000-000000000802')$$,
  '42501', 'Cannot inspect another member access', 'node inventory prevents impersonation');
set local role authenticated;
select is((select count(*) from public.resources where id = 904110), 0::bigint, 'resource REST/RLS cannot bypass course access');
select is((select count(*) from public.content_nodes where id in (904211, 904231, 904240)), 0::bigint, 'node RLS hides restricted, draft-ancestor and private metadata');
select is((select count(*) from public.resource_block_locations where resource_id = 904103), 1::bigint, 'placement view cannot leak the other restricted parent');
select is((select count(*) from public.resources where id = 904108), 1::bigint, 'RLS does not confuse discovery eligibility with learning access');
reset role;
select ok(not has_function_privilege('authenticated', 'public.discovery_node_paths(uuid)', 'execute'), 'internal path inventory is not directly callable');
select * from finish();
rollback;
