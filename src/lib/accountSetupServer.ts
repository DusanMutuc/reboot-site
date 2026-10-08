import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const ACCOUNT_SETUP_REDIRECT = 'https://hub.rebootmembers.com/reset-password';

export function createSetupCredential() {
  // This credential is never displayed or sent to the member. Email recovery
  // establishes the session in which they choose their own password.
  return randomBytes(48).toString('base64url') + 'aA1!';
}

export async function sendAccountSetupEmail(client: SupabaseClient, email: string): Promise<boolean> {
  try {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: ACCOUNT_SETUP_REDIRECT });
    return !error;
  } catch {
    return false;
  }
}
