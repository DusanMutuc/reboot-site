import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

test('default-off member discovery preserves legacy search and hides new surfaces', {
  skip: process.env.MEMBER_DISCOVERY_FLAG_LOCAL_HTTP_TEST !== '1',
  timeout: 120000,
}, async () => {
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const appUrl = process.env.DISCOVERY_LOCAL_APP_URL ?? 'http://127.0.0.1:3015';
  assert.equal(dbUrl, 'http://127.0.0.1:54321');
  assert.match(appUrl, /^http:\/\/127\.0\.0\.1:\d+$/);

  const service = createClient(dbUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const checked = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  const runId = randomUUID();
  const email = `discovery-off-${runId}@example.invalid`;
  const password = `${randomUUID()}Aa!`;
  let userId = null;
  let resourceId = null;

  try {
    const created = checked(await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }));
    userId = created.user.id;
    checked(await service.from('profiles').upsert({
      id: userId,
      first_name: 'Discovery flag',
      last_name: 'Fixture',
    }));

    const resource = checked(await service.from('resources').insert({
      title: `Legacy boundary ${runId}`,
      type: 'pdf',
      url: `https://example.invalid/${runId}`,
      state: 'published',
      is_discoverable: true,
    }).select('id').single());
    resourceId = resource.id;

    const cookies = new Map();
    const member = createServerClient(dbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
      },
    });
    checked(await member.auth.signInWithPassword({ email, password }));
    const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const call = (path, body) => fetch(`${appUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      redirect: 'manual',
      headers: { Cookie: cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });

    const beforeResult = await service.from('logical_searches').select('id', {
      count: 'exact',
      head: true,
    });
    if (beforeResult.error) throw new Error(beforeResult.error.message);
    const before = beforeResult.count;
    const legacy = await call('/api/home/search', { query: `Legacy boundary ${runId}` });
    assert.equal(legacy.status, 200);
    const payload = await legacy.json();
    assert.ok(payload.items.some((item) => item.title === `Legacy boundary ${runId}`));

    assert.equal((await call('/api/discovery/catalogue', { query: runId })).status, 404);
    assert.equal((await call('/api/discovery/events', { eventType: 'discovery_opened' })).status, 404);
    assert.equal((await call('/api/discovery/preferences', {
      resourceId,
      preference: 'finished',
    })).status, 404);
    assert.equal((await call('/discover')).status, 404);

    const adminRole = checked(await service.from('roles').select('id').eq('code', 'admin').single());
    checked(await service.from('user_roles').insert({ user_id: userId, role_id: adminRole.id }));
    const guide = await call('/api/admin/discovery/guide');
    assert.equal(guide.status, 200, 'the admin guide remains available while member discovery is off');
    assert.match(guide.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await guide.text(), /How to fill each field/);

    const afterResult = await service.from('logical_searches').select('id', {
      count: 'exact',
      head: true,
    });
    if (afterResult.error) throw new Error(afterResult.error.message);
    const after = afterResult.count;
    assert.equal(after, before, 'legacy search must not write new discovery analytics');
  } finally {
    if (resourceId) await service.from('resources').delete().eq('id', resourceId);
    if (userId) {
      await service.from('profiles').delete().eq('id', userId);
      await service.auth.admin.deleteUser(userId);
    }
  }
});
