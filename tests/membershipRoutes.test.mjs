import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as userRoles from '../src/lib/userRoles.ts';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
function loadModule(path, imports) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, process, console, require: (name) => imports[name] ?? require(name) });
  return exports;
}

function loadMiddleware(codes, context, authenticated = true) {
  const client = {
    auth: { getSession: async () => ({ data: { session: authenticated ? { user: { id: 'fixture', app_metadata: {} } } : null } }) },
    from: () => ({ select: () => ({ eq: async () => ({ data: codes.map((code) => ({ roles: { code } })), error: null }) }) }),
    rpc: async () => ({ data: context, error: null }),
  };
  return loadModule('../src/middleware.ts', {
    '@supabase/ssr': { createServerClient: () => client },
    '@/lib/userRoles': userRoles,
  }).middleware;
}
const context = { default_home: 'ninety-day', has_active_ninety_day_enrollment: true };
const dual = ['user', 'ninety-day-user'];

test('middleware allows both dashboards regardless of the dual member default', async () => {
  for (const default_home of ['member', 'ninety-day']) {
    const middleware = loadMiddleware(dual, { ...context, default_home });
    for (const path of ['/dashboard', '/home/ninety-day', '/courses', '/library']) {
      assert.equal((await middleware(new NextRequest(`https://reboot.example${path}`))).status, 200);
    }
  }
});

test('inactive dual enrollment cannot open the programme dashboard', async () => {
  const middleware = loadMiddleware(dual, { ...context, has_active_ninety_day_enrollment: false });
  const response = await middleware(new NextRequest('https://reboot.example/home/ninety-day'));
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get('location')).pathname, '/dashboard');
});

test('programme-only, removed-access and unauthenticated restrictions remain enforced', async () => {
  const restricted = await loadMiddleware(['ninety-day-user'])(new NextRequest('https://reboot.example/dashboard'));
  assert.equal(new URL(restricted.headers.get('location')).pathname, '/home/ninety-day');
  const removed = await loadMiddleware([...dual, 'past_member'], context)(new NextRequest('https://reboot.example/home/ninety-day'));
  assert.equal(new URL(removed.headers.get('location')).pathname, '/access-removed');
  const noSession = await loadMiddleware([], undefined, false)(new NextRequest('https://reboot.example/home/ninety-day'));
  assert.equal(new URL(noSession.headers.get('location')).pathname, '/login');
});

const memberId = 'f0fcb5dc-d435-456c-9319-7e17e1fbb645';
function adminApi(isAdmin) {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: true, error: null }; } };
  const api = loadModule('../src/app/api/admin/ninety-day/route.ts', {
    '@/lib/requireAdmin': { requireAdmin: async () => isAdmin ? { ok: true, user: { id: 'admin' } } : { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } },
    '@/lib/supabaseAdmin': { getAdminClient: () => client },
    '@/lib/adminUserDirectory': { invalidateAdminUserDirectory() {} },
  });
  return { post: (body) => api.POST(new NextRequest('https://reboot.example/api/admin/ninety-day', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })), calls };
}

test('programme mutations reject non-admin callers before any RPC', async () => {
  const api = adminApi(false);
  for (const action of ['enroll-user', 'grant-full-membership', 'end-enrollment', 'set-default-home']) {
    assert.equal((await api.post({ action, user_id: memberId, cycle_id: 1, default_home: 'ninety-day' })).status, 403);
  }
  assert.equal(api.calls.length, 0);
});

test('admin enrollment and default home are submitted as one atomic operation', async () => {
  const api = adminApi(true);
  assert.equal((await api.post({ action: 'enroll-user', user_id: memberId, cycle_id: 12, make_default: true })).status, 200);
  assert.equal(api.calls[0].name, 'admin_enroll_ninety_day_user');
  assert.equal(api.calls[0].args.p_make_default, true);
  assert.equal(api.calls[0].args.p_cycle_id, 12);
});

test('granting access and ending enrollment call distinct operations', async () => {
  const api = adminApi(true);
  assert.equal((await api.post({ action: 'grant-full-membership', user_id: memberId })).status, 200);
  assert.equal((await api.post({ action: 'end-enrollment', user_id: memberId, cycle_id: 12 })).status, 200);
  assert.deepEqual(api.calls.map((call) => call.name), ['grant_full_membership', 'end_ninety_day_enrollment']);
});

test('invalid default choices, users and cycle IDs cannot reach mutations', async () => {
  const api = adminApi(true);
  for (const body of [
    { action: 'set-default-home', user_id: memberId, default_home: 'admin' },
    { action: 'end-enrollment', user_id: memberId },
    { action: 'grant-full-membership', user_id: 'invalid' },
  ]) assert.equal((await api.post(body)).status, 400);
  assert.equal(api.calls.length, 0);
});
