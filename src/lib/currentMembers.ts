import type { SupabaseClient } from '@supabase/supabase-js';

type CurrentMemberRow = {
  user_id: string;
};

type CurrentMemberQueryClient = Pick<SupabaseClient, 'rpc'>;
type CoachingWorkspaceQueryClient = Pick<SupabaseClient, 'from' | 'rpc'>;

/** Archived identities retain historical assignments but never rejoin a roster. */
export async function filterUnmergedAccountIds(
  client: Pick<SupabaseClient, 'from'>,
  userIds: readonly string[],
): Promise<string[]> {
  const uniqueIds = [...new Set(userIds)];
  const available = new Set<string>();
  for (let index = 0; index < uniqueIds.length; index += 200) {
    const { data, error } = await client.from('profiles')
      .select('id, merged_into_user_id')
      .in('id', uniqueIds.slice(index, index + 200));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.merged_into_user_id == null) available.add(row.id);
    }
  }
  return uniqueIds.filter((id) => available.has(id));
}

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

  const ninetyDayUserIds = Array.from(new Set(((data ?? []) as CurrentMemberRow[])
    .map((row) => row.user_id)
    .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)));

  // Removing access does not end a programme enrollment. As with the current
  // member RPC, past_member must take precedence over that remaining enrollment.
  const pastMemberIds = new Set<string>();
  for (let index = 0; index < ninetyDayUserIds.length; index += 200) {
    const { data: pastMembers, error: pastMembersError } = await client
      .from('user_roles')
      .select('user_id, roles!inner(code)')
      .eq('roles.code', 'past_member')
      .in('user_id', ninetyDayUserIds.slice(index, index + 200));

    if (pastMembersError) throw new Error(pastMembersError.message);
    for (const row of (pastMembers ?? []) as CurrentMemberRow[]) {
      pastMemberIds.add(row.user_id);
    }
  }

  return filterUnmergedAccountIds(client, [
    ...currentMemberIds,
    ...ninetyDayUserIds.filter((userId) => !pastMemberIds.has(userId)),
  ]);
}

export async function fetchCoachingWorkspaceUserIdSet(
  client: CoachingWorkspaceQueryClient,
): Promise<Set<string>> {
  return new Set(await fetchCoachingWorkspaceUserIds(client));
}
