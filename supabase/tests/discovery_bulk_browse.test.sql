begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

set local request.jwt.claim.role = 'service_role';

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'bulk-admin@example.invalid', '', now(), '{}', '{}', now(), now()),
       ('00000000-0000-0000-0000-000000000932', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'bulk-other@example.invalid', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, first_name, last_name) values
  ('00000000-0000-0000-0000-000000000931', 'Bulk', 'Fixture'),
  ('00000000-0000-0000-0000-000000000932', 'Other', 'Editor');
insert into public.user_roles(user_id, role_id)
  select '00000000-0000-0000-0000-000000000931', id from public.roles where code = 'admin';
insert into public.user_roles(user_id, role_id)
  select '00000000-0000-0000-0000-000000000932', id from public.roles where code = 'admin';

insert into public.tags(id, name, slug, tag_kind, browse_category) values
  (931001, 'Bulk fixture hiring', 'bulk-fixture-hiring', 'topic', 'hiring'),
  (931002, 'Bulk fixture systems', 'bulk-fixture-systems', 'topic', 'systems'),
  (931003, 'Bulk fixture existing', 'bulk-fixture-existing', 'topic', 'marketing');

insert into public.resources(id, title, type, url, state, is_discoverable, description) values
  (939001, 'Bulk target one', 'podcast', 'https://example.invalid/b1', 'published', true, ''),
  (939002, 'Bulk target two', 'podcast', 'https://example.invalid/b2', 'published', true, ''),
  (939003, 'Bulk untouched bystander', 'podcast', 'https://example.invalid/b3', 'published', true, ''),
  (939004, 'Bulk representative', 'pdf', 'https://example.invalid/b4', 'published', true, ''),
  (939010, 'Browse ready item', 'podcast', 'https://example.invalid/ready', 'published', true, ''),
  (939011, 'Browse embedded item', 'pdf', 'https://example.invalid/emb', 'published', true, ''),
  (939012, 'Browse unpublished item', 'pdf', 'https://example.invalid/unpub', 'draft', true, ''),
  (939013, 'Browse hidden item', 'pdf', 'https://example.invalid/hid', 'published', false, '');
-- A node sharing a bulk target's numeric id: bulk must never touch it.
insert into public.content_nodes(id, node_type, title, slug, state, is_discoverable, description) values
  (939001, 'lesson', 'Bulk collision lesson', 'bulk-collision-lesson', 'published', true, ''),
  (939201, 'lesson', 'Browse container lesson', 'browse-container-lesson', 'published', true, '');
insert into public.content_blocks(id, node_id, position, block_type, resource_id) values
  (939301, 939201, 0, 'asset', 939011);

-- The representative already carries topics; targets carry one pre-existing topic each so we can
-- prove bulk ADDS rather than replaces.
insert into public.resource_tags(resource_id, tag_id) values
  (939004, 931001), (939004, 931002), (939001, 931003);

-- ---------------------------------------------------------------------------
-- Representatives: only already-tagged items qualify
-- ---------------------------------------------------------------------------
select ok(exists(select 1 from jsonb_array_elements(
    public.admin_discovery_representatives('00000000-0000-0000-0000-000000000931'::uuid, 'Bulk representative')) e
  where (e->>'id')::bigint = 939004),
  'an already-tagged item is offered as a representative');
select ok(not exists(select 1 from jsonb_array_elements(
    public.admin_discovery_representatives('00000000-0000-0000-0000-000000000931'::uuid, 'Bulk target two')) e
  where (e->>'id')::bigint = 939002),
  'an untagged item is never offered as a representative — nothing can be copied from it');

-- ---------------------------------------------------------------------------
-- Bulk writes to exactly the selected composite identities
-- ---------------------------------------------------------------------------
select throws_ok($$
  select public.admin_bulk_discovery_topics('00000000-0000-0000-0000-000000000931'::uuid,
    '[{"kind":"resource","id":939001}]'::jsonb, null)$$,
  '22023', null, 'bulk without explicit topics is refused — subject is never inferred');

select throws_ok($$
  select public.admin_bulk_discovery_topics('00000000-0000-0000-0000-000000000931'::uuid,
    '[{"kind":"node","id":939001}]'::jsonb, array[931001]::bigint[])$$,
  '22023', null, 'bulk cannot turn a parentless lesson into an independent discovery item');

select ok((public.admin_bulk_discovery_topics('00000000-0000-0000-0000-000000000931'::uuid,
    '[{"kind":"resource","id":939001},{"kind":"resource","id":939002}]'::jsonb,
    array[931001, 931002]::bigint[])->>'ok')::boolean,
  'bulk writes to the two selected resources');

select is((select count(*)::int from public.resource_tags where resource_id = 939001), 3,
  'bulk ADDS: the pre-existing topic survives alongside the two added');
select ok(exists(select 1 from public.resource_tags where resource_id = 939001 and tag_id = 931003),
  'the target keeps the topic it already carried');
select is((select count(*)::int from public.resource_tags where resource_id = 939003), 0,
  'an unselected bystander is untouched');
select is((select count(*)::int from public.content_node_tags where node_id = 939001), 0,
  'the LESSON sharing a target resource id is untouched by the bulk write');
select ok(not exists(select 1 from public.discovery_decisions
    where item_kind = 'node' and item_id = 939001),
  'no decision row was created for the colliding lesson');
select is((select count(*)::int from public.discovery_decisions
  where item_kind = 'resource' and item_id in (939001, 939002) and question = 'topics'), 2,
  'each bulk target records its own topics decision, identical to a single assignment');

-- ---------------------------------------------------------------------------
-- A single save replaces; bulk only ever adds. The two paths differ deliberately: bulk proposes
-- topics for items the admin has not individually examined, so it must never destroy what is
-- there. A single save is the admin looking at one item's exact set and pressing Save.
-- ---------------------------------------------------------------------------
select lives_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000931'::uuid,
    'resource', 939003, 'topics', 'assigned', array[931001, 931002, 931003]::bigint[])$$,
  'three topics are saved on a single item');
select is((select count(*)::int from public.resource_tags where resource_id = 939003), 3,
  'all three are assigned');

select lives_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000931'::uuid,
    'resource', 939003, 'topics', 'assigned', array[931001]::bigint[],
    (select token from public.discovery_decisions
      where item_kind='resource' and item_id=939003 and question='topics'))$$,
  'the same item is saved again with two of them deselected');
select is((select count(*)::int from public.resource_tags where resource_id = 939003), 1,
  'a single save REPLACES: deselected topics are removed, not silently kept');
select ok(exists(select 1 from public.resource_tags where resource_id = 939003 and tag_id = 931001),
  'the topic that stayed selected survives');

-- ---------------------------------------------------------------------------
-- Undo restores the exact prior state, and skips what someone else changed
-- ---------------------------------------------------------------------------
-- Before-image for 939001 was [931003] with no decision; for 939002 it was [] with no decision.
select is((select (public.admin_undo_discovery_decisions('00000000-0000-0000-0000-000000000931'::uuid,
    jsonb_build_array(jsonb_build_object(
      'kind','resource','id',939001,'question','topics','answer',null,'tagIds', to_jsonb(array[931003]),
      'token', (select token from public.discovery_decisions where item_kind='resource' and item_id=939001 and question='topics'))
    ))->>'ok')::boolean), true,
  'undo accepts a single before-image entry');

select is((select count(*)::int from public.resource_tags where resource_id = 939001), 1,
  'undo restored the exact prior topic set, not merely the absence of a decision');
select ok(exists(select 1 from public.resource_tags where resource_id = 939001 and tag_id = 931003),
  'the topic that existed before the bulk write is the one that remains');
select ok(not exists(select 1 from public.discovery_decisions
  where item_kind = 'resource' and item_id = 939001 and question = 'topics'),
  'undo removed the decision because there was none before');

-- Another admin changes 939002; undo must skip it and say so rather than overwrite.
select lives_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000932'::uuid,
    'resource', 939002, 'topics', 'none_needed', null,
    (select token from public.discovery_decisions where item_kind='resource' and item_id=939002 and question='topics'))$$,
  'a second admin records a different answer');
select is((select jsonb_array_length((public.admin_undo_discovery_decisions('00000000-0000-0000-0000-000000000931'::uuid,
    jsonb_build_array(jsonb_build_object('kind','resource','id',939002,'question','topics',
      'answer',null,'tagIds', to_jsonb(array[]::bigint[]),
      'token','00000000-0000-0000-0000-0000000000aa'))))->'skipped')), 1,
  'undo skips an item another admin has changed since');
select is((select answer from public.discovery_decisions
  where item_kind='resource' and item_id=939002 and question='topics'), 'none_needed',
  'the other admin''s decision was not overwritten');

-- ---------------------------------------------------------------------------
-- Job D — browse eligibility and blockers
-- ---------------------------------------------------------------------------
select is(public.discovery_browse_blocker('published', true, false, 'context', false), null,
  'a published, searchable, standalone resource has no blocker');
select is(public.discovery_browse_blocker('draft', true, false, 'context', false), 'unpublished',
  'an unpublished resource is blocked, and that is not a discovery decision');
select is(public.discovery_browse_blocker('published', false, false, 'context', false), 'hidden',
  'a hidden resource is blocked — browse must never silently make something searchable');
select is(public.discovery_browse_blocker('published', true, true, 'context', false), 'context_not_reviewed',
  'an embedded resource with no placement decision is genuinely outstanding work');
select is(public.discovery_browse_blocker('published', true, true, 'context', true), 'kept_within_guide',
  'a completed keep-within-guide decision blocks browse and is shown for information, not as a task');

select ok((public.admin_set_discovery_browse('00000000-0000-0000-0000-000000000931'::uuid, 939010, true)->>'ok')::boolean,
  'a ready resource can be approved for browse');
select ok((select is_browsable from public.resources where id = 939010),
  'approval is recorded on the resource');

select is((public.admin_set_discovery_browse('00000000-0000-0000-0000-000000000931'::uuid, 939013, true))->>'blocker', 'hidden',
  'approving a hidden resource is refused with its reason');
select ok(not (select is_browsable from public.resources where id = 939013),
  'the refused approval wrote nothing — browse curation is not a back door to searchability');
select ok(not (select is_discoverable from public.resources where id = 939013),
  'and it did not quietly unhide the resource either');

select is((public.admin_set_discovery_browse('00000000-0000-0000-0000-000000000931'::uuid, 939012, true))->>'blocker', 'unpublished',
  'approving an unpublished resource is refused with its reason');
select is((public.admin_set_discovery_browse('00000000-0000-0000-0000-000000000931'::uuid, 939011, true))->>'blocker', 'context_not_reviewed',
  'approving an embedded resource with no placement decision is refused with its reason');

-- Once the placement decision says it stands alone, it becomes addable.
select lives_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000931'::uuid,
    'resource', 939011, 'placement', 'direct')$$, 'the embedded resource is judged suitable independently');
select ok((public.admin_set_discovery_browse('00000000-0000-0000-0000-000000000931'::uuid, 939011, true)->>'ok')::boolean,
  'and can then be approved for browse');

-- Removal takes effect immediately and needs no eligibility check.
select ok((public.admin_set_discovery_browse('00000000-0000-0000-0000-000000000931'::uuid, 939010, false)->>'ok')::boolean,
  'a resource can be removed from browse');
select ok(not (select is_browsable from public.resources where id = 939010), 'removal is recorded');

-- Blocked candidates are listed WITH their reason, never hidden.
select ok((select (public.admin_discovery_browse_candidates('00000000-0000-0000-0000-000000000931'::uuid,
    'blocked', 'Browse hidden item')->>'total')::int) >= 1,
  'a blocked candidate is findable in the needs-attention view');
select ok(exists(select 1 from jsonb_array_elements(
    public.admin_discovery_browse_candidates('00000000-0000-0000-0000-000000000931'::uuid,
      'blocked', 'Browse hidden item')->'items') e
  where e->>'blocker' = 'hidden'),
  'and it carries the reason it cannot be added');

select * from finish();
rollback;
