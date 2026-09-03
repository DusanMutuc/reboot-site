begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

set local request.jwt.claim.role = 'service_role';

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'decisions-admin@example.invalid', '', now(), '{}', '{}', now(), now()),
       ('00000000-0000-0000-0000-000000000922', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'decisions-other@example.invalid', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, first_name, last_name) values
  ('00000000-0000-0000-0000-000000000921', 'Decision', 'Fixture'),
  ('00000000-0000-0000-0000-000000000922', 'Second', 'Admin');
insert into public.user_roles(user_id, role_id)
  select '00000000-0000-0000-0000-000000000921', id from public.roles where code = 'admin';
insert into public.user_roles(user_id, role_id)
  select '00000000-0000-0000-0000-000000000922', id from public.roles where code = 'admin';

insert into public.tags(id, name, slug, tag_kind, browse_category) values
  (921001, 'Decision fixture hiring', 'decision-fixture-hiring', 'topic', 'hiring'),
  (921002, 'Decision fixture systems', 'decision-fixture-systems', 'topic', 'systems'),
  (921003, 'Decision fixture uncategorised', 'decision-fixture-uncat', 'topic', null);

-- THE COLLISION FIXTURE.
-- resources and content_nodes have independent id sequences, so the same integer names two
-- different items. Every behaviour below must distinguish them. This pair is the permanent
-- regression guard for that: 35 real catalogue rows collide the same way.
insert into public.resources(id, title, type, url, state, is_discoverable, description) values
  (909099, 'Collision fixture RESOURCE', 'pdf', 'https://example.invalid/collide-r', 'published', true, ''),
  (909101, 'Collision fixture embedded resource', 'pdf', 'https://example.invalid/embed', 'published', true, ''),
  (909102, 'Collision fixture standalone', 'podcast', 'https://example.invalid/stand', 'published', true, ''),
  (909103, 'Collision fixture unpublished', 'pdf', 'https://example.invalid/draft', 'draft', true, ''),
  (909104, 'Collision fixture hidden', 'pdf', 'https://example.invalid/hidden', 'published', false, '');
insert into public.content_nodes(id, node_type, title, slug, state, is_discoverable, description) values
  (909099, 'lesson', 'Collision fixture LESSON', 'collision-fixture-lesson', 'published', true, ''),
  (909201, 'lesson', 'Collision fixture container', 'collision-fixture-container', 'published', true, 'Container'),
  (909202, 'chapter', 'Collision fixture chapter', 'collision-fixture-chapter', 'published', false, ''),
  (909203, 'course', 'Collision fixture whole course', 'collision-fixture-course', 'published', true, '');
insert into public.content_nodes(node_type, title, slug, state)
select 'collection', 'Library', 'library', 'published'
where not exists (select 1 from public.content_nodes where node_type = 'collection' and slug = 'library');
insert into public.node_edge_rules(parent_type, child_kind, child_type)
values ('collection', 'node', 'lesson') on conflict do nothing;
insert into public.node_children(parent_id, child_id, position)
select library.id, 909099,
  coalesce((select max(edge.position) + 1 from public.node_children edge where edge.parent_id = library.id), 1)
from (select id from public.content_nodes where node_type = 'collection' and slug = 'library'
  order by id limit 1) library;
insert into public.content_blocks(id, node_id, position, block_type, resource_id) values
  (909301, 909201, 0, 'asset', 909101);
insert into public.content_blocks(id, node_id, position, block_type, text_md) values
  (909302, 909201, 1, 'text', 'Follow these steps before opening the file.');

-- ---------------------------------------------------------------------------
-- Scope and exclusions
-- ---------------------------------------------------------------------------
select ok(exists(select 1 from public.discovery_job_items where kind = 'node' and id = 909099),
  'a lesson directly inside Library is a discovery job item');
select ok(exists(select 1 from public.discovery_job_items where kind = 'node' and id = 909203),
  'a whole course is a discovery job item');
select ok(not exists(select 1 from public.discovery_job_items where kind = 'node' and id = 909201),
  'a parentless lesson is not an independent discovery job item');
select ok(not exists(select 1 from public.discovery_job_items where kind = 'node' and id = 909202),
  'a chapter is excluded from every job — it is not a search result, topic target or visibility item');
select ok(exists(select 1 from public.discovery_job_items where kind = 'resource' and id = 909099),
  'a resource with the same numeric id is a separate job item');

-- ---------------------------------------------------------------------------
-- Composite identity: node:99 and resource:99 must never affect each other
-- ---------------------------------------------------------------------------
select lives_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000921'::uuid,
    'node', 909099, 'topics', 'assigned', array[921001]::bigint[])$$,
  'a topics decision can be recorded against the lesson');

select is((select count(*)::int from public.discovery_decisions
  where item_id = 909099 and question = 'topics'), 1,
  'exactly one decision row exists for the colliding id');
select is((select item_kind from public.discovery_decisions
  where item_id = 909099 and question = 'topics'), 'node',
  'the decision belongs to the node, not the resource');
select ok(not exists(select 1 from public.resource_tags where resource_id = 909099),
  'tagging the lesson did not tag the resource that shares its id');
select ok((select needs from public.discovery_queue_rows('topics') where kind = 'resource' and id = 909099),
  'the colliding resource still needs a topics decision');
select ok((select decided from public.discovery_queue_rows('topics') where kind = 'node' and id = 909099),
  'the colliding lesson is decided');

-- ...and the reverse direction
select lives_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000921'::uuid,
    'resource', 909099, 'topics', 'none_needed')$$,
  'the colliding resource records its own independent answer');
select is((select answer from public.discovery_decisions
  where item_kind = 'resource' and item_id = 909099 and question = 'topics'), 'none_needed',
  'the resource answer is none_needed');
select is((select answer from public.discovery_decisions
  where item_kind = 'node' and item_id = 909099 and question = 'topics'), 'assigned',
  'the lesson answer is untouched by the resource decision');

-- ---------------------------------------------------------------------------
-- Both answers complete an item; skip records nothing
-- ---------------------------------------------------------------------------
select ok((select decided from public.discovery_queue_rows('topics') where kind = 'resource' and id = 909099),
  'no-topic-needed completes the item exactly as assigning topics does');
select ok(not exists(select 1 from public.discovery_decisions
  where item_kind = 'resource' and item_id = 909102),
  'skip is a fact about a session and writes nothing');

-- Answers are constrained per question.
select throws_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000921'::uuid,
    'resource', 909102, 'topics', 'direct')$$,
  '22023', null, 'a placement answer is rejected for the topics question');
select throws_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000921'::uuid,
    'node', 909099, 'placement', 'direct')$$,
  '22023', null, 'placement does not apply to learning nodes');
select throws_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000921'::uuid,
    'node', 909201, 'topics', 'none_needed')$$,
  '22023', null, 'a parentless lesson cannot receive a discovery topics decision');

-- ---------------------------------------------------------------------------
-- Content arrives un-findable, and that is not a decision
--
-- is_discoverable defaults to false, so anything created without someone answering the question
-- sits invisible to search. It must land in the queue rather than carry an implied answer: a
-- default nobody chose is exactly what the decision record exists to distinguish.
-- ---------------------------------------------------------------------------
insert into public.resources(id, title, type, url, state)
  values (909105, 'Created without answering the question', 'pdf', 'https://example.invalid/unanswered', 'published');

select ok(not (select is_discoverable from public.resources where id = 909105),
  'a new resource is born hidden from search');
select ok(not exists(select 1 from public.discovery_decisions
  where item_kind = 'resource' and item_id = 909105 and question = 'visibility'),
  'and carries no visibility decision, because nobody made one');
select ok((select needs from public.discovery_queue_rows('visibility') where kind = 'resource' and id = 909105),
  'so it appears in the not-in-search queue for someone to answer deliberately');

select lives_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000921'::uuid,
    'resource', 909105, 'visibility', 'allowed')$$,
  'answering it is an ordinary decision');
select ok(not (select needs from public.discovery_queue_rows('visibility') where kind = 'resource' and id = 909105),
  'and it leaves the queue');
select ok((select is_discoverable from public.resources where id = 909105),
  'with the setting applied in the same transaction');

-- ---------------------------------------------------------------------------
-- Stable denominator
-- ---------------------------------------------------------------------------
create temporary table progress_probe as
  select (public.admin_discovery_queue('00000000-0000-0000-0000-000000000921'::uuid,'topics','',null,1,0)->'progress') as p;
select lives_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000921'::uuid,
    'resource', 909102, 'topics', 'assigned', array[921002]::bigint[])$$,
  'another topics decision is recorded');
select is(
  ((select (p->>'population')::int from progress_probe)),
  ((select ((public.admin_discovery_queue('00000000-0000-0000-0000-000000000921'::uuid,'topics','',null,1,0)->'progress')->>'population')::int)),
  'the population is unchanged by deciding — the denominator is candidates plus answered, not eligibility');

-- ---------------------------------------------------------------------------
-- Staleness: which changes reopen which decision
-- ---------------------------------------------------------------------------
update public.resources set title = 'Collision fixture standalone (renamed)' where id = 909102;
select ok((select stale from public.discovery_queue_rows('topics') where kind = 'resource' and id = 909102),
  'renaming stales the topics decision — the title is the main evidence of subject');
select ok((select needs from public.discovery_queue_rows('topics') where kind = 'resource' and id = 909102),
  'a stale decision returns to the queue as rework');

select lives_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000921'::uuid,
    'resource', 909101, 'placement', 'direct')$$,
  'a placement decision is recorded for the embedded resource');
select is((select discovery_open_mode from public.resources where id = 909101), 'direct',
  'the setting and the decision are written in one transaction');
select ok(not (select stale from public.discovery_queue_rows('placement') where id = 909101),
  'the fresh placement decision is not stale');

-- The surroundings ARE the question: changing the instructions around the resource reopens it.
update public.content_blocks set text_md = 'You must complete the intake form before opening this.'
  where id = 909302;
select ok((select stale from public.discovery_queue_rows('placement') where id = 909101),
  'editing the surrounding instructions stales the placement decision');

-- Publication is a blocker, not evidence: allow-in-search is a permission.
select lives_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000921'::uuid,
    'resource', 909104, 'visibility', 'excluded')$$,
  'a visibility decision is recorded for the hidden resource');
update public.resources set state = 'draft' where id = 909104;
select ok(not (select stale from public.discovery_queue_rows('visibility') where id = 909104),
  'changing publication state does not stale a visibility decision');

-- ---------------------------------------------------------------------------
-- Supersession: an external edit removes the decision rather than staling it
-- ---------------------------------------------------------------------------
insert into public.resource_tags(resource_id, tag_id) values (909102, 921003);
select ok(not exists(select 1 from public.discovery_decisions
  where item_kind = 'resource' and item_id = 909102 and question = 'topics'),
  'editing topics outside the job supersedes the topics decision');
select ok(exists(select 1 from public.discovery_decisions
  where item_kind = 'resource' and item_id = 909101 and question = 'placement'),
  'an unrelated question is not superseded');

update public.resources set discovery_open_mode = 'context' where id = 909101;
select ok(not exists(select 1 from public.discovery_decisions
  where item_kind = 'resource' and item_id = 909101 and question = 'placement'),
  'editing open mode outside the job supersedes the placement decision');

-- ---------------------------------------------------------------------------
-- Concurrency: an opaque token, checked on write
-- ---------------------------------------------------------------------------
select lives_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000921'::uuid,
    'resource', 909102, 'topics', 'none_needed')$$,
  'a decision is recorded so a token exists');
select ok(((select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000922'::uuid,
    'resource', 909102, 'topics', 'assigned', array[921001]::bigint[],
    '00000000-0000-0000-0000-0000000000ff'::uuid))->>'conflict')::boolean,
  'a write carrying a token that no longer matches is refused');
select is((select answer from public.discovery_decisions
  where item_kind = 'resource' and item_id = 909102 and question = 'topics'), 'none_needed',
  'the refused write changed nothing');
select ok(((select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000922'::uuid,
    'resource', 909102, 'topics', 'assigned', array[921001]::bigint[],
    (select token from public.discovery_decisions where item_kind='resource' and item_id=909102 and question='topics')))->>'ok')::boolean,
  'a write carrying the current token succeeds');

-- The ABA case a counter could not survive: delete the row, write a fresh one, and an old token
-- must still not match. A uuid regenerated on every write cannot be recreated by deletion.
delete from public.resource_tags where resource_id = 909102 and tag_id = 921003;  -- supersedes, deleting the row
select lives_ok($$
  select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000921'::uuid,
    'resource', 909102, 'topics', 'none_needed')$$, 'a brand new decision replaces the deleted one');
select ok(((select public.admin_record_discovery_decision('00000000-0000-0000-0000-000000000922'::uuid,
    'resource', 909102, 'topics', 'assigned', array[921001]::bigint[],
    '00000000-0000-0000-0000-0000000000ff'::uuid))->>'conflict')::boolean,
  'a token from before the deletion cannot match the new decision (no ABA)');

select * from finish();
rollback;
