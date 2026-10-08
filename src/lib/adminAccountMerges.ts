import { getAdminClient } from '@/lib/supabaseAdmin';

export type AccountMergeRecord = {
  source_user_id: string;
  dest_user_id: string;
  actor_user_id: string | null;
  source_email: string | null;
  dest_email: string | null;
  source_snapshot: {
    execution_actor?: string;
    profile?: { first_name?: string | null; last_name?: string | null; ghl_user_id?: string | null; ghl_contact_id?: string | null };
    auth?: { email?: string | null; phone?: string | null };
  } | null;
  merged_at: string;
};

export type AdminAccountMergeHistory = {
  source_user_id: string;
  source_name: string;
  source_email: string;
  source_ghl_user_id: string | null;
  source_ghl_contact_id: string | null;
  dest_user_id: string;
  dest_email: string;
  merged_at: string;
  actor: { id: string; name: string; email: string } | null;
  execution_actor: 'system' | 'administrator';
};

export async function fetchAdminAccountMerges(supa = getAdminClient()): Promise<AccountMergeRecord[]> {
  const rows: AccountMergeRecord[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supa.from('account_merges')
      .select('source_user_id, dest_user_id, actor_user_id, source_email, dest_email, source_snapshot, merged_at')
      .order('source_user_id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as AccountMergeRecord[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export function currentAccountId(userId: string, merges: AccountMergeRecord[]): string {
  const destinations = new Map(merges.map((merge) => [merge.source_user_id, merge.dest_user_id]));
  const seen = new Set<string>();
  let current = userId;
  while (destinations.has(current)) {
    if (seen.has(current)) throw new Error('Account merge history contains a cycle.');
    seen.add(current);
    current = destinations.get(current)!;
  }
  return current;
}
