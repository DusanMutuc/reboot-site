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

function loadRoutes(deniedStatus) {
  const calls = { clients: 0, queries: [], guards: [], invalidations: 0 };
  const denied = deniedStatus
    ? NextResponse.json({ error: 'Access denied' }, { status: deniedStatus })
    : null;
  const client = {
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
    vm.runInNewContext(source, { exports, console, require: (name) => imports[name] ?? require(name) });
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
