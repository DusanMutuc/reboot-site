import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Session, User } from '@supabase/supabase-js';
import type { BackupEmailConfig } from './backupEmailConfig';

type AuthResult = { data: { user: User | null; session: Session | null }; error: unknown };
export type BackupEmailAuth = {
  signInWithPassword(input: { email: string; password: string }): Promise<AuthResult>;
  verifyOtp(input: { token_hash: string; type: 'recovery' }): Promise<AuthResult>;
  updateUser(input: { password: string }): Promise<{ data: { user: User | null }; error: unknown }>;
  signOut(input: { scope: 'local' | 'global' }): Promise<{ error: unknown }>;
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ error: unknown }>;
};
type RpcResult = Record<string, unknown> & { status: string };
export type BackupEmailDependencies = {
  enabled: boolean;
  config: BackupEmailConfig | null;
  deliveryReady: boolean;
  network: string;
  currentUser(): Promise<User>;
  auth(): BackupEmailAuth;
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
  checkLoginAccount(user: User, kind: 'primary' | 'backup'): Promise<void>;
  generateRecovery(email: string): Promise<{ user: User | null; tokenHash: string | null }>;
  commitSession(session: Session): Promise<void>;
  send(message: { id: string; to: string; subject: string; text: string }): Promise<void>;
};

export class BackupEmailError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const RECOVERY_MESSAGE = 'If an account can be recovered with this email, we have sent a reset link.';
const invalidLink = () => new BackupEmailError(400, 'invalid_link', 'This link is invalid, expired, or already used. Request a fresh link.');
const unavailable = () => new BackupEmailError(503, 'unavailable', 'Account access could not be verified. Please try again.');
const invalidCredentials = () => new BackupEmailError(401, 'invalid_credentials', 'We could not sign you in. Check your email and password.');

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
function string(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw unavailable();
  return value;
}
function requiredString(value: unknown): string {
  const result = string(value);
  if (!result) throw unavailable();
  return result;
}
function email(value: unknown): string | null {
  const result = string(value).trim().toLowerCase();
  if (result.length > 254 || /[\u0000-\u001f\u007f]/.test(result) || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(result)) return null;
  return result;
}
function password(value: unknown, minimum = 1): string {
  if (typeof value !== 'string' || value.length < minimum || value.length > 1024 || value.includes('\0')) {
    throw new BackupEmailError(400, minimum === 8 ? 'password_policy' : 'invalid_password', minimum === 8 ? 'Choose a password between 8 and 1024 characters.' : 'Enter your current password.');
  }
  return value;
}
function expectedVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new BackupEmailError(409, 'state_changed', 'Your backup email settings changed. Refresh them and try again.');
  return value;
}
function tokenParts(value: unknown): { id: string; hash: string } {
  const match = string(value).match(new RegExp(`^(${UUID})\.([A-Za-z0-9_-]{43})$`, 'i'));
  if (!match) throw invalidLink();
  return { id: match[1], hash: createHash('sha256').update(match[2]).digest('hex') };
}
function keyed(deps: BackupEmailDependencies, value: string): string {
  if (!deps.config) throw unavailable();
  return createHmac('sha256', deps.config.secret).update(value).digest('hex');
}
function networkHash(deps: BackupEmailDependencies): string { return keyed(deps, `network:${deps.network}`); }

export function assertBackupEligible(user: User) {
  if (user.factors?.some(factor => factor.status === 'verified')) throw new BackupEmailError(403, 'mfa_required', 'Backup email changes and recovery are not available for accounts using multi-factor authentication.');
  if (!user.email || user.app_metadata?.must_reset_password === true) throw new BackupEmailError(403, 'account_ineligible', 'Finish setting up your account using your primary email before adding a backup email.');
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new BackupEmailError(400, 'invalid_request', 'Submit the account form again.');
  const reader = request.body?.getReader();
  if (!reader) throw new BackupEmailError(400, 'invalid_request', 'Submit the account form again.');
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new BackupEmailError(413, 'invalid_request', 'The submitted form is too large.'); }
    parts.push(chunk.value);
  }
  try {
    const result: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result as Record<string, unknown>;
  } catch { throw new BackupEmailError(400, 'invalid_request', 'Submit the account form again.'); }
}

function requireMutationOrigin(request: Request, deps: BackupEmailDependencies) {
  if (!deps.config) throw unavailable();
  if (request.headers.get('origin') !== deps.config.origin || new URL(request.url).origin !== deps.config.origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new BackupEmailError(403, 'invalid_origin', 'Submit the form from the Reboot website.');
  }
}
function requireOk(result: RpcResult, invalid: 'state' | 'link' = 'state') {
  if (result.status === 'ok') return;
  if (result.status === 'rate_limited') throw new BackupEmailError(429, 'rate_limited', 'Too many attempts. Please wait before trying again.');
  if (invalid === 'link') throw invalidLink();
  if (result.status === 'ineligible') throw new BackupEmailError(403, 'account_ineligible', 'Backup email is not available for this account.');
  if (['conflict', 'invalid', 'stale'].includes(result.status)) throw new BackupEmailError(409, 'state_changed', 'Your backup email settings changed or the address is unavailable. Refresh them and try again.');
  throw unavailable();
}
async function rateLimit(deps: BackupEmailDependencies, scope: string, actor: string) {
  requireOk(await deps.rpc('backup_email_rate_limit', { _scope: scope, _actor_hash: keyed(deps, actor), _network_hash: networkHash(deps) }));
}
async function discardSession(auth: BackupEmailAuth) {
  await auth.signOut({ scope: 'local' }).catch(() => {});
}
async function reauthenticate(deps: BackupEmailDependencies, user: User, value: unknown) {
  const currentPassword = password(value);
  const auth = deps.auth();
  try {
    const result = await auth.signInWithPassword({ email: user.email!, password: currentPassword });
    if (result.error || !result.data.session || result.data.user?.id !== user.id) throw new BackupEmailError(400, 'invalid_password', 'Your current password could not be verified.');
    assertBackupEligible(result.data.user);
  } finally { await discardSession(auth); }
}

export type BackupEmailAction = 'state' | 'begin' | 'remove' | 'verify' | 'login' | 'recovery' | 'complete';

export async function handleBackupEmail(request: Request, deps: BackupEmailDependencies, action: BackupEmailAction): Promise<Response> {
  if (!deps.enabled) return action === 'state' ? reply({ enabled: false }) : reply({ error: 'Backup email is not enabled.', code: 'feature_disabled' }, 404);
  try {
    if (action === 'state') {
      const user = await deps.currentUser();
      assertBackupEligible(user);
      const state = await deps.rpc('backup_email_state', { _user_id: user.id });
      requireOk(state);
      return reply({ enabled: true, deliveryReady: !!deps.config && deps.deliveryReady, primaryEmail: user.email,
        backupEmail: state.verified === true ? state.email ?? null : null, verifiedAt: state.verifiedAt ?? null,
        version: number(state.version), pendingEmail: state.pendingEmail ?? null, pendingExpiresAt: state.pendingExpiresAt ?? null });
    }
    requireMutationOrigin(request, deps);
    const body = await readBody(request);
    if (action === 'login') return await login(deps, body);
    if (action === 'recovery') return await requestRecovery(deps, body);
    if (action === 'complete') return await completeRecovery(deps, body);
    const user = await deps.currentUser();
    assertBackupEligible(user);
    await rateLimit(deps, action === 'verify' ? 'verify' : 'manage', `user:${user.id}`);
    if (action === 'verify') {
      const token = tokenParts(body.token);
      requireOk(await deps.rpc('verify_backup_email', { _user_id: user.id, _challenge_id: token.id, _token_hash: token.hash }), 'link');
      return reply({ ok: true });
    }
    const submittedVersion = expectedVersion(body.version);
    if (action === 'begin' && !deps.deliveryReady) throw new BackupEmailError(503, 'delivery_unavailable', 'Backup email delivery is not configured yet. Please try again later.');
    const destination = action === 'begin' ? email(body.email) : null;
    if (action === 'begin' && !destination) throw new BackupEmailError(400, 'invalid_email', 'Enter a valid backup email address.');
    // Bind password proof to a server-read revision. A caller can guess a future
    // browser version; it must not authorize an operation after a concurrent
    // password/security reset. Those changes also advance the SQL version.
    const beforeProof = await deps.rpc('backup_email_state', { _user_id: user.id });
    requireOk(beforeProof);
    const version = number(beforeProof.version);
    if (submittedVersion !== version) throw new BackupEmailError(409, 'state_changed', 'Your backup email settings changed. Refresh them and try again.');
    await reauthenticate(deps, user, body.currentPassword);
    if (action === 'remove') {
      requireOk(await deps.rpc('remove_backup_email', { _user_id: user.id, _expected_version: version }));
      return reply({ ok: true });
    }
    const secret = randomBytes(32).toString('base64url');
    const begun = await deps.rpc('begin_backup_email', { _user_id: user.id, _email: destination, _token_hash: createHash('sha256').update(secret).digest('hex'), _request_id: randomUUID(), _expected_version: version, _network_hash: networkHash(deps) });
    requireOk(begun);
    const id = requiredString(begun.challengeId);
    const link = `${deps.config!.origin}/auth/verify-backup-email#token=${id}.${secret}`;
    try {
      await deps.send({ id, to: destination!, subject: 'Verify your Reboot backup email', text: `Confirm this address as your Reboot backup email. Open this link while signed in to the account that requested it:\n\n${link}\n\nThis link expires shortly and can be used once. If you did not request this, ignore this email.` });
    } catch { throw new BackupEmailError(503, 'delivery_unavailable', 'We could not confirm delivery. Check your inbox, or refresh your settings to request a fresh link.'); }
    return reply({ ok: true, pendingEmail: destination, expiresAt: begun.expiresAt });
  } catch (error) {
    if (error instanceof BackupEmailError) return reply({ error: error.message, code: error.code }, error.status);
    return reply({ error: 'Account access could not be verified. Please try again.', code: 'unavailable' }, 503);
  }
}

async function login(deps: BackupEmailDependencies, body: Record<string, unknown>): Promise<Response> {
  const identifier = email(body.email);
  const suppliedPassword = string(body.password);
  if (!identifier || !suppliedPassword || suppliedPassword.length > 1024) throw invalidCredentials();
  const resolved = await deps.rpc('resolve_login_email', { _email: identifier, _network_hash: networkHash(deps) });
  if (resolved.status === 'rate_limited') requireOk(resolved);
  if (resolved.status !== 'ok' || !['primary', 'backup'].includes(string(resolved.kind))) throw invalidCredentials();
  const userId = requiredString(resolved.userId);
  const auth = deps.auth();
  let published = false;
  try {
    const result = await auth.signInWithPassword({ email: requiredString(resolved.canonicalEmail), password: suppliedPassword });
    if (result.error || !result.data.session || result.data.user?.id !== userId) throw invalidCredentials();
    const kind = resolved.kind as 'primary' | 'backup';
    if (kind === 'backup') assertBackupEligible(result.data.user);
    await deps.checkLoginAccount(result.data.user, kind);
    const recheck = await deps.rpc('recheck_login_email', { _user_id: userId, _email: identifier, _version: number(resolved.version) });
    if (recheck.status !== 'ok') throw invalidCredentials();
    await deps.commitSession(result.data.session);
    published = true;
    return reply({ ok: true });
  } finally { if (!published) await discardSession(auth); }
}

async function requestRecovery(deps: BackupEmailDependencies, body: Record<string, unknown>): Promise<Response> {
  const accepted = () => reply({ ok: true, message: RECOVERY_MESSAGE });
  const identifier = email(body.email);
  if (!identifier) return accepted();
  const secret = randomBytes(32).toString('base64url');
  const result = await deps.rpc('begin_backup_recovery', { _email: identifier, _token_hash: createHash('sha256').update(secret).digest('hex'), _request_id: randomUUID(), _network_hash: networkHash(deps) });
  if (result.status === 'primary') {
    // Keep primary recovery and first-password setup on Supabase's native path.
    await deps.auth().resetPasswordForEmail(requiredString(result.email), { redirectTo: `${deps.config!.origin}/reset-password` }).catch(() => {});
    return accepted();
  }
  if (result.status !== 'ok' || !deps.deliveryReady) return accepted();
  const id = requiredString(result.grantId);
  const destination = requiredString(result.email);
  const link = `${deps.config!.origin}/auth/recover-backup-email#token=${id}.${secret}`;
  // Public recovery responses do not reveal whether an address exists, is
  // eligible, throttled, or whether the receiving mail service rejected it.
  await deps.send({ id, to: destination, subject: 'Reset your Reboot password', text: `A password reset was requested using your verified Reboot backup email. Choose a new password here:\n\n${link}\n\nThis link expires shortly and can be used once. Your primary Reboot email will stay the same. If you did not request this, ignore this email.` }).catch(() => {});
  return accepted();
}

async function completeRecovery(deps: BackupEmailDependencies, body: Record<string, unknown>): Promise<Response> {
  const token = tokenParts(body.token);
  const newPassword = password(body.password, 8);
  await rateLimit(deps, 'recovery', `grant:${token.id}`);
  const grant = await deps.rpc('consume_backup_recovery', { _grant_id: token.id, _token_hash: token.hash });
  requireOk(grant, 'link');
  // The one-use app grant is consumed BEFORE any GoTrue recovery token/session
  // exists. Nothing below is retried or exported to the browser.
  const userId = requiredString(grant.userId);
  const canonicalEmail = requiredString(grant.canonicalEmail);
  const auth = deps.auth();
  let updateStarted = false;
  let allSessionsRevoked = false;
  try {
    const generated = await deps.generateRecovery(canonicalEmail);
    if (!generated.tokenHash || generated.user?.id !== userId) throw invalidLink();
    assertBackupEligible(generated.user);
    const verified = await auth.verifyOtp({ token_hash: generated.tokenHash, type: 'recovery' });
    if (verified.error || !verified.data.session || verified.data.user?.id !== userId) throw invalidLink();
    assertBackupEligible(verified.data.user);
    await deps.checkLoginAccount(verified.data.user, 'backup');
    const recheck = await deps.rpc('recheck_backup_recovery', { _redemption_id: requiredString(grant.redemptionId), _user_id: userId, _version: number(grant.version), _credential_epoch: number(grant.credentialEpoch) });
    requireOk(recheck, 'link');
    updateStarted = true;
    const updated = await auth.updateUser({ password: newPassword });
    if (updated.error) {
      const code = updated.error && typeof updated.error === 'object' && 'code' in updated.error ? updated.error.code : null;
      if (['weak_password', 'same_password', 'password_too_short'].includes(string(code))) {
        throw new BackupEmailError(400, 'invalid_link', 'The password was rejected. Request a fresh link and choose a different password.');
      }
      throw new Error('Password update not confirmed');
    }
    if (updated.data.user?.id !== userId) throw new Error('Password update identity not confirmed');
    const revoked = await auth.signOut({ scope: 'global' }).catch(() => ({ error: true }));
    if (revoked.error) throw new BackupEmailError(503, 'recovery_uncertain', 'Your password was saved, but we could not confirm sign-out on other devices. Sign in with the new password and contact support. Do not reuse this link.');
    allSessionsRevoked = true;
    return reply({ ok: true, passwordUpdated: true });
  } catch (error) {
    if (error instanceof BackupEmailError) throw error;
    if (updateStarted) throw new BackupEmailError(503, 'recovery_uncertain', 'We could not confirm the password change. Try signing in with the new password, or request a fresh reset link. Do not reuse this link.');
    throw invalidLink();
  } finally { if (!allSessionsRevoked) await discardSession(auth); }
}
