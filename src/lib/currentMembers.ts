import type { SupabaseClient } from '@supabase/supabase-js';

type CurrentMemberRow = {
  user_id: string;
};

type CurrentMemberQueryClient = Pick<SupabaseClient, 'rpc'>;

export async function fetchCurrentMemberUserIds(
  client: CurrentMemberQueryClient,
): Promise<string[]> {
  const { data, error } = await client.rpc('get_current_member_ids');

  if (error) {
    throw new Error(error.message);
  }

  return Array.from(
    new Set(
      ((data ?? []) as CurrentMemberRow[])
        .map((row) => row.user_id)
        .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0),
    ),
  );
}

export async function fetchCurrentMemberUserIdSet(
  client: CurrentMemberQueryClient,
): Promise<Set<string>> {
  return new Set(await fetchCurrentMemberUserIds(client));
}
