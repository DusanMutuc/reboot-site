import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAccountLifecycle, isAccountMerged } from '@/lib/accountLifecycle';

/** Run after admin authorization, before changing an account or its Auth user. */
export async function archivedAccountWriteResponse(
  client: Pick<SupabaseClient, 'from'>,
  userId: string,
): Promise<NextResponse | null> {
  try {
    const lifecycle = await fetchAccountLifecycle(client, userId);
    return isAccountMerged(lifecycle)
      ? NextResponse.json({
        error: 'This account is a read-only merged archive. Open the current account to make changes.',
        merged_into_user_id: lifecycle.merged_into_user_id,
      }, { status: 409 })
      : null;
  } catch {
    return NextResponse.json({ error: 'Could not verify the account status. No changes were made.' }, { status: 503 });
  }
}
