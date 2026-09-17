import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

// Explicit opt-in only. Never load .env.local, which may contain production keys.
const enabled = process.env.DISCOVERY_LOCAL_HTTP_TEST === '1';
test('local discovery infrastructure HTTP round trip', { skip: !enabled, timeout: 120000 }, async (t) => {
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const appUrl = process.env.DISCOVERY_LOCAL_APP_URL ?? 'http://127.0.0.1:3015';
  assert.equal(dbUrl, 'http://127.0.0.1:54321', 'Database must be the known local Supabase clone');
  assert.match(appUrl, /^http:\/\/127\.0\.0\.1:\d+$/, 'App must be loopback, without a path');
  const service = createClient(dbUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = [], resourceIds = [], nodeIds = [], tagIds = [], aliasIds = [], objects = [];
  const runId = randomUUID();
  const checked = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const counts = async () => {
    const result = {};
    for (const table of ['resources', 'content_nodes', 'tags', 'profiles']) {
      const response = await service.from(table).select('id', { count: 'exact', head: true });
      if (response.error) throw new Error(response.error.message);
      result[table] = response.count;
    }
    return result;
  };
  const baseline = await counts();
  async function actor(label, admin = false) {
    const email = `discovery-http-${label}-${runId}@example.invalid`;
    const password = `${randomUUID()}Aa!`;
    const created = checked(await service.auth.admin.createUser({ email, password, email_confirm: true }));
    users.push(created.user.id);
    checked(await service.from('profiles').upsert({ id: created.user.id, first_name: 'Infrastructure fixture', last_name: label }));
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
    // Exercise the browser cookie path, including the existing auth middleware.
    return { id: created.user.id, token: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') };
  }
  const call = (path, token, body, method) => fetch(`${appUrl}${path}`, {
    method: method ?? (body ? 'POST' : 'GET'), redirect: 'manual',
    headers: { ...(token ? { Cookie: token } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined,
  });
  async function json(response, expected = 200) {
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true, `Expected JSON, received HTTP ${response.status}`);
    const data = await response.json();
    assert.equal(response.status, expected, data.error ?? `Expected HTTP ${expected}`);
    return data;
  }
  try {
    const admin = await actor('admin', true), member = await actor('member');
    const resource = checked(await service.from('resources').insert({ title: `Infrastructure fixture ${runId}`, type: 'pdf',
      url: `https://example.invalid/${runId}`, state: 'published', is_discoverable: true, created_by: admin.id }).select('id').single());
    resourceIds.push(resource.id);

    // READ-ONLY cross-check before calling any mutating application endpoint:
    // the running app must see a nonce row that exists only in our local clone.
    const probe = await json(await call(`/api/admin/discovery?kind=resource&id=${resource.id}`, admin.token));
    assert.equal(probe.item.title, `Infrastructure fixture ${runId}`, 'App must use this exact local clone');
    await t.test('admin API rejects anonymous and member callers', async () => {
      assert.ok([307, 401].includes((await call('/api/admin/discovery?view=vocabulary')).status));
      assert.equal((await call('/api/admin/discovery?view=vocabulary', member.token)).status, 403);
      assert.equal((await call('/api/admin/discovery', member.token, { operation: 'update_items', resourceIds: [resource.id], visibility: 'hidden' })).status, 403);
    });
    await t.test('vocabulary and atomic metadata save round trip', async () => {
      const tag = await json(await call('/api/admin/discovery', admin.token, { operation: 'save_tag', name: `Infrastructure topic ${runId}`, kind: 'topic', category: 'systems', canonicalId: null, active: true }));
      tagIds.push(tag.result);
      await json(await call('/api/admin/discovery', admin.token, { operation: 'update_items', resourceIds: [resource.id], tagIds: [tag.result],
        tagAction: 'replace', visibility: 'search_only', openMode: 'direct', searchNames: [`nickname-${runId}`] }));
      const loaded = await json(await call(`/api/admin/discovery?kind=resource&id=${resource.id}`, admin.token));
      assert.deepEqual(loaded.item.tag_ids, [tag.result]);
      assert.equal(loaded.item.discovery_open_mode, 'direct');
      assert.deepEqual(loaded.item.search_names, [`nickname-${runId}`]);
      const invalid = await call('/api/admin/discovery', admin.token, { operation: 'update_items', resourceIds: [resource.id, 999999999], visibility: 'hidden' });
      assert.equal(invalid.status, 400);
      assert.equal(checked(await service.from('resources').select('is_discoverable').eq('id', resource.id).single()).is_discoverable, true);
    });
    await t.test('member discovery search consumes the new RPC contract', async () => {
      const result = await json(await call('/api/home/search', member.token, { query: `nickname-${runId}` }));
      assert.ok(result.items.some((item) => item.href === `/r/${resource.id}`));
      const catalogue = await json(await call('/api/discovery/catalogue', member.token, { query: `nickname-${runId}` }));
      assert.ok(catalogue.items.some((item) => item.href === `/r/${resource.id}`));
    });
    await t.test('direct opens use access checks, not discovery visibility', async () => {
      assert.ok([307, 401].includes((await call(`/r/${resource.id}`)).status));
      const accessible = await call(`/r/${resource.id}`, member.token);
      assert.equal(accessible.status, 302);
      assert.equal(accessible.headers.get('cache-control'), 'private, no-store');
      assert.equal(accessible.headers.get('location'), `https://example.invalid/${runId}`);
      checked(await service.from('resources').update({ is_discoverable: false }).eq('id', resource.id));
      assert.equal((await call(`/r/${resource.id}`, member.token)).status, 302);
      const course = checked(await service.from('content_nodes').insert({ node_type: 'course', title: `Infrastructure restricted ${runId}`,
        slug: `infra-${runId}`, state: 'published', visibility: 'limited', is_discoverable: false }).select('id').single());
      nodeIds.push(course.id);
      checked(await service.from('content_blocks').insert({ node_id: course.id, resource_id: resource.id, position: 1, block_type: 'asset' }));
      assert.equal((await call(`/r/${resource.id}`, member.token)).status, 404);
      assert.equal((await call(`/api/nodes/${course.id}/blocks`, member.token)).status, 404);
      // Explicit staff preview continues to work.
      assert.equal((await call(`/r/${resource.id}`, admin.token)).status, 302);
    });
    await t.test('upload persists tag IDs and returns a working signed local link', async () => {
      const form = new FormData();
      form.append('file', new Blob(['%PDF-1.4\n% Local infrastructure fixture\n%%EOF'], { type: 'application/pdf' }), 'infrastructure.pdf');
      form.append('title', `Infrastructure upload ${runId}`);
      form.append('type', 'pdf'); form.append('state', 'published'); form.append('tag_ids', JSON.stringify(tagIds));
      form.append('search_names', JSON.stringify([`upload-${runId}`]));
      const result = await json(await call('/api/resources/upload', admin.token, form));
      resourceIds.push(result.id);
      const row = checked(await service.from('resources').select('storage_bucket,storage_path').eq('id', result.id).single());
      objects.push({ bucket: row.storage_bucket, path: row.storage_path });
      const links = checked(await service.from('resource_tags').select('tag_id').eq('resource_id', result.id));
      assert.deepEqual(links.map((link) => link.tag_id), tagIds);
      const open = await call(result.openUrl, member.token);
      assert.equal(open.status, 302);
      const target = new URL(open.headers.get('location'));
      assert.equal(target.origin, dbUrl, 'Signed file must stay in local storage');
      assert.ok(target.pathname.includes('/storage/v1/object/sign/'));
      // An old client sending names must fail before uploading another file.
      form.delete('tag_ids'); form.set('tags', JSON.stringify(['Not a tag ID']));
      assert.equal((await call('/api/resources/upload', admin.token, form)).status, 400);
    });
    await t.test('fixed sections, topic synonyms and dismissal persistence', async () => {
      const vocabulary = await json(await call('/api/admin/discovery?view=vocabulary', admin.token));
      const section = vocabulary.tags.find(tag => tag.tag_kind === 'browse_category');
      assert.ok(section);
      await json(await call('/api/admin/discovery', admin.token, { operation: 'save_tag', id: section.id,
        name: section.name, kind: 'browse_category', category: section.browse_category, canonicalId: null, active: true }), 400);
      await json(await call('/api/admin/discovery', admin.token, { operation: 'save_tag', id: section.id,
        name: section.name, kind: 'topic', category: section.browse_category, canonicalId: null, active: true }), 400);
      await json(await call('/api/admin/discovery', admin.token, { operation: 'update_items', resourceIds: [resource.id], tagIds: [section.id] }), 400);
      await json(await call('/api/admin/discovery', admin.token, { operation: 'save_tag', name: `Invalid synonym ${runId}`,
        kind: 'alias', category: null, canonicalId: section.id, active: true }), 400);
      const alias = await json(await call('/api/admin/discovery', admin.token, { operation: 'save_tag', name: `Synonym ${runId}`,
        kind: 'alias', category: null, canonicalId: tagIds[0], active: true }));
      aliasIds.push(alias.result); tagIds.push(alias.result);
      const signature = JSON.stringify([[tagIds[0], `Synthetic duplicate ${runId}`, 'systems']]);
      await json(await call('/api/admin/discovery', admin.token, { operation: 'dismiss_duplicate', signature }));
      assert.ok((await json(await call('/api/admin/discovery?view=vocabulary', admin.token))).dismissedDuplicates.includes(signature));
      await json(await call('/api/admin/discovery', member.token, { operation: 'restore_duplicates' }), 403);
      await json(await call('/api/admin/discovery', admin.token, { operation: 'restore_duplicates' }));
      assert.equal((await json(await call('/api/admin/discovery?view=vocabulary', admin.token))).dismissedDuplicates.length, 0);
    });
    await t.test('review queue, multiple staff previews and member browse/search round trip', async () => {
      const guide = checked(await service.from('content_nodes').insert({ node_type: 'lesson', title: `Workflow guide ${runId}`,
        slug: `workflow-${runId}`, state: 'published', is_discoverable: true }).select('id').single());
      nodeIds.push(guide.id);
      const root = checked(await service.from('content_nodes').select('id').eq('slug', 'library').single());
      const last = checked(await service.from('node_children').select('position').eq('parent_id', root.id).order('position', { ascending: false }).limit(1));
      checked(await service.from('node_children').insert({ parent_id: root.id, child_id: guide.id, position: (last[0]?.position ?? 0) + 1 }));
      const tool = checked(await service.from('resources').insert({ title: `Workflow tool ${runId}`, type: 'pdf', url: `https://example.invalid/tool-${runId}`,
        state: 'published', is_discoverable: true }).select('id').single());
      resourceIds.push(tool.id);
      checked(await service.from('content_blocks').insert([
        { node_id: guide.id, block_type: 'text', position: 1, text_md: 'Essential fixture instructions' },
        { node_id: guide.id, block_type: 'asset', position: 2, resource_id: tool.id },
        { node_id: nodeIds[0], block_type: 'asset', position: 2, resource_id: tool.id },
      ]));
      const get = async () => (await json(await call(`/api/admin/discovery?kind=resource&id=${tool.id}`, admin.token))).item;
      const update = async body => json(await call('/api/admin/discovery', admin.token, { operation: 'update_items', resourceIds: [tool.id], ...body }));
      // Placement is recorded through the jobs API now: discovery_reviewed_at is deprecated and
      // the decision lives in discovery_decisions.
      const decide = async answer => json(await call('/api/admin/discovery/jobs', admin.token, {
        operation: 'decide', item: { kind: 'resource', id: tool.id }, question: 'placement', answer,
        token: (await decision()).token,
      }));
      const decision = async () => json(await call(
        `/api/admin/discovery/jobs?view=item-decision&kind=resource&id=${tool.id}&question=placement`, admin.token));
      assert.equal((await decision()).answer, null);
      assert.equal((await get()).placements.length, 2);
      await update({ tagIds: [tagIds[0]], searchNames: [`workflow-name-${runId}`] });
      assert.equal((await decision()).answer, null, 'saving topics/names does not claim a placement decision');
      await decide('context');
      assert.equal((await decision()).answer, 'context');
      assert.equal((await get()).is_browsable, false);
      const queue = await json(await call(`/api/admin/discovery?kind=resource&filter=needs_review&q=${encodeURIComponent(`Workflow tool ${runId}`)}`, admin.token));
      assert.equal(queue.total, 0, 'a decided resource leaves the needs-review filter');
      const contextual = await json(await call('/api/home/search', member.token, { query: `workflow-name-${runId}` }));
      assert.ok(contextual.items.some(item => item.href === `/library/workflow-${runId}`));
      const preview = await json(await call(`/api/admin/discovery/preview?nodeId=${guide.id}`, admin.token));
      assert.equal(preview.blocks.length, 2);
      assert.equal(preview.parents[0].id, root.id);
      assert.equal(preview.resources[tool.id].id, tool.id);
      await json(await call(`/api/admin/discovery/preview?nodeId=${guide.id}`, member.token), 403);
      await json(await call(`/api/admin/discovery/preview?nodeId=${nodeIds[0]}`, admin.token));
      await decide('direct');
      assert.equal((await get()).is_browsable, false, 'independent-use approval is not browse approval');
      const direct = await json(await call('/api/home/search', member.token, { query: `workflow-name-${runId}` }));
      assert.ok(direct.items.some(item => item.href === `/r/${tool.id}`));
      await update({ visibility: 'browse' });
      const browse = await json(await call('/api/discovery/catalogue', member.token, { category: 'systems', sort: 'newest' }));
      assert.ok(browse.items.some(item => item.href === `/r/${tool.id}`));
      // Reopening is supersession now: an edit to open mode made outside the job deletes the
      // decision rather than leaving a stale one behind.
      await update({ openMode: 'context' });
      const pending = await get();
      assert.equal(pending.discovery_open_mode, 'context');
      assert.equal((await decision()).answer, null, 'an external open-mode edit supersedes the decision');
      const excluded = await json(await call('/api/discovery/catalogue', member.token, { category: 'systems', sort: 'newest' }));
      assert.ok(!excluded.items.some(item => item.href === `/r/${tool.id}`));
    });
    await t.test('read-only previews work on actual cloned learning material', async () => {
      const actual = checked(await service.from('content_nodes').select('id,title').eq('node_type', 'lesson')
        .not('id', 'in', `(${nodeIds.join(',')})`).limit(3));
      assert.ok(actual.length > 0, 'The populated local clone should contain real learning material');
      for (const node of actual) {
        const preview = await json(await call(`/api/admin/discovery/preview?nodeId=${node.id}`, admin.token));
        const blocks = checked(await service.from('content_blocks').select('id').eq('node_id', node.id));
        assert.equal(preview.node.title, node.title);
        assert.equal(preview.blocks.length, blocks.length);
      }
    });
  } finally {
    // Remove only IDs and storage paths created by this run. Never reset tables.
    for (const object of objects) checked(await service.storage.from(object.bucket).remove([object.path]));
    if (nodeIds.length) checked(await service.from('content_nodes').delete().in('id', nodeIds));
    if (resourceIds.length) checked(await service.from('resources').delete().in('id', resourceIds));
    if (aliasIds.length) checked(await service.from('tags').delete().in('id', aliasIds));
    if (tagIds.length) checked(await service.from('tags').delete().in('id', tagIds));
    for (const id of users) checked(await service.auth.admin.deleteUser(id));
    assert.deepEqual(await counts(), baseline, 'Fixture cleanup must restore catalogue/account row counts');
  }
});
