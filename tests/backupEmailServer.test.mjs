import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, overrides = {}) {
  const source = readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => overrides[name] ?? require(name), loaded, loaded.exports);
  return loaded.exports;
}
const { handleBackupEmail, BackupEmailError } = load('backupEmailServer');
const { getBackupEmailConfig, isBackupEmailEnabled } = load('backupEmailConfig');
const origin = 'https://hub.reboot.test';
const config = { secret: 'test-only-secret-with-at-least-32-characters', origin, deliveryMode: 'smtp' };
const user = { id: randomUUID(), email: 'primary@example.test', app_metadata: {}, factors: [] };
const challengeId = randomUUID();
const secret = randomBytes(32).toString('base64url');
const token = `${challengeId}.${secret}`;
const version = 2;
const session = { user, access_token: 'test-access', refresh_token: 'test-refresh' };

function request(action, body = {}, headers = {}) {
  return new Request(`${origin}/api/auth/${action}`, { method: action === 'state' ? 'GET' : 'POST',
    headers: { origin, 'content-type': 'application/json', ...headers },
    ...(action === 'state' ? {} : { body: JSON.stringify(body) }),
  });
}
function fixture(options = {}) {
  const events = [], mails = [], cookies = [];
  const rpcDefaults = {
    backup_email_state: { status: 'ok', version, email: 'backup@example.test', verified: true, verifiedAt: '2026-10-28T12:00:00Z', pendingEmail: null, pendingExpiresAt: null },
    backup_email_rate_limit: { status: 'ok' },
    begin_backup_email: { status: 'ok', challengeId, version: version + 1, email: 'new@example.test', expiresAt: '2026-10-28T12:15:00Z' },
    verify_backup_email: { status: 'ok', version: version + 1 },
    remove_backup_email: { status: 'ok', version: version + 1 },
    resolve_login_email: { status: 'ok', userId: user.id, canonicalEmail: user.email, email: 'backup@example.test', version, kind: 'backup' },
    recheck_login_email: { status: 'ok' },
    begin_backup_recovery: { status: 'ok', grantId: challengeId, userId: user.id, email: 'backup@example.test' },
    consume_backup_recovery: { status: 'ok', redemptionId: randomUUID(), userId: user.id, version, credentialEpoch: 4, canonicalEmail: user.email },
    recheck_backup_recovery: { status: 'ok' },
  };
  const authUser = options.authUser ?? user;
  const deps = {
    enabled: options.enabled ?? true, config: options.config === null ? null : config,
    deliveryReady: options.deliveryReady ?? true, network: 'test-network',
    async currentUser() { events.push(['currentUser']); if (options.signedOut) throw new BackupEmailError(401, 'authentication_required', 'Sign in.'); return options.user ?? user; },
    async rpc(name, args) {
      events.push([name, args]);
      const override = options.rpc?.[name];
      if (typeof override === 'function') return override(args);
      return override ?? rpcDefaults[name];
    },
    auth() {
      events.push(['auth']);
      return {
        async signInWithPassword(input) { events.push(['signIn', input]); await options.onSignIn?.(); return { data: { user: authUser, session: { ...session, user: authUser } }, error: options.passwordError ? { code: 'invalid_credentials' } : null }; },
        async verifyOtp(input) { events.push(['verifyOtp', input]); return { data: { user: authUser, session: { ...session, user: authUser } }, error: options.otpError ?? null }; },
        async updateUser(input) { events.push(['updateUser', input]); if (options.updateThrows) throw new Error('Uncertain network'); return { data: { user: authUser }, error: options.updateError ?? null }; },
        async signOut(input) { events.push(['signOut', input]); return { error: input.scope === 'global' && options.revokeError ? new Error('Unavailable') : null }; },
        async resetPasswordForEmail(...args) { events.push(['nativeRecovery', ...args]); return { error: null }; },
      };
    },
    async checkLoginAccount(...args) { events.push(['checkAccount', ...args]); if (options.archived) throw new BackupEmailError(403, 'account_ineligible', 'Unavailable account.'); },
    async generateRecovery(email) { events.push(['generateRecovery', email]); return { user: options.generatedUser ?? user, tokenHash: 'internal-gotrue-token' }; },
    async commitSession(value) { events.push(['commitSession']); cookies.push(value); if (options.cookieFailure) throw new Error('Cookie failure'); },
    async send(message) { events.push(['send']); mails.push(message); if (options.mailError) throw new Error('SMTP refused'); },
  };
  return { deps, events, mails, cookies, run: (action, body, headers) => handleBackupEmail(request(action, body, headers), deps, action) };
}
const eventNames = f => f.events.map(event => event[0]);

test('backup email is disabled by default and requires complete canonical configuration', () => {
  assert.equal(isBackupEmailEnabled({}), false);
  const env = { BACKUP_EMAIL_ENABLED: 'true', BACKUP_EMAIL_SECRET: config.secret, BACKUP_EMAIL_ORIGIN: origin, BACKUP_EMAIL_DELIVERY_MODE: 'smtp' };
  assert.deepEqual(getBackupEmailConfig(env), config);
  for (const [key, value] of [['BACKUP_EMAIL_ENABLED', '1'], ['BACKUP_EMAIL_SECRET', 'short'], ['BACKUP_EMAIL_ORIGIN', 'https://hub.reboot.test/path'], ['BACKUP_EMAIL_ORIGIN', 'https://hub.reboot.test?token=secret'], ['BACKUP_EMAIL_ORIGIN', 'http://hub.reboot.test'], ['BACKUP_EMAIL_DELIVERY_MODE', 'optional']]) assert.equal(getBackupEmailConfig({ ...env, [key]: value }), null);
  const local = { ...env, BACKUP_EMAIL_DELIVERY_MODE: 'local', BACKUP_EMAIL_ORIGIN: 'http://127.0.0.1:3017', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' };
  assert.ok(getBackupEmailConfig(local));
  assert.equal(getBackupEmailConfig({ ...local, NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' }), null);
  assert.equal(getBackupEmailConfig({ ...local, BACKUP_EMAIL_ORIGIN: origin }), null);
});

test('disabled endpoints never touch Auth, storage or SMTP', async () => {
  for (const action of ['state', 'begin', 'verify', 'remove', 'login', 'recovery', 'complete']) {
    const f = fixture({ enabled: false });
    const res = await f.run(action);
    assert.equal(res.status, action === 'state' ? 200 : 404);
    assert.equal(f.events.length, 0);
  }
});

test('state exposes only account settings and readiness', async () => {
  const f = fixture({ deliveryReady: false });
  const res = await f.run('state');
  assert.deepEqual(await res.json(), { enabled: true, deliveryReady: false, primaryEmail: user.email, backupEmail: 'backup@example.test', verifiedAt: '2026-10-28T12:00:00Z', version, pendingEmail: null, pendingExpiresAt: null });
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('cross-origin mutations and oversized JSON fail before authentication or writes', async () => {
  const f = fixture();
  assert.equal((await f.run('begin', {}, { origin: 'https://other.test' })).status, 403);
  assert.equal((await f.run('begin', { currentPassword: 'x'.repeat(9000) })).status, 413);
  assert.equal(f.events.length, 0);
});

test('enrollment checks quota and fresh password, never publishes that session, sends only app token', async () => {
  const f = fixture();
  const res = await f.run('begin', { email: ' New@Example.Test ', currentPassword: 'ExistingPassword!', version });
  assert.equal(res.status, 200);
  assert.ok(eventNames(f).indexOf('backup_email_rate_limit') < eventNames(f).indexOf('signIn'));
  assert.ok(eventNames(f).indexOf('signIn') < eventNames(f).indexOf('begin_backup_email'));
  assert.equal(f.cookies.length, 0);
  assert.deepEqual(f.events.find(e => e[0] === 'signIn')[1], { email: user.email, password: 'ExistingPassword!' });
  assert.deepEqual(f.events.find(e => e[0] === 'signOut')[1], { scope: 'local' });
  const mailedToken = f.mails[0].text.match(/#token=([^\s]+)/)[1];
  const begin = f.events.find(e => e[0] === 'begin_backup_email')[1];
  assert.equal(begin._token_hash, createHash('sha256').update(mailedToken.split('.')[1]).digest('hex'));
  assert.equal(f.mails[0].to, 'new@example.test');
  assert.match(f.mails[0].text, /\/auth\/verify-backup-email#token=/);
  assert.ok(!f.mails[0].text.includes('test-access'));
  assert.equal(begin._user_id, user.id);
  assert.equal(begin._expected_version, version);
});

test('bad password, wrong identity, no session, pending setup, MFA and quota prevent enrollment', async () => {
  for (const options of [{ passwordError: true }, { authUser: { ...user, id: randomUUID() } }, { signedOut: true }, { user: { ...user, app_metadata: { must_reset_password: true } } }, { user: { ...user, factors: [{ status: 'verified' }] } }, { rpc: { backup_email_rate_limit: { status: 'rate_limited' } } }]) {
    const f = fixture(options);
    assert.ok((await f.run('begin', { email: 'new@example.test', currentPassword: 'ExistingPassword!', version })).status >= 400);
    assert.ok(!eventNames(f).includes('begin_backup_email'));
    assert.equal(f.mails.length, 0);
    assert.equal(f.cookies.length, 0);
  }
});

test('CAS conflict and delivery errors never claim successful enrollment', async () => {
  for (const [options, expected] of [[{ rpc: { begin_backup_email: { status: 'conflict' } } }, 'state_changed'], [{ mailError: true }, 'delivery_unavailable'], [{ deliveryReady: false }, 'delivery_unavailable']]) {
    const f = fixture(options);
    const res = await f.run('begin', { email: 'new@example.test', currentPassword: 'ExistingPassword!', version });
    assert.equal((await res.json()).code, expected);
    assert.ok(res.status >= 400);
  }
});

test('verification binds the token to the currently signed-in UUID and cannot mint a session', async () => {
  const f = fixture();
  assert.equal((await f.run('verify', { token, userId: 'forged' })).status, 200);
  assert.deepEqual(f.events.find(e => e[0] === 'verify_backup_email')[1], { _user_id: user.id, _challenge_id: challengeId, _token_hash: createHash('sha256').update(secret).digest('hex') });
  assert.ok(!eventNames(f).includes('auth'));
  for (const status of ['invalid', 'conflict', 'ineligible']) {
    const denied = fixture({ rpc: { verify_backup_email: { status } } });
    assert.equal((await (await denied.run('verify', { token })).json()).code, 'invalid_link');
  }
});

test('removal requires password proof and the submitted version', async () => {
  const f = fixture();
  assert.equal((await f.run('remove', { currentPassword: 'ExistingPassword!', version })).status, 200);
  assert.deepEqual(f.events.find(e => e[0] === 'remove_backup_email')[1], { _user_id: user.id, _expected_version: version });
  assert.equal(f.cookies.length, 0);
});

test('a caller cannot preselect the next security revision before proving an old password', async () => {
  for (const action of ['begin', 'remove']) {
    const f = fixture();
    const res = await f.run(action, { email: 'new@example.test', currentPassword: 'OldPassword!', version: version + 1 });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'state_changed');
    assert.ok(eventNames(f).includes('backup_email_state'));
    assert.ok(!eventNames(f).includes('signIn'), 'future browser version must fail before password proof');
    assert.ok(!eventNames(f).includes('begin_backup_email'));
    assert.ok(!eventNames(f).includes('remove_backup_email'));
    assert.equal(f.mails.length, 0);
  }
});

test('password rotation during successful proof rejects both enrollment and removal using the captured server revision', async () => {
  for (const action of ['begin', 'remove']) {
    let currentRevision = version;
    const mutation = action === 'begin' ? 'begin_backup_email' : 'remove_backup_email';
    const f = fixture({
      onSignIn() { currentRevision++; },
      rpc: {
        backup_email_state: () => ({ status: 'ok', version: currentRevision }),
        [mutation](args) {
          assert.equal(args._expected_version, version, 'must use the pre-proof snapshot, never reread after proof');
          return { status: args._expected_version === currentRevision ? 'ok' : 'conflict' };
        },
      },
    });
    const res = await f.run(action, { email: 'new@example.test', currentPassword: 'OldPassword!', version });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'state_changed');
    assert.ok(eventNames(f).indexOf('backup_email_state') < eventNames(f).indexOf('signIn'));
    assert.equal(f.events.filter(event => event[0] === 'backup_email_state').length, 1);
    assert.ok(eventNames(f).includes(mutation));
    assert.deepEqual(f.events.filter(event => event[0] === 'signOut').map(event => event[1]), [{ scope: 'local' }]);
    assert.equal(f.mails.length, 0);
    assert.equal(f.cookies.length, 0);
  }
});

test('backup login delegates the same password to canonical Auth UUID and commits cookies only after recheck', async () => {
  const f = fixture();
  const res = await f.run('login', { email: 'backup@example.test', password: 'ExistingPassword!' });
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(f.events.find(e => e[0] === 'signIn')[1].email, user.email);
  assert.equal(f.cookies[0].user.id, user.id);
  assert.ok(eventNames(f).indexOf('recheck_login_email') < eventNames(f).indexOf('commitSession'));
  assert.ok(!eventNames(f).includes('signOut'));
});

test('login wrong credentials, UUID mismatch, revoked alias, archived account and MFA never publish sessions', async () => {
  for (const options of [{ passwordError: true }, { authUser: { ...user, id: randomUUID() } }, { rpc: { recheck_login_email: { status: 'invalid' } } }, { archived: true }, { authUser: { ...user, factors: [{ status: 'verified' }] } }, { rpc: { resolve_login_email: { status: 'invalid' } } }]) {
    const f = fixture(options);
    assert.ok((await f.run('login', { email: 'backup@example.test', password: 'ExistingPassword!' })).status >= 400);
    assert.equal(f.cookies.length, 0);
    if (eventNames(f).includes('signIn')) assert.ok(eventNames(f).includes('signOut'));
  }
});

test('primary login preserves native pending-password setup behavior', async () => {
  const pending = { ...user, app_metadata: { must_reset_password: true } };
  const f = fixture({ authUser: pending, rpc: { resolve_login_email: { status: 'ok', userId: user.id, canonicalEmail: user.email, version: 0, kind: 'primary' } } });
  assert.equal((await f.run('login', { email: user.email, password: 'ExistingPassword!' })).status, 200);
  assert.equal(f.cookies.length, 1);
});

test('email normalization preserves primary addresses with international characters and rejects control injection', async () => {
  const f = fixture({ rpc: { resolve_login_email: { status: 'ok', userId: user.id, canonicalEmail: 'mémber@example.test', version: 0, kind: 'primary' } } });
  assert.equal((await f.run('login', { email: ' Mémber@Example.Test ', password: 'ExistingPassword!' })).status, 200);
  assert.equal(f.events.find(e => e[0] === 'resolve_login_email')[1]._email, 'mémber@example.test');
  const rejected = fixture();
  assert.equal((await rejected.run('login', { email: 'member\u0000@example.test', password: 'ExistingPassword!' })).status, 401);
  assert.ok(!eventNames(rejected).includes('resolve_login_email'));
});

test('public recovery response does not distinguish valid, missing, throttled, ineligible or failed mail', async () => {
  const bodies = [];
  for (const options of [{}, { mailError: true }, { deliveryReady: false }, { rpc: { begin_backup_recovery: { status: 'invalid' } } }, { rpc: { begin_backup_recovery: { status: 'rate_limited' } } }, { rpc: { begin_backup_recovery: { status: 'ineligible' } } }]) {
    const f = fixture(options);
    const res = await f.run('recovery', { email: 'backup@example.test' });
    assert.equal(res.status, 200);
    bodies.push(await res.json());
    assert.ok(!eventNames(f).includes('generateRecovery'));
    assert.ok(!eventNames(f).includes('verifyOtp'));
    assert.equal(f.cookies.length, 0);
  }
  for (const body of bodies) assert.deepEqual(body, bodies[0]);
});

test('primary recovery keeps native email flow available without custom SMTP', async () => {
  const f = fixture({ deliveryReady: false, rpc: { begin_backup_recovery: { status: 'primary', email: user.email } } });
  assert.equal((await f.run('recovery', { email: user.email })).status, 200);
  assert.deepEqual(f.events.find(e => e[0] === 'nativeRecovery').slice(1), [user.email, { redirectTo: `${origin}/reset-password` }]);
  assert.equal(f.mails.length, 0);
  assert.ok(!eventNames(f).includes('generateRecovery'));
});

test('successful backup recovery consumes before generating any Auth token, rechecks before password, globally revokes and sets no cookies', async () => {
  const f = fixture();
  const res = await f.run('complete', { token, password: 'NewPassword123!' });
  assert.deepEqual(await res.json(), { ok: true, passwordUpdated: true });
  const names = eventNames(f);
  assert.ok(names.indexOf('consume_backup_recovery') < names.indexOf('generateRecovery'));
  assert.ok(names.indexOf('generateRecovery') < names.indexOf('verifyOtp'));
  assert.ok(names.indexOf('recheck_backup_recovery') < names.indexOf('updateUser'));
  assert.equal(f.events.find(e => e[0] === 'generateRecovery')[1], user.email);
  assert.deepEqual(f.events.find(e => e[0] === 'updateUser')[1], { password: 'NewPassword123!' });
  assert.deepEqual(f.events.filter(e => e[0] === 'signOut').map(e => e[1]), [{ scope: 'global' }]);
  assert.equal(f.cookies.length, 0);
});

test('invalid, expired, reused and revoked grants never generate Auth tokens', async () => {
  for (const status of ['invalid', 'expired', 'consumed', 'ineligible']) {
    const f = fixture({ rpc: { consume_backup_recovery: { status } } });
    assert.equal((await (await f.run('complete', { token, password: 'NewPassword123!' })).json()).code, 'invalid_link');
    assert.ok(!eventNames(f).includes('generateRecovery'));
    assert.ok(!eventNames(f).includes('updateUser'));
  }
});

test('concurrent recovery attempts have only one consume winner and one password update', async () => {
  let consumed = false;
  const f = fixture({ rpc: { consume_backup_recovery() {
    if (consumed) return { status: 'invalid' };
    consumed = true;
    return { status: 'ok', redemptionId: randomUUID(), userId: user.id, canonicalEmail: user.email, version, credentialEpoch: 1 };
  } } });
  const results = await Promise.all([f.run('complete', { token, password: 'NewPassword123!' }), f.run('complete', { token, password: 'OtherPassword123!' })]);
  assert.deepEqual(results.map(res => res.status).sort(), [200, 400]);
  assert.equal(f.events.filter(e => e[0] === 'updateUser').length, 1);
});

test('changed UUID, MFA, archived account, revoked revision or failed OTP prevent password changes and clean temporary sessions locally', async () => {
  for (const options of [{ generatedUser: { ...user, id: randomUUID() } }, { authUser: { ...user, id: randomUUID() } }, { authUser: { ...user, factors: [{ status: 'verified' }] } }, { archived: true }, { rpc: { recheck_backup_recovery: { status: 'invalid' } } }, { otpError: { code: 'otp_expired' } }]) {
    const f = fixture(options);
    assert.ok((await f.run('complete', { token, password: 'NewPassword123!' })).status >= 400);
    assert.ok(!eventNames(f).includes('updateUser'));
    assert.deepEqual(f.events.filter(e => e[0] === 'signOut').map(e => e[1]), [{ scope: 'local' }]);
    assert.equal(f.cookies.length, 0);
  }
});

test('password update acknowledgement loss and sign-out uncertainty are terminal and never return success', async () => {
  for (const options of [{ updateThrows: true }, { updateError: { code: 'unexpected_failure' } }, { revokeError: true }]) {
    const f = fixture(options);
    const res = await f.run('complete', { token, password: 'NewPassword123!' });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'recovery_uncertain');
    assert.equal(f.cookies.length, 0);
    assert.deepEqual(f.events.at(-1), ['signOut', { scope: 'local' }]);
  }
});

test('password policy errors distinguish pre-consumption correction from a consumed rejected link', async () => {
  const f = fixture();
  assert.equal((await (await f.run('complete', { token, password: 'short' })).json()).code, 'password_policy');
  assert.ok(!eventNames(f).includes('consume_backup_recovery'));
  const rejected = fixture({ updateError: { code: 'weak_password' } });
  assert.equal((await (await rejected.run('complete', { token, password: 'NewPassword123!' })).json()).code, 'invalid_link');
  assert.ok(eventNames(rejected).includes('consume_backup_recovery'));
});
