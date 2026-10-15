import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { fetchCoachingWorkspaceUserIdSet } from '@/lib/currentMembers';
import type { CoachHomeRange } from '@/lib/coachHomeShared';
import type { CoachHomeMeeting } from '@/types/coachHome';

export type CoachAssignment = { user_id: string; relationship_type: string | null };
export type SavedCoachMeeting = {
  id: number;
  date: string;
  created_by: string | null;
  meeting_type_id: number;
  starts_at: string | null;
  ends_at: string | null;
  ghl_appointment_id: string | null;
  ghl_status: string | null;
};
export type CoachScheduledMeeting = {
  meeting: SavedCoachMeeting;
  kind: CoachHomeMeeting['kind'];
  memberIds: string[];
  start: string;
  end: string | null;
  dateOnly: boolean;
};

export function relationshipMeetingKind(relationship: string | null): CoachHomeMeeting['kind'] | null {
  if (relationship === 'implementation') return 'implementation';
  return relationship === 'primary' || relationship === null ? 'business_review' : null;
}

export function excludedCoachMeeting(status: string | null) {
  return ['cancelled', 'canceled', 'deleted', 'invalid', 'noshow'].includes((status ?? '').toLowerCase().replace(/[\s_-]+/g, ''));
}

function checkedRows<T>(result: { data: unknown; error: unknown }): T[] {
  if (result.error) throw new Error('The saved coaching schedule could not be loaded.');
  return (result.data ?? []) as T[];
}

export async function loadCoachAssignments(client: SupabaseClient, coachId: string): Promise<CoachAssignment[]> {
  const [assignments, eligible] = await Promise.all([
    (async () => {
      const assignments: CoachAssignment[] = [];
      for (let offset = 0; ; offset += 200) {
        const page = checkedRows<CoachAssignment>(await client.from('user_coaches').select('user_id,relationship_type').eq('coach_id', coachId)
          .eq('course_id', 2).eq('is_active', true).or(`ended_at.is.null,ended_at.gt.${new Date().toISOString()}`)
          .order('id').range(offset, offset + 199));
        assignments.push(...page);
        if (page.length < 200) return assignments;
      }
    })(),
    fetchCoachingWorkspaceUserIdSet(client),
  ]);
  return assignments.filter((row) => eligible.has(row.user_id) && relationshipMeetingKind(row.relationship_type));
}

/** Shared attendance expands eligible partners; one saved meeting still produces one agenda row. */
export async function loadCoachSchedule(
  client: SupabaseClient,
  coachId: string,
  assignments: CoachAssignment[],
  range: CoachHomeRange,
  meetingId?: number,
): Promise<CoachScheduledMeeting[]> {
  if (!assignments.length) return [];
  const types = checkedRows<{ id: number; code: string }>(await client.from('meeting_types')
    .select('id,code').in('code', ['IMPLEMENTATION_MEETING', 'M2_MEETING']));
  if (types.length !== 2) throw new Error('The coaching meeting types could not be loaded.');
  const kinds = new Map(types.map((type) => [Number(type.id), type.code === 'IMPLEMENTATION_MEETING' ? 'implementation' as const : 'business_review' as const]));
  const saved: SavedCoachMeeting[] = [];
  for (let offset = 0; ; offset += 200) {
    let query = client.from('meetings')
      .select('id,date,created_by,meeting_type_id,starts_at,ends_at,ghl_appointment_id,ghl_status')
      .in('meeting_type_id', types.map((type) => type.id));
    query = meetingId === undefined
      ? query.or(`and(starts_at.gte.${new Date(range.startMs).toISOString()},starts_at.lt.${new Date(range.endMs).toISOString()}),and(starts_at.is.null,date.gte.${range.weekStart},date.lt.${range.weekEnd})`)
      : query.eq('id', meetingId);
    const page = checkedRows<SavedCoachMeeting>(await query.order('id').range(offset, offset + 199));
    saved.push(...page);
    if (page.length < 200) break;
  }
  // GHL sync records the actual calendar owner in created_by. A stand-in's call
  // must not appear as the assigned coach's own appointment. Manual creators
  // can be admins, so unsynced records retain the roster/type association.
  const candidates = saved.filter((meeting) => !excludedCoachMeeting(meeting.ghl_status)
    && !(meeting.ghl_appointment_id && meeting.created_by && meeting.created_by !== coachId));
  if (!candidates.length) return [];
  const assignedIds = [...new Set(assignments.map((row) => row.user_id))];
  const attendees = new Map<number, Set<string>>();
  for (let meetingOffset = 0; meetingOffset < candidates.length; meetingOffset += 100) {
    for (let memberOffset = 0; memberOffset < assignedIds.length; memberOffset += 100) {
      for (let offset = 0; ; offset += 200) {
        const page = checkedRows<{ meeting_id: number; user_id: string }>(await client.from('meeting_attendance')
          .select('meeting_id,user_id').in('meeting_id', candidates.slice(meetingOffset, meetingOffset + 100).map((meeting) => meeting.id))
          .in('user_id', assignedIds.slice(memberOffset, memberOffset + 100))
          .order('meeting_id').order('user_id').range(offset, offset + 199));
        for (const row of page) {
          const members = attendees.get(Number(row.meeting_id)) ?? new Set<string>();
          members.add(row.user_id);
          attendees.set(Number(row.meeting_id), members);
        }
        if (page.length < 200) break;
      }
    }
  }
  return candidates.flatMap<CoachScheduledMeeting>((meeting) => {
    const kind = kinds.get(Number(meeting.meeting_type_id))!;
    const memberIds = [...(attendees.get(Number(meeting.id)) ?? [])].filter((id) => assignments.some((assignment) =>
      assignment.user_id === id && relationshipMeetingKind(assignment.relationship_type) === kind)).sort();
    if (!memberIds.length) return [];
    const dateOnly = !meeting.starts_at;
    const start = dateOnly ? DateTime.fromISO(meeting.date, { zone: range.timezone }).startOf('day').toUTC().toISO() : meeting.starts_at;
    const end = dateOnly ? DateTime.fromISO(meeting.date, { zone: range.timezone }).endOf('day').toUTC().toISO() : meeting.ends_at;
    if (!start || !Number.isFinite(Date.parse(start))) return [];
    if (meetingId === undefined && (Date.parse(start) < range.startMs || Date.parse(start) >= range.endMs)) return [];
    return [{ meeting, kind, memberIds, start: new Date(start).toISOString(),
      end: end && Number.isFinite(Date.parse(end)) ? new Date(end).toISOString() : null, dateOnly }];
  }).sort((a, b) => a.start.localeCompare(b.start) || Number(a.meeting.id) - Number(b.meeting.id));
}
