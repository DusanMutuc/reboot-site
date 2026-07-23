import { DateTime } from 'luxon';
import type { SupabaseClient } from '@supabase/supabase-js';

import { GHL } from '@/lib/config';
import { getAdminClient } from '@/lib/supabaseAdmin';
import type {
  BookingFollowUpGroup,
  BookingFollowUpMember,
  BookingFollowUpResponse,
  BookingMeetingSummary,
  CoachingRelationship,
} from '@/types/bookingFollowUp';

const COURSE_ID = 2;
const FALLBACK_HISTORY_DAYS = 540;
const MAX_HISTORY_DAYS = 540;
const FUTURE_SCAN_DAYS = 180;
const ASSIGNMENT_HISTORY_BUFFER_DAYS = 90;
const GHL_SCAN_CHUNK_DAYS = 180;
const IMPLEMENTATION_REMINDER_DAYS = 4;
const M2_REMINDER_DAYS = 28;
const GHL_FETCH_CONCURRENCY = 4;

type AssignmentRow = {
  user_id: string;
  coach_id: string;
  relationship_type: string | null;
  assigned_at: string | null;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  ghl_user_id: string | null;
};

type PartnershipMembershipRow = {
  partnership_id: string;
  user_id: string;
};

type RawGhlEvent = {
  id?: string | number;
  _id?: string | number;
  title?: string | null;
  name?: string | null;
  appointmentStatus?: string | null;
  status?: string | null;
  startTime?: number | string;
  start?: number | string;
  from?: number | string;
  endTime?: number | string;
  end?: number | string;
  to?: number | string;
  contactId?: string | null;
  contact?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  deleted?: boolean;
};

type NormalizedGhlEvent = {
  id: string;
  title: string;
  status: string | null;
  start: string;
  startMs: number;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
};

type ParsedMeetingTitle = {
  type: 'implementation' | 'm2';
  memberName: string;
};

type MatchedMeeting = NormalizedGhlEvent & {
  type: 'implementation' | 'm2';
  coachId: string;
  coachIds: string[];
  coachName: string;
  studentId: string;
};

type CoachScan = {
  coachId: string;
  events: NormalizedGhlEvent[];
  error: string | null;
};

type BuildOptions = {
  coachId?: string;
};

export async function buildBookingFollowUp(
  options: BuildOptions = {},
): Promise<BookingFollowUpResponse> {
  const supabase = getAdminClient();
  const visibleAssignments = await fetchAssignments(supabase, options.coachId);

  if (visibleAssignments.length === 0) {
    return { generatedAt: new Date().toISOString(), groups: [] };
  }

  const visibleStudentIds = unique(visibleAssignments.map((row) => row.user_id));
  const partnershipMembersByUserId = await fetchActivePartnershipMembers(
    supabase,
    visibleStudentIds,
  );
  const analysisStudentIds = unique(
    visibleStudentIds.flatMap(
      (studentId) => partnershipMembersByUserId.get(studentId) ?? [studentId],
    ),
  );
  const analysisAssignments = await fetchAssignmentsForStudents(supabase, analysisStudentIds);

  const coachIds = unique(analysisAssignments.map((row) => row.coach_id));
  const studentIds = unique([
    ...analysisStudentIds,
    ...analysisAssignments.map((row) => row.user_id),
  ]);
  const allIds = unique([...coachIds, ...studentIds]);

  const [{ data: profileRows, error: profileError }, emailById] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, first_name, last_name, ghl_user_id')
      .in('id', allIds),
    fetchEmails(supabase, new Set(allIds)),
  ]);

  if (profileError) {
    throw new Error(`Could not load coach and member profiles: ${profileError.message}`);
  }

  const profileById = new Map(
    ((profileRows ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
  );
  const scanRange = getScanRange(analysisAssignments);
  const coachScans = await mapWithConcurrency(
    coachIds,
    GHL_FETCH_CONCURRENCY,
    async (coachId) => scanCoachCalendar(
      coachId,
      profileById.get(coachId)?.ghl_user_id ?? null,
      scanRange.startMs,
      scanRange.endMs,
    ),
  );
  const scanByCoachId = new Map(coachScans.map((scan) => [scan.coachId, scan]));
  const meetingCandidateAssignments = expandAssignmentsForPartnerships(
    analysisAssignments,
    partnershipMembersByUserId,
  );
  const assignmentsByCoachId = groupBy(meetingCandidateAssignments, (row) => row.coach_id);
  const meetingsByStudentId = matchMeetingsToStudents({
    coachScans,
    assignmentsByCoachId,
    profileById,
    emailById,
  });

  const visibleByCoachId = groupBy(visibleAssignments, (row) => row.coach_id);
  const groups = Array.from(visibleByCoachId.entries())
    .map(([coachId, assignments]) => buildCoachGroup({
      coachId,
      assignments,
      analysisAssignments,
      profileById,
      emailById,
      meetingsByStudentId,
      scanByCoachId,
      partnershipMembersByUserId,
    }))
    .sort((a, b) => a.coachName.localeCompare(b.coachName, undefined, { sensitivity: 'base' }));

  return { generatedAt: new Date().toISOString(), groups };
}

async function fetchAssignments(
  supabase: SupabaseClient,
  coachId?: string,
): Promise<AssignmentRow[]> {
  let query = supabase
    .from('user_coaches')
    .select('user_id, coach_id, relationship_type, assigned_at')
    .eq('course_id', COURSE_ID)
    .eq('is_active', true);

  if (coachId) query = query.eq('coach_id', coachId);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load coach rosters: ${error.message}`);
  return (data ?? []) as AssignmentRow[];
}

async function fetchAssignmentsForStudents(
  supabase: SupabaseClient,
  studentIds: string[],
): Promise<AssignmentRow[]> {
  if (studentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('user_coaches')
    .select('user_id, coach_id, relationship_type, assigned_at')
    .eq('course_id', COURSE_ID)
    .eq('is_active', true)
    .in('user_id', studentIds);

  if (error) throw new Error(`Could not load related coach assignments: ${error.message}`);
  return (data ?? []) as AssignmentRow[];
}

async function fetchActivePartnershipMembers(
  supabase: SupabaseClient,
  visibleStudentIds: string[],
): Promise<Map<string, string[]>> {
  const membersByUserId = new Map<string, string[]>();
  if (visibleStudentIds.length === 0) return membersByUserId;

  const { data: visibleMemberships, error: visibleMembershipError } = await supabase
    .from('partnership_users')
    .select('partnership_id, user_id, partnerships!inner(is_active)')
    .in('user_id', visibleStudentIds)
    .eq('partnerships.is_active', true);

  if (visibleMembershipError) {
    throw new Error(`Could not load active partnerships: ${visibleMembershipError.message}`);
  }

  const partnershipIds = unique(
    ((visibleMemberships ?? []) as PartnershipMembershipRow[])
      .map((membership) => membership.partnership_id),
  );
  if (partnershipIds.length === 0) return membersByUserId;

  const { data: allMemberships, error: allMembershipError } = await supabase
    .from('partnership_users')
    .select('partnership_id, user_id')
    .in('partnership_id', partnershipIds);

  if (allMembershipError) {
    throw new Error(`Could not load partnership members: ${allMembershipError.message}`);
  }

  const usersByPartnershipId = groupBy(
    (allMemberships ?? []) as PartnershipMembershipRow[],
    (membership) => membership.partnership_id,
  );
  for (const memberships of usersByPartnershipId.values()) {
    const memberIds = unique(memberships.map((membership) => membership.user_id));
    for (const memberId of memberIds) {
      membersByUserId.set(memberId, memberIds);
    }
  }

  return membersByUserId;
}

function expandAssignmentsForPartnerships(
  assignments: AssignmentRow[],
  partnershipMembersByUserId: Map<string, string[]>,
): AssignmentRow[] {
  return assignments.flatMap((assignment) => {
    const memberIds = partnershipMembersByUserId.get(assignment.user_id) ?? [assignment.user_id];
    return memberIds.map((memberId) => ({ ...assignment, user_id: memberId }));
  });
}

async function fetchEmails(
  supabase: SupabaseClient,
  wantedIds: Set<string>,
): Promise<Map<string, string>> {
  const emailById = new Map<string, string>();
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not load account emails: ${error.message}`);

    for (const user of data.users) {
      if (wantedIds.has(user.id) && user.email) {
        emailById.set(user.id, user.email.trim().toLowerCase());
      }
    }

    if (data.users.length < perPage) break;
  }

  return emailById;
}

function getScanRange(assignments: AssignmentRow[]): { startMs: number; endMs: number } {
  const now = DateTime.utc();
  const fallbackStart = now.minus({ days: FALLBACK_HISTORY_DAYS });
  const maximumStart = now.minus({ days: MAX_HISTORY_DAYS });
  const assignedDates = assignments
    .map((row) => DateTime.fromISO(row.assigned_at ?? '', { setZone: true }))
    .filter((date) => date.isValid);
  const earliestAssigned = assignedDates.reduce<DateTime | null>(
    (earliest, date) => (!earliest || date < earliest ? date : earliest),
    null,
  );
  const desiredStart = earliestAssigned?.minus({ days: ASSIGNMENT_HISTORY_BUFFER_DAYS }) ?? fallbackStart;
  const start = desiredStart < maximumStart ? maximumStart : desiredStart;

  return {
    startMs: start.startOf('day').toMillis(),
    endMs: now.plus({ days: FUTURE_SCAN_DAYS }).endOf('day').toMillis(),
  };
}

async function scanCoachCalendar(
  coachId: string,
  ghlUserId: string | null,
  startMs: number,
  endMs: number,
): Promise<CoachScan> {
  const trimmedGhlUserId = ghlUserId?.trim();
  if (!trimmedGhlUserId) {
    return { coachId, events: [], error: 'This coach does not have a GHL user ID.' };
  }
  if (!GHL.BASE || !GHL.TOKEN || !GHL.VERSION || !GHL.LOCATION_ID) {
    return { coachId, events: [], error: 'The GHL calendar connection is not configured.' };
  }

  const base = GHL.BASE.replace(/\/+$/, '');

  try {
    const chunkResults = await Promise.all(
      buildTimeChunks(startMs, endMs, GHL_SCAN_CHUNK_DAYS).map(async (chunk) => {
      const url = new URL(`${base}/calendars/events`);
      url.searchParams.set('locationId', GHL.LOCATION_ID);
      url.searchParams.set('userId', trimmedGhlUserId);
      url.searchParams.set('startTime', String(chunk.startMs));
      url.searchParams.set('endTime', String(chunk.endMs));

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${GHL.TOKEN}`,
          Version: GHL.VERSION,
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return { ok: false as const, status: response.status, detail };
      }

      const payload: unknown = await response.json();
        return { ok: true as const, events: extractRawEvents(payload) };
      }),
    );
    const failedChunk = chunkResults.find((result) => !result.ok);
    if (failedChunk && !failedChunk.ok) {
      console.error('[booking-follow-up] GHL calendar scan failed', {
        coachId,
        status: failedChunk.status,
        detail: failedChunk.detail.slice(0, 500),
      });
      return { coachId, events: [], error: `GHL calendar returned ${failedChunk.status}.` };
    }
    const rawEvents = chunkResults.flatMap((result) => result.ok ? result.events : []);

    const seen = new Set<string>();
    return {
      coachId,
      events: rawEvents
        .map(normalizeGhlEvent)
        .filter(isPresent)
        .filter((event) => {
          const key = `${event.id}:${event.start}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
      error: null,
    };
  } catch (error) {
    console.error('[booking-follow-up] GHL calendar request failed', { coachId, error });
    return { coachId, events: [], error: 'The GHL calendar could not be reached.' };
  }
}

function extractRawEvents(payload: unknown): RawGhlEvent[] {
  if (Array.isArray(payload)) return payload as RawGhlEvent[];
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as { events?: unknown; appointments?: unknown };
  if (Array.isArray(record.events)) return record.events as RawGhlEvent[];
  if (Array.isArray(record.appointments)) return record.appointments as RawGhlEvent[];
  return [];
}

function normalizeGhlEvent(event: RawGhlEvent): NormalizedGhlEvent | null {
  if (event.deleted === true) return null;
  const start = toIsoUtc(event.startTime ?? event.start ?? event.from);
  if (!start) return null;
  const title = readString(event.title) ?? readString(event.name);
  if (!title) return null;

  return {
    id: String(event.id ?? event._id ?? `${title}-${start}`),
    title,
    status: readString(event.appointmentStatus) ?? readString(event.status),
    start,
    startMs: DateTime.fromISO(start).toMillis(),
    contactId: readString(event.contactId) ?? readString(event.contact?.id),
    contactName: readString(event.contact?.name),
    contactEmail: readString(event.contact?.email)?.toLowerCase() ?? null,
  };
}

function matchMeetingsToStudents({
  coachScans,
  assignmentsByCoachId,
  profileById,
  emailById,
}: {
  coachScans: CoachScan[];
  assignmentsByCoachId: Map<string, AssignmentRow[]>;
  profileById: Map<string, ProfileRow>;
  emailById: Map<string, string>;
}): Map<string, MatchedMeeting[]> {
  const meetingsByStudentId = new Map<string, MatchedMeeting[]>();
  const seen = new Map<string, MatchedMeeting>();

  for (const scan of coachScans) {
    const assignments = assignmentsByCoachId.get(scan.coachId) ?? [];
    const coachName = fullName(profileById.get(scan.coachId), emailById.get(scan.coachId));

    for (const event of scan.events) {
      if (isExcludedStatus(event.status)) continue;
      const parsed = parseMeetingTitle(event.title);
      if (!parsed) continue;

      const studentId = matchStudent(event, parsed, assignments, profileById, emailById);
      if (!studentId) continue;

      const dedupeKey = `${event.id}:${parsed.type}:${studentId}`;
      const duplicate = seen.get(dedupeKey);
      if (duplicate) {
        duplicate.coachIds = unique([...duplicate.coachIds, scan.coachId]);
        continue;
      }

      const meeting: MatchedMeeting = {
        ...event,
        type: parsed.type,
        coachId: scan.coachId,
        coachIds: [scan.coachId],
        coachName,
        studentId,
      };
      seen.set(dedupeKey, meeting);
      const existing = meetingsByStudentId.get(studentId) ?? [];
      existing.push(meeting);
      meetingsByStudentId.set(studentId, existing);
    }
  }

  for (const meetings of meetingsByStudentId.values()) {
    meetings.sort((a, b) => a.startMs - b.startMs);
  }
  return meetingsByStudentId;
}

function matchStudent(
  event: NormalizedGhlEvent,
  parsed: ParsedMeetingTitle,
  assignments: AssignmentRow[],
  profileById: Map<string, ProfileRow>,
  emailById: Map<string, string>,
): string | null {
  const candidateIds = unique(assignments.map((row) => row.user_id));

  if (event.contactId) {
    const contactMatches = candidateIds.filter(
      (id) => profileById.get(id)?.ghl_user_id?.trim() === event.contactId,
    );
    if (contactMatches.length === 1) return contactMatches[0];
  }

  if (event.contactEmail) {
    const emailMatches = candidateIds.filter((id) => emailById.get(id) === event.contactEmail);
    if (emailMatches.length === 1) return emailMatches[0];
  }

  const titleName = normalizeName(parsed.memberName);
  const titleMatches = candidateIds.filter(
    (id) => namesProbablyMatch(fullName(profileById.get(id), emailById.get(id)), titleName),
  );
  if (titleMatches.length === 1) return titleMatches[0];

  const contactName = normalizeName(event.contactName ?? '');
  if (contactName) {
    const contactNameMatches = candidateIds.filter(
      (id) => namesProbablyMatch(fullName(profileById.get(id), emailById.get(id)), contactName),
    );
    if (contactNameMatches.length === 1) return contactNameMatches[0];
  }

  return null;
}

function collectSchedulingUnitMeetings(
  studentIds: string[],
  meetingsByStudentId: Map<string, MatchedMeeting[]>,
): MatchedMeeting[] {
  const byMeetingKey = new Map<string, MatchedMeeting>();

  for (const studentId of studentIds) {
    for (const meeting of meetingsByStudentId.get(studentId) ?? []) {
      const key = `${meeting.id}:${meeting.type}:${meeting.start}`;
      if (!byMeetingKey.has(key)) byMeetingKey.set(key, meeting);
    }
  }

  return Array.from(byMeetingKey.values()).sort((a, b) => a.startMs - b.startMs);
}

function buildCoachGroup({
  coachId,
  assignments,
  analysisAssignments,
  profileById,
  emailById,
  meetingsByStudentId,
  scanByCoachId,
  partnershipMembersByUserId,
}: {
  coachId: string;
  assignments: AssignmentRow[];
  analysisAssignments: AssignmentRow[];
  profileById: Map<string, ProfileRow>;
  emailById: Map<string, string>;
  meetingsByStudentId: Map<string, MatchedMeeting[]>;
  scanByCoachId: Map<string, CoachScan>;
  partnershipMembersByUserId: Map<string, string[]>;
}): BookingFollowUpGroup {
  const ownScanError = scanByCoachId.get(coachId)?.error ?? null;
  const analysisByStudentId = groupBy(analysisAssignments, (row) => row.user_id);
  const schedulingUnits = new Map<string, { studentIds: string[]; assignments: AssignmentRow[] }>();

  for (const assignment of assignments) {
    const studentIds = unique(
      partnershipMembersByUserId.get(assignment.user_id) ?? [assignment.user_id],
    ).sort();
    const key = studentIds.join(':');
    const existingUnit = schedulingUnits.get(key);

    if (existingUnit) {
      existingUnit.assignments.push(assignment);
    } else {
      schedulingUnits.set(key, { studentIds, assignments: [assignment] });
    }
  }

  const members = Array.from(schedulingUnits.values())
    .map(({ studentIds, assignments: unitAssignments }) => {
      const schedulingUnitIds = studentIds;
      const schedulingUnitAssignments = schedulingUnitIds.flatMap(
        (unitMemberId) => analysisByStudentId.get(unitMemberId) ?? [],
      );
      const schedulingUnitMeetings = collectSchedulingUnitMeetings(
        schedulingUnitIds,
        meetingsByStudentId,
      );

      return buildMemberRow({
        coachId,
        studentIds,
        assignments: unitAssignments,
        analysisAssignments: schedulingUnitAssignments.length > 0
          ? schedulingUnitAssignments
          : unitAssignments,
        profileById,
        emailById,
        meetings: schedulingUnitMeetings,
        scanByCoachId,
      });
    })
    .sort((a, b) => {
      const attentionDifference = Number(hasAttention(b)) - Number(hasAttention(a));
      return attentionDifference || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

  return {
    coachId,
    coachName: fullName(profileById.get(coachId), emailById.get(coachId)),
    coachEmail: emailById.get(coachId) ?? null,
    dataComplete: !ownScanError,
    dataWarning: ownScanError,
    members,
  };
}

function buildMemberRow({
  coachId,
  studentIds,
  assignments,
  analysisAssignments,
  profileById,
  emailById,
  meetings,
  scanByCoachId,
}: {
  coachId: string;
  studentIds: string[];
  assignments: AssignmentRow[];
  analysisAssignments: AssignmentRow[];
  profileById: Map<string, ProfileRow>;
  emailById: Map<string, string>;
  meetings: MatchedMeeting[];
  scanByCoachId: Map<string, CoachScan>;
}): BookingFollowUpMember {
  const nowMs = Date.now();
  const people = studentIds
    .map((studentId) => ({
      userId: studentId,
      name: fullName(profileById.get(studentId), emailById.get(studentId)),
      email: emailById.get(studentId) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const relationshipTypes = unique(
    assignments.map((row) => normalizeRelationship(row.relationship_type)),
  );
  const monitorsImplementation = relationshipTypes.includes('implementation');
  const assignedAt = earliestIso(assignments.map((row) => row.assigned_at));
  const schedulingUnitAssignedAt = earliestIso(
    analysisAssignments.map((row) => row.assigned_at),
  ) ?? assignedAt;
  const allRelatedCoachIds = unique(analysisAssignments.map((row) => row.coach_id));
  const relatedPrimaryCoachIds = unique(
    analysisAssignments
      .filter((row) => normalizeRelationship(row.relationship_type) === 'primary')
      .map((row) => row.coach_id),
  );
  const requiredCoachIds = monitorsImplementation
    ? allRelatedCoachIds
    : relatedPrimaryCoachIds.length > 0 ? relatedPrimaryCoachIds : [coachId];
  const allScanErrors = allRelatedCoachIds
    .map((relatedCoachId) => scanByCoachId.get(relatedCoachId)?.error ?? null)
    .filter(isPresent);
  const scanErrors = requiredCoachIds
    .map((requiredCoachId) => scanByCoachId.get(requiredCoachId)?.error ?? null)
    .filter(isPresent);
  const dataComplete = scanErrors.length === 0;
  const pastMeetings = meetings.filter((meeting) => meeting.startMs <= nowMs);
  const futureMeetings = meetings.filter((meeting) => meeting.startMs > nowMs);
  const lastImplementation = lastOfType(pastMeetings, 'implementation');
  const lastM2 = lastOfType(pastMeetings, 'm2');
  const lastMeeting = pastMeetings.at(-1) ?? null;
  const upcomingImplementation = firstOfType(futureMeetings, 'implementation');
  const upcomingM2 = firstOfType(futureMeetings, 'm2');
  const cycleStartMs = lastM2?.startMs ?? isoToMillis(schedulingUnitAssignedAt) ?? Number.NEGATIVE_INFINITY;
  const implementationsSinceLastM2 = pastMeetings.filter(
    (meeting) => meeting.type === 'implementation' && meeting.startMs > cycleStartMs,
  ).length;
  const implementationCycleComplete = implementationsSinceLastM2 >= 3;
  const activeMeetingCount = pastMeetings.length + futureMeetings.length;
  const isNewMember = allScanErrors.length === 0 && activeMeetingCount === 0;
  const daysSinceLastMeeting = lastMeeting ? wholeDaysSince(lastMeeting.startMs, nowMs) : null;
  const daysSinceLastM2 = lastM2 ? wholeDaysSince(lastM2.startMs, nowMs) : null;
  const daysSinceAssigned = schedulingUnitAssignedAt
    ? wholeDaysSince(isoToMillis(schedulingUnitAssignedAt) ?? nowMs, nowMs)
    : null;

  const needsImplementation = Boolean(
    dataComplete &&
      !isNewMember &&
      monitorsImplementation &&
      !upcomingImplementation &&
      !implementationCycleComplete &&
      daysSinceLastMeeting !== null &&
      daysSinceLastMeeting >= IMPLEMENTATION_REMINDER_DAYS,
  );
  const needsM2 = Boolean(
    dataComplete &&
      !isNewMember &&
      !upcomingM2 &&
      (daysSinceLastM2 !== null
        ? daysSinceLastM2 >= M2_REMINDER_DAYS
        : daysSinceAssigned !== null && daysSinceAssigned >= M2_REMINDER_DAYS),
  );

  return {
    userId: studentIds.slice().sort().join(':'),
    memberIds: studentIds,
    people,
    name: people.map((person) => person.name).join(' & '),
    email: people.map((person) => person.email).filter(isPresent).join(' & ') || null,
    relationshipTypes,
    assignedAt,
    dataComplete,
    dataWarning: dataComplete
      ? null
      : `Could not scan all related calendars: ${unique(scanErrors).join(' ')}`,
    isNewMember,
    needsImplementation,
    needsM2,
    implementationCycleComplete,
    implementationsSinceLastM2,
    lastImplementation: summarizeMeeting(lastImplementation, nowMs),
    lastM2: summarizeMeeting(lastM2, nowMs),
    upcomingImplementation: summarizeMeeting(upcomingImplementation, nowMs),
    upcomingM2: summarizeMeeting(upcomingM2, nowMs),
  };
}

function parseMeetingTitle(title: string): ParsedMeetingTitle | null {
  const m2 = title.match(/^\s*(.+?)\s+m2\s+meeting\s+with\s+(.+?)\s*$/i);
  if (m2) return { type: 'm2', memberName: m2[1] };

  const implementation = title.match(
    /^\s*implementation\s+meeting\s*\([^)]*\)\s+with\s+(.+?)\s*$/i,
  );
  if (implementation) return { type: 'implementation', memberName: implementation[1] };
  return null;
}

function normalizeRelationship(value: string | null): CoachingRelationship {
  return value === 'implementation' ? 'implementation' : 'primary';
}

function lastOfType(
  meetings: MatchedMeeting[],
  type: MatchedMeeting['type'],
): MatchedMeeting | null {
  return meetings.filter((meeting) => meeting.type === type).at(-1) ?? null;
}

function firstOfType(
  meetings: MatchedMeeting[],
  type: MatchedMeeting['type'],
): MatchedMeeting | null {
  return meetings.find((meeting) => meeting.type === type) ?? null;
}

function summarizeMeeting(
  meeting: MatchedMeeting | null,
  nowMs: number,
): BookingMeetingSummary | null {
  if (!meeting) return null;
  return {
    id: meeting.id,
    title: meeting.title,
    start: meeting.start,
    status: meeting.status,
    coachId: meeting.coachId,
    coachName: meeting.coachName,
    daysAgo: meeting.startMs <= nowMs ? wholeDaysSince(meeting.startMs, nowMs) : null,
  };
}

function isExcludedStatus(status: string | null): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase().replace(/[\s_-]+/g, '');
  return ['cancelled', 'canceled', 'invalid', 'noshow'].includes(normalized);
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function namesProbablyMatch(left: string, right: string): boolean {
  const leftTokens = normalizeName(left).split(' ').filter(Boolean);
  const rightTokens = normalizeName(right).split(' ').filter(Boolean);
  if (leftTokens.join(' ') === rightTokens.join(' ')) return true;
  if (leftTokens.length < 2 || rightTokens.length < 2) return false;
  return leftTokens[0] === rightTokens[0] && leftTokens.at(-1) === rightTokens.at(-1);
}

function fullName(profile: ProfileRow | undefined, email?: string): string {
  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim();
  return name || email || 'Unnamed member';
}

function earliestIso(values: Array<string | null>): string | null {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, ms: isoToMillis(value) }))
    .filter((entry): entry is { value: string; ms: number } => entry.ms !== null)
    .sort((a, b) => a.ms - b.ms);
  return valid[0]?.value ?? null;
}

function isoToMillis(value: string | null): number | null {
  if (!value) return null;
  const parsed = DateTime.fromISO(value, { setZone: true });
  return parsed.isValid ? parsed.toMillis() : null;
}

function toIsoUtc(value: unknown): string | null {
  if (typeof value === 'number') return DateTime.fromMillis(value).toUTC().toISO();
  if (typeof value !== 'string') return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && /^\d+$/.test(value.trim())) {
    return DateTime.fromMillis(asNumber).toUTC().toISO();
  }
  const parsed = DateTime.fromISO(value, { setZone: true });
  return parsed.isValid ? parsed.toUTC().toISO() : null;
}

function wholeDaysSince(startMs: number, endMs: number): number {
  return Math.max(0, Math.floor((endMs - startMs) / 86_400_000));
}

function buildTimeChunks(
  startMs: number,
  endMs: number,
  daysPerChunk: number,
): Array<{ startMs: number; endMs: number }> {
  const chunks: Array<{ startMs: number; endMs: number }> = [];
  const chunkSizeMs = daysPerChunk * 86_400_000;

  for (let chunkStart = startMs; chunkStart < endMs; chunkStart += chunkSizeMs) {
    chunks.push({
      startMs: chunkStart,
      endMs: Math.min(endMs, chunkStart + chunkSizeMs - 1),
    });
  }
  return chunks;
}

function hasAttention(member: BookingFollowUpMember): boolean {
  return member.isNewMember || member.needsImplementation || member.needsM2;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), value]);
  }
  return grouped;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}
