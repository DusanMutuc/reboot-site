import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const root = fileURLToPath(new URL('../', import.meta.url));
const target = '11111111-1111-4111-8111-111111111111';
const active = { merged_at: null, merged_into_user_id: null };
const archived = { merged_at: '2026-10-08T12:00:00Z', merged_into_user_id: '22222222-2222-4222-8222-222222222222' };

function fixture({ lifecycle = active, lookupError = null, isAdmin = true, incomingMerges = 0 } = {}) {
  const calls = [];
  const authUser = { id: target, email: 'member@example.invalid' };
  const record = (operation, result) => async (...args) => { calls.push({ operation, args }); return result; };
  const client = {
    auth: {
      resetPasswordForEmail: record('send-reset', { error: null }),
      admin: {
        getUserById: record('get-auth-user', { data: { user: authUser }, error: null }),
        updateUserById: record('update-auth', { error: null }),
        deleteUser: record('delete-auth', { error: null }),
        createUser: record('create-auth', { data: {}, error: { message: 'User already registered' } }),
        listUsers: record('list-auth-users', { data: { users: [authUser] }, error: null }),
      },
    },
    from(table) {
      calls.push({ operation: 'query', table });
      const query = {
        select() { return query; }, eq() { return query; },
        upsert: record(`upsert-${table}`, { error: null }),
        async maybeSingle() {
          if (table === 'profiles') return { data: lifecycle, error: lookupError };
          if (table === 'roles') return { data: { id: 1 }, error: null };
          throw new Error(`Unexpected table: ${table}`);
        },
        then(resolve, reject) {
          assert.equal(table, 'account_merges');
          return Promise.resolve({ count: incomingMerges, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    rpc: record('rpc', { data: null, error: null }),
  };
  const imports = {
    '@/lib/supabaseAdmin': { getAdminClient: () => client },
    '@/lib/requireAdmin': { requireAdmin: async () => isAdmin ? { ok: true, user: { id: 'admin' } }
      : { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } },
    '@/lib/adminUserDirectory': { invalidateAdminUserDirectory() {} },
  };
  const modules = new Map();
  function load(relativePath) {
    const filename = path.resolve(root, relativePath);
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = (name) => {
      if (name in imports) return imports[name];
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`));
      return require(name);
    };
    vm.runInNewContext(`(function(exports,require){${code}\n})`, {
      console: { log() {}, warn() {}, error() {} }, Buffer,
      process: { env: { GHL_ASSISTANT_WEBHOOK_SECRET: 'fixture-secret' } },
    }, { filename })(exports, localRequire);
    return exports;
  }
  return { client, calls, load };
}

test('admin target guard allows current accounts and rejects archived targets with destination link', async () => {
  for (const lifecycle of [active, archived]) {
    const env = fixture({ lifecycle });
    const response = await env.load('src/lib/adminAccountGuard.ts').archivedAccountWriteResponse(env.client, target);
    if (lifecycle === active) assert.equal(response, null);
    else {
      assert.equal(response.status, 409);
      assert.equal((await response.json()).merged_into_user_id, archived.merged_into_user_id);
    }
  }
});

test('admin target guard fails closed for missing profile, missing migration or unavailable database', async () => {
  for (const options of [{ lifecycle: null }, { lifecycle: {} }, { lookupError: { message: 'unavailable' } }]) {
    const env = fixture(options);
    const response = await env.load('src/lib/adminAccountGuard.ts').archivedAccountWriteResponse(env.client, target);
    assert.equal(response.status, 503);
  }
});

const routes = [
  ['reset password', 'src/app/api/admin/users/[userId]/reset-password/route.ts', 'POST'],
  ['edit profile/Auth metadata', 'src/app/api/admin/users/[userId]/route.ts', 'PATCH'],
  ['delete Auth identity', 'src/app/api/admin/users/[userId]/route.ts', 'DELETE'],
];
for (const [label, path, method] of routes) {
  test(`${label} denies archived targets and unknown account status before any Auth operation`, async () => {
    for (const [options, status] of [[{ lifecycle: archived }, 409], [{ lookupError: { message: 'offline' } }, 503]]) {
      const env = fixture(options);
      const response = await env.load(path)[method](new NextRequest(`https://hub.example.invalid/api/admin/users/${target}`, {
        method, ...(method === 'PATCH' ? { body: JSON.stringify({ phone: '+15555550100', is_past_member: false }) } : {}),
      }), { params: Promise.resolve({ userId: target }) });
      assert.equal(response.status, status);
      assert.deepEqual(env.calls.map((call) => call.operation), ['query']);
      assert.equal(env.calls[0].table, 'profiles');
    }
  });
}

test('password reset for a current member still sends to the verified Auth email', async () => {
  const env = fixture();
  const response = await env.load(routes[0][1]).POST(new NextRequest('https://hub.example.invalid/api/admin/reset', { method: 'POST' }), {
    params: Promise.resolve({ userId: target }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(env.calls.map((call) => call.operation), ['query', 'get-auth-user', 'send-reset']);
  assert.equal(env.calls[2].args[0], 'member@example.invalid');
});

test('canonical destination with retained merge history cannot be deleted', async () => {
  const env = fixture({ incomingMerges: 1 });
  const response = await env.load(routes[2][1]).DELETE(new NextRequest('https://hub.example.invalid/api/admin/delete', { method: 'DELETE' }), {
    params: Promise.resolve({ userId: target }),
  });
  assert.equal(response.status, 409);
  assert.equal(env.calls.some((call) => call.operation === 'delete-auth' || call.operation === 'rpc'), false);
});

test('GHL duplicate-email provisioning cannot reactivate or modify an archived Auth identity', async () => {
  const env = fixture({ lifecycle: archived });
  const response = await env.load('src/app/api/ghl/create-assistant/route.ts').POST(new NextRequest('https://hub.example.invalid/api/ghl/create-assistant', {
    method: 'POST', headers: { 'x-ghl-secret': 'fixture-secret' },
    body: JSON.stringify({ email: 'member@example.invalid', tags: ['assistant workroom'], first_name: 'Old' }),
  }));
  assert.equal(response.status, 409);
  assert.deepEqual(env.calls.map((call) => call.operation), ['query', 'create-auth', 'list-auth-users', 'query']);
  assert.equal(env.calls.at(-1).table, 'profiles');
});

test('admin authorization precedes target-status access and Auth writes', async () => {
  const env = fixture({ isAdmin: false });
  const response = await env.load(routes[0][1]).POST(new NextRequest('https://hub.example.invalid/api/admin/reset', { method: 'POST' }), {
    params: Promise.resolve({ userId: target }),
  });
  assert.equal(response.status, 403);
  assert.equal(env.calls.length, 0);
});
