import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNT_MERGED_CODE, ACCOUNT_MERGED_MESSAGE, ACCOUNT_MERGED_PATH } from './accountLifecycle';

// Revalidate after an Auth exchange: middleware ran before the browser acquired
// that new session. The server validates the bearer rather than trusting claims.
export async function assertAccountSessionAllowed(client: Pick<SupabaseClient, 'auth'>): Promise<void> {
  const { data, error } = await client.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) throw new Error('Please sign in to continue.');
  const response = await fetch('/api/auth/account-status', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (result && typeof result === 'object' && 'code' in result && result.code === ACCOUNT_MERGED_CODE) {
      await client.auth.signOut({ scope: 'local' }).catch(() => {});
      window.location.replace(ACCOUNT_MERGED_PATH);
      throw new Error(ACCOUNT_MERGED_MESSAGE);
    }
    throw new Error('Account access could not be verified. Please try again.');
  }
  if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
    throw new Error('Account access could not be verified. Please try again.');
  }
}
