import type { SupabaseClient } from '@supabase/supabase-js';
import { getNotesScopeUserIds } from '@/lib/partnershipScope';
import type { CoachingHistoryNote, CoachingNotesResponse } from '@/types/coachingNotes';

type RowId = number | string;
type ReadQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  order(column: string, options: { ascending: boolean }): ReadQuery;
  limit(count: number): ReadQuery;
  gt(column: string, value: RowId): ReadQuery;
};
type CycleRow = { id: RowId; m2_meeting_id: RowId | null };
type CommentRow = { id: RowId; coaching_note_id: RowId; author_id: string | null; body: string; created_at: string };
type ReviewRow = { id: RowId; coaching_note_id: RowId; meeting_id: RowId | null; review_date: string };
type SessionRow = {
  id: string; note_id: RowId; meeting_id: RowId; notes: string; commitments: string;
  notes_written_at: string | null; notes_author_id: string | null;
  notes_updated_at: string | null; notes_updated_by: string | null;
};
type GeneralRow = { id: string; author_id: string | null; body: string; created_at: string };
type ProfileRow = { id: string; first_name: string | null; last_name: string | null };
type MeetingRow = { id: RowId; date: string };

// Advance by the last returned ID, even when PostgREST caps a page below our
// requested size. Every source and lookup is paged; a long history stays intact.
async function readAll<T extends { id: RowId }>(query: () => ReadQuery): Promise<T[]> {
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
    if (String(next) === String(cursor)) throw new Error('Coaching notes pagination did not advance.');
    cursor = next;
  }
}

async function readRelated<T extends { id: RowId }>(
  client: SupabaseClient, table: string, columns: string, foreignKey: string, ids: RowId[],
): Promise<T[]> {
  const uniqueIds = [...new Set(ids.map(String))];
  const rows: T[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const batch = uniqueIds.slice(offset, offset + 100);
    rows.push(...await readAll<T>(() => client.from(table).select(columns).in(foreignKey, batch)));
  }
  return [...new Map(rows.map((row) => [String(row.id), row])).values()];
}

export async function loadCoachingNotes(client: SupabaseClient, userId: string): Promise<CoachingNotesResponse> {
  const [cycles, memberIds] = await Promise.all([
    // This view preserves existing shared-partner notes and omits deleted cycles.
    readAll<CycleRow>(() => client.from('coaching_notes').select('id,m2_meeting_id').eq('user_id', userId)),
    getNotesScopeUserIds(client, userId),
  ]);
  const cycleById = new Map(cycles.map((row) => [String(row.id), row]));
  const cycleIds = cycles.map((row) => row.id);
  const [comments, reviews, sessions, general] = await Promise.all([
    readRelated<CommentRow>(client, 'coaching_note_comments', 'id,coaching_note_id,author_id,body,created_at', 'coaching_note_id', cycleIds),
    readRelated<ReviewRow>(client, 'business_reviews', 'id,coaching_note_id,meeting_id,review_date', 'coaching_note_id', cycleIds),
    readRelated<SessionRow>(client, 'implementation_meeting_sessions',
      'id,note_id,meeting_id,notes,commitments,notes_written_at,notes_author_id,notes_updated_at,notes_updated_by', 'note_id', cycleIds),
    // An authorized admin can still inspect an archived account's own history;
    // it must never gain another member's notes through sharing.
    readRelated<GeneralRow>(client, 'general_coaching_notes', 'id,author_id,body,created_at', 'user_id', memberIds.length ? memberIds : [userId]),
  ]);
  const visibleSessions = sessions.filter((row) => row.notes.trim() || row.commitments.trim());
  const reviewByCycle = new Map<string, ReviewRow>();
  for (const row of reviews) {
    const previous = reviewByCycle.get(String(row.coaching_note_id));
    if (!previous || row.review_date > previous.review_date
      || (row.review_date === previous.review_date && Number(row.id) > Number(previous.id))) {
      reviewByCycle.set(String(row.coaching_note_id), row);
    }
  }
  const authorIds = [...comments.map((row) => row.author_id), ...general.map((row) => row.author_id),
    ...visibleSessions.flatMap((row) => [row.notes_author_id, row.notes_updated_by])].filter((id): id is string => Boolean(id));
  const meetingIds = [...cycles.map((row) => row.m2_meeting_id), ...visibleSessions.map((row) => row.meeting_id)]
    .filter((id): id is RowId => id !== null);
  const [profiles, meetings] = await Promise.all([
    readRelated<ProfileRow>(client, 'profiles', 'id,first_name,last_name', 'id', authorIds),
    readRelated<MeetingRow>(client, 'meetings', 'id,date', 'id', meetingIds),
  ]);
  const nameById = new Map(profiles.map((row) => [row.id, [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || null]));
  const dateByMeeting = new Map(meetings.map((row) => [String(row.id), row.date]));
  const name = (id: string | null) => id ? nameById.get(id) ?? null : null;
  const notes: CoachingHistoryNote[] = [];
  for (const row of comments) {
    if (!row.body.trim()) continue;
    const cycle = cycleById.get(String(row.coaching_note_id));
    if (!cycle) continue;
    const review = reviewByCycle.get(String(row.coaching_note_id));
    notes.push({ id: `comment:${row.id}`, source: 'business_review', body: row.body,
      writtenAt: row.created_at, authorName: name(row.author_id),
      contextKind: review ? 'business_review' : cycle.m2_meeting_id ? 'm2' : 'legacy',
      contextDate: review?.review_date ?? (cycle.m2_meeting_id ? dateByMeeting.get(String(cycle.m2_meeting_id)) ?? null : null) });
  }
  for (const row of visibleSessions) {
    notes.push({ id: `implementation:${row.id}`, source: 'implementation', body: row.notes,
      ...(row.commitments.trim() ? { commitments: row.commitments } : {}),
      // General session timestamps/actors also change on checkbox and attendance
      // updates. They never stand in for unknown historical note attribution.
      writtenAt: row.notes_written_at ?? null, authorName: name(row.notes_author_id),
      updatedAt: row.notes_updated_at ?? null, updatedByName: name(row.notes_updated_by),
      contextDate: dateByMeeting.get(String(row.meeting_id)) ?? null });
  }
  for (const row of general) {
    if (!row.body.trim()) continue;
    notes.push({ id: `coaching:${row.id}`, source: 'coaching', body: row.body,
      writtenAt: row.created_at, authorName: name(row.author_id) });
  }
  notes.sort((left, right) => {
    if (!left.writtenAt && right.writtenAt) return 1;
    if (left.writtenAt && !right.writtenAt) return -1;
    return (right.writtenAt ?? '').localeCompare(left.writtenAt ?? '') || right.id.localeCompare(left.id);
  });
  return { notes };
}
