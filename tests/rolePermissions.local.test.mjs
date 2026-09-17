import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

// Explicit local opt-in. Never load .env.local (it may point at production).
test('local role permissions through REST and admin APIs', {
  skip: process.env.ROLE_PERMISSIONS_LOCAL_HTTP_TEST !== '1', timeout: 120000,
}, async (t) => {
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const appUrl = process.env.DISCOVERY_LOCAL_APP_URL ?? 'http://127.0.0.1:3015';
  assert.equal(dbUrl, 'http://127.0.0.1:54321');
  assert.match(appUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  const service = createClient(dbUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(dbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const checked = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const denied = ({ error }) => assert.equal(error?.code, '42501', 'Expected database permission denial');
  const users = [], roleIds = [];
  const runId = randomUUID();
  async function counts() {
    const result = {};
    for (const table of ['roles', 'user_roles', 'profiles', 'user_merge_log']) {
      const response = await service.from(table).select('*', { head: true, count: 'exact' });
      checked(response);
      result[table] = response.count;
    }
    return result;
  }
  const baseline = await counts();
  const roles = new Map(checked(await service.from('roles').select('id,code')).map(({ id, code }) => [code, id]));
  for (const role of ['admin', 'user', 'ninety-day-user', 'assistant', 'legend', 'past_member']) {
    assert.ok(roles.has(role), `Missing ${role} role`);
  }
  async function actor(label, role = 'user') {
    const email = `role-http-${label}-${runId}@example.invalid`, password = `${randomUUID()}Aa!`;
    const { user } = checked(await service.auth.admin.createUser({ email, password, email_confirm: true }));
    users.push(user.id);
    checked(await service.from('profiles').upsert({ id: user.id, first_name: `Role fixture ${runId}`, last_name: label }));
    checked(await service.from('user_roles').insert({ user_id: user.id, role_id: roles.get(role) }));
    const cookies = new Map();
    const client = createServerClient(dbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
      },
    });
    checked(await client.auth.signInWithPassword({ email, password }));
    return { id: user.id, client, cookie: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') };
  }
  const call = (path, actor, body, method) => fetch(`${appUrl}${path}`, {
    method: method ?? (body ? 'POST' : 'GET'), redirect: 'manual',
    headers: { ...(actor ? { Cookie: actor.cookie() } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  async function json(response, status = 200) {
    assert.ok(response.headers.get('content-type')?.includes('application/json'), `Expected JSON, got HTTP ${response.status}`);
    const body = await response.json();
    assert.equal(response.status, status, body.error ?? `Expected HTTP ${status}`);
    return body;
  }
  async function hasRole(userId, code) {
    return checked(await service.from('user_roles').select('role_id').eq('user_id', userId).eq('role_id', roles.get(code))).length > 0;
  }
  try {
    const admin = await actor('admin', 'admin'), member = await actor('member'), target = await actor('target');
    const customRole = checked(await service.from('roles').insert({ code: `role-http-${runId}` }).select('id').single());
    roleIds.push(customRole.id);

    // Read-only proof that this app uses this exact local clone BEFORE any
    // mutating application call. A loopback app URL alone is insufficient.
    const probe = await json(await call(`/api/admin/users/${target.id}`, admin));
    assert.equal(probe.first_name, `Role fixture ${runId}`, 'App must see our local nonce profile');

    await t.test('anonymous/member cannot change roles directly or through admin routes', async () => {
      denied(await anon.from('user_roles').insert({ user_id: member.id, role_id: roles.get('admin') }));
      denied(await anon.from('roles').insert({ code: `role-http-anon-${runId}` }));
      denied(await member.client.from('user_roles').insert({ user_id: member.id, role_id: roles.get('admin') }));
      denied(await member.client.from('user_roles').upsert({ user_id: member.id, role_id: roles.get('admin') }));
      assert.deepEqual(checked(await member.client.from('user_roles').update({ role_id: roles.get('admin') })
        .eq('user_id', member.id).eq('role_id', roles.get('user')).select()), []);
      assert.deepEqual(checked(await member.client.from('user_roles').delete().eq('user_id', admin.id).select()), []);
      assert.deepEqual(checked(await member.client.from('roles').update({ code: `role-http-renamed-${runId}` })
        .eq('id', customRole.id).select()), []);
      assert.deepEqual(checked(await member.client.from('roles').delete().eq('id', customRole.id).select()), []);
      const own = checked(await member.client.from('user_roles').select('roles(code)').eq('user_id', member.id));
      assert.deepEqual(own.map((row) => row.roles.code), ['user'], 'Navigation can still read its own role join');
      assert.equal(await hasRole(member.id, 'admin'), false);
      assert.equal(await hasRole(admin.id, 'admin'), true);
      assert.ok([307, 401].includes((await call('/api/admin/assign-assistant-role', null, { user_id: target.id })).status));
      assert.equal((await call('/api/admin/assign-assistant-role', member, { user_id: target.id })).status, 403);
      assert.equal((await call(`/api/admin/users/${target.id}`, member, { is_legend: true }, 'PATCH')).status, 403);
    });

    await t.test('privileged account RPCs cannot bypass role protections', async () => {
      for (const client of [anon, member.client]) {
        for (const name of ['transfer_user_data', 'transfer_user_data_admin']) {
          denied(await client.rpc(name, { _source: admin.id, _dest: member.id, _options: { skip_admin_check: true, dry_run: false } }));
        }
        denied(await client.rpc('try_delete_user_db', { p_user_id: admin.id }));
      }
      assert.equal((await call('/api/admin/transfer-user-data', member, { source: admin.id, dest: member.id })).status, 403);
      checked(await member.client.auth.updateUser({ data: { role: 'admin', roles: ['admin'] } }));
      assert.equal(checked(await member.client.rpc('is_admin')), false, 'User-editable metadata is not authorization');
      assert.equal((await call(`/api/admin/users/${target.id}`, member)).status, 403);
      assert.equal(await hasRole(member.id, 'admin'), false);
      assert.equal(await hasRole(admin.id, 'admin'), true);
    });

    await t.test('admin assistant-role API supports idempotent assignment and removal', async () => {
      for (let i = 0; i < 2; i++) await json(await call('/api/admin/assign-assistant-role', admin, { user_id: target.id }));
      assert.equal(await hasRole(target.id, 'assistant'), true);
      await json(await call(`/api/admin/assign-assistant-role?user_id=${target.id}`, admin, null, 'DELETE'));
      assert.equal(await hasRole(target.id, 'assistant'), false);
    });

    await t.test('admin user editor changes legend and past-member roles and restores access', async () => {
      const enabled = await json(await call(`/api/admin/users/${target.id}`, admin, { is_legend: true, is_past_member: true }, 'PATCH'));
      assert.equal(enabled.is_legend, true); assert.equal(enabled.is_past_member, true);
      assert.equal(await hasRole(target.id, 'past_member'), true);
      const blocked = await call('/home', target);
      assert.equal(blocked.status, 307);
      assert.equal(new URL(blocked.headers.get('location'), appUrl).pathname, '/access-removed');
      const disabled = await json(await call(`/api/admin/users/${target.id}`, admin, { is_legend: false, is_past_member: false }, 'PATCH'));
      assert.equal(disabled.is_legend, false); assert.equal(disabled.is_past_member, false);
      assert.equal(await hasRole(target.id, 'past_member'), false);
      assert.ok(checked(await target.client.from('user_roles').select('roles(code)').eq('user_id', target.id))
        .every((row) => row.roles.code === 'user'));
    });

    await t.test('direct admin promotion and revocation take effect without signing in again', async () => {
      checked(await admin.client.from('user_roles').insert({ user_id: target.id, role_id: roles.get('admin') }));
      assert.equal(checked(await target.client.rpc('is_admin')), true);
      await json(await call(`/api/admin/users/${member.id}`, target));
      checked(await admin.client.from('user_roles').delete().eq('user_id', target.id).eq('role_id', roles.get('admin')));
      assert.equal(checked(await target.client.rpc('is_admin')), false);
      assert.equal((await call(`/api/admin/users/${member.id}`, target)).status, 403);
      denied(await target.client.from('user_roles').insert({ user_id: target.id, role_id: roles.get('admin') }));
    });

    await t.test('admin-guarded account transfer can still perform a dry run', async () => {
      const result = await json(await call('/api/admin/transfer-user-data', admin, { source: target.id, dest: member.id, options: { dry_run: true } }));
      assert.equal(result.dry_run, true);
      assert.equal(result.source, target.id); assert.equal(result.dest, member.id);
      assert.equal(await hasRole(member.id, 'admin'), false);
    });
  } finally {
    // Only IDs created in this invocation, never real accounts or broad resets.
    // Even dry-run transfers create a log row; remove that synthetic row too.
    if (users.length) checked(await service.from('user_merge_log').delete().in('source_user_id', users).in('dest_user_id', users));
    for (const id of users) checked(await service.auth.admin.deleteUser(id));
    if (roleIds.length) checked(await service.from('roles').delete().in('id', roleIds));
    assert.deepEqual(await counts(), baseline, 'Synthetic accounts, roles and logs must all be cleaned up');
  }
});
