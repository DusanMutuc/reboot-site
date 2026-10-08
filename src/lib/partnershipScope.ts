import type { SupabaseClient } from '@supabase/supabase-js';

type RowId = number | string;
type ReadQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  order(column: string, options: { ascending: boolean }): ReadQuery;
  limit(count: number): ReadQuery;
  gt(column: string, value: RowId): ReadQuery;
};

export type VisibleCoachingNote = {
  id: number;
  created_at: string;
  m2_meeting_id: number | null;
};

async function readAllRows<T extends { id: RowId }>(query: () => ReadQuery): Promise<T[]> {
  const rows: T[] = [];
  let cursor: RowId | null = null;
  while (true) {
    let page = query().order('id', { ascending: true }).limit(200);
    if (cursor !== null) page = page.gt('id', cursor);
    const result = await page;
    if (result.error) throw result.error;
    const values = (result.data ?? []) as T[];
    if (!values.length) return rows;
    rows.push(...values);
    const next = values[values.length - 1].id;
    if (String(next) === String(cursor)) throw new Error('Shared coaching history pagination did not advance.');
    cursor = next;
  }
}

// The view expands only active notes-sharing partnerships and omits deleted
// notes. Filtering by the selected member preserves notes owned by either partner.
export function loadVisibleCoachingNotes(client: SupabaseClient, userId: string): Promise<VisibleCoachingNote[]> {
  return readAllRows<VisibleCoachingNote>(() => client.from('coaching_notes')
    .select('id,created_at,m2_meeting_id').eq('user_id', userId));
}

export async function readRowsForIds<T extends { id: RowId }>(
  client: SupabaseClient, table: string, columns: string, foreignKey: string, ids: RowId[],
): Promise<T[]> {
  const uniqueIds = [...new Set(ids.map(String))];
  const rows: T[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const batch = uniqueIds.slice(offset, offset + 100);
    rows.push(...await readAllRows<T>(() => client.from(table).select(columns).in(foreignKey, batch)));
  }
  return [...new Map(rows.map((row) => [String(row.id), row])).values()];
}

// This is an authorization scope, not a replacement identity. Keep the selected
// member for booking links and use visible note IDs when loading shared records.
export async function getNotesScopeUserIds(client: SupabaseClient, userId: string): Promise<string[]> {
  const result = await client.rpc('view_user_ids_for_owner', { _owner: userId, _domain: 'notes' });
  if (result.error) throw result.error;
  const ids = [...new Set((result.data ?? []).map((row: { user_id: string }) => row.user_id))] as string[];
  if (!ids.includes(userId)) throw new Error('Could not resolve the member sharing scope.');
  const activeIds: string[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const profiles = await client.from('profiles').select('id,merged_at').in('id', ids.slice(offset, offset + 100));
    if (profiles.error) throw profiles.error;
    activeIds.push(...(profiles.data ?? []).filter((row) => row.merged_at === null).map((row) => row.id));
  }
  // An archived target never acquires access through an active partner.
  return activeIds.includes(userId) ? activeIds : [];
}
