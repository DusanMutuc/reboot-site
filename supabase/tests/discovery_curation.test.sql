begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'curation-admin@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'curation-member@example.invalid', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, first_name, last_name)
values ('00000000-0000-0000-0000-000000000901', 'Curation', 'Admin'), ('00000000-0000-0000-0000-000000000902', 'Curation', 'Member');
insert into public.roles(code) select 'admin' where not exists(select 1 from public.roles where code = 'admin');
insert into public.user_roles(user_id, role_id) select '00000000-0000-0000-0000-000000000901', id from public.roles where code = 'admin';
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000901';

insert into public.tags(id, name, slug, tag_kind, browse_category)
values (905001, 'Curation original concept', 'curation-original', 'topic', 'systems'),
  (905002, 'Curation retained concept', 'curation-retained', 'topic', 'systems'),
  (905003, 'Curation different category', 'curation-category', 'topic', 'hiring');
insert into public.tags(id, name, slug, tag_kind, canonical_tag_id)
values (905010, 'Curation precursor synonym', 'curation-synonym', 'alias', 905001);
insert into public.resources(id, title, type, url, state, is_discoverable)
values (905101, 'Curation fixture one', 'podcast', 'https://example.invalid/curation-one', 'published', true),
  (905102, 'Curation fixture two', 'podcast', 'https://example.invalid/curation-two', 'published', true),
  (905103, 'Curation fixture three', 'pdf', 'https://example.invalid/curation-three', 'published', false);
insert into public.content_nodes(node_type, title, slug, state)
select 'collection', 'Library', 'library', 'published' where not exists(select 1 from public.content_nodes where slug = 'library');
insert into public.content_nodes(id, node_type, title, slug, state, is_discoverable)
values (905201, 'lesson', 'Curation fixture guide', 'curation-fixture-guide', 'published', true);
insert into public.node_edge_rules(parent_type, child_kind, child_type)
values ('collection', 'node', 'lesson') on conflict do nothing;
insert into public.node_children(parent_id, child_id, position)
select n.id, 905201, coalesce((select max(c.position) + 1 from public.node_children c where c.parent_id = n.id), 1)
from public.content_nodes n where n.slug = 'library';
insert into public.resource_tags(resource_id, tag_id) values (905101, 905001), (905101, 905002), (905102, 905001);
insert into public.content_node_tags(node_id, tag_id) values (905201, 905001), (905201, 905002);

select throws_ok($$select public.admin_update_discovery_items('00000000-0000-0000-0000-000000000902', array[905101]::bigint[])$$,
  '42501', 'Discovery administration requires an authorized editor', 'member cannot mutate even through a service call');
select throws_ok($$update public.tags set canonical_tag_id = 905010 where id = 905010$$, '23514', null, 'self-alias is rejected');
select throws_ok($$insert into public.tags(name, slug, tag_kind, canonical_tag_id) values ('Curation chained synonym', 'chain', 'alias', 905010)$$,
  '23514', null, 'alias chains are rejected');
select throws_ok($$update public.tags set tag_kind = 'alias', canonical_tag_id = 905002 where id = 905001$$,
  '23514', null, 'flipping kind cannot strand existing assignments and aliases');
select throws_ok($$select public.admin_merge_discovery_tags(auth.uid(), 905001, 905003)$$, '22023', null, 'cross-category merge is explicit, not a silent behavior change');
select lives_ok($$select public.admin_merge_discovery_tags(auth.uid(), 905001, 905002)$$, 'compatible canonical merge succeeds atomically');
select is((select count(*) from public.resource_tags where resource_id = 905101 and tag_id = 905002), 1::bigint, 'resource assignments deduplicate');
select is((select count(*) from public.content_node_tags where node_id = 905201 and tag_id = 905002), 1::bigint, 'guide assignments deduplicate');
select is((select count(*) from public.resource_tags where tag_id = 905001), 0::bigint, 'no resource links remain on the alias');
select is((select count(*) from public.content_node_tags where tag_id = 905001), 0::bigint, 'no guide links remain on the alias');
select is((select canonical_tag_id from public.tags where id = 905010), 905002::bigint, 'preexisting synonyms retarget');
select is((select canonical_tag_id from public.tags where id = 905001 and tag_kind = 'alias'), 905002::bigint, 'old canonical label becomes a synonym');
select ok((select tag_text like '%curation precursor synonym%' from public.resources where id = 905102), 'old synonyms still index moved resources');
select ok((select tag_text like '%curation original concept%' from public.content_nodes where id = 905201), 'old label still indexes moved guide');

select is(public.admin_update_discovery_items(auth.uid(), array[905101]::bigint[], '{}', null, 'add', null, null, array[' QuantumNickSeven ', 'quantumnickseven']),
  1, 'content-specific alternate name can be saved');
select is(cardinality((select search_names from public.resources where id = 905101)), 1, 'alternate names trim and deduplicate');
select results_eq($$select resource_id from public.search_discovery_catalogue(_q => 'quantumnickseven', _tag_ids => array[905002]::bigint[], _include_related => false)$$,
  $$values (905101::bigint)$$, 'item nickname does not apply to other resources or guides sharing its topic');
select ok((select tag_text not like '%quantumnickseven%' from public.resources where id = 905101), 'item nicknames do not pollute topic vocabulary');
select is(public.admin_update_discovery_items(auth.uid(), '{}', array[905201]::bigint[], null, 'add', null, null, array['StellarGuideNine']), 1, 'guide alternate name can be saved');
select is((select content_node_id from public.search_discovery_catalogue(_q => 'stellarguidenine', _include_related => false)), 905201::bigint, 'guide nickname retrieves its guide');
select throws_ok($$select public.admin_update_discovery_items(auth.uid(), array[905101, 999999999]::bigint[], '{}', null, 'add', 'hidden')$$,
  '22023', 'One or more selected items no longer exist or are not a Library guide or whole course',
  'all selected IDs are validated before mutation');
select ok((select is_discoverable from public.resources where id = 905101), 'invalid bulk request leaves valid rows untouched');
select throws_ok($$select public.admin_update_discovery_items(auth.uid(), array[905101]::bigint[], '{}', array[999999999]::bigint[])$$,
  '22023', 'Choose existing active canonical tag IDs', 'unknown tag IDs are rejected');
select throws_ok($$select public.admin_update_discovery_items(auth.uid(), '{}', array[905201]::bigint[], null, 'add', 'browse')$$,
  '22023', null, 'guide tags can never approve homepage browse');
select throws_ok($$select public.admin_update_discovery_items(auth.uid(), array[905101,905102]::bigint[], '{}', null, 'add', null, null, array['OneName'])$$,
  '22023', 'Alternate names belong to one specific item', 'bulk nickname assignment is disallowed');
select throws_ok($$select public.admin_update_discovery_items(auth.uid(), array[905101]::bigint[], '{}', array[905003]::bigint[], 'replace', 'hidden', null, array[''])$$,
  '22023', null, 'invalid names reject the entire transaction');
select ok((select is_discoverable from public.resources where id = 905101) and exists(select 1 from public.resource_tags where resource_id = 905101 and tag_id = 905002),
  'tag and visibility changes roll back when later validation fails');

select lives_ok($$select public.admin_save_discovery_tag(auth.uid(), 905002, 'Curation retained concept', 'topic', 'systems', null, false)$$,
  'deactivate canonical and aliases together');
select is((select count(*) from public.tags where canonical_tag_id = 905002 and is_active), 0::bigint, 'dependent aliases are inactive');
select ok((select coalesce(tag_text, '') not like '%curation retained concept%' from public.resources where id = 905101), 'inactive canonical removed from resource index');
select ok((select coalesce(tag_text, '') not like '%curation precursor synonym%' from public.content_nodes where id = 905201), 'inactive aliases removed from guide index');
select is((select count(*) from public.resource_tags where tag_id = 905002), 2::bigint, 'deactivation preserves assignments for inspection');
select is((public.admin_discovery_catalogue(auth.uid(), 'resource', 'Curation fixture', null, 'untagged', 1, 0)->>'total')::integer,
  3, 'progress filters use active vocabulary before pagination');
select is(jsonb_array_length(public.admin_discovery_catalogue(auth.uid(), 'resource', 'Curation fixture', null, 'untagged', 1, 0)->'items'),
  1, 'catalogue response delivers only the requested page');
select ok(exists(select 1 from jsonb_array_elements(public.admin_discovery_vocabulary(auth.uid())) t
  where (t->>'id')::bigint = 905002 and (t->>'resource_count')::integer = 2 and (t->>'node_count')::integer = 1), 'vocabulary reports retained usage counts');

create temp table uploaded_fixture as select public.create_tagged_resource_upload(auth.uid(), 'Curation fixture upload', '', 'pdf', 'draft', false, false,
  'context', 'resources', 'pdf/curation-synthetic-test.pdf', array[905003]::bigint[], array['UploadNickOne']) as id;
select is((select count(*) from public.resource_tags where resource_id = (select id from uploaded_fixture) and tag_id = 905003), 1::bigint, 'upload persists tag IDs in the same transaction');
select ok((select url = '/r/' || id from public.resources where id = (select id from uploaded_fixture)), 'uploaded resource uses the guarded redirect route');
select throws_ok($$select public.create_tagged_resource_upload(auth.uid(), 'Curation invalid upload', '', 'pdf', 'draft', false, false,
  'context', 'resources', 'pdf/curation-invalid-test.pdf', array[999999999]::bigint[], '{}')$$,
  '22023', 'Choose existing active canonical tag IDs', 'bad upload tags fail visibly');
select is((select count(*) from public.resources where title = 'Curation invalid upload'), 0::bigint, 'failed upload leaves no untagged resource row');
select ok(not has_function_privilege('authenticated', 'public.admin_update_discovery_items(uuid,bigint[],bigint[],bigint[],text,text,text,text[])', 'execute'), 'members cannot call the privileged bulk RPC');
select * from finish();
rollback;
