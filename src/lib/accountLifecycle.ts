import type { SupabaseClient } from '@supabase/supabase-js';

export const ACCOUNT_MERGED_PATH = '/account-merged';
export const ACCOUNT_MERGED_CODE = 'ACCOUNT_MERGED';
export const ACCOUNT_MERGED_MESSAGE = 'This account has been merged. Please sign in with your current account.';

export type AccountLifecycle = {
  merged_into_user_id: string | null;
  merged_at: string | null;
};

// Server callers use a service client: a merged user's own database requests
// are rejected before PostgREST executes them, including lifecycle reads.
export async function fetchAccountLifecycle(
  client: Pick<SupabaseClient, 'from'>,
  userId: string,
): Promise<AccountLifecycle> {
  const { data, error } = await client.from('profiles')
    .select('merged_into_user_id, merged_at')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data
    || !Object.hasOwn(data, 'merged_into_user_id') || !Object.hasOwn(data, 'merged_at')) {
    throw new Error('Account access could not be verified. Please try again.');
  }
  return data as AccountLifecycle;
}

export function isAccountMerged(account: AccountLifecycle): boolean {
  return account.merged_into_user_id !== null || account.merged_at !== null;
}
