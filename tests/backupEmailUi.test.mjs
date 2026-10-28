import assert from 'node:assert/strict';
import test from 'node:test';
import { renderComponent } from './helpers/componentHarness.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const response = (body, status = 200) => Response.json(body, { status });
const baseState = () => ({ enabled: true, deliveryReady: true, primaryEmail: 'primary@example.test',
  backupEmail: null, verifiedAt: null, version: 0, pendingEmail: null, pendingExpiresAt: null });
const field = (ui, label) => ui.all(node => node.props.label === label)[0];
const button = (ui, label) => ui.all(node => node.type === 'Button' && node.props.children === label)[0];
const form = ui => ui.all(node => node.type === 'form' || node.props.component === 'form')[0];
const change = (ui, label, value) => ui.act(() => field(ui, label).props.onChange({ target: { value } }));
const submit = ui => ui.act(() => form(ui).props.onSubmit({ preventDefault() {} }));

async function mount(file, { props = {}, state = baseState(), fetcher, hash = '', pathname = '/account', authError = null } = {}) {
  const calls = [], cleaned = [], assigned = [], redirected = [], legacyLogins = [], legacyRecoveries = [], guards = [];
  const auth = {
    async signInWithPassword(data) { legacyLogins.push(data); return { data: { user: { id: 'member' } }, error: authError }; },
    async resetPasswordForEmail(email, options) { legacyRecoveries.push({ email, options }); return { error: null }; },
  };
  const router = { replace: path => redirected.push(path), refresh() {} };
  const ui = renderComponent(file, props, {
    'next/link': { default: 'Link', __esModule: true },
    'next/image': { default: 'Image', __esModule: true },
    '/public/Reboot Logo - Color.png': { default: { src: '/logo.png' }, __esModule: true },
    'next/navigation': { useRouter: () => router },
    '../../lib/supabaseClient': { supabase: { auth } },
    '@/lib/accountLifecycleClient': { async assertAccountSessionAllowed() { guards.push(true); } },
  }, {
    process: { env: {} }, URLSearchParams,
    window: { innerWidth: 1440, addEventListener() {}, removeEventListener() {},
      location: { hash, pathname, assign: path => assigned.push(path) },
      history: { replaceState(_state, _title, path) { cleaned.push(path); } } },
    fetch: async (url, options = {}) => {
      const call = { url, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null };
      calls.push(call);
      return fetcher ? fetcher(call) : response(state);
    },
  });
  await ui.flush();
  return { ui, calls, cleaned, assigned, redirected, legacyLogins, legacyRecoveries, guards };
}

test('adding a backup requires an explicit password-confirmed POST and displays pending verification', async () => {
  let current = baseState();
  const app = await mount('src/app/account/AccountSettingsClient.tsx', { fetcher: async call => {
    if (call.method === 'GET') return response(current);
    current = { ...current, version: 1, pendingEmail: call.body.email, pendingExpiresAt: '2099-01-01T00:00:00Z' };
    return response({ ok: true });
  } });
  assert.equal(app.calls.length, 1);
  await change(app.ui, 'Backup email address', 'backup@example.test');
  assert.equal(button(app.ui, 'Send verification link').props.disabled, true);
  await change(app.ui, 'Current password', 'CurrentPassword!');
  await submit(app.ui);
  assert.deepEqual(app.calls.find(call => call.method === 'POST').body, { email: 'backup@example.test', currentPassword: 'CurrentPassword!', version: 0 });
  assert.equal(field(app.ui, 'Current password').props.value, '');
  assert.match(app.ui.text(), /Awaiting verification/);
  assert.match(app.ui.text(), /cannot be used to sign in/);
  app.ui.unmount();
});

test('expired pending address resends with the latest version and removal requires confirmation and password', async () => {
  let current = { ...baseState(), version: 4, pendingEmail: 'backup@example.test', pendingExpiresAt: '2000-01-01T00:00:00Z' };
  const app = await mount('src/app/account/AccountSettingsClient.tsx', { fetcher: async call => {
    if (call.method === 'GET') return response(current);
    if (call.method === 'POST') current = { ...current, version: 5, pendingExpiresAt: '2099-01-01T00:00:00Z' };
    if (call.method === 'DELETE') current = { ...baseState(), version: 6 };
    return response({ ok: true });
  } });
  assert.match(app.ui.text(), /Verification expired/);
  await change(app.ui, 'Current password', 'CurrentPassword!'); await submit(app.ui);
  assert.equal(app.calls.find(call => call.method === 'POST').body.version, 4);
  await app.ui.act(() => button(app.ui, 'Cancel pending verification').props.onClick());
  assert.equal(app.calls.filter(call => call.method === 'DELETE').length, 0);
  await change(app.ui, 'Current password', 'CurrentPassword!'); await submit(app.ui);
  assert.deepEqual(app.calls.find(call => call.method === 'DELETE').body, { currentPassword: 'CurrentPassword!', version: 5 });
  assert.match(app.ui.text(), /Backup email removed/); app.ui.unmount();
});

test('a stale settings version refreshes state without automatically repeating the mutation', async () => {
  let current = baseState();
  const app = await mount('src/app/account/AccountSettingsClient.tsx', { fetcher: async call => {
    if (call.method === 'GET') return response(current);
    current = { ...baseState(), version: 7, backupEmail: 'other@example.test', verifiedAt: '2026-01-01T00:00:00Z' };
    return response({ code: 'state_changed' }, 409);
  } });
  await change(app.ui, 'Backup email address', 'backup@example.test');
  await change(app.ui, 'Current password', 'CurrentPassword!'); await submit(app.ui);
  assert.equal(app.calls.filter(call => call.method === 'POST').length, 1);
  assert.match(app.ui.text(), /details changed or this email address is unavailable/); assert.match(app.ui.text(), /other@example.test/);
  assert.equal(field(app.ui, 'Backup email address'), undefined); app.ui.unmount();
});

test('failed settings writes require a refresh before another attempt and clear the password', async () => {
  const app = await mount('src/app/account/AccountSettingsClient.tsx', { fetcher: async call => {
    if (call.method === 'GET') return response(baseState());
    throw new Error('network interrupted');
  } });
  await change(app.ui, 'Backup email address', 'backup@example.test');
  await change(app.ui, 'Current password', 'CurrentPassword!'); await submit(app.ui);
  assert.equal(field(app.ui, 'Current password').props.value, '');
  await change(app.ui, 'Current password', 'CurrentPassword!');
  assert.equal(button(app.ui, 'Send verification link').props.disabled, true);
  await submit(app.ui);
  assert.equal(app.calls.filter(call => call.method === 'POST').length, 1);
  await app.ui.act(() => button(app.ui, 'Refresh status').props.onClick());
  assert.equal(button(app.ui, 'Send verification link').props.disabled, false); app.ui.unmount();
});

test('a removal conflict requires a fresh confirmation of the changed address', async () => {
  let current = { ...baseState(), version: 1, backupEmail: 'old@example.test', verifiedAt: '2026-01-01T00:00:00Z' };
  const app = await mount('src/app/account/AccountSettingsClient.tsx', { fetcher: async call => {
    if (call.method === 'GET') return response(current);
    current = { ...current, version: 3, backupEmail: 'new@example.test' };
    return response({ code: 'state_changed' }, 409);
  } });
  await app.ui.act(() => button(app.ui, 'Remove backup email').props.onClick());
  await change(app.ui, 'Current password', 'CurrentPassword!'); await submit(app.ui);
  assert.equal(form(app.ui), undefined);
  assert.match(app.ui.text(), /new@example.test/);
  assert.equal(app.calls.filter(call => call.method === 'DELETE').length, 1); app.ui.unmount();
});

test('disabled or signed-out settings do not show controls; unavailable delivery still permits removal', async () => {
  for (const [status, code] of [[404, 'feature_disabled'], [401, 'authentication_required']]) {
    const app = await mount('src/app/account/AccountSettingsClient.tsx', { fetcher: () => response({ code }, status) });
    assert.equal(form(app.ui), undefined); app.ui.unmount();
  }
  const app = await mount('src/app/account/AccountSettingsClient.tsx', { state: { ...baseState(), deliveryReady: false,
    version: 1, backupEmail: 'backup@example.test', verifiedAt: '2026-01-01T00:00:00Z' } });
  await app.ui.act(() => button(app.ui, 'Remove backup email').props.onClick());
  await change(app.ui, 'Current password', 'CurrentPassword!');
  assert.equal(button(app.ui, 'Remove backup email').props.disabled, false); app.ui.unmount();
});

test('verification strips the fragment without consuming it until the member presses Verify', async () => {
  const app = await mount('src/app/auth/verify-backup-email/VerifyBackupEmailClient.tsx', {
    hash: '#token=opaque-secret', pathname: '/auth/verify-backup-email', fetcher: () => response({ ok: true }),
  });
  assert.deepEqual(app.cleaned, ['/auth/verify-backup-email']); assert.equal(app.calls.length, 0);
  await app.ui.act(() => button(app.ui, 'Verify backup email').props.onClick());
  assert.deepEqual(app.calls[0], { url: '/api/auth/backup-email/verify', method: 'POST', body: { token: 'opaque-secret' } });
  assert.match(app.ui.text(), /backup email is ready/); app.ui.unmount();
});

test('verification sign-in and expired/removed link messages never put the token into a link', async () => {
  for (const [status, code] of [[401, 'authentication_required'], [400, 'invalid_link']]) {
    const app = await mount('src/app/auth/verify-backup-email/VerifyBackupEmailClient.tsx', {
      hash: '#token=opaque-secret', pathname: '/auth/verify-backup-email', fetcher: () => response({ code }, status),
    });
    await app.ui.act(() => button(app.ui, 'Verify backup email').props.onClick());
    assert.match(app.ui.text(), status === 401 ? /then reopen the verification link/ : /expired, was already used, or is no longer active/);
    assert.equal(button(app.ui, 'Verify backup email'), undefined);
    for (const node of app.ui.all(node => typeof node.props.href === 'string')) assert.doesNotMatch(node.props.href, /opaque-secret|token=/);
    app.ui.unmount();
  }
});

test('backup recovery validates confirmation and posts the fragment grant without creating a browser session', async () => {
  const app = await mount('src/app/auth/recover-backup-email/RecoverBackupEmailClient.tsx', {
    hash: '#token=opaque-secret', pathname: '/auth/recover-backup-email', fetcher: () => response({ ok: true }),
  });
  assert.equal(app.calls.length, 0); assert.deepEqual(app.cleaned, ['/auth/recover-backup-email']);
  await change(app.ui, 'New password', 'NewPassword123!'); await change(app.ui, 'Confirm new password', 'Mismatch123!');
  await submit(app.ui); assert.equal(app.calls.length, 0);
  await change(app.ui, 'Confirm new password', 'NewPassword123!'); await submit(app.ui);
  assert.deepEqual(app.calls[0], { url: '/api/auth/backup-recovery/complete', method: 'POST', body: { token: 'opaque-secret', password: 'NewPassword123!' } });
  assert.deepEqual(app.redirected, ['/login?passwordUpdated=1']);
  assert.equal(app.legacyLogins.length, 0); app.ui.unmount();
});

test('consumed/removed and uncertain recovery outcomes cannot submit the same link again', async () => {
  for (const outcome of ['invalid_link', 'recovery_uncertain', 'network']) {
    const app = await mount('src/app/auth/recover-backup-email/RecoverBackupEmailClient.tsx', {
      hash: '#token=opaque-secret', pathname: '/auth/recover-backup-email', fetcher: () => {
        if (outcome === 'network') throw new Error('response lost');
        return response({ code: outcome }, outcome === 'invalid_link' ? 400 : 503);
      },
    });
    await change(app.ui, 'New password', 'NewPassword123!'); await change(app.ui, 'Confirm new password', 'NewPassword123!');
    const previousForm = form(app.ui); await submit(app.ui);
    assert.equal(form(app.ui), undefined);
    await app.ui.act(() => previousForm.props.onSubmit({ preventDefault() {} }));
    assert.equal(app.calls.length, 1);
    assert.match(app.ui.text(), outcome === 'invalid_link' ? /expired, was already used/ : /could not confirm whether/);
    app.ui.unmount();
  }
});

test('enabled sign-in uses the server cookie flow and only navigates to safe local destinations', async () => {
  for (const [redirectTo, target] of [['/courses/course', '/courses/course'], ['//external.example', '/'], ['/\\external.example', '/']]) {
    const app = await mount('src/app/login/LoginClient.tsx', {
      props: { backupEmailEnabled: true, redirectTo }, fetcher: () => response({ ok: true }),
    });
    await app.ui.act(() => app.ui.all(node => node.props.placeholder === 'Email')[0].props.onChange({ target: { value: 'backup@example.test' } }));
    await app.ui.act(() => app.ui.all(node => node.props.placeholder === 'Password')[0].props.onChange({ target: { value: 'CurrentPassword!' } }));
    await submit(app.ui);
    assert.deepEqual(app.calls[0], { url: '/api/auth/backup-login', method: 'POST', body: { email: 'backup@example.test', password: 'CurrentPassword!' } });
    assert.deepEqual(app.assigned, [target]); assert.equal(app.legacyLogins.length, 0); assert.equal(app.guards.length, 0);
    app.ui.unmount();
  }
});

test('disabled sign-in and recovery preserve the existing Supabase flows', async () => {
  const app = await mount('src/app/login/LoginClient.tsx');
  await app.ui.act(() => app.ui.all(node => node.props.placeholder === 'Email')[0].props.onChange({ target: { value: 'primary@example.test' } }));
  await app.ui.act(() => app.ui.all(node => node.props.placeholder === 'Password')[0].props.onChange({ target: { value: 'CurrentPassword!' } }));
  await submit(app.ui);
  assert.deepEqual(clone(app.legacyLogins), [{ email: 'primary@example.test', password: 'CurrentPassword!' }]);
  assert.equal(app.guards.length, 1);
  await app.ui.act(() => button(app.ui, 'Set my password by email').props.onClick());
  await app.ui.act(() => button(app.ui, 'Send password link').props.onClick());
  assert.equal(app.legacyRecoveries[0].email, 'primary@example.test'); assert.equal(app.calls.length, 0); app.ui.unmount();
});

test('enabled recovery sends one email input and uses generic confirmation copy', async () => {
  const app = await mount('src/app/login/LoginClient.tsx', { props: { backupEmailEnabled: true }, fetcher: () => response({ ok: true, message: 'Do not disclose account existence' }) });
  await app.ui.act(() => button(app.ui, 'Set my password by email').props.onClick());
  await change(app.ui, 'Enter your email', 'backup@example.test');
  await app.ui.act(() => button(app.ui, 'Send password link').props.onClick());
  assert.deepEqual(app.calls[0], { url: '/api/auth/backup-recovery', method: 'POST', body: { email: 'backup@example.test' } });
  assert.match(app.ui.text(), /If this email can receive/); assert.doesNotMatch(app.ui.text(), /Do not disclose/);
  assert.equal(app.legacyRecoveries.length, 0); app.ui.unmount();
});

test('account navigation is hidden when the feature is disabled or the member is not signed in', async () => {
  for (const [status, body] of [[404, {}], [401, {}], [200, { enabled: false }], [200, { enabled: true }]]) {
    const app = await mount('src/components/account/AccountSettingsLink.tsx', { fetcher: () => response(body, status) });
    assert.equal(app.ui.all(node => node.props.href === '/account').length, body.enabled === true ? 1 : 0);
    app.ui.unmount();
  }
});
