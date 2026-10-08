import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
const { createClient } = require('@supabase/supabase-js');
const root = fileURLToPath(new URL('../', import.meta.url));
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.invalid', app_metadata: {} };
const active = { merged_into_user_id: null, merged_at: null };
const archived = { merged_into_user_id: '22222222-2222-4222-8222-222222222222', merged_at: '2026-10-08T12:00:00Z' };

function fixture({ lifecycle = active, lifecycleError = null, roleCodes = ['user'], authUser = user, authError = null } = {}) {
  const calls = { roles: 0, profiles: 0, writes: 0, verifiedUsers: 0, token: null, requests: [], redirects: [], signouts: [] };
  const client = {
    auth: {
      async getUser(token) { calls.verifiedUsers += 1; calls.token = token; return { data: { user: authUser }, error: authError }; },
      async getSession() { throw new Error('Server boundaries must verify with getUser'); },
      admin: { async updateUserById() { calls.writes += 1; return { error: null }; } },
    },
    from(table) {
      if (table === 'profiles') calls.profiles += 1;
      else if (table === 'user_roles') calls.roles += 1;
      else throw new Error(`Unexpected table ${table}`);
      const query = {
        select() { return query; }, eq() { return query; },
        async maybeSingle() { return table === 'profiles'
          ? { data: lifecycle, error: lifecycleError }
          : { data: roleCodes.includes('admin') ? { user_id: user.id } : null, error: null }; },
      };
      return query;
    },
  };
  const imports = {
    '@supabase/ssr': { createServerClient: () => client },
    '@supabase/supabase-js': {
      createClient(url, key, options) {
        // Keep the real SDK transport so bearer verification also proves that
        // the returned client's later RPC uses the user's Authorization header.
        return createClient(url, key, {
          ...options,
          global: { ...options.global, fetch: async (input, init) => {
            calls.requests.push({ url: String(input), authorization: new Headers(init?.headers).get('authorization') });
            if (String(input).includes('/auth/v1/user')) {
              calls.verifiedUsers += 1;
              return new Response(JSON.stringify(authUser ?? { message: 'Invalid token' }), {
                status: authUser && !authError ? 200 : 401, headers: { 'Content-Type': 'application/json' },
              });
            }
            return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
          } },
        });
      },
    },
    '@/lib/supabaseAdmin': { getAdminClient: () => client },
    './supabaseAdmin': { getAdminClient: () => client },
    './supabaseServer': { getServerAnonClient: () => client },
    'next/headers': { cookies: async () => ({ get: () => undefined }) },
  };
  const roles = {
    async fetchUserRoleCodes() { calls.roles += 1; return roleCodes; },
    isPastMemberRole: (codes) => codes.includes('past_member'),
    hasRoleCode: (codes, code) => codes.includes(code),
    hasDualMembership: () => false,
    fetchMemberHomeContext: async () => ({}),
    resolveHomePathForRoleCodes: () => '/',
    isPastMemberAllowedApiPath: () => false,
    canSwitchMemberViews: () => false,
    ACCESS_REMOVED_PATH: '/access-removed', NINETY_DAY_HOME_PATH: '/ninety-day',
  };
  imports['./userRoles'] = roles;
  imports['@/lib/userRoles'] = roles;
  const modules = new Map();
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, URL, Headers,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon' } },
    fetch: async () => { throw new Error('Unexpected network request'); },
    window: { location: { replace: (url) => calls.redirects.push(url) } },
  });
  function load(relativePath) {
    const filename = path.resolve(root, relativePath);
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const localRequire = (name) => {
      if (name in imports) return imports[name];
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`));
      return require(name);
    };
    vm.runInContext(`(function(exports,require){${code}\n})`, context, { filename })(exports, localRequire);
    return exports;
  }
  return { calls, client, load, context };
}

for (const authentication of ['cookie', 'bearer']) {
  for (const allowPastMember of [false, true]) {
    test(`${authentication} user guard denies merged accounts even when allowPastMember=${allowPastMember}`, async () => {
      const env = fixture({ lifecycle: archived, roleCodes: ['user', 'past_member'] });
      const request = new NextRequest('https://hub.example.invalid/api/mobile/ambassador-hub', {
        headers: authentication === 'bearer' ? { Authorization: 'Bearer fixture-access-token' } : {},
      });
      const result = await env.load('src/lib/requireUser.ts').requireUser(request, { allowPastMember });
      assert.equal(result.ok, false);
      assert.equal(result.res.status, 403);
      assert.equal((await result.res.json()).code, 'ACCOUNT_MERGED');
      assert.equal(env.calls.roles, 0, 'archive denial precedes role exceptions');
      assert.equal(env.calls.verifiedUsers, 1);
    });
  }
}

for (const options of [{ lifecycle: null }, { lifecycleError: { message: 'unavailable' } }, { lifecycle: {} }]) {
  test(`user guard fails closed when account status is unreadable (${JSON.stringify(options)})`, async () => {
    const env = fixture(options);
    const result = await env.load('src/lib/requireUser.ts').requireUser(new NextRequest('https://hub.example.invalid/api/coaching-notes'));
    assert.equal(result.ok, false);
    assert.equal(result.res.status, 500);
    assert.equal(env.calls.roles, 0);
  });
}

test('active bearer guard returns a Supabase client bound to the verified user token', async () => {
  const env = fixture();
  const result = await env.load('src/lib/requireUser.ts').requireUser(new NextRequest('https://hub.example.invalid/api/progress', {
    headers: { Authorization: 'Bearer fixture-access-token' },
  }));
  assert.equal(result.ok, true);
  await result.supabase.rpc('fixture_read');
  assert.equal(env.calls.requests.length, 2);
  assert.ok(env.calls.requests.every((request) => request.authorization === 'Bearer fixture-access-token'));
});

test('ordinary past-member exception still works for unmerged accounts', async () => {
  const env = fixture({ roleCodes: ['past_member'] });
  const guard = env.load('src/lib/requireUser.ts').requireUser;
  const request = new NextRequest('https://hub.example.invalid/api/user/ambassador-hub');
  assert.equal((await guard(request)).res.status, 403);
  assert.equal((await guard(request, { allowPastMember: true })).ok, true);
});

test('merged admins cannot bypass lifecycle denial through their role', async () => {
  const env = fixture({ lifecycle: archived, roleCodes: ['admin'] });
  const result = await env.load('src/lib/requireAdmin.ts').requireAdmin(new NextRequest('https://hub.example.invalid/api/admin/users'));
  assert.equal(result.ok, false);
  assert.equal(result.res.status, 403);
  assert.equal(env.calls.roles, 0);
});

for (const [file, method] of [
  ['src/app/api/auth/is-admin/route.ts', 'GET'],
  ['src/app/api/auth/clear-first-login-flag/route.ts', 'POST'],
  ['src/app/api/auth/account-status/route.ts', 'GET'],
]) {
  test(`public auth route ${file} denies merged sessions without privileged work`, async () => {
    const env = fixture({ lifecycle: archived, roleCodes: ['admin'] });
    const response = await env.load(file)[method](new NextRequest('https://hub.example.invalid/api/auth/test'));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'ACCOUNT_MERGED');
    assert.equal(env.calls.roles, 0);
    assert.equal(env.calls.writes, 0);
  });
}

for (const pathname of ['/tracker', '/login', '/reset-password', '/auth/mobile-handoff']) {
  test(`middleware redirects a verified merged session from ${pathname}`, async () => {
    const env = fixture({ lifecycle: archived });
    const result = await env.load('src/middleware.ts').middleware(new NextRequest(`https://hub.example.invalid${pathname}`));
    assert.equal(result.status, 307);
    assert.equal(result.headers.get('location'), 'https://hub.example.invalid/account-merged');
    assert.equal(env.calls.verifiedUsers, 1);
    assert.equal(env.calls.roles, 0);
  });
}

test('middleware returns API denial and fails closed on lifecycle lookup failure', async () => {
  const merged = fixture({ lifecycle: archived });
  const denied = await merged.load('src/middleware.ts').middleware(new NextRequest('https://hub.example.invalid/api/my-schedule'));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'ACCOUNT_MERGED');
  const unavailable = fixture({ lifecycleError: {} });
  const failed = await unavailable.load('src/middleware.ts').middleware(new NextRequest('https://hub.example.invalid/tracker'));
  assert.equal(failed.status, 503);
  assert.equal(unavailable.calls.roles, 0);
});

test('middleware preserves unauthenticated login and the merged-account explanation page', async () => {
  const env = fixture({ authUser: null });
  const middleware = env.load('src/middleware.ts').middleware;
  assert.equal((await middleware(new NextRequest('https://hub.example.invalid/login'))).status, 200);
  assert.equal((await middleware(new NextRequest('https://hub.example.invalid/account-merged'))).status, 200);
  assert.equal(env.calls.profiles, 0);
});

for (const response of [
  { status: 403, body: { code: 'ACCOUNT_MERGED' } },
  { status: 503, body: { error: 'unavailable' } },
  { status: 200, body: {} },
]) {
  test(`post-exchange client gate blocks rejected or malformed status (${response.status}, ${JSON.stringify(response.body)})`, async () => {
    const env = fixture();
    env.client.auth.getSession = async () => ({ data: { session: { access_token: 'fixture-access-token' } }, error: null });
    env.client.auth.signOut = async (options) => { env.calls.signouts.push(options.scope); return { error: null }; };
    env.context.fetch = async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer fixture-access-token');
      return new Response(JSON.stringify(response.body), { status: response.status });
    };
    await assert.rejects(() => env.load('src/lib/accountLifecycleClient.ts').assertAccountSessionAllowed(env.client));
    if (response.status === 403) {
      assert.deepEqual(env.calls.signouts, ['local']);
      assert.deepEqual(env.calls.redirects, ['/account-merged']);
    } else assert.equal(env.calls.redirects.length, 0);
  });
}

test('post-exchange client gate allows a positively verified active account', async () => {
  const env = fixture();
  env.client.auth.getSession = async () => ({ data: { session: { access_token: 'fixture-access-token' } }, error: null });
  env.context.fetch = async () => new Response('{"ok":true}', { status: 200 });
  await env.load('src/lib/accountLifecycleClient.ts').assertAccountSessionAllowed(env.client);
  assert.equal(env.calls.redirects.length, 0);
});
