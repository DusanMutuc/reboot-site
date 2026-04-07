import type { SupabaseClient } from '@supabase/supabase-js';

type LegendRoleRow = {
  user_id: string;
};

const USER_ROLE_CHUNK_SIZE = 500;

function uniqueUserIds(userIds: string[]): string[] {
  return Array.from(
    new Set(userIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)),
  );
}

export async function fetchLegendUserIdSet(
  client: SupabaseClient,
  userIds: string[],
): Promise<Set<string>> {
  const ids = uniqueUserIds(userIds);
  const legendUserIds = new Set<string>();

  for (let index = 0; index < ids.length; index += USER_ROLE_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + USER_ROLE_CHUNK_SIZE);
    const { data, error } = await client
      .from('user_roles')
      .select('user_id, roles!inner(code)')
      .in('user_id', chunk)
      .eq('roles.code', 'legend');

    if (error) {
      throw new Error(error.message);
    }

    for (const row of (data ?? []) as LegendRoleRow[]) {
      legendUserIds.add(row.user_id);
    }
  }

  return legendUserIds;
}
