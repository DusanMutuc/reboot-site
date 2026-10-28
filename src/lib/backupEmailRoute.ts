import { createClient, type Session, type User } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient } from './supabaseAdmin';
import { requireUser } from './requireUser';
import { fetchAccountLifecycle, isAccountMerged } from './accountLifecycle';
import { getBackupEmailConfig, isBackupEmailEnabled } from './backupEmailConfig';
import { getBackupEmailDeliveryConfig, sendBackupEmail } from './backupEmailDelivery';
import { assertBackupEligible, BackupEmailError, handleBackupEmail, type BackupEmailAction, type BackupEmailDependencies } from './backupEmailServer';

export async function backupEmailRoute(request: NextRequest, action: BackupEmailAction): Promise<Response> {
  const config = getBackupEmailConfig();
  const delivery = getBackupEmailDeliveryConfig();
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const freshClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12_000) }) },
  });
  const deps: BackupEmailDependencies = {
    enabled: isBackupEmailEnabled(), config, deliveryReady: delivery !== null,
    // Untrusted forwarding headers cannot select their own quota bucket.
    network: process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown' : 'unknown',
    async currentUser() {
      const guard = await requireUser(request);
      if (!guard.ok) {
        if (guard.res.status === 401) throw new BackupEmailError(401, 'authentication_required', 'Sign in to manage your backup email.');
        if (guard.res.status === 403) throw new BackupEmailError(403, 'account_ineligible', 'Backup email is not available for this account.');
        throw new BackupEmailError(503, 'unavailable', 'Account access could not be verified. Please try again.');
      }
      return guard.user;
    },
    auth: () => freshClient().auth,
    async rpc(name, args) {
      const { data, error } = await getAdminClient().rpc(name, args);
      if (error || !data || typeof data !== 'object' || typeof data.status !== 'string') throw new Error('Backup email storage unavailable');
      return data;
    },
    async checkLoginAccount(user: User, kind) {
      if (isAccountMerged(await fetchAccountLifecycle(getAdminClient(), user.id))) {
        throw new BackupEmailError(403, 'account_ineligible', 'This account is not available. Sign in with your current account.');
      }
      if (kind === 'backup') assertBackupEligible(user);
    },
    async generateRecovery(email) {
      const { data, error } = await getAdminClient().auth.admin.generateLink({ type: 'recovery', email });
      if (error) throw new Error('Recovery token unavailable');
      return { user: data.user, tokenHash: data.properties?.hashed_token ?? null };
    },
    async commitSession(session: Session) {
      // Buffer writes until all identity/alias/lifecycle checks have passed.
      // Never return access or refresh tokens in a JSON response.
      const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: { getAll: () => request.cookies.getAll(), setAll: values => { pendingCookies.push(...values); } },
        auth: { autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      if (error || data.user?.id !== session.user.id) throw new Error('Session could not be saved');
    },
    async send(message) {
      if (!delivery) throw new Error('Email delivery is not configured');
      await sendBackupEmail(delivery, message);
    },
  };
  const result = await handleBackupEmail(request, deps, action);
  if (action !== 'login' || !result.ok || pendingCookies.length === 0) return result;
  const response = new NextResponse(result.body, { status: result.status, headers: result.headers });
  for (const cookie of pendingCookies) response.cookies.set(cookie.name, cookie.value, {
    ...cookie.options, path: '/', sameSite: 'lax', secure: config?.origin.startsWith('https:') === true,
  });
  return response;
}
