import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { GHL } from '@/lib/config';
import { fetchCoachingWorkspaceUserIdSet } from '@/lib/currentMembers';
import { loadCoachingCycles, selectActiveCoachingCycle } from '@/lib/coachingCycles';
import { getNotesScopeUserIds } from '@/lib/partnershipScope';
import { getContentNodeHref } from '@/lib/contentNodeLinks';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { coachWorkspaceHref, normalizeCoachCalendar, safeCoachHomeUrl, type CoachHomeRange, type CoachCalendarEvent } from '@/lib/coachHomeShared';
import type { CoachHomeGroupSession, CoachHomeMeeting, CoachHomePriority, CoachHomeResponse, CoachHomeSource } from '@/types/coachHome';
import { COACH_GROUP_CALENDAR_URL, loadPublishedCoachGroups } from '@/lib/coachHomeGroups';

type Profile = { id: string; first_name: string | null; last_name: string | null; ghl_contact_id: string | null; ghl_user_id: string | null };
type Assignment = { user_id: string; relationship_type: string | null };
type LocalMeeting = { id: number; date: string; ghl_appointment_id: string; ghl_status: string | null };
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
    pages.push(rows<Profile>(await client.from('profiles').select('id,first_name,last_name,ghl_contact_id,ghl_user_id').in('id', ids.slice(offset, offset + 100))));
  }
  return pages.flat();
}

async function loadSchedule(ghlUserId: string | null, range: CoachHomeRange): Promise<{ events: CoachCalendarEvent[]; source: CoachHomeSource }> {
  if (!ghlUserId?.trim()) return { events: [], source: { status: 'unavailable', message: 'Your coaching calendar is not connected yet.' } };
  if (!GHL.BASE || !GHL.TOKEN || !GHL.VERSION || !GHL.LOCATION_ID) {
    return { events: [], source: { status: 'unavailable', message: 'The calendar connection is not configured.' } };
  }
  try {
    const url = new URL(`${GHL.BASE.replace(/\/+$/, '')}/calendars/events`);
    const localDevelopment = process.env.NODE_ENV !== 'production' && url.protocol === 'http:'
      && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !localDevelopment) || url.username || url.password) throw new Error('Invalid calendar configuration.');
    url.searchParams.set('locationId', GHL.LOCATION_ID);
    url.searchParams.set('userId', ghlUserId.trim());
    url.searchParams.set('startTime', String(range.startMs));
    url.searchParams.set('endTime', String(range.endMs));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${GHL.TOKEN}`, Version: GHL.VERSION, Accept: 'application/json' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error('The calendar could not be loaded.');
    return { events: normalizeCoachCalendar(await response.json(), range), source: ready };
  } catch {
    return { events: [], source: { status: 'unavailable', message: 'Your calendar could not be loaded. Please retry.' } };
  }
}

/** No coach filter: coaches need to recommend sessions led by any coach. */
async function loadProgrammeGroups(client: SupabaseClient): Promise<{ sessions: CoachHomeGroupSession[]; source: CoachHomeSource }> {
  const now = DateTime.utc();
  try {
    const result = await client.from('ninety_day_cycle_meetings')
      .select('id,title,starts_at,ends_at,join_url,ninety_day_cycles!inner(name,status)')
      .eq('ninety_day_cycles.status', 'active').gte('starts_at', now.minus({ hours: 2 }).toISO())
      .lt('starts_at', now.plus({ days: 30 }).toISO()).order('starts_at').limit(100);
    const meetings = rows<{ id: number; title: string; starts_at: string; ends_at: string | null; join_url: string | null;
      ninety_day_cycles: { name: string; status: string } | Array<{ name: string; status: string }> }>(result);
    const sessions = meetings.filter((meeting) => Date.parse(meeting.ends_at ?? meeting.starts_at) >= now.toMillis())
      .map((meeting) => {
        const cycle = Array.isArray(meeting.ninety_day_cycles) ? meeting.ninety_day_cycles[0] : meeting.ninety_day_cycles;
        return { id: `ninety-day:${meeting.id}`, title: meeting.title, start: meeting.starts_at, end: meeting.ends_at,
          joinUrl: safeCoachHomeUrl(meeting.join_url), audience: cycle?.name || '90-day programme members' };
      });
    return { sessions, source: ready };
  } catch {
    return { sessions: [], source: { status: 'unavailable', message: 'Group sessions could not be loaded. The full group calendar is still available.' } };
  }
}

export async function loadCoachHomeGroups(client: SupabaseClient): Promise<{ sessions: CoachHomeGroupSession[]; source: CoachHomeSource }> {
  const [programme, published] = await Promise.allSettled([loadProgrammeGroups(client), loadPublishedCoachGroups()]);
  const programmeReady = programme.status === 'fulfilled' && programme.value.source.status === 'ready';
  const publishedReady = published.status === 'fulfilled';
  const sessions = [
    ...(programmeReady && programme.status === 'fulfilled' ? programme.value.sessions : []),
    ...(publishedReady ? published.value : []),
  ].sort((a, b) => a.start.localeCompare(b.start));
  return { sessions, source: programmeReady && publishedReady ? ready : {
    status: programmeReady || publishedReady ? 'partial' : 'unavailable',
    message: !publishedReady ? 'The published group calendar could not be loaded. Open the full calendar for all sessions.'
      : 'Programme sessions could not be loaded. The published REBOOT calendar is shown.',
  } };
}

async function matchMembers(client: SupabaseClient, events: CoachCalendarEvent[], assignedProfiles: Profile[], eligibleIds: Set<string>): Promise<Map<string, string>> {
  const assignedIds = new Set(assignedProfiles.map((profile) => profile.id));
  const result = new Map<string, string>();
  const contacts = [...new Set(events.map((event) => event.contactId).filter((id): id is string => Boolean(id)))];
  const unknown: string[] = [];
  for (const contactId of contacts) {
    const matches = assignedProfiles.filter((profile) => [profile.ghl_contact_id?.trim(), profile.ghl_user_id?.trim()].includes(contactId));
    if (matches.length === 1) result.set(contactId, matches[0].id);
    else if (matches.length === 0) unknown.push(contactId);
  }
  // Resolve a partner only when the notes-sharing scope leads to one assigned
  // member. Never match on names or emails, or promote an unrelated contact.
  for (let offset = 0; offset < unknown.length; offset += 100) {
    const batch = unknown.slice(offset, offset + 100);
    const lookups = await Promise.all(['ghl_contact_id', 'ghl_user_id'].map((column) => client.from('profiles')
      .select('id,first_name,last_name,ghl_contact_id,ghl_user_id').in(column, batch).is('merged_at', null)));
    const profiles = [...new Map(lookups.flatMap((lookup) => rows<Profile>(lookup)).map((profile) => [profile.id, profile])).values()];
    await mapLimit(batch, async (contactId) => {
      const candidates = profiles.filter((profile) => eligibleIds.has(profile.id)
        && [profile.ghl_contact_id?.trim(), profile.ghl_user_id?.trim()].includes(contactId));
      if (candidates.length !== 1) return;
      const aliases = await getNotesScopeUserIds(client, candidates[0].id);
      const visible = aliases.filter((id) => assignedIds.has(id));
      if (visible.length === 1) result.set(contactId, visible[0]);
    });
  }
  return result;
}

async function loadMemberContext(client: SupabaseClient, memberId: string, events: CoachCalendarEvent[], localMeetings: LocalMeeting[]) {
  const cycles = await loadCoachingCycles(client, memberId);
  const active = cycles.cycles.find((cycle) => cycle.id === cycles.activeCycleId);
  const reviewIds = cycles.cycles.flatMap((cycle) => cycle.businessReviewId ? [cycle.businessReviewId] : []);
  const relevantLocal = localMeetings.filter((meeting) => events.some((event) => event.id === meeting.ghl_appointment_id));
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
  for (const event of events) {
    const local = relevantLocal.find((meeting) => meeting.ghl_appointment_id === event.id);
    if (!local) continue;
    if (event.kind === 'business_review') {
      const review = reviews.find((row) => Number(row.meeting_id) === Number(local.id));
      if (review) links.set(event.id, { href: coachWorkspaceHref(memberId, event.kind, { reviewId: Number(review.id) }),
        prep: preparations.some((row) => Number(row.business_review_id) === Number(review.id) && Boolean(row.submitted_at)) });
    } else {
      const session = sessions.find((row) => Number(row.meeting_id) === Number(local.id));
      const cycle = session ? cycles.cycles.find((row) => row.noteId === Number(session.note_id)) : selectActiveCoachingCycle(cycles.cycles, local.date);
      if (cycle && (session || attendance.has(Number(local.id)))) links.set(event.id,
        { href: coachWorkspaceHref(memberId, event.kind, { noteId: cycle.noteId, meetingId: Number(local.id) }), prep: null });
    }
  }
  return { priorities, links };
}

export async function buildCoachHome(coachId: string, roleCodes: string[], range: CoachHomeRange): Promise<CoachHomeResponse> {
  const client = getAdminClient();
  const [coachProfiles, assignmentResult, eligibleIds, groups] = await Promise.all([
    profilesFor(client, [coachId]),
    client.from('user_coaches').select('user_id,relationship_type').eq('coach_id', coachId).eq('is_active', true)
      .or(`ended_at.is.null,ended_at.gt.${new Date().toISOString()}`),
    fetchCoachingWorkspaceUserIdSet(client),
    loadCoachHomeGroups(client),
  ]);
  const profile = coachProfiles[0];
  const assignments = rows<Assignment>(assignmentResult).filter((row) => eligibleIds.has(row.user_id));
  const responsibilities = [...new Set(assignments.map((row) => row.relationship_type === 'implementation' ? 'implementation' as const : 'primary' as const))];
  if (!responsibilities.length && roleCodes.includes('implementation_coach')) responsibilities.push('implementation');
  const [assignedProfiles, schedule] = await Promise.all([
    profilesFor(client, [...new Set(assignments.map((row) => row.user_id))]), loadSchedule(profile?.ghl_user_id ?? null, range),
  ]);
  let prioritiesSource: CoachHomeSource = ready;
  let memberByContact = new Map<string, string>();
  try { memberByContact = await matchMembers(client, schedule.events, assignedProfiles, eligibleIds); }
  catch { prioritiesSource = { status: 'unavailable', message: 'Member context could not be loaded. Open Coaching space to find a member.' }; }
  const memberIds = [...new Set(memberByContact.values())];
  const localMeetings: LocalMeeting[] = [];
  try {
    for (let offset = 0; offset < schedule.events.length; offset += 100) {
      localMeetings.push(...rows<LocalMeeting>(await client.from('meetings').select('id,date,ghl_appointment_id,ghl_status')
        .in('ghl_appointment_id', schedule.events.slice(offset, offset + 100).map((event) => event.id))));
    }
  } catch { prioritiesSource = { status: 'partial', message: 'Exact meeting links could not be loaded. Member workspaces are still available.' }; }
  const contexts = new Map(await mapLimit(memberIds, async (memberId) => {
    try {
      const context = await loadMemberContext(client, memberId,
        schedule.events.filter((event) => event.contactId && memberByContact.get(event.contactId) === memberId), localMeetings);
      return [memberId, context] as const;
    } catch {
      prioritiesSource = { status: 'partial', message: 'Some member priorities or preparation details could not be loaded. Please retry.' };
      return [memberId, null] as const;
    }
  }));
  const meetings: CoachHomeMeeting[] = schedule.events.map((event) => {
    const memberId = event.contactId ? memberByContact.get(event.contactId) : null;
    const member = assignedProfiles.find((row) => row.id === memberId);
    const context = memberId ? contexts.get(memberId) : null;
    const link = context?.links.get(event.id);
    return { id: event.id, kind: event.kind, title: event.kind === 'implementation' ? 'Implementation meeting' : 'Business Review',
      start: event.start, end: event.end, joinUrl: event.joinUrl,
      member: member ? { id: member.id, name: `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || 'Member' } : null,
      workspaceHref: link?.href ?? coachWorkspaceHref(memberId, event.kind), priorities: context?.priorities ?? [],
      prioritiesState: context ? 'ready' : 'unavailable', prepSubmitted: link?.prep ?? null };
  });
  return { timezone: range.timezone, weekStart: range.weekStart, weekEnd: range.weekEnd, generatedAt: new Date().toISOString(),
    coach: { id: coachId, name: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Coach', responsibilities },
    meetings, groupSessions: groups.sessions, groupCalendarUrl: COACH_GROUP_CALENDAR_URL,
    sources: { schedule: schedule.source, priorities: prioritiesSource, groups: groups.source } };
}
