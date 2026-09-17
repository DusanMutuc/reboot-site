import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

/**
 * End-to-end verification of the discovery jobs API over real HTTP, against the local Supabase
 * clone only. Explicit opt-in, and every fixture it creates is removed in the finally block.
 *
 *   DISCOVERY_LOCAL_HTTP_TEST=1 \
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   DISCOVERY_LOCAL_APP_URL=http://127.0.0.1:3015 \
 *   node --test --experimental-strip-types tests/discoveryJobs.local.test.mjs
 */
const enabled = process.env.DISCOVERY_LOCAL_HTTP_TEST === '1';

test('discovery jobs HTTP round trip', { skip: !enabled, timeout: 180000 }, async (t) => {
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const appUrl = process.env.DISCOVERY_LOCAL_APP_URL ?? 'http://127.0.0.1:3015';
  assert.equal(dbUrl, 'http://127.0.0.1:54321', 'Database must be the known local Supabase clone');
  assert.match(appUrl, /^http:\/\/127\.0\.0\.1:\d+$/, 'App must be loopback, without a path');

  const service = createClient(dbUrl, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const runId = randomUUID();
  const users = [], resourceIds = [], nodeIds = [], tagIds = [], blockIds = [];
  const checked = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

  async function actor(label, admin = false) {
    const email = `discovery-jobs-${label}-${runId}@example.invalid`;
    const password = `${randomUUID()}Aa!`;
    const created = checked(await service.auth.admin.createUser({ email, password, email_confirm: true }));
    users.push(created.user.id);
    checked(await service.from('profiles').upsert({ id: created.user.id, first_name: 'Jobs fixture', last_name: label }));
    if (admin) {
      const role = checked(await service.from('roles').select('id').eq('code', 'admin').single());
      checked(await service.from('user_roles').insert({ user_id: created.user.id, role_id: role.id }));
    }
    const cookies = new Map();
    const client = createServerClient(dbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)) },
    });
    checked(await client.auth.signInWithPassword({ email, password }));
    return { id: created.user.id, token: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') };
  }

  const call = (path, token, body, method) => fetch(`${appUrl}${path}`, {
    method: method ?? (body ? 'POST' : 'GET'), redirect: 'manual',
    headers: { ...(token ? { Cookie: token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  async function json(response, expected = 200) {
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true,
      `Expected JSON, received HTTP ${response.status}`);
    const data = await response.json();
    assert.equal(response.status, expected, data.error ?? `Expected HTTP ${expected}`);
    return data;
  }

  try {
    const admin = await actor('admin', true), member = await actor('member');

    // Fixtures, including a numerically colliding resource/node pair.
    const topicA = checked(await service.from('tags').insert({
      name: `Jobs topic A ${runId}`, slug: `jobs-topic-a-${runId}`, tag_kind: 'topic', browse_category: 'hiring',
    }).select('id').single());
    const topicB = checked(await service.from('tags').insert({
      name: `Jobs topic B ${runId}`, slug: `jobs-topic-b-${runId}`, tag_kind: 'topic', browse_category: 'systems',
    }).select('id').single());
    tagIds.push(topicA.id, topicB.id);

    const solo = checked(await service.from('resources').insert({
      title: `Jobs standalone ${runId}`, type: 'podcast', url: `https://example.invalid/solo-${runId}`,
      state: 'published', is_discoverable: true,
    }).select('id').single());
    const embedded = checked(await service.from('resources').insert({
      title: `Jobs embedded ${runId}`, type: 'pdf', url: `https://example.invalid/emb-${runId}`,
      state: 'published', is_discoverable: true,
    }).select('id').single());
    const hidden = checked(await service.from('resources').insert({
      title: `Jobs hidden ${runId}`, type: 'pdf', url: `https://example.invalid/hid-${runId}`,
      state: 'published', is_discoverable: false,
    }).select('id').single());
    resourceIds.push(solo.id, embedded.id, hidden.id);

    const lesson = checked(await service.from('content_nodes').insert({
      node_type: 'lesson', title: `Jobs container ${runId}`, slug: `jobs-container-${runId}`,
      state: 'published', is_discoverable: true,
    }).select('id').single());
    const library = checked(await service.from('content_nodes').select('id')
      .eq('node_type', 'collection').eq('slug', 'library').order('id').limit(1).single());
    const libraryGuide = checked(await service.from('content_nodes').insert({
      node_type: 'lesson', title: `Jobs Library guide ${runId}`, slug: `jobs-library-guide-${runId}`,
      state: 'published', is_discoverable: true,
    }).select('id').single());
    const course = checked(await service.from('content_nodes').insert({
      node_type: 'course', title: `Jobs whole course ${runId}`, slug: `jobs-whole-course-${runId}`,
      state: 'published', is_discoverable: true,
    }).select('id').single());
    const courseLesson = checked(await service.from('content_nodes').insert({
      node_type: 'lesson', title: `Jobs course internal ${runId}`, slug: `jobs-course-internal-${runId}`,
      state: 'published', is_discoverable: true,
    }).select('id').single());
    nodeIds.push(lesson.id, libraryGuide.id, course.id, courseLesson.id);
    checked(await service.from('node_children').insert([
      { parent_id: library.id, child_id: libraryGuide.id, position: 990001 },
      { parent_id: course.id, child_id: courseLesson.id, position: 0 },
    ]));
    const block = checked(await service.from('content_blocks').insert({
      node_id: lesson.id, position: 0, block_type: 'asset', resource_id: embedded.id,
    }).select('id').single());
    const repeatedPositionBlocks = checked(await service.from('content_blocks').insert([
      { node_id: lesson.id, position: 1, block_type: 'text', text_md: 'First context block.' },
      { node_id: lesson.id, position: 1, block_type: 'text', text_md: 'Second context block.' },
    ]).select('id'));
    const scopedPlacementBlocks = checked(await service.from('content_blocks').insert([
      { node_id: libraryGuide.id, position: 0, block_type: 'asset', resource_id: embedded.id },
      { node_id: courseLesson.id, position: 0, block_type: 'asset', resource_id: hidden.id },
    ]).select('id'));
    blockIds.push(block.id, ...repeatedPositionBlocks.map(({ id }) => id),
      ...scopedPlacementBlocks.map(({ id }) => id));

    await t.test('the jobs API rejects anonymous and member callers', async () => {
      assert.ok([307, 401].includes((await call('/api/admin/discovery/jobs?view=counts')).status));
      assert.equal((await call('/api/admin/discovery/jobs?view=counts', member.token)).status, 403);
      assert.equal((await call('/api/admin/discovery/jobs', member.token,
        { operation: 'decide', item: { kind: 'resource', id: solo.id }, question: 'topics', answer: 'none_needed' })).status, 403);
    });

    await t.test('a bare id is refused; identity is always kind and id', async () => {
      const bad = await call('/api/admin/discovery/jobs', admin.token,
        { operation: 'decide', item: { id: solo.id }, question: 'topics', answer: 'none_needed' });
      assert.equal(bad.status, 400);
      const bad2 = await call('/api/admin/discovery/jobs', admin.token,
        { operation: 'decide', item: { kind: 'guide', id: solo.id }, question: 'topics', answer: 'none_needed' });
      assert.equal(bad2.status, 400);
    });

    await t.test('only Library guides and whole courses enter the learning-node queue', async () => {
      const queue = await json(await call(
        `/api/admin/discovery/jobs?view=queue&question=topics&q=${encodeURIComponent(runId)}`, admin.token));
      const ids = new Set(queue.items.filter((entry) => entry.kind === 'node').map((entry) => entry.id));
      assert.equal(ids.has(libraryGuide.id), true, 'a direct child of Library is eligible');
      assert.equal(ids.has(course.id), true, 'a whole course is eligible');
      assert.equal(ids.has(courseLesson.id), false, 'a course-internal lesson is not independent');
      assert.equal(ids.has(lesson.id), false, 'a parentless lesson is not independent');

      const refused = await call('/api/admin/discovery/jobs', admin.token, {
        operation: 'decide', item: { kind: 'node', id: courseLesson.id }, question: 'topics',
        answer: 'none_needed', token: null,
      });
      assert.equal(refused.status, 400, 'the write boundary matches the queue boundary');
    });

    let soloToken = null;
    await t.test('both answers complete an item and the population stays stable', async () => {
      const before = await json(await call('/api/admin/discovery/jobs?view=queue&question=topics', admin.token));
      const recorded = await json(await call('/api/admin/discovery/jobs', admin.token, {
        operation: 'decide', item: { kind: 'resource', id: solo.id }, question: 'topics',
        answer: 'assigned', tagIds: [topicA.id], token: null,
      }));
      assert.equal(recorded.ok, true);
      soloToken = recorded.token;
      const after = await json(await call('/api/admin/discovery/jobs?view=queue&question=topics', admin.token));
      assert.equal(after.progress.population, before.progress.population,
        'deciding must not move the denominator');
      assert.equal(after.progress.decided, before.progress.decided + 1);
    });

    await t.test('an unmatched token is refused and changes nothing', async () => {
      const conflict = await json(await call('/api/admin/discovery/jobs', admin.token, {
        operation: 'decide', item: { kind: 'resource', id: solo.id }, question: 'topics',
        answer: 'none_needed', token: randomUUID(),
      }));
      assert.equal(conflict.ok, false);
      assert.equal(conflict.conflict, true);
      const row = checked(await service.from('discovery_decisions').select('answer')
        .eq('item_kind', 'resource').eq('item_id', solo.id).eq('question', 'topics').single());
      assert.equal(row.answer, 'assigned', 'the refused write left the decision alone');
    });

    await t.test('renaming reopens the topics decision', async () => {
      checked(await service.from('resources').update({ title: `Jobs standalone ${runId} renamed` }).eq('id', solo.id));
      const queue = await json(await call('/api/admin/discovery/jobs?view=queue&question=topics', admin.token));
      const row = queue.items.find((entry) => entry.kind === 'resource' && entry.id === solo.id);
      assert.equal(row.stale, true, 'the title is the main evidence of subject');
      assert.equal(row.needs, true, 'a reopened item returns to the queue as rework');
    });

    await t.test('editing topics outside the job supersedes the decision', async () => {
      checked(await service.from('resource_tags').insert({ resource_id: solo.id, tag_id: topicB.id }));
      const rows = checked(await service.from('discovery_decisions').select('item_id')
        .eq('item_kind', 'resource').eq('item_id', solo.id).eq('question', 'topics'));
      assert.equal(rows.length, 0, 'an external edit removes the decision rather than staling it');
    });

    await t.test('placement records the setting and the decision together', async () => {
      const result = await json(await call('/api/admin/discovery/jobs', admin.token, {
        operation: 'decide', item: { kind: 'resource', id: embedded.id }, question: 'placement',
        answer: 'direct', token: null,
      }));
      assert.equal(result.ok, true);
      const row = checked(await service.from('resources').select('discovery_open_mode').eq('id', embedded.id).single());
      assert.equal(row.discovery_open_mode, 'direct');
      const context = await json(await call(`/api/admin/discovery/jobs?view=placement&id=${embedded.id}`, admin.token));
      assert.equal(context.placements.length, 2);
      const parentlessContext = context.placements.find(({ nodeId }) => nodeId === lesson.id);
      assert.ok(parentlessContext);
      assert.equal(parentlessContext.nodeTitle, `Jobs container ${runId}`);
      const blocks = parentlessContext.blocks;
      assert.equal(blocks.filter(({ position }) => position === 1).length, 2,
        'multiple blocks may legitimately share a display position');
      assert.equal(new Set(blocks.map(({ blockId }) => blockId)).size, blocks.length,
        'each rendered block has stable unique identity independent of its position');
    });

    await t.test('placement inbox groups only by Library guides and whole courses', async () => {
      const result = await json(await call('/api/admin/discovery/jobs?view=placement-groups', admin.token));
      const libraryGroup = result.groups.find(({ nodeId }) => nodeId === libraryGuide.id);
      const courseGroup = result.groups.find(({ nodeId }) => nodeId === course.id);
      assert.ok(libraryGroup, 'the direct Library guide is a review group');
      assert.ok(courseGroup, 'the whole course is a review group');
      assert.equal(libraryGroup.resources.some(({ id }) => id === embedded.id), true);
      const nestedCourseResource = courseGroup.resources.find(({ id }) => id === hidden.id);
      assert.equal(nestedCourseResource?.placementNodeId, courseLesson.id,
        'a course-internal placement rolls up while retaining its exact editor node');
      assert.equal(result.groups.some(({ nodeId }) => nodeId === lesson.id), false,
        'a parentless editor lesson is not a discovery container');
      assert.equal(result.groups.some(({ nodeId }) => nodeId === courseLesson.id), false,
        'a course-internal lesson is not shown as a separate guide');
      assert.equal(result.groups.every(({ nodeType }) => ['lesson', 'course'].includes(nodeType)), true);
    });

    await t.test('only tagged items are offered as bulk representatives', async () => {
      const reps = await json(await call(
        `/api/admin/discovery/jobs?view=representatives&q=${encodeURIComponent(`Jobs embedded ${runId}`)}`, admin.token));
      assert.equal(reps.items.length, 0, 'an untagged item can never be copied from');
    });

    await t.test('bulk writes to exactly the selected composite identities', async () => {
      const result = await json(await call('/api/admin/discovery/jobs', admin.token, {
        operation: 'bulk_topics',
        items: [{ kind: 'resource', id: embedded.id }],
        tagIds: [topicA.id, topicB.id],
        tokens: [{ kind: 'resource', id: embedded.id, token: null }],
      }));
      assert.equal(result.ok, true);
      assert.equal(result.written.length, 1);
      const onResource = checked(await service.from('resource_tags').select('tag_id').eq('resource_id', embedded.id));
      assert.equal(onResource.length, 2);
      const onNode = checked(await service.from('content_node_tags').select('tag_id').eq('node_id', lesson.id));
      assert.equal(onNode.length, 0, 'the containing lesson was never a target');
    });

    await t.test('bulk without explicit topics is refused — subject is never inferred', async () => {
      const refused = await call('/api/admin/discovery/jobs', admin.token, {
        operation: 'bulk_topics', items: [{ kind: 'resource', id: embedded.id }], tagIds: [], tokens: [],
      });
      assert.equal(refused.status, 400);
    });

    await t.test('undo restores the exact prior state', async () => {
      const current = checked(await service.from('discovery_decisions').select('token')
        .eq('item_kind', 'resource').eq('item_id', embedded.id).eq('question', 'topics').single());
      const result = await json(await call('/api/admin/discovery/jobs', admin.token, {
        operation: 'undo',
        entries: [{ kind: 'resource', id: embedded.id, question: 'topics', answer: null, tagIds: [], token: current.token }],
      }));
      assert.equal(result.ok, true);
      assert.equal(result.skipped.length, 0);
      const tags = checked(await service.from('resource_tags').select('tag_id').eq('resource_id', embedded.id));
      assert.equal(tags.length, 0, 'the exact prior topic set (empty) was restored');
      const rows = checked(await service.from('discovery_decisions').select('item_id')
        .eq('item_kind', 'resource').eq('item_id', embedded.id).eq('question', 'topics'));
      assert.equal(rows.length, 0, 'and the decision was removed because there was none before');
    });

    await t.test('browse refuses a hidden item and never unhides it', async () => {
      const refused = await json(await call('/api/admin/discovery/jobs', admin.token, {
        operation: 'set_browse', item: { kind: 'resource', id: hidden.id }, approved: true,
      }));
      assert.equal(refused.ok, false);
      assert.equal(refused.blocker, 'hidden');
      const row = checked(await service.from('resources').select('is_browsable,is_discoverable').eq('id', hidden.id).single());
      assert.equal(row.is_browsable, false);
      assert.equal(row.is_discoverable, false, 'browse curation is not a back door to searchability');
    });

    await t.test('a blocked candidate is listed with its reason rather than hidden', async () => {
      const blocked = await json(await call(
        `/api/admin/discovery/jobs?view=candidates&section=blocked&q=${encodeURIComponent(`Jobs hidden ${runId}`)}`, admin.token));
      assert.equal(blocked.items.length, 1);
      assert.equal(blocked.items[0].blocker, 'hidden');
    });

    await t.test('a ready item can be added and removed', async () => {
      const added = await json(await call('/api/admin/discovery/jobs', admin.token, {
        operation: 'set_browse', item: { kind: 'resource', id: solo.id }, approved: true,
      }));
      assert.equal(added.ok, true);
      const browse = await json(await call(
        `/api/admin/discovery/jobs?view=browse&q=${encodeURIComponent(`Jobs standalone ${runId}`)}`, admin.token));
      assert.equal(browse.items.length, 1);
      const removed = await json(await call('/api/admin/discovery/jobs', admin.token, {
        operation: 'set_browse', item: { kind: 'resource', id: solo.id }, approved: false,
      }));
      assert.equal(removed.ok, true);
    });

    await t.test('a guide can never enter homepage browse', async () => {
      const refused = await call('/api/admin/discovery/jobs', admin.token, {
        operation: 'set_browse', item: { kind: 'node', id: lesson.id }, approved: true,
      });
      assert.equal(refused.status, 400);
    });

    await t.test('landing counts describe the same world the queues do', async () => {
      const counts = await json(await call('/api/admin/discovery/jobs?view=counts', admin.token));
      const queue = await json(await call('/api/admin/discovery/jobs?view=queue&question=topics', admin.token));
      assert.equal(counts.topics.needs, queue.progress.needs);
      assert.equal(counts.topics.population, queue.progress.population);
      assert.equal(typeof counts.categoryDiagnostic.topicsTotal, 'number');
      assert.ok(counts.hiddenChaptersExcluded >= 0);
    });
  } finally {
    // Fixtures only. Nothing pre-existing is touched.
    for (const id of blockIds) await service.from('content_blocks').delete().eq('id', id);
    for (const id of resourceIds) await service.from('resources').delete().eq('id', id);
    for (const id of nodeIds) await service.from('content_nodes').delete().eq('id', id);
    for (const id of tagIds) await service.from('tags').delete().eq('id', id);
    for (const id of users) await service.auth.admin.deleteUser(id);
  }
});
