import type { SupabaseClient } from '@supabase/supabase-js';

type CurrentMemberRow = {
  user_id: string;
};

type CurrentMemberQueryClient = Pick<SupabaseClient, 'rpc'>;
type CoachingWorkspaceQueryClient = Pick<SupabaseClient, 'from' | 'rpc'>;

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

export async function fetchCoachingWorkspaceUserIds(
  client: CoachingWorkspaceQueryClient,
): Promise<string[]> {
  const [currentMemberIds, { data, error }] = await Promise.all([
    fetchCurrentMemberUserIds(client),
    client
      .from('ninety_day_cycle_users')
      .select('user_id, ninety_day_cycles!inner(status)')
      .is('ended_at', null)
      .eq('ninety_day_cycles.status', 'active'),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  const ninetyDayUserIds = ((data ?? []) as CurrentMemberRow[])
    .map((row) => row.user_id)
    .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0);

  return Array.from(new Set([...currentMemberIds, ...ninetyDayUserIds]));
}

export async function fetchCoachingWorkspaceUserIdSet(
  client: CoachingWorkspaceQueryClient,
): Promise<Set<string>> {
  return new Set(await fetchCoachingWorkspaceUserIds(client));
}
