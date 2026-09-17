import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

/**
 * End-to-end contract for the remaining discovery surfaces. Explicit opt-in and local-only.
 * Every fixture is removed in finally.
 */
const enabled = process.env.DISCOVERY_LOCAL_HTTP_TEST === '1';

test('remaining discovery surfaces round trip', { skip: !enabled, timeout: 180000 }, async (t) => {
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const appUrl = process.env.DISCOVERY_LOCAL_APP_URL ?? 'http://127.0.0.1:3015';
  assert.equal(dbUrl, 'http://127.0.0.1:54321', 'Database must be the known local Supabase clone');
  assert.match(appUrl, /^http:\/\/127\.0\.0\.1:\d+$/, 'App must be loopback');
  const service = createClient(dbUrl, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const checked = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const users = [], resources = [], notes = [], suggestions = [], logicalSearches = [];
  const runId = randomUUID();

  async function actor(label, roleCode) {
    const email = `remaining-${label}-${runId}@example.invalid`;
    const password = `${randomUUID()}Aa!`;
    const created = checked(await service.auth.admin.createUser({ email, password, email_confirm: true }));
    users.push(created.user.id);
    checked(await service.from('profiles').upsert({ id: created.user.id, first_name: 'Remaining', last_name: label }));
    if (roleCode) {
      const role = checked(await service.from('roles').select('id').eq('code', roleCode).single());
      checked(await service.from('user_roles').insert({ user_id: created.user.id, role_id: role.id }));
    }
    const cookies = new Map();
    const client = createServerClient(dbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
      },
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
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true, `Expected JSON, got ${response.status}`);
    const data = await response.json();
    assert.equal(response.status, expected, data.error ?? `Expected HTTP ${expected}`);
    return data;
  }

  try {
    const admin = await actor('admin', 'admin');
    const coach = await actor('coach', 'coach');
    const member = await actor('member', null);
    checked(await service.from('user_coaches').insert({ user_id: member.id, coach_id: coach.id, is_active: true }));
    const note = checked(await service.from('coaching_notes_base').insert({ user_id: member.id, coach_id: coach.id }).select('id').single());
    notes.push(note.id);
    const resource = checked(await service.from('resources').insert({
      title: `Remaining discovery tool ${runId}`, description: 'A focused seller workflow.', type: 'pdf',
      url: `https://example.invalid/${runId}`, state: 'published', is_discoverable: true,
    }).select('id').single());
    resources.push(resource.id);

    await t.test('Find content is admin-only and reads undecided state honestly', async () => {
      assert.equal((await call(`/api/admin/discovery/find?q=${runId}`, member.token)).status, 403);
      const found = await json(await call(`/api/admin/discovery/find?q=${runId}`, admin.token));
      const row = found.items.find((item) => item.kind === 'resource' && item.id === resource.id);
      assert.ok(row);
      const detail = await json(await call(`/api/admin/discovery/find?view=detail&kind=resource&id=${resource.id}`, admin.token));
      assert.equal(detail.item.decisions.every((decision) => decision.decided === false), true);
      assert.equal(detail.item.isDiscoverable, true);
    });

    await t.test('admin diagnosis does not write member search analytics and verifies an alternate name', async () => {
      const beforeResult = await service.from('logical_searches').select('id', { count: 'exact', head: true });
      if (beforeResult.error) throw new Error(beforeResult.error.message);
      const before = beforeResult.count;
      const query = `nickname-${runId}`;
      const diagnosed = await json(await call('/api/admin/discovery/search', admin.token, {
        operation: 'diagnose', query, kind: 'resource', id: resource.id,
      }));
      assert.equal(diagnosed.correction, 'alternate_name');
      const saved = await json(await call('/api/admin/discovery/search', admin.token, {
        operation: 'add_alternate_name', query, kind: 'resource', id: resource.id, name: query,
      }));
      assert.equal(saved.saved, true);
      assert.equal(saved.position, 1);
      const afterResult = await service.from('logical_searches').select('id', { count: 'exact', head: true });
      if (afterResult.error) throw new Error(afterResult.error.message);
      const after = afterResult.count;
      assert.equal(after, before, 'admin test searches must not enter member analytics');
    });

    await t.test('query length no longer qualifies a search before it is shown', async () => {
      const ids = { logical: randomUUID(), journey: randomUUID(), tab: randomUUID(), execution: randomUUID(), resultSet: randomUUID() };
      logicalSearches.push(ids.logical);
      const now = new Date().toISOString();
      checked(await service.rpc('record_discovery_search_response', {
        _logical_search_id: ids.logical, _journey_id: ids.journey, _parent_logical_search_id: null,
        _user_id: member.id, _client_session_id: `remaining-${runId}`, _tab_session_id: ids.tab,
        _query_text: 'seller', _browse_category: null, _filter_state: {}, _canonical_sort: 'relevance',
        _change_reason: 'initial', _execution_id: ids.execution, _execution_number: 1,
        _search_version: 'discovery-context-v3', _execution_pass: 'related', _requested_at: now,
        _completed_at: now, _execution_status: 'completed', _latency_ms: 1,
        _eligible_candidate_count: 0, _total_match_count: 0, _execution_error_code: null,
        _result_set_id: ids.resultSet, _surface: 'remaining-test', _page_number: 1, _page_size: 24,
        _is_prefetched: false, _result_status: 'empty', _returned_count: 0,
        _result_error_code: null, _items: [],
      }));
      let search = checked(await service.from('logical_searches').select('qualified_at').eq('id', ids.logical).single());
      assert.equal(search.qualified_at, null);
      checked(await service.from('discovery_events').insert({
        event_id: randomUUID(), user_id: member.id, client_session_id: `remaining-${runId}`,
        tab_session_id: ids.tab, client_sequence: 1, event_type: 'result_set_shown',
        result_set_id: ids.resultSet, logical_search_id: ids.logical, client_occurred_at: now,
      }));
      search = checked(await service.from('logical_searches').select('qualified_at').eq('id', ids.logical).single());
      assert.ok(search.qualified_at);
    });

    await t.test('coach suggestions resolve durably from explicit member feedback', async () => {
      assert.equal((await call(`/api/coach-resource-suggestions?user_id=${member.id}&coaching_note_id=${note.id}`, member.token)).status, 403);
      const options = await json(await call(`/api/coach-resource-suggestions?user_id=${member.id}&coaching_note_id=${note.id}&q=${encodeURIComponent(runId)}`, coach.token));
      assert.equal(options.options.find((option) => option.id === resource.id)?.eligible, true);
      const added = await json(await call('/api/coach-resource-suggestions', coach.token, {
        operation: 'add', userId: member.id, coachingNoteId: note.id, resourceId: resource.id,
      }));
      const active = added.suggestions.find((suggestion) => suggestion.resourceId === resource.id && suggestion.active);
      assert.ok(active); suggestions.push(active.id);
      await json(await call('/api/discovery/preferences', member.token, { resourceId: resource.id, preference: 'finished' }));
      const stored = checked(await service.from('coach_resource_suggestions').select('member_resolution,member_resolved_at').eq('id', active.id).single());
      assert.equal(stored.member_resolution, 'finished');
      assert.ok(stored.member_resolved_at);
      const refreshed = await json(await call(`/api/coach-resource-suggestions?user_id=${member.id}&coaching_note_id=${note.id}&q=${encodeURIComponent(runId)}`, coach.token));
      assert.equal(refreshed.suggestions.find((suggestion) => suggestion.id === active.id)?.resolution, 'finished');
      assert.match(refreshed.options.find((option) => option.id === resource.id)?.reason ?? '', /already marked it finished/i);
    });
  } finally {
    for (const id of logicalSearches) await service.from('logical_searches').delete().eq('id', id);
    for (const id of suggestions) await service.from('coach_resource_suggestions').delete().eq('id', id);
    for (const id of notes) await service.from('coaching_notes_base').delete().eq('id', id);
    for (const id of resources) await service.from('resources').delete().eq('id', id);
    for (const id of users) await service.auth.admin.deleteUser(id);
  }
});
