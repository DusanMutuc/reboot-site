import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCoachingCycles, selectActiveCoachingCycle } from '@/lib/coachingCycles';
import { getContentNodeHref } from '@/lib/contentNodeLinks';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { coachWorkspaceHref, type CoachHomeRange } from '@/lib/coachHomeShared';
import { loadCoachAssignments, loadCoachSchedule, relationshipMeetingKind, type CoachScheduledMeeting } from '@/lib/coachSchedule';
import type { CoachHomeGroupSession, CoachHomeMeeting, CoachHomePriority, CoachHomeResponse, CoachHomeSource } from '@/types/coachHome';
import { COACH_GROUP_CALENDAR_URL, loadPublishedCoachGroups } from '@/lib/coachHomeGroups';

type Profile = { id: string; first_name: string | null; last_name: string | null };
type Review = { id: number; meeting_id: number | null; coaching_note_id: number };
type PriorityRow = { system_id: number; position: number };
type SystemRow = { id: number; label: string; library_item_id: number | null };
const ready: CoachHomeSource = { status: 'ready' };

function rows<T>(result: { data: unknown; error: unknown }): T[] {
  if (result.error) throw new Error('A coaching data source could not be loaded.');
  return (result.data ?? []) as T[];
}

async function mapLimit<T, U>(items: T[], mapper: (item: T) => Promise<U>, limit = 4): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await mapper(items[index]); }
  }));
  return results;
}

async function profilesFor(client: SupabaseClient, ids: string[]): Promise<Profile[]> {
  const pages = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    pages.push(rows<Profile>(await client.from('profiles').select('id,first_name,last_name').in('id', ids.slice(offset, offset + 100))));
  }
  return pages.flat();
}

/** Coach-wide group recommendations come only from the public REBOOT calendar. */
export async function loadCoachHomeGroups(): Promise<{ sessions: CoachHomeGroupSession[]; source: CoachHomeSource }> {
  try {
    return { sessions: await loadPublishedCoachGroups(), source: ready };
  } catch {
    return { sessions: [], source: { status: 'unavailable',
      message: 'The published group calendar could not be loaded. Open the full calendar for all sessions.' } };
  }
}

async function loadMemberContext(client: SupabaseClient, memberId: string, scheduled: CoachScheduledMeeting[]) {
  const cycles = await loadCoachingCycles(client, memberId);
  const active = cycles.cycles.find((cycle) => cycle.id === cycles.activeCycleId);
  const reviewIds = cycles.cycles.flatMap((cycle) => cycle.businessReviewId ? [cycle.businessReviewId] : []);
  const relevantLocal = scheduled.map((item) => item.meeting);
  const localIds = relevantLocal.map((meeting) => meeting.id);
  const [priorityResult, reviewsResult, attendanceResult, sessionResult] = await Promise.all([
    active?.businessReviewId ? client.from('business_review_system_priorities').select('system_id,position')
      .eq('business_review_id', active.businessReviewId).order('position') : Promise.resolve({ data: [], error: null }),
    reviewIds.length ? client.from('business_reviews').select('id,meeting_id,coaching_note_id').in('id', reviewIds) : Promise.resolve({ data: [], error: null }),
    localIds.length ? client.from('meeting_attendance').select('meeting_id').eq('user_id', memberId).in('meeting_id', localIds) : Promise.resolve({ data: [], error: null }),
    localIds.length && cycles.cycles.length ? client.from('implementation_meeting_sessions').select('meeting_id,note_id')
      .in('meeting_id', localIds).in('note_id', cycles.cycles.map((cycle) => cycle.noteId)) : Promise.resolve({ data: [], error: null }),
  ]);
  const priorityRows = rows<PriorityRow>(priorityResult);
  const reviews = rows<Review>(reviewsResult);
  const attendance = new Set(rows<{ meeting_id: number }>(attendanceResult).map((row) => Number(row.meeting_id)));
  const sessions = rows<{ meeting_id: number; note_id: number }>(sessionResult);
  const systems = priorityRows.length ? rows<SystemRow>(await client.from('system_scorecard_systems')
    .select('id,label,library_item_id').in('id', priorityRows.map((row) => row.system_id))) : [];
  const nodeIds = systems.flatMap((system) => system.library_item_id ? [system.library_item_id] : []);
  const nodes = nodeIds.length ? rows<{ id: number; slug: string | null; node_type: string | null }>(await client.from('content_nodes')
    .select('id,slug,node_type').in('id', nodeIds)) : [];
  const priorities: CoachHomePriority[] = priorityRows.flatMap((priority) => {
    const system = systems.find((row) => Number(row.id) === Number(priority.system_id));
    if (!system) return [];
    const node = nodes.find((row) => Number(row.id) === Number(system.library_item_id));
    return [{ id: Number(system.id), label: system.label, guideHref: node ? getContentNodeHref(node) : null }];
  });
  const exactReviewIds = reviews.filter((review) => localIds.includes(Number(review.meeting_id))).map((review) => review.id);
  const preparations = exactReviewIds.length ? rows<{ business_review_id: number; submitted_at: string | null }>(await client.from('business_review_preparation_responses')
    .select('business_review_id,submitted_at').in('business_review_id', exactReviewIds)) : [];
  const links = new Map<string, { href: string; prep: boolean | null }>();
  for (const event of scheduled) {
    const local = event.meeting;
    if (event.kind === 'business_review') {
      const review = reviews.find((row) => Number(row.meeting_id) === Number(local.id));
      if (review) links.set(String(local.id), { href: coachWorkspaceHref(memberId, event.kind, { reviewId: Number(review.id) }),
        prep: preparations.some((row) => Number(row.business_review_id) === Number(review.id) && Boolean(row.submitted_at)) });
    } else {
      const session = sessions.find((row) => Number(row.meeting_id) === Number(local.id));
      const cycle = session ? cycles.cycles.find((row) => row.noteId === Number(session.note_id)) : selectActiveCoachingCycle(cycles.cycles, local.date);
      if (cycle && (session || attendance.has(Number(local.id)))) links.set(String(local.id),
        { href: coachWorkspaceHref(memberId, event.kind, { noteId: cycle.noteId, meetingId: Number(local.id) }), prep: null });
    }
  }
  return { priorities, links };
}

export async function buildCoachHome(coachId: string, roleCodes: string[], range: CoachHomeRange): Promise<CoachHomeResponse> {
  const client = getAdminClient();
  const [coachProfiles, assignments, groups] = await Promise.all([
    profilesFor(client, [coachId]), loadCoachAssignments(client, coachId), loadCoachHomeGroups(),
  ]);
  const profile = coachProfiles[0];
  const responsibilities = [...new Set(assignments.map((row) => relationshipMeetingKind(row.relationship_type) === 'implementation' ? 'implementation' as const : 'primary' as const))];
  if (!responsibilities.length && roleCodes.includes('implementation_coach')) responsibilities.push('implementation');
  let scheduleSource: CoachHomeSource = ready;
  let scheduled: CoachScheduledMeeting[] = [];
  try { scheduled = await loadCoachSchedule(client, coachId, assignments, range); }
  catch { scheduleSource = { status: 'unavailable', message: 'Your saved meetings could not be loaded. Please retry.' }; }
  const memberIds = [...new Set(scheduled.flatMap((item) => item.memberIds))];
  const assignedProfiles = await profilesFor(client, memberIds);
  let prioritiesSource: CoachHomeSource = ready;
  const contexts = new Map(await mapLimit(memberIds, async (memberId) => {
    try {
      return [memberId, await loadMemberContext(client, memberId, scheduled.filter((item) => item.memberIds.includes(memberId)))] as const;
    } catch {
      prioritiesSource = { status: 'partial', message: 'Some member priorities or preparation details could not be loaded. Please retry.' };
      return [memberId, null] as const;
    }
  }));
  const meetings: CoachHomeMeeting[] = scheduled.map((item) => {
    const id = String(item.meeting.id);
    const people = item.memberIds.flatMap((memberId) => {
      const member = assignedProfiles.find((row) => row.id === memberId);
      if (!member) return [];
      return [{ id: memberId, name: `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || 'Member',
        workspaceHref: contexts.get(memberId)?.links.get(id)?.href ?? coachWorkspaceHref(memberId, item.kind) }];
    });
    const memberId = people.find((person) => contexts.get(person.id)?.links.has(id))?.id ?? people[0]?.id;
    const context = memberId ? contexts.get(memberId) : null;
    const link = context?.links.get(id);
    return { id, kind: item.kind, title: item.kind === 'implementation' ? 'Implementation meeting' : 'Business Review',
      start: item.start, end: item.end, dateOnly: item.dateOnly,
      joinUrl: item.meeting.ghl_appointment_id ? `/api/coach/meetings/${id}/join` : null,
      member: memberId ? { id: memberId, name: people.map((person) => person.name).join(' & ') } : null, people,
      workspaceHref: link?.href ?? coachWorkspaceHref(memberId, item.kind), priorities: context?.priorities ?? [],
      prioritiesState: context ? 'ready' : 'unavailable', prepSubmitted: link?.prep ?? null };
  });
  return { timezone: range.timezone, weekStart: range.weekStart, weekEnd: range.weekEnd, generatedAt: new Date().toISOString(),
    coach: { id: coachId, name: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Coach', responsibilities },
    meetings, groupSessions: groups.sessions, groupCalendarUrl: COACH_GROUP_CALENDAR_URL,
    sources: { schedule: scheduleSource, priorities: prioritiesSource, groups: groups.source } };
}
