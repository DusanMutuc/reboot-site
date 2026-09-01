import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

// Explicit local opt-in. Never load .env.local because it may point at production.
test('local 90-day lifecycle stays isolated from ordinary members', {
  skip: process.env.NINETY_DAY_LOCAL_HTTP_TEST !== '1',
  timeout: 120000,
}, async () => {
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const appUrl = process.env.NINETY_DAY_LOCAL_APP_URL ?? 'http://127.0.0.1:3016';
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
  const createdUserIds = [];
  let cycleId = null;

  async function sessionActor(email, password) {
    const cookies = new Map();
    const client = createServerClient(dbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
      },
    });
    checked(await client.auth.signInWithPassword({ email, password }));
    return { cookie: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') };
  }

  function call(path, actor, body, method) {
    return fetch(`${appUrl}${path}`, {
      method: method ?? (body ? 'POST' : 'GET'),
      redirect: 'manual',
      headers: {
        ...(actor ? { Cookie: actor.cookie() } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  function follow(path, actor) {
    return fetch(`${appUrl}${path}`, {
      redirect: 'follow',
      headers: { Cookie: actor.cookie() },
    });
  }

  async function json(response, expectedStatus = 200) {
    const body = await response.json();
    assert.equal(response.status, expectedStatus, body.error ?? `Expected HTTP ${expectedStatus}`);
    return body;
  }

  try {
    const roles = new Map(
      checked(await service.from('roles').select('id,code')).map(({ id, code }) => [code, id]),
    );
    assert.ok(roles.has('admin'));
    assert.ok(roles.has('user'));
    assert.ok(roles.has('ninety-day-user'));

    const adminEmail = `ninety-admin-${runId}@example.invalid`;
    const adminPassword = `${randomUUID()}Aa!`;
    const { user: adminUser } = checked(await service.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    }));
    createdUserIds.push(adminUser.id);
    checked(await service.from('profiles').insert({ id: adminUser.id, first_name: '90-day test admin' }));
    checked(await service.from('user_roles').insert({ user_id: adminUser.id, role_id: roles.get('admin') }));
    const admin = await sessionActor(adminEmail, adminPassword);

    const libraryRoot = checked(await service
      .from('content_nodes')
      .select('id')
      .eq('node_type', 'collection')
      .eq('slug', 'library')
      .single());
    const rootLinks = checked(await service
      .from('node_children')
      .select('child_id,position')
      .eq('parent_id', libraryRoot.id)
      .order('position'));
    const rootNodes = checked(await service
      .from('content_nodes')
      .select('id,slug,state,node_type')
      .in('id', rootLinks.map(({ child_id }) => child_id)));
    const rootNodeMap = new Map(rootNodes.map((node) => [node.id, node]));
    const systems = rootLinks
      .map(({ child_id }) => rootNodeMap.get(child_id))
      .filter((node) => node?.state === 'published' && node.slug && ['lesson', 'chapter', 'playlist'].includes(node.node_type))
      .slice(0, 8);
    assert.equal(systems.length, 8, 'Local fixture needs eight published system nodes');

    const startsOn = new Date().toISOString().slice(0, 10);
    const end = new Date();
    end.setUTCDate(end.getUTCDate() + 89);
    const cycle = checked(await service
      .from('ninety_day_cycles')
      .insert({
        name: `HTTP lifecycle ${runId}`,
        starts_on: startsOn,
        ends_on: end.toISOString().slice(0, 10),
        timezone: 'America/Edmonton',
        status: 'draft',
        created_by: adminUser.id,
        updated_by: adminUser.id,
      })
      .select('id')
      .single());
    cycleId = cycle.id;

    checked(await service.rpc('configure_ninety_day_cycle', {
      p_cycle_id: cycleId,
      p_name: `HTTP lifecycle ${runId}`,
      p_starts_on: startsOn,
      p_timezone: 'America/Edmonton',
      p_status: 'active',
      p_system_node_ids: systems.map(({ id }) => id),
      p_active_system_node_id: systems[0].id,
      p_actor_id: adminUser.id,
    }));

    await json(await call('/api/admin/ninety-day', admin, {
      action: 'create-meeting',
      cycle_id: cycleId,
      title: 'HTTP fixture group call',
      starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      ends_at: new Date(Date.now() + 90_000_000).toISOString(),
      join_url: 'https://example.invalid/fixture-call',
    }));

    const programmeEmail = `ninety-user-${runId}@example.invalid`;
    const onboarded = await json(await call('/api/admin/create-user', admin, {
      email: programmeEmail,
      first_name: 'Ninety',
      last_name: 'Day HTTP',
      role: 'ninety-day-user',
      ninety_day_cycle_id: cycleId,
    }));
    createdUserIds.push(onboarded.user_id);
    checked(await service.auth.admin.updateUserById(onboarded.user_id, {
      app_metadata: { must_reset_password: false },
    }));

    const ninetyDayDirectory = await json(await call(
      `/api/admin/users?membership=ninety-day&query=${encodeURIComponent(programmeEmail)}`,
      admin,
    ));
    assert.equal(ninetyDayDirectory.total, 1);
    assert.equal(ninetyDayDirectory.items[0].id, onboarded.user_id);
    assert.equal(ninetyDayDirectory.items[0].is_ninety_day_user, true);

    const programmeUser = await sessionActor(programmeEmail, 'reboot');

    const programmeRoot = await follow('/', programmeUser);
    assert.equal(programmeRoot.status, 200);
    assert.equal(new URL(programmeRoot.url).pathname, '/home/ninety-day');
    const programmeHome = await call('/home/ninety-day', programmeUser);
    assert.equal(programmeHome.status, 200);
    assert.match(await programmeHome.text(), /Your 90-day library/);
    assert.equal((await call('/tracker', programmeUser)).status, 200);

    const courses = await json(await call('/api/courses', programmeUser));
    assert.deepEqual(courses.courses.map((course) => course.slug), ['set-your-compass']);
    const library = await json(await call('/api/library/collection?scope=main', programmeUser));
    assert.deepEqual(library.items.map((item) => item.child_id), systems.map((system) => system.id));

    const ordinaryEmail = `ordinary-user-${runId}@example.invalid`;
    const ordinary = await json(await call('/api/admin/create-user', admin, {
      email: ordinaryEmail,
      first_name: 'Ordinary',
      last_name: 'Member',
      role: 'user',
    }));
    createdUserIds.push(ordinary.user_id);
    checked(await service.auth.admin.updateUserById(ordinary.user_id, {
      app_metadata: { must_reset_password: false },
    }));
    const ordinaryUser = await sessionActor(ordinaryEmail, 'reboot');
    const ordinaryRoot = await follow('/', ordinaryUser);
    assert.equal(ordinaryRoot.status, 200);
    assert.equal(new URL(ordinaryRoot.url).pathname, '/dashboard');
    assert.equal((await call('/dashboard', ordinaryUser)).status, 200);
    const ordinaryNinetyPage = await follow('/home/ninety-day', ordinaryUser);
    assert.equal(ordinaryNinetyPage.status, 200);
    assert.equal(new URL(ordinaryNinetyPage.url).pathname, '/dashboard');

    const promoted = await json(await call(`/api/admin/users/${onboarded.user_id}/promote`, admin, {}));
    assert.equal(promoted.changed, true);
    const promotedRoles = checked(await service
      .from('user_roles')
      .select('roles(code)')
      .eq('user_id', onboarded.user_id));
    assert.deepEqual(promotedRoles.map((row) => row.roles.code), ['user']);
    const history = checked(await service
      .from('ninety_day_cycle_users')
      .select('ended_at,outcome')
      .eq('user_id', onboarded.user_id)
      .single());
    assert.ok(history.ended_at);
    assert.equal(history.outcome, 'promoted');
    const promotedNinetyDayDirectory = await json(await call(
      `/api/admin/users?membership=ninety-day&query=${encodeURIComponent(programmeEmail)}`,
      admin,
    ));
    assert.equal(promotedNinetyDayDirectory.total, 0);
    const promotedMemberDirectory = await json(await call(
      `/api/admin/users?membership=current&query=${encodeURIComponent(programmeEmail)}`,
      admin,
    ));
    assert.equal(promotedMemberDirectory.total, 1);
    assert.equal(promotedMemberDirectory.items[0].is_ninety_day_user, false);
    const promotedHome = await follow('/home/ninety-day', programmeUser);
    assert.equal(promotedHome.status, 200);
    assert.equal(new URL(promotedHome.url).pathname, '/dashboard');
  } finally {
    for (const userId of createdUserIds.reverse()) {
      await service.auth.admin.deleteUser(userId);
    }
    if (cycleId) await service.from('ninety_day_cycles').delete().eq('id', cycleId);
  }
});
