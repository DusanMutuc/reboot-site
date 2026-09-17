import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

// Explicit local opt-in. Never load .env.local (it may point at production).
test('local 90-day onboarding, routing, admin, and promotion lifecycle', {
  skip: process.env.NINETY_DAY_LOCAL_HTTP_TEST !== '1',
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
  const createdUserIds = [];
  let cycleId = null;

  async function counts() {
    const result = {};
    for (const table of [
      'profiles',
      'user_roles',
      'ninety_day_cycles',
      'ninety_day_cycle_systems',
      'ninety_day_cycle_users',
      'ninety_day_cycle_meetings',
    ]) {
      const response = await service.from(table).select('*', { head: true, count: 'exact' });
      checked(response);
      result[table] = response.count;
    }
    return result;
  }

  async function sessionActor(email, password) {
    const cookies = new Map();
    const client = createServerClient(dbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
      },
    });
    checked(await client.auth.signInWithPassword({ email, password }));
    return {
      client,
      cookie: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    };
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

  async function json(response, expectedStatus = 200) {
    const body = await response.json();
    assert.equal(response.status, expectedStatus, body.error ?? `Expected HTTP ${expectedStatus}`);
    return body;
  }

  const baseline = await counts();
  try {
    const roles = new Map(
      checked(await service.from('roles').select('id,code')).map(({ id, code }) => [code, id]),
    );
    assert.ok(roles.has('admin'));
    assert.ok(roles.has('user'));
    assert.ok(roles.has('ninety-day-user'));

    const adminEmail = `ninety-day-admin-${runId}@example.invalid`;
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
    const systemNodes = rootLinks
      .map(({ child_id }) => rootNodeMap.get(child_id))
      .filter((node) => node?.state === 'published'
        && node.slug
        && ['lesson', 'chapter', 'playlist'].includes(node.node_type))
      .slice(0, 8);
    assert.equal(systemNodes.length, 8, 'Local fixture needs eight published system nodes');

    const today = new Date();
    const startsOn = today.toISOString().slice(0, 10);
    const ends = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 89));
    const cycle = checked(await service
      .from('ninety_day_cycles')
      .insert({
        name: `HTTP lifecycle ${runId}`,
        starts_on: startsOn,
        ends_on: ends.toISOString().slice(0, 10),
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
      p_system_node_ids: systemNodes.map(({ id }) => id),
      p_active_system_node_id: systemNodes[0].id,
      p_actor_id: adminUser.id,
    }));

    const meeting = await json(await call('/api/admin/ninety-day', admin, {
      action: 'create-meeting',
      cycle_id: cycleId,
      title: 'HTTP fixture group call',
      starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      ends_at: new Date(Date.now() + 90_000_000).toISOString(),
      join_url: 'https://example.invalid/fixture-call',
    }));
    assert.ok(meeting.meeting_id);

    const programmeEmail = `ninety-day-user-${runId}@example.invalid`;
    const onboarded = await json(await call('/api/admin/create-user', admin, {
      email: programmeEmail,
      first_name: 'Ninety',
      last_name: 'Day HTTP',
      role: 'ninety-day-user',
      ninety_day_cycle_id: cycleId,
    }));
    createdUserIds.push(onboarded.user_id);

    const assignments = checked(await service
      .from('user_roles')
      .select('roles(code)')
      .eq('user_id', onboarded.user_id));
    assert.deepEqual(assignments.map((row) => row.roles.code), ['ninety-day-user']);
    assert.equal(checked(await service
      .from('ninety_day_cycle_users')
      .select('cycle_id')
      .eq('user_id', onboarded.user_id)
      .is('ended_at', null)).length, 1);

    checked(await service.auth.admin.updateUserById(onboarded.user_id, {
      app_metadata: { must_reset_password: false },
    }));
    const programmeUser = await sessionActor(programmeEmail, 'reboot');

    const homeResponse = await call('/home', programmeUser);
    assert.equal(homeResponse.status, 307);
    assert.equal(new URL(homeResponse.headers.get('location')).pathname, '/home/ninety-day');

    const ninetyDayHome = await call('/home/ninety-day', programmeUser);
    assert.equal(ninetyDayHome.status, 200);
    assert.match(await ninetyDayHome.text(), /Your 90-day library/);

    const courses = await json(await call('/api/courses', programmeUser));
    assert.deepEqual(courses.courses.map((course) => course.slug), ['set-your-compass']);

    const library = await json(await call('/api/library/collection?scope=main', programmeUser));
    assert.deepEqual(
      library.items.map((item) => item.child_id),
      systemNodes.map((node) => node.id),
      'The library API returns the cycle\'s eight systems and nothing else',
    );

    await json(await call('/api/discovery', programmeUser), 403);

    const adminCyclePayload = await json(await call('/api/admin/ninety-day', admin));
    const adminCycle = adminCyclePayload.cycles.find((item) => item.id === cycleId);
    assert.equal(adminCycle.systems.length, 8);
    assert.equal(adminCycle.active_system_node_id, systemNodes[0].id);
    assert.equal(adminCycle.meetings.length, 1);
    assert.equal(adminCycle.members.some((member) => member.user_id === onboarded.user_id), true);

    const promoted = await json(await call(
      `/api/admin/users/${onboarded.user_id}/promote`,
      admin,
      {},
    ));
    assert.equal(promoted.changed, true);
    assert.equal(promoted.is_current_member, true);
    assert.equal(promoted.is_ninety_day_user, false);

    const promotedAssignments = checked(await service
      .from('user_roles')
      .select('roles(code)')
      .eq('user_id', onboarded.user_id));
    assert.deepEqual(promotedAssignments.map((row) => row.roles.code), ['user']);
    const history = checked(await service
      .from('ninety_day_cycle_users')
      .select('ended_at,outcome')
      .eq('user_id', onboarded.user_id)
      .single());
    assert.ok(history.ended_at);
    assert.equal(history.outcome, 'promoted');

    const oldHome = await call('/home/ninety-day', programmeUser);
    assert.equal(oldHome.status, 307);
    assert.equal(new URL(oldHome.headers.get('location')).pathname, '/home');
  } finally {
    for (const userId of createdUserIds.reverse()) {
      await service.auth.admin.deleteUser(userId);
    }
    if (cycleId) {
      checked(await service.from('ninety_day_cycles').delete().eq('id', cycleId));
    }
    assert.deepEqual(await counts(), baseline, 'HTTP fixtures must be fully cleaned up');
  }
});
