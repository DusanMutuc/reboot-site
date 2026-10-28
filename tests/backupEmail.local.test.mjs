import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

// Run only against the PC's isolated Auth/PostgreSQL/Mailpit stack.
// No dotenv import: real .env.local values must never enter this test.
test('verified backup email with real local Supabase Auth and captured mail', {
  skip: process.env.BACKUP_EMAIL_LOCAL_HTTP_TEST !== '1', timeout: 180_000,
}, async () => {
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const app = process.env.BACKUP_EMAIL_LOCAL_APP_URL;
  const mailbox = process.env.BACKUP_EMAIL_LOCAL_MAILPIT_URL;
  assert.equal(api, 'http://127.0.0.1:54321');
  assert.equal(app, 'http://127.0.0.1:3017');
  assert.equal(mailbox, 'http://127.0.0.1:54324');
  assert.ok(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const publicClient = () => createClient(api, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
  const admin = createClient(api, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
  const created = [];
  const sessions = [];
  const checked = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  const runId = randomUUID();
  const primary = `backup-primary-${runId}@example.invalid`;
  const backup = `backup-alias-${runId}@example.invalid`;
  const other = `backup-other-${runId}@example.invalid`;
  const oldPassword = `${randomUUID()}Aa!`;
  const newPassword = `${randomUUID()}Bb!`;
  const call = (path, body, token, method = body ? 'POST' : 'GET') => fetch(`${app}${path}`, {
    method, redirect: 'manual', signal: AbortSignal.timeout(30_000),
    headers: { Origin: app, ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const read = async (response, status = 200) => {
    const body = await response.json();
    assert.equal(response.status, status, body.error ?? 'Unexpected response status');
    return body;
  };
  const state = token => call('/api/auth/backup-email', null, token).then(read);
  async function signIn(email, password) {
    const client = publicClient();
    const result = checked(await client.auth.signInWithPassword({ email, password }));
    sessions.push(client);
    return result;
  }
  async function messageLink(to, path, excludedToken) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const found = await fetch(`${mailbox}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`, {
        signal: AbortSignal.timeout(3000),
      });
      assert.equal(found.status, 200, 'Mailpit search must be available locally');
      const messages = (await found.json()).messages ?? [];
      for (const item of messages) {
        const response = await fetch(`${mailbox}/api/v1/message/${encodeURIComponent(item.ID)}`);
        const message = await response.json();
        const links = `${message.Text ?? ''}\n${message.HTML ?? ''}`.match(/https?:\/\/[^\s<>"']+/g) ?? [];
        const link = links.map(value => value.replaceAll('&amp;', '&')).find(value => {
          const url = new URL(value);
          return url.pathname === path && (!excludedToken || new URLSearchParams(url.hash.slice(1)).get('token') !== excludedToken);
        });
        if (link) return new URL(link);
      }
      await delay(300);
    }
    throw new Error(`No captured ${path} email arrived for the synthetic test account`);
  }
  async function createActor(email) {
    const { user } = checked(await admin.auth.admin.createUser({ email, password: oldPassword, email_confirm: true }));
    created.push(user.id);
    checked(await admin.from('profiles').upsert({ id: user.id, first_name: 'Backup email local test' }));
    const role = checked(await admin.from('roles').select('id').eq('code', 'user').single());
    checked(await admin.from('user_roles').upsert({ user_id: user.id, role_id: role.id }));
    return { id: user.id, ...(await signIn(email, oldPassword)) };
  }
  try {
    const owner = await createActor(primary);
    const ownerToken = owner.session.access_token;
    const initial = await state(ownerToken);
    if (process.env.BACKUP_EMAIL_LOCAL_EXPECT_DISABLED === '1') {
      assert.deepEqual(initial, { enabled: false });
      await read(await call('/api/auth/backup-login', { email: primary, password: oldPassword }), 404);
      await read(await call('/api/auth/backup-email', { email: backup, currentPassword: oldPassword, version: 0 }, ownerToken), 404);
      assert.equal((await signIn(primary, oldPassword)).user.id, owner.id);
      return;
    }
    assert.equal(initial.enabled, true, 'Start the app with -Mode start, without -FeatureOff');
    assert.equal(initial.deliveryReady, true, 'Local Mailpit delivery must be configured');
    assert.equal(initial.primaryEmail, primary);
    assert.equal(initial.backupEmail, null);
    const stranger = await createActor(other);

    await read(await call('/api/auth/backup-email', {
      email: backup, currentPassword: oldPassword, version: initial.version,
    }, ownerToken));
    const pending = await state(ownerToken);
    assert.equal(pending.pendingEmail, backup);
    assert.equal(pending.backupEmail, null);
    await read(await call('/api/auth/backup-login', { email: backup, password: oldPassword }), 401);
    const verification = await messageLink(backup, '/auth/verify-backup-email');
    assert.equal(verification.origin, app);
    const verifyToken = new URLSearchParams(verification.hash.slice(1)).get('token');
    assert.ok(verifyToken);
    const preview = await fetch(`${app}${verification.pathname}`, { redirect: 'manual' });
    assert.equal(preview.status, 200);
    assert.equal((await state(ownerToken)).backupEmail, null, 'GET/email scanners cannot verify');
    await read(await call('/api/auth/backup-email/verify', { token: verifyToken }), 401);
    await read(await call('/api/auth/backup-email/verify', { token: verifyToken }, stranger.session.access_token), 400);
    await read(await call('/api/auth/backup-email/verify', { token: verifyToken }, ownerToken));
    await read(await call('/api/auth/backup-email/verify', { token: verifyToken }, ownerToken), 400);
    assert.equal((await state(ownerToken)).backupEmail, backup);

    const wrongPassword = await call('/api/auth/backup-login', { email: backup, password: 'wrong-password' });
    assert.equal(wrongPassword.headers.get('set-cookie'), null);
    await read(wrongPassword, 401);
    const login = await call('/api/auth/backup-login', { email: backup.toUpperCase(), password: oldPassword });
    const cookieStrings = login.headers.getSetCookie();
    assert.ok(cookieStrings.length > 0, 'Successful login must commit SSR cookies');
    assert.deepEqual(await read(login), { ok: true });
    const cookies = cookieStrings.map(value => {
      const pair = value.split(';', 1)[0];
      const index = pair.indexOf('=');
      return { name: pair.slice(0, index), value: decodeURIComponent(pair.slice(index + 1)) };
    }).filter(cookie => cookie.value);
    const cookieClient = createServerClient(api, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: { getAll: () => cookies, setAll() {} },
    });
    sessions.push(cookieClient);
    const signedInUser = checked(await cookieClient.auth.getUser()).user;
    assert.equal(signedInUser.id, owner.id);
    assert.equal(signedInUser.email, primary, 'Backup login must not change the Auth email');
    assert.equal((await signIn(primary, oldPassword)).user.id, owner.id);
    const duplicate = await admin.auth.admin.createUser({ email: backup, password: oldPassword, email_confirm: true });
    if (duplicate.data.user) created.push(duplicate.data.user.id);
    assert.ok(duplicate.error, 'Direct Auth account creation must not steal a verified backup');
    const directRpc = await publicClient().rpc('backup_email_state', { _user_id: owner.id });
    assert.ok(directRpc.error, 'Private service RPCs must be denied to anonymous clients');

    const recovery = await read(await call('/api/auth/backup-recovery', { email: backup }));
    const unknown = await read(await call('/api/auth/backup-recovery', { email: `missing-${runId}@example.invalid` }));
    assert.deepEqual(recovery, unknown, 'Public recovery must not reveal address ownership');
    const reset = await messageLink(backup, '/auth/recover-backup-email');
    assert.equal(reset.origin, app);
    const resetToken = new URLSearchParams(reset.hash.slice(1)).get('token');
    assert.ok(resetToken);
    const resetPreview = await fetch(`${app}${reset.pathname}`, { redirect: 'manual' });
    assert.equal(resetPreview.status, 200);
    assert.equal(resetPreview.headers.get('set-cookie'), null, 'GET must not create a recovery session');
    // Two real HTTP requests race through PostgreSQL and GoTrue; only one may win.
    const attempts = await Promise.all([0, 1].map(() => call('/api/auth/backup-recovery/complete', { token: resetToken, password: newPassword })));
    assert.deepEqual(attempts.map(response => response.status).sort(), [200, 400]);
    for (const response of attempts) {
      assert.equal(response.headers.get('set-cookie'), null, 'Backup reset must never publish a session');
      const result = await response.json();
      assert.equal('access_token' in result || 'refresh_token' in result, false);
    }
    assert.ok((await publicClient().auth.signInWithPassword({ email: primary, password: oldPassword })).error);
    const newSession = await signIn(primary, newPassword);
    assert.equal(newSession.user.id, owner.id);
    assert.equal(newSession.user.email, primary);
    await read(await call('/api/auth/backup-login', { email: backup, password: newPassword }));

    // Removing a backup invalidates both login and an outstanding reset grant.
    await read(await call('/api/auth/backup-recovery', { email: backup }));
    const staleReset = await messageLink(backup, '/auth/recover-backup-email', resetToken);
    const staleToken = new URLSearchParams(staleReset.hash.slice(1)).get('token');
    assert.notEqual(staleToken, resetToken);
    const active = await state(newSession.session.access_token);
    await read(await call('/api/auth/backup-email', { currentPassword: newPassword, version: active.version }, newSession.session.access_token, 'DELETE'));
    await read(await call('/api/auth/backup-recovery/complete', { token: staleToken, password: `${randomUUID()}Cc!` }), 400);
    await read(await call('/api/auth/backup-login', { email: backup, password: newPassword }), 401);
    assert.equal((await signIn(primary, newPassword)).user.id, owner.id);

    // Primary recovery still sends Supabase's native link to the primary address.
    await read(await call('/api/auth/backup-recovery', { email: primary }));
    const native = await messageLink(primary, '/auth/v1/verify');
    assert.equal(native.origin, api);
    assert.equal(native.searchParams.get('type'), 'recovery');
    assert.equal(native.searchParams.get('redirect_to'), `${app}/reset-password`);
  } finally {
    await Promise.allSettled(sessions.map(client => client.auth.signOut({ scope: 'local' })));
    // Delete only synthetic users created by this run; retain captured mail for inspection.
    for (const id of created.reverse()) {
      const result = await admin.auth.admin.deleteUser(id);
      assert.equal(result.error, null, 'Could not clean up a synthetic local test account');
    }
  }
});
