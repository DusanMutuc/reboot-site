import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const partnership = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Test partnership',
  shared_kpis: true,
  shared_attendance: false,
  shared_notes: false,
  is_active: true,
  created_at: '2026-10-06T00:00:00Z',
};

function loadRoutes(deniedStatus, rpcError = null) {
  const calls = { clients: 0, queries: [], guards: [], invalidations: 0, rpcs: [] };
  const denied = deniedStatus
    ? NextResponse.json({ error: 'Access denied' }, { status: deniedStatus })
    : null;
  const client = {
    async rpc(name, args) {
      calls.rpcs.push({ name, args: JSON.parse(JSON.stringify(args)) });
      return { data: { ...partnership, members: [] }, error: rpcError };
    },
    from(table) {
      calls.queries.push(table);
      const query = {
        select() { return query; },
        insert() { return query; },
        update() { return query; },
        delete() { return query; },
        eq() { return query; },
        in() { return query; },
        order() { return query; },
        async single() { return { data: partnership, error: null }; },
        async maybeSingle() { return { data: { id: partnership.id }, error: null }; },
        then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
      };
      return query;
    },
  };
  const imports = {
    '@/lib/requireAdmin': {
      async requireAdmin(request) {
        calls.guards.push(request);
        return denied ? { ok: false, res: denied } : { ok: true, user: { id: 'admin' } };
      },
    },
    '@/lib/supabaseAdmin': { getAdminClient() { calls.clients += 1; return client; } },
    '@/lib/adminUserDirectory': { invalidateAdminUserDirectory() { calls.invalidations += 1; } },
  };
  function load(path) {
    const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const exports = {};
    vm.runInNewContext(source, { exports, console, require: (name) => name === '@/lib/partnershipMutation'
      ? load('../src/lib/partnershipMutation.ts') : imports[name] ?? require(name) });
    return exports;
  }
  return {
    ...load('../src/app/api/admin/partnerships/route.ts'),
    ...load('../src/app/api/admin/partnerships/[partnershipId]/route.ts'),
    calls,
    denied,
  };
}

function requestFor(method) {
  return new NextRequest(`https://reboot.example/api/admin/partnerships/${partnership.id}`, {
    method,
    ...(method === 'POST' || method === 'PATCH'
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: partnership.name }) }
      : {}),
  });
}

for (const status of [401, 403, 500]) {
  test(`all partnership operations stop on an admin guard ${status} response`, async () => {
    const routes = loadRoutes(status);
    assert.equal(routes.calls.clients, 0, 'loading a route must not construct a privileged client');
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const request = requestFor(method);
      const response = await routes[method](request, { params: Promise.resolve({ partnershipId: partnership.id }) });
      assert.equal(response, routes.denied, method);
      assert.equal(routes.calls.guards.at(-1), request, 'guard must receive request cookies');
    }
    assert.equal(routes.calls.clients, 0);
    assert.deepEqual(routes.calls.queries, []);
    assert.deepEqual(routes.calls.rpcs, []);
    assert.equal(routes.calls.invalidations, 0);
  });
}

test('authorized admins retain access to all partnership operations', async () => {
  const routes = loadRoutes();
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const request = requestFor(method);
    const response = await routes[method](request, { params: Promise.resolve({ partnershipId: partnership.id }) });
    assert.equal(response.status, method === 'POST' ? 201 : 200, method);
    assert.equal(routes.calls.guards.at(-1), request);
  }
  assert.equal(routes.calls.clients, 4);
  assert.equal(routes.calls.invalidations, 3);
  assert.ok(routes.calls.queries.length > 0);
});

test('create and edit perform one atomic RPC and no separate database writes or hydration', async () => {
  for (const method of ['POST', 'PATCH']) {
    const routes = loadRoutes();
    const changes = { name: 'Revised', shared_notes: true, is_active: true, user_ids: [partnership.id] };
    const request = new NextRequest('https://reboot.example/api/admin/partnerships', {
      method, body: JSON.stringify(changes), headers: { 'content-type': 'application/json' },
    });
    const result = await routes[method](request, { params: Promise.resolve({ partnershipId: partnership.id }) });
    assert.equal(result.status, method === 'POST' ? 201 : 200);
    assert.deepEqual(routes.calls.rpcs, [{ name: 'save_partnership_admin', args: {
      _id: method === 'POST' ? null : partnership.id, _changes: changes,
    } }]);
    assert.deepEqual(routes.calls.queries, []);
    assert.equal(routes.calls.invalidations, 1);
    assert.deepEqual(await result.json(), { ...partnership, members: [] });
  }
});

for (const [code, status] of [['23514',400], ['23503',400], ['42501',409], ['P0002',404], ['40001',409], ['XX000',500]]) {
  test(`partnership mutation failure ${code} returns ${status} without extra writes or cache invalidation`, async () => {
    for (const method of ['POST', 'PATCH']) {
      const routes = loadRoutes(undefined, { code, message: 'rejected' });
      const response = await routes[method](requestFor(method), { params: Promise.resolve({ partnershipId: partnership.id }) });
      assert.equal(response.status, status);
      assert.equal(routes.calls.rpcs.length, 1);
      assert.deepEqual(routes.calls.queries, []);
      assert.equal(routes.calls.invalidations, 0);
    }
  });
}

test('invalid partnership payloads are rejected before mutation and omitted members stay omitted', async () => {
  for (const changes of [null, [], { user_ids: 'invalid' }, { user_ids: ['not-a-uuid'] }, { shared_kpis: 'false' }, { surprise: true }]) {
    const routes = loadRoutes();
    const request = new NextRequest('https://reboot.example/api/admin/partnerships', {
      method: 'PATCH', body: JSON.stringify(changes), headers: { 'content-type': 'application/json' },
    });
    assert.equal((await routes.PATCH(request, { params: Promise.resolve({ partnershipId: partnership.id }) })).status, 400);
    assert.deepEqual(routes.calls.rpcs, []);
    assert.equal(routes.calls.invalidations, 0);
  }
  const routes = loadRoutes();
  await routes.PATCH(requestFor('PATCH'), { params: Promise.resolve({ partnershipId: partnership.id }) });
  assert.equal(Object.hasOwn(routes.calls.rpcs[0].args._changes, 'user_ids'), false);
});
