import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
function load(file, overrides = {}) {
  const source = readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => overrides[name] ?? require(name), loaded, loaded.exports);
  return loaded.exports;
}
const shared = load('support');
const configuration = load('backupEmailConfig');
const support = load('supportServer', { './support': shared });
const server = load('backupEmailServer');
const origin = 'https://hub.reboot.test';
const base = { BACKUP_EMAIL_ENABLED: 'true', BACKUP_EMAIL_SECRET: 'test-only-backup-secret-at-least-32-characters', BACKUP_EMAIL_ORIGIN: origin, BACKUP_EMAIL_DELIVERY_MODE: 'smtp' };
const smtp = { SUPPORT_SMTP_HOST: 'smtp.example.test', SUPPORT_SMTP_PORT: '587', SUPPORT_SMTP_SECURE: 'false', SUPPORT_SMTP_USER: 'synthetic-user', SUPPORT_SMTP_PASSWORD: 'synthetic-password', SUPPORT_FROM_EMAIL: 'accounts@reboot.test' };

function deliveryFixture() {
  const calls = [], localOptions = [];
  const delivery = load('backupEmailDelivery', {
    './support': shared, './backupEmailConfig': configuration,
    './supportServer': { getSupportConfig: support.getSupportConfig, async sendSupportEmail(...args) { calls.push(args); return 'reference'; } },
    nodemailer: { createTransport(options) { localOptions.push(options); return { async sendMail(message) { calls.push(message); return { accepted: [message.to], rejected: [], response: '250 queued' }; }, close() {} }; } },
  });
  return { ...delivery, calls, localOptions };
}

test('production account mail reuses strict SMTP without depending on support destination', async () => {
  const f = deliveryFixture();
  const config = f.getBackupEmailDeliveryConfig({ ...base, ...smtp });
  assert.equal(config.mode, 'smtp');
  const message = { id: randomUUID(), to: 'backup@example.test', subject: 'Verify', text: 'Synthetic challenge' };
  await f.sendBackupEmail(config, message);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][2].from, smtp.SUPPORT_FROM_EMAIL);
  assert.deepEqual(f.calls[0][2].to, [message.to]);
  assert.equal(f.localOptions.length, 0);
  assert.equal(f.getBackupEmailDeliveryConfig({ ...base, ...smtp, SUPPORT_SMTP_PASSWORD: '' }), null);
});

test('local plaintext SMTP requires explicit app, Auth and mail loopback configuration', async () => {
  const f = deliveryFixture();
  const local = { ...base, BACKUP_EMAIL_DELIVERY_MODE: 'local', BACKUP_EMAIL_ORIGIN: 'http://127.0.0.1:3017', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', BACKUP_EMAIL_LOCAL_SMTP_HOST: '127.0.0.1', BACKUP_EMAIL_LOCAL_SMTP_PORT: '54325', BACKUP_EMAIL_LOCAL_FROM_EMAIL: 'accounts@reboot.test' };
  const config = f.getBackupEmailDeliveryConfig(local);
  assert.equal(config.mode, 'local');
  for (const changes of [{ BACKUP_EMAIL_LOCAL_SMTP_HOST: 'smtp.external.test' }, { BACKUP_EMAIL_ORIGIN: origin }, { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' }, { BACKUP_EMAIL_DELIVERY_MODE: 'smtp' }, { BACKUP_EMAIL_LOCAL_SMTP_PORT: '65536' }]) assert.equal(f.getBackupEmailDeliveryConfig({ ...local, ...changes }), null);
  await f.sendBackupEmail(config, { id: randomUUID(), to: 'backup@example.test', subject: 'Verify', text: 'Synthetic challenge' });
  assert.equal(f.localOptions[0].host, '127.0.0.1');
  assert.equal(f.localOptions[0].ignoreTLS, true);
  assert.equal(f.localOptions[0].auth, undefined);
});

function routeFixture({ stale = false, commitFailure = false, enabled = true } = {}) {
  const user = { id: randomUUID(), email: 'primary@example.test', factors: [], app_metadata: {} };
  const session = { user, access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token' };
  const writes = [], reads = [], signouts = [];
  const auth = {
    async signInWithPassword() { return { data: { user, session }, error: null }; },
    async signOut({ scope }) { signouts.push(scope); return { error: null }; },
  };
  const api = load('backupEmailRoute', {
    '@supabase/supabase-js': { createClient: () => ({ auth }) },
    '@supabase/ssr': { createServerClient(url, key, options) { return { auth: {
      async setSession() {
        const previous = options.cookies.getAll(); reads.push(previous);
        const values = [
          { name: 'sb-test-auth-token', value: 'new-synthetic-session', options: { path: '/', maxAge: 3600 } },
          ...previous.filter(cookie => cookie.name.startsWith('sb-test-auth-token.')).map(cookie => ({ name: cookie.name, value: '', options: { path: '/', maxAge: 0 } })),
        ];
        writes.push(...values); options.cookies.setAll(values);
        return { data: { user: commitFailure ? { ...user, id: randomUUID() } : user, session }, error: null };
      },
    } }; } },
    './supabaseAdmin': { getAdminClient: () => ({ async rpc(name) {
      if (name === 'resolve_login_email') return { data: { status: 'ok', userId: user.id, canonicalEmail: user.email, version: 3, kind: 'backup' }, error: null };
      if (name === 'recheck_login_email') return { data: { status: stale ? 'invalid' : 'ok' }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    } }) },
    './requireUser': { requireUser: async () => ({ ok: true, user }) },
    './accountLifecycle': { fetchAccountLifecycle: async () => ({ merged_into_user_id: null, merged_at: null }), isAccountMerged: () => false },
    './backupEmailConfig': { getBackupEmailConfig: () => ({ secret: base.BACKUP_EMAIL_SECRET, origin, deliveryMode: 'smtp' }), isBackupEmailEnabled: () => enabled },
    './backupEmailDelivery': { getBackupEmailDeliveryConfig: () => null, sendBackupEmail: async () => { throw new Error('No mail allowed'); } },
    './backupEmailServer': server,
  });
  return { writes, reads, signouts, async run() {
    const request = new NextRequest(`${origin}/api/auth/backup-login`, { method: 'POST', headers: { origin, 'content-type': 'application/json', Cookie: 'sb-test-auth-token.0=old-first; sb-test-auth-token.1=old-second; unrelated=retained' }, body: JSON.stringify({ email: 'backup@example.test', password: 'ExistingPassword!' }) });
    return api.backupEmailRoute(request, 'login');
  } };
}

test('SSR login sees and clears stale auth-cookie chunks after validated alias login', async () => {
  const f = routeFixture();
  const response = await f.run();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(f.reads[0].length, 3);
  const cookies = response.headers.get('set-cookie');
  assert.match(cookies, /sb-test-auth-token=new-synthetic-session/);
  assert.match(cookies, /sb-test-auth-token\.0=;[^,]*Max-Age=0/);
  assert.match(cookies, /sb-test-auth-token\.1=;[^,]*Max-Age=0/);
  assert.match(cookies, /Secure/);
  assert.match(cookies, /SameSite=lax/);
  assert.ok(!cookies.includes('unrelated='));
});

test('failed postchecks or failed session commit publish no cookies, even after buffered writes', async () => {
  for (const options of [{ stale: true }, { commitFailure: true }, { enabled: false }]) {
    const f = routeFixture(options);
    const response = await f.run();
    assert.ok(response.status >= 400);
    assert.equal(response.headers.get('set-cookie'), null);
    if (options.commitFailure) assert.ok(f.writes.length > 0);
    if (options.stale || options.commitFailure) assert.deepEqual(f.signouts, ['local']);
  }
});
