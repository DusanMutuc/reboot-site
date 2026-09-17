begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'workflow-admin@example.invalid', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, first_name, last_name) values ('00000000-0000-0000-0000-000000000911', 'Workflow', 'Fixture');
insert into public.user_roles(user_id, role_id) select '00000000-0000-0000-0000-000000000911', id from public.roles where code = 'admin';
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000911';

insert into public.tags(id, name, slug, tag_kind, browse_category) values
  (906001, 'Workflow fixture topic', 'workflow-fixture-topic', 'topic', 'hiring'),
  (906002, 'Workflow fixture second topic', 'workflow-fixture-second', 'topic', 'systems');
insert into public.resources(id, title, type, url, state, is_discoverable) values
  (906101, 'Workflow fixture resource', 'pdf', 'https://example.invalid/workflow', 'published', true),
  (906102, 'Workflow fixture standalone', 'podcast', 'https://example.invalid/workflow-standalone', 'published', true);
insert into public.content_nodes(id, node_type, title, slug, state, is_discoverable)
values (906201, 'lesson', 'Workflow fixture guide', 'workflow-fixture-guide', 'published', true);
insert into public.content_nodes(node_type, title, slug, state)
select 'collection', 'Library', 'library', 'published' where not exists(select 1 from public.content_nodes where slug = 'library');
insert into public.node_edge_rules(parent_type, child_kind, child_type) values ('collection', 'node', 'lesson') on conflict do nothing;
insert into public.node_children(parent_id, child_id, position)
select n.id, 906201, coalesce((select max(c.position) + 1 from public.node_children c where c.parent_id = n.id), 1)
from public.content_nodes n where n.slug = 'library';
insert into public.content_blocks(node_id, position, block_type, resource_id) values (906201, 1, 'asset', 906101);

select is((public.admin_discovery_catalogue(auth.uid(), 'resource', 'Workflow fixture', null, 'needs_review')->>'total')::int, 1,
  'only embedded, unreviewed resources enter the review queue');
select is(public.admin_update_discovery_items(auth.uid(), array[906101]::bigint[], '{}', array[906001,906002]::bigint[]), 1,
  'multiple topics can be assigned');
select ok((select discovery_reviewed_at is null from public.resources where id = 906101), 'tagging is not a review');
select ok((select not is_browsable from public.resources where id = 906101), 'tagging does not grant browse approval');
select is((public.admin_discovery_catalogue(auth.uid(), 'resource', 'Workflow fixture', null, 'no_category')->>'total')::int, 1,
  'categories come from the assigned topics');
select throws_ok($$select public.admin_update_discovery_items(auth.uid(), array[906101]::bigint[], '{}',
  array[(select id from public.tags where tag_kind = 'browse_category' and browse_category = 'hiring' limit 1)])$$,
  '22023', null, 'category roots are not assignable through the bulk RPC');
select throws_ok($$insert into public.resource_tags(resource_id, tag_id)
  select 906101, id from public.tags where tag_kind = 'browse_category' and browse_category = 'hiring' limit 1$$,
  '23514', null, 'direct database assignment also requires a topic');
select throws_ok($$insert into public.tags(name,slug,tag_kind,canonical_tag_id)
  select 'Workflow fixture invalid synonym','workflow-invalid-alias','alias',id from public.tags
  where tag_kind='browse_category' and browse_category='hiring' limit 1$$,
  '23514', null, 'synonyms cannot point at category sections');
select throws_ok($$select public.admin_save_discovery_tag(auth.uid(),
  (select id from public.tags where tag_kind='browse_category' and browse_category='hiring' limit 1),
  'Workflow attempted section rename','topic','hiring',null,true)$$,
  '22023', null, 'fixed sections cannot be renamed by disguising the kind');

-- Placement is now recorded through admin_record_discovery_decision, which writes the setting and
-- the decision in one transaction. discovery_reviewed_at is no longer the authority.
select ok((public.admin_record_discovery_decision(auth.uid(), 'resource', 906101, 'placement', 'context')->>'ok')::boolean,
  'keeping guide context records a completed decision');
select ok((select answer = 'context' and decided_by = auth.uid() from public.discovery_decisions
  where item_kind = 'resource' and item_id = 906101 and question = 'placement'),
  'the decision records its answer and actor');
select ok((select discovery_open_mode = 'context' from public.resources where id = 906101),
  'and the setting is applied in the same transaction');
select is((public.admin_discovery_catalogue(auth.uid(), 'resource', 'Workflow fixture', null, 'needs_review')->>'total')::int, 0,
  'reviewed context leaves the backlog');
select is((public.admin_discovery_catalogue(auth.uid(), 'resource', 'Workflow fixture', null, 'reviewed_context')->>'total')::int, 1,
  'completed context decisions remain inspectable');
select ok((public.admin_record_discovery_decision(auth.uid(), 'resource', 906101, 'placement', 'direct', null,
    (select token from public.discovery_decisions where item_kind='resource' and item_id=906101 and question='placement'))->>'ok')::boolean,
  'independent-use review succeeds');
select ok((select discovery_open_mode = 'direct' and not is_browsable
  from public.resources where id = 906101), 'independent approval does not grant homepage approval');
select is((public.admin_discovery_catalogue(auth.uid(), 'resource', 'Workflow fixture', null, 'reviewed_direct')->>'total')::int, 1,
  'independent decision is a completed review');
select is((select categories from public.search_discovery_catalogue(_q => 'Workflow fixture resource', _tag_ids => array[906001]::bigint[], _include_related => false)
  where resource_id = 906101), array['hiring','systems']::text[], 'search response inherits all active topic categories');
select is((select count(*) from public.search_discovery_catalogue(_q => 'Workflow fixture resource', _tag_ids => array[906001]::bigint[], _surface => 'browse')), 0::bigint,
  'direct search-only item stays out of browse');
select is(public.admin_update_discovery_items(_actor_id => auth.uid(), _resource_ids => array[906101]::bigint[], _visibility => 'browse'), 1,
  'homepage approval is a separate update');
select ok(exists(select 1 from public.search_discovery_catalogue(_browse_category => 'hiring', _tag_ids => array[906001]::bigint[], _surface => 'browse')
  where resource_id = 906101), 'approved item appears under its inherited category');
-- Reopening is now supersession: an edit to open mode made outside the job deletes the decision
-- rather than leaving a stale one behind.
update public.resources set discovery_open_mode = 'context' where id = 906101;
select ok(not exists(select 1 from public.discovery_decisions
  where item_kind='resource' and item_id=906101 and question='placement'),
  'an external open-mode edit supersedes the placement decision');
select ok((select discovery_open_mode='context' and is_browsable from public.resources where id=906101),
  'reopening restores safe context without erasing the separate browse decision');
select is((select count(*) from public.search_discovery_catalogue(_tag_ids => array[906001]::bigint[], _surface => 'browse')), 0::bigint,
  'contextual resource is withheld even with browse approval');

select is(public.admin_update_discovery_items(_actor_id => auth.uid(), _resource_ids => array[906102]::bigint[], _visibility => 'browse'), 1,
  'standalone item can be approved without a category');
select ok(exists(select 1 from public.search_discovery_catalogue(_q => 'Workflow fixture standalone', _surface => 'browse') where resource_id = 906102),
  'uncategorized approval appears in All');
select ok(not exists(select 1 from public.search_discovery_catalogue(_q => 'Workflow fixture standalone', _browse_category => 'hiring', _surface => 'browse') where resource_id = 906102),
  'uncategorized item does not appear under a category chip');
select throws_ok($$select public.admin_bulk_discovery_topics(auth.uid(),
    '[{"kind":"resource","id":906101},{"kind":"resource","id":999999999}]'::jsonb, array[906001]::bigint[])$$,
  '22023', null, 'invalid bulk selection cannot partially record decisions');
select ok(not exists(select 1 from public.discovery_decisions where item_kind='resource' and item_id=906101 and question='topics'),
  'invalid bulk request rolled back entirely');
select throws_ok($$select public.admin_record_discovery_decision(auth.uid(), 'node', 906201, 'placement', 'direct')$$,
  '22023', null, 'guide metadata cannot become an independent-resource review');
select ok(not has_table_privilege('authenticated','public.discovery_duplicate_dismissals','INSERT'), 'dismissals are writable only through the verified admin API');
select ok(not has_function_privilege('authenticated','public.admin_update_discovery_items(uuid,bigint[],bigint[],bigint[],text,text,text,text[])','EXECUTE'), 'catalogue mutations remain server-only');
select ok(not has_function_privilege('authenticated','public.admin_record_discovery_decision(uuid,text,bigint,text,text,bigint[],uuid,boolean)','EXECUTE'), 'decision writes remain server-only');
select ok(not has_table_privilege('authenticated','public.discovery_decisions','INSERT'), 'decisions are never written directly by a client');
select * from finish();
rollback;
