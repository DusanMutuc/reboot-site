import 'server-only';

import { DateTime } from 'luxon';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import type {
  BookingOption,
  CoachingAttendance,
  ContentItem,
  HelpStep,
  HomeData,
  MeetingSlot,
  Metric,
  OnePageExtras,
  Priority,
  RequiredTraining,
  TrainingStanding,
  UtilityLink,
} from '@/components/home/types';
import { BUSINESS_AUDIT_TIMEZONE } from '@/lib/businessAuditConfig';
import { isCancelledGhlStatus } from '@/lib/businessReviews';
import { loadCoachingCycles, type CoachingCycle } from '@/lib/coachingCycles';
import { getAvailableCourseIdsForUser } from '@/lib/courseAccess';
import { getContentNodeHref } from '@/lib/contentNodeLinks';
import { loadBusinessAuditPreparation } from '@/lib/businessAuditPreparation';
import { GHL } from '@/lib/config';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { loadRequiredTraining } from '@/lib/trainingAssignments';

/**
 * These are product requirements, not fallback heuristics. Keeping them next
 * to the live home loader makes it difficult to accidentally ship an
 * accessible course as "assigned", or arbitrary tags as curated categories.
 */
export const MOMENTUM_HOME_REQUIRED_CAPABILITIES = {
  assignedTraining: 'required',
  browseCategoryAdministration: 'required',
  sprintRecommendations: 'required',
} as const;

export type MomentumHomePayload = {
  data: HomeData;
  extras: OnePageExtras;
  meetings: MeetingSlot[];
  priorities: Priority[];
  requiredTraining: RequiredTraining | null;
  trainingStanding: TrainingStanding;
  recommended: ContentItem[];
  content: ContentItem[];
  isLegend: boolean;
  year: number;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  ghl_user_id: string | null;
};

type CoachAssignmentRow = {
  coach_id: string;
  relationship_type: string | null;
  assigned_at: string | null;
};

type CoachProfileRow = {
  user_id: string;
  m2_booking_url: string | null;
  impl_booking_url: string | null;
  call15_url: string | null;
};

type PersonRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type SupportLinks = {
  bookingOptions: BookingOption[];
  primaryBookingUrl: string | null;
  primaryCoachName: string | null;
  implementationBookingUrl: string | null;
  implementationCoachName: string | null;
};

type MeetingTypeJoin = {
  code: string | null;
  name: string | null;
};

type HomeMeetingRow = {
  id: number;
  date: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  meeting_timezone: string | null;
  ghl_status: string | null;
  ghl_appointment_id: string | null;
  meeting_types: MeetingTypeJoin | MeetingTypeJoin[] | null;
};

type UserMeetingRow = {
  meeting_id: number;
  meeting_date: string;
  meeting_type_code: string;
  attended: boolean;
  counts_toward_engagement: boolean;
};

type KpiHistoryRow = {
  period_start_date: string;
  kpi_values: Record<string, number | null> | null;
};

type ActionStepRow = {
  id: number;
  label: string;
  status: 'not_started' | 'in_progress' | 'complete';
  library_item_id: number | null;
  created_at: string;
};

type PriorityPositionRow = {
  action_step_id: number;
  position: number;
};

type LinkedNodeRow = {
  id: number;
  slug: string | null;
  node_type: string | null;
};

type ContentBlockResourceRow = {
  node_id: number;
  resource_id: number | null;
};

type ResourceDurationRow = {
  id: number;
  duration: number | null;
};

type ProgressRow = {
  node_id: number;
  completed_at: string | null;
};

type CourseProgressRow = {
  progress: number | null;
};

type CourseRow = {
  id: number;
  title: string | null;
};

type CatalogueResourceRow = {
  id: number;
  title: string;
  type: string;
  thumbnail: string | null;
  duration: number | null;
  url: string | null;
  page_slug?: string | null;
  open_path?: string | null;
};

type RawGhlEvent = {
  id?: string | number;
  _id?: string | number;
  address?: string | null;
  meetingLocation?: string | null;
};

const REBOOT_COACHING_ZOOM = 'https://zoom.us/j/93233351653';
const ASSISTANT_WORKROOM_ZOOM = 'https://zoom.us/j/99652221215';
const REBOOT_CALENDAR = 'https://www.addevent.com/calendar/ez616853';
const ASSISTANT_ONBOARDING = 'https://api.leadconnectorhq.com/widget/bookings/assistant_on';
const FACEBOOK_GROUP = 'https://www.facebook.com/groups/realestatereboot';
const FIND_A_REBOOT_AGENT = 'https://rebootmembers.com/legends';
const AMBASSADOR_HUB = 'https://rebootmembers.com/ambassadors/hub';

const ATTENDANCE_ROWS = [
  { code: 'WEDNESDAY_SESSION', label: 'Wednesday sessions' },
  { code: 'FRIDAY_DROPIN', label: 'Friday drop-in with Ben' },
  { code: 'IMPLEMENTATION_MEETING', label: 'Implementation sessions' },
] as const;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}([/:].*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function fullName(person: PersonRow | null | undefined): string | null {
  const value = [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim();
  return value || null;
}

function firstName(profile: ProfileRow | null, user: User): string {
  const profileName = profile?.first_name?.trim();
  if (profileName) return profileName;

  const metadataName =
    typeof user.user_metadata?.first_name === 'string'
      ? user.user_metadata.first_name.trim()
      : '';
  if (metadataName) return metadataName;

  return user.email?.split('@')[0]?.trim() || 'Member';
}

function buildAmbassadorHubUrl(profile: ProfileRow | null, memberFirstName: string): string | null {
  const contactId = profile?.ghl_user_id?.trim();
  if (!contactId) return null;

  const url = new URL(AMBASSADOR_HUB);
  url.searchParams.set('fn', memberFirstName);
  url.searchParams.set('aid', contactId);
  return url.toString();
}

async function loadProfile(client: SupabaseClient, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from('profiles')
    .select('first_name, last_name, ghl_user_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[momentum-home] profile', error);
    return null;
  }
  return data as ProfileRow | null;
}

async function loadSupportLinks(client: SupabaseClient, userId: string): Promise<SupportLinks> {
  const empty: SupportLinks = {
    bookingOptions: [],
    primaryBookingUrl: null,
    primaryCoachName: null,
    implementationBookingUrl: null,
    implementationCoachName: null,
  };

  const { data, error } = await client
    .from('user_coaches')
    .select('coach_id, relationship_type, assigned_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('assigned_at', { ascending: false });

  if (error) {
    console.error('[momentum-home] coach assignments', error);
    return empty;
  }

  const assignments = (data ?? []) as CoachAssignmentRow[];
  const latest = (relationship: 'primary' | 'implementation') =>
    assignments.find((row) =>
      relationship === 'primary'
        ? row.relationship_type !== 'implementation'
        : row.relationship_type === 'implementation',
    ) ?? null;
  const primary = latest('primary');
  const implementation = latest('implementation');
  const coachIds = Array.from(
    new Set([primary?.coach_id, implementation?.coach_id].filter((id): id is string => Boolean(id))),
  );

  if (coachIds.length === 0) return empty;

  const [profilesResult, linksResult] = await Promise.all([
    client.from('profiles').select('id, first_name, last_name').in('id', coachIds),
    client
      .from('coach_profiles')
      .select('user_id, m2_booking_url, impl_booking_url, call15_url')
      .in('user_id', coachIds),
  ]);

  if (profilesResult.error) console.error('[momentum-home] coach profiles', profilesResult.error);
  if (linksResult.error) console.error('[momentum-home] coach links', linksResult.error);

  const people = new Map(
    ((profilesResult.data ?? []) as PersonRow[]).map((person) => [person.id, person]),
  );
  const links = new Map(
    ((linksResult.data ?? []) as CoachProfileRow[]).map((row) => [row.user_id, row]),
  );
  const primaryLinks = primary ? links.get(primary.coach_id) : null;
  const implementationLinks = implementation ? links.get(implementation.coach_id) : null;
  const primaryBookingUrl = normalizeUrl(primaryLinks?.m2_booking_url);
  const implementationBookingUrl = normalizeUrl(
    implementationLinks?.impl_booking_url ?? implementationLinks?.call15_url,
  );
  const primaryCoachName = primary ? fullName(people.get(primary.coach_id)) : null;
  const implementationCoachName = implementation
    ? fullName(people.get(implementation.coach_id))
    : null;

  return {
    primaryBookingUrl,
    primaryCoachName,
    implementationBookingUrl,
    implementationCoachName,
    bookingOptions: [
      {
        label: 'Momentum coach',
        coachName: primaryCoachName,
        href: primaryBookingUrl,
      },
      {
        label: 'Implementation coach',
        coachName: implementationCoachName,
        href: implementationBookingUrl,
      },
    ].filter((option) => Boolean(option.href)),
  };
}

async function loadGhlJoinUrls(contactId: string | null | undefined): Promise<Map<string, string>> {
  const trimmedId = contactId?.trim();
  if (!trimmedId || !GHL.BASE || !GHL.TOKEN || !GHL.VERSION) return new Map();

  try {
    const response = await fetch(
      `${GHL.BASE.replace(/\/+$/, '')}/contacts/${encodeURIComponent(trimmedId)}/appointments`,
      {
        headers: {
          Authorization: `Bearer ${GHL.TOKEN}`,
          Version: GHL.VERSION,
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return new Map();

    const payload = (await response.json()) as unknown;
    const events: RawGhlEvent[] = Array.isArray(payload)
      ? (payload as RawGhlEvent[])
      : Array.isArray((payload as { appointments?: unknown })?.appointments)
        ? ((payload as { appointments: RawGhlEvent[] }).appointments ?? [])
        : [];

    const result = new Map<string, string>();
    events.forEach((event) => {
      const id = String(event.id ?? event._id ?? '').trim();
      const location = normalizeUrl(event.address ?? event.meetingLocation);
      if (id && location) result.set(id, location);
    });
    return result;
  } catch (error) {
    console.warn('[momentum-home] GHL join links unavailable', error);
    return new Map();
  }
}

function meetingKind(code: string): string {
  return code === 'IMPLEMENTATION_MEETING'
    ? 'Implementation Session'
    : '60-day Business Review';
}

function meetingDateTime(row: HomeMeetingRow): DateTime | null {
  const zone = row.meeting_timezone || BUSINESS_AUDIT_TIMEZONE;
  const value = row.starts_at
    ? DateTime.fromISO(row.starts_at, { setZone: true }).setZone(zone)
    : DateTime.fromISO(row.date, { zone }).startOf('day');
  return value.isValid ? value : null;
}

function meetingWhenLabel(row: HomeMeetingRow, value: DateTime): string {
  if (!row.starts_at) return value.toFormat('cccc d LLLL');
  return `${value.toFormat('cccc d LLLL')}, ${value.toFormat('h:mm a').toLowerCase()}`;
}

function relativeMeetingLabel(value: DateTime, now: DateTime): string {
  const minutes = Math.max(0, Math.round(value.diff(now, 'minutes').minutes));
  if (minutes < 60) return `starts in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;

  const days = Math.max(0, Math.ceil(value.startOf('day').diff(now.startOf('day'), 'days').days));
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

async function loadMeetingSlots(
  client: SupabaseClient,
  userId: string,
  contactId: string | null,
  support: SupportLinks,
): Promise<MeetingSlot[]> {
  const yesterday = DateTime.now().minus({ days: 1 }).toISODate();
  const [{ data, error }, joinUrls] = await Promise.all([
    client
      .from('meetings')
      .select(
        'id, date, title, starts_at, ends_at, meeting_timezone, ghl_status, ghl_appointment_id, meeting_types!inner(code, name), meeting_attendance_base!inner(user_id)',
      )
      .eq('meeting_attendance_base.user_id', userId)
      .in('meeting_types.code', ['M2_MEETING', 'IMPLEMENTATION_MEETING'])
      .gte('date', yesterday ?? '2000-01-01')
      .order('date', { ascending: true })
      .limit(30),
    loadGhlJoinUrls(contactId),
  ]);

  if (error) console.error('[momentum-home] upcoming meetings', error);

  const now = DateTime.now();
  const rows = ((data ?? []) as unknown as HomeMeetingRow[])
    .filter((row) => !isCancelledGhlStatus(row.ghl_status))
    .filter((row) => {
      const start = meetingDateTime(row);
      if (!start) return false;
      const end = row.ends_at
        ? DateTime.fromISO(row.ends_at, { setZone: true })
        : start.plus({ hours: row.starts_at ? 2 : 24 });
      return end >= now;
    });

  const slotFor = (
    id: MeetingSlot['id'],
    code: 'M2_MEETING' | 'IMPLEMENTATION_MEETING',
    bookUrl: string | null,
  ): MeetingSlot => {
    const row = rows
      .filter((candidate) => one(candidate.meeting_types)?.code === code)
      .sort((left, right) => {
        const leftStart = meetingDateTime(left)?.toMillis() ?? Number.MAX_SAFE_INTEGER;
        const rightStart = meetingDateTime(right)?.toMillis() ?? Number.MAX_SAFE_INTEGER;
        return leftStart - rightStart;
      })[0];

    if (!row) {
      return {
        id,
        kind: meetingKind(code),
        startsAt: null,
        whenLabel: null,
        relativeLabel: null,
        joinUrl: null,
        bookUrl: bookUrl ?? '/support',
        imminent: false,
        prepLabel: null,
        prepHref: null,
        prepSubmitted: false,
      };
    }

    const start = meetingDateTime(row)!;
    const appointmentId = row.ghl_appointment_id?.trim() ?? '';
    const joinUrl = appointmentId ? (joinUrls.get(appointmentId) ?? null) : null;
    const imminent = Boolean(
      row.starts_at &&
        joinUrl &&
        start.diff(now, 'minutes').minutes <= 30 &&
        start.plus({ hours: 2 }) >= now,
    );

    return {
      id,
      kind: meetingKind(code),
      startsAt: start.toUTC().toISO(),
      whenLabel: meetingWhenLabel(row, start),
      relativeLabel: relativeMeetingLabel(start, now.setZone(start.zoneName ?? BUSINESS_AUDIT_TIMEZONE)),
      joinUrl,
      bookUrl: bookUrl ?? '/support',
      imminent,
      prepLabel: null,
      prepHref: null,
      prepSubmitted: false,
    };
  };

  return [
    slotFor('business_review', 'M2_MEETING', support.primaryBookingUrl),
    slotFor(
      'implementation',
      'IMPLEMENTATION_MEETING',
      support.implementationBookingUrl,
    ),
  ];
}

function getActiveCycle(
  cycles: Awaited<ReturnType<typeof loadCoachingCycles>> | null,
): CoachingCycle | null {
  if (!cycles?.activeCycleId) return null;
  return cycles.cycles.find((cycle) => cycle.id === cycles.activeCycleId) ?? null;
}

async function loadPriorities(
  client: SupabaseClient,
  activeCycle: CoachingCycle | null,
): Promise<Priority[]> {
  if (!activeCycle) return [];

  const [{ data: stepsData, error: stepsError }, positionsResult] = await Promise.all([
    client
      .from('coaching_note_action_steps')
      .select('id, label, status, library_item_id, created_at')
      .eq('coaching_note_id', activeCycle.noteId)
      .order('created_at', { ascending: true }),
    activeCycle.businessReviewId
      ? client
          .from('business_review_system_priorities')
          .select('action_step_id, position')
          .eq('business_review_id', activeCycle.businessReviewId)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (stepsError) {
    console.error('[momentum-home] action steps', stepsError);
    return [];
  }
  if (positionsResult.error) {
    console.error('[momentum-home] priority positions', positionsResult.error);
  }

  const steps = (stepsData ?? []) as ActionStepRow[];
  const positions = (positionsResult.data ?? []) as PriorityPositionRow[];
  const stepById = new Map(steps.map((step) => [step.id, step]));
  const ordered = positions.length
    ? positions.flatMap((position) => {
        const step = stepById.get(position.action_step_id);
        return step ? [step] : [];
      })
    : steps.slice(0, 3);

  if (ordered.length === 0) return [];

  const linkedIds = Array.from(
    new Set(
      ordered
        .map((step) => step.library_item_id)
        .filter((id): id is number => typeof id === 'number'),
    ),
  );
  const nodeMap = new Map<number, LinkedNodeRow>();
  const minutesByNode = new Map<number, number>();

  if (linkedIds.length > 0) {
    const [nodesResult, blocksResult] = await Promise.all([
      client.from('content_nodes').select('id, slug, node_type').in('id', linkedIds),
      client.from('content_blocks').select('node_id, resource_id').in('node_id', linkedIds),
    ]);

    if (nodesResult.error) console.error('[momentum-home] priority links', nodesResult.error);
    if (blocksResult.error) console.error('[momentum-home] priority durations', blocksResult.error);

    ((nodesResult.data ?? []) as LinkedNodeRow[]).forEach((node) => nodeMap.set(node.id, node));
    const blocks = (blocksResult.data ?? []) as ContentBlockResourceRow[];
    const resourceIds = Array.from(
      new Set(
        blocks
          .map((block) => block.resource_id)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );

    if (resourceIds.length > 0) {
      const { data: resourcesData, error: resourcesError } = await client
        .from('resources')
        .select('id, duration')
        .in('id', resourceIds);

      if (resourcesError) console.error('[momentum-home] resource durations', resourcesError);
      const durations = new Map(
        ((resourcesData ?? []) as ResourceDurationRow[]).map((row) => [row.id, row.duration ?? 0]),
      );
      blocks.forEach((block) => {
        if (!block.resource_id) return;
        const seconds = durations.get(block.resource_id) ?? 0;
        minutesByNode.set(block.node_id, (minutesByNode.get(block.node_id) ?? 0) + seconds / 60);
      });
    }
  }

  const firstInProgress = ordered.findIndex((step) => step.status === 'in_progress');
  const firstUnfinished = ordered.findIndex((step) => step.status !== 'complete');
  const currentIndex = firstInProgress >= 0 ? firstInProgress : firstUnfinished;

  return ordered.map((step, index) => {
    const linked = step.library_item_id ? nodeMap.get(step.library_item_id) : null;
    const minutes = step.library_item_id
      ? Math.max(0, Math.round(minutesByNode.get(step.library_item_id) ?? 0))
      : 0;

    return {
      id: String(step.id),
      title: step.label,
      detail: minutes > 0 ? `The guide takes about ${minutes} minutes.` : '',
      status:
        step.status === 'complete'
          ? 'done'
          : index === currentIndex
            ? 'current'
            : 'todo',
      guideHref:
        linked && step.library_item_id
          ? getContentNodeHref({
              id: step.library_item_id,
              slug: linked.slug,
              node_type: linked.node_type,
            })
          : null,
    } satisfies Priority;
  });
}

async function loadMetrics(
  client: SupabaseClient,
  userId: string,
  year: number,
): Promise<Metric[]> {
  const { data, error } = await client.rpc('get_monthly_kpi_history_for_year', {
    _user_id: userId,
    _year: year,
  });

  if (error) {
    console.error('[momentum-home] KPIs', error);
    return [
      { label: 'Closed deals', value: '—', deltaPct: null },
      { label: 'Gross revenue', value: '—', deltaPct: null },
      { label: '15/30 list', value: '—', deltaPct: null },
      { label: 'Holidays taken', value: '—', deltaPct: null },
    ];
  }

  const rows = [...((data ?? []) as KpiHistoryRow[])].sort((a, b) =>
    a.period_start_date.localeCompare(b.period_start_date),
  );
  let closedDeals = 0;
  let grossRevenue = 0;
  let daysOff = 0;
  let pipeline: number | null = null;

  rows.forEach((row) => {
    const values = row.kpi_values ?? {};
    closedDeals += Number(values.closed_deals ?? 0);
    grossRevenue += Number(values.gross_revenue ?? 0);
    daysOff += Number(values.days_off ?? 0);
    if (values.pipeline_15_30 != null) pipeline = Number(values.pipeline_15_30);
  });

  const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const currency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  return [
    { label: 'Closed deals', value: integer.format(closedDeals), deltaPct: null },
    { label: 'Gross revenue', value: currency.format(grossRevenue), deltaPct: null },
    { label: '15/30 list', value: pipeline == null ? '—' : integer.format(pipeline), deltaPct: null },
    { label: 'Holidays taken', value: integer.format(daysOff), deltaPct: null },
  ];
}

async function loadAttendance(
  client: SupabaseClient,
  userId: string,
): Promise<CoachingAttendance> {
  const now = DateTime.now().setZone(BUSINESS_AUDIT_TIMEZONE);
  const from = now.minus({ days: 60 }).toISODate()!;
  const to = now.toISODate()!;
  const { data, error } = await client.rpc('get_user_meetings', {
    _user_id: userId,
    _from: from,
    _to: to,
  });

  if (error) {
    console.error('[momentum-home] attendance', error);
  }

  const meetings = (data ?? []) as UserMeetingRow[];
  return {
    periodLabel: 'Last 60 days',
    rows: ATTENDANCE_ROWS.map((definition) => {
      const records = Array.from(
        new Map(
          meetings
            .filter(
              (meeting) =>
                meeting.meeting_type_code === definition.code &&
                meeting.counts_toward_engagement,
            )
            .map((meeting) => [meeting.meeting_id, meeting]),
        ).values(),
      ).sort(
        (left, right) =>
          left.meeting_date.localeCompare(right.meeting_date) ||
          left.meeting_id - right.meeting_id,
      );

      return {
        label: definition.label,
        attended: records.filter((meeting) => meeting.attended).length,
        total: records.length,
        meetings: records.map((meeting) => ({
          id: String(meeting.meeting_id),
          dateLabel: DateTime.fromISO(meeting.meeting_date, {
            zone: BUSINESS_AUDIT_TIMEZONE,
          }).toFormat('d LLL'),
          attended: meeting.attended,
        })),
      };
    }),
  };
}

function completedLabel(iso: string | null): string {
  if (!iso) return '';
  const value = DateTime.fromISO(iso, { setZone: true });
  return value.isValid ? `in ${value.toFormat('LLLL')}` : '';
}

async function loadTrainingStanding(
  client: SupabaseClient,
  userId: string,
): Promise<TrainingStanding> {
  try {
    const courseIds = await getAvailableCourseIdsForUser(userId);
    if (courseIds.length === 0) {
      return { completedCount: 0, lastCompleted: null, browseHref: '/courses' };
    }

    const courseProgress = await Promise.all(
      courseIds.map(async (courseId) => {
        const { data, error } = await client.rpc('get_user_course_progress', {
          _user_id: userId,
          _course_id: courseId,
        });
        if (error) {
          console.error('[momentum-home] course progress', { courseId, error });
          return null;
        }

        const row = one(data as CourseProgressRow | CourseProgressRow[] | null);
        return (row?.progress ?? 0) >= 1 ? courseId : null;
      }),
    );
    const completedCourseIds = courseProgress.filter(
      (courseId): courseId is number => typeof courseId === 'number',
    );
    if (completedCourseIds.length === 0) {
      return { completedCount: 0, lastCompleted: null, browseHref: '/courses' };
    }

    const [progressResult, coursesResult] = await Promise.all([
      client
        .from('user_node_progress')
        .select('node_id, completed_at')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .in('node_id', completedCourseIds)
        .order('completed_at', { ascending: false }),
      client.from('content_nodes').select('id, title').in('id', completedCourseIds),
    ]);

    if (progressResult.error) throw progressResult.error;
    if (coursesResult.error) throw coursesResult.error;

    const progress = (progressResult.data ?? []) as ProgressRow[];
    const courses = new Map(
      ((coursesResult.data ?? []) as CourseRow[]).map((course) => [course.id, course]),
    );
    const latest = progress[0] ?? null;
    const latestCourse = latest ? courses.get(latest.node_id) : null;

    return {
      completedCount: completedCourseIds.length,
      lastCompleted:
        latest && latestCourse
          ? {
              title: latestCourse.title ?? 'a course',
              completedLabel: completedLabel(latest.completed_at),
            }
          : null,
      browseHref: '/courses',
    };
  } catch (error) {
    console.error('[momentum-home] training standing', error);
    return { completedCount: 0, lastCompleted: null, browseHref: '/courses' };
  }
}

function formatResourceDuration(seconds: number | null): string {
  if (!seconds || seconds < 60) return '';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function resourceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    video: 'Video',
    podcast: 'Podcast',
    pdf: 'PDF',
    document: 'Document',
    audio: 'Audio',
    image: 'Image',
    link: 'Library',
  };
  return labels[type.toLowerCase()] ?? type;
}

async function loadUncategorisedCatalogue(client: SupabaseClient): Promise<ContentItem[]> {
  const { data, error } = await client.rpc('search_resources_with_page', {
    _q: '',
    _types: null,
    _tag_ids: null,
    _duration: null,
    _date_range: null,
    _sort: 'date_desc',
    _limit: 24,
    _offset: 0,
    _mode: 'strict',
  });

  if (error) {
    console.error('[momentum-home] catalogue', error);
    return [];
  }

  return ((data ?? []) as CatalogueResourceRow[]).map((resource, index) => ({
    id: `resource-${resource.id}`,
    title: resource.title,
    typeLabel: resourceTypeLabel(resource.type),
    metaLabel: formatResourceDuration(resource.duration),
    href: resource.open_path
      ? normalizeUrl(resource.open_path) ?? `/r/${resource.id}`
      : resource.page_slug
        ? `/library/${resource.page_slug}`
        : normalizeUrl(resource.url) ?? `/r/${resource.id}`,
    thumbIndex: index + 1,
    thumbnailUrl: normalizeUrl(resource.thumbnail),
    // Required next pass: populate from admin-managed canonical category tags.
    categories: [],
    progressPct: null,
  }));
}

function buildHelpSteps(support: SupportLinks): HelpStep[] {
  return [
    {
      title: 'Ask your coach',
      detail: 'Fastest route for anything about your business or your numbers.',
      actionLabel: 'Book a call',
      href: support.primaryBookingUrl ?? '#now',
    },
    {
      title: 'Ask the group',
      detail: 'Other Reboot agents have almost certainly hit the same wall.',
      actionLabel: 'Open Facebook group',
      href: FACEBOOK_GROUP,
    },
    {
      title: 'Something is broken',
      detail: 'Login trouble, a missing training, numbers that look wrong.',
      actionLabel: 'Contact support',
      href: '/support',
    },
  ];
}

function buildUtilityLinks(ambassadorUrl: string | null): UtilityLink[] {
  return [
    { label: 'Facebook group', href: FACEBOOK_GROUP },
    ...(ambassadorUrl ? [{ label: 'Refer an agent', href: ambassadorUrl }] : []),
    { label: 'Find an agent to refer to', href: FIND_A_REBOOT_AGENT },
    { label: 'Assistant onboarding', href: ASSISTANT_ONBOARDING },
    { label: 'Get help', href: '/support' },
  ];
}

function buildCallData(meetings: MeetingSlot[], support: SupportLinks) {
  const imminent = meetings.find((meeting) => meeting.imminent && meeting.joinUrl);
  const booked = meetings
    .filter((meeting) => meeting.startsAt)
    .sort((left, right) => (left.startsAt ?? '').localeCompare(right.startsAt ?? ''))[0];
  const next = imminent ?? booked ?? null;

  return {
    callStatus: imminent ? ('imminent' as const) : booked ? ('booked' as const) : ('none' as const),
    nextCall: next
      ? {
          kind: next.kind,
          coachName:
            next.id === 'implementation'
              ? support.implementationCoachName
              : support.primaryCoachName,
          whenLabel: next.whenLabel ?? 'Upcoming',
          relativeLabel: next.relativeLabel ?? '',
          joinUrl: next.joinUrl,
          addToCalendarUrl: null,
        }
      : null,
  };
}

export async function getMomentumHomeData(): Promise<MomentumHomePayload> {
  const guard = await requireUser();
  if (!guard.ok) {
    throw new Error('A signed-in member is required to load the Momentum home.');
  }

  const admin = getAdminClient();
  const userId = guard.user.id;
  const year = DateTime.now().setZone(BUSINESS_AUDIT_TIMEZONE).year;
  const [profile, support, cycles, metrics, trainingStanding, content] = await Promise.all([
    loadProfile(admin, userId),
    loadSupportLinks(admin, userId),
    loadCoachingCycles(admin, userId).catch((error) => {
      console.error('[momentum-home] coaching cycles', error);
      return null;
    }),
    loadMetrics(guard.supabase, userId, year),
    loadTrainingStanding(admin, userId),
    loadUncategorisedCatalogue(guard.supabase),
  ]);
  const memberFirstName = firstName(profile, guard.user);
  const activeCycle = getActiveCycle(cycles);
  const [
    meetingSlots,
    priorities,
    requiredTraining,
    coachingAttendance,
    businessReviewPreparation,
  ] = await Promise.all([
    loadMeetingSlots(admin, userId, profile?.ghl_user_id ?? null, support),
    loadPriorities(admin, activeCycle),
    loadRequiredTraining(admin, userId, activeCycle),
    loadAttendance(admin, userId),
    loadBusinessAuditPreparation(admin, userId).catch((error) => {
      console.error('[momentum-home] business review preparation', error);
      return null;
    }),
  ]);
  const hasUpcomingBusinessReviewPreparation =
    businessReviewPreparation?.audit.timing === 'upcoming';
  const preparationSubmitted = Boolean(
    hasUpcomingBusinessReviewPreparation && businessReviewPreparation?.answers?.submittedAt,
  );
  const meetings = meetingSlots.map((meeting): MeetingSlot => {
    if (meeting.id !== 'business_review' || !hasUpcomingBusinessReviewPreparation) {
      return meeting;
    }

    return {
      ...meeting,
      prepLabel: preparationSubmitted
        ? 'Preparation submitted — you can review or update it anytime.'
        : 'Complete your preparation before the call.',
      prepHref: '/business-review-prep',
      prepSubmitted: preparationSubmitted,
    };
  });
  const calls = buildCallData(meetings, support);
  const ambassadorUrl = buildAmbassadorHubUrl(profile, memberFirstName);

  const data: HomeData = {
    memberFirstName,
    ...calls,
    lastCall: null,
    bookingOptions: support.bookingOptions,
    roomOptions: [
      { label: 'Reboot coaching Zoom', href: REBOOT_COACHING_ZOOM },
      { label: 'Assistant workroom', href: ASSISTANT_WORKROOM_ZOOM },
    ],
    calendar: { label: 'Reboot calendar', href: REBOOT_CALENDAR },
    continueItem: null,
    browseTiles: [],
    latestEpisode: null,
    metrics,
    utilityLinks: buildUtilityLinks(ambassadorUrl),
  };

  const extras: OnePageExtras = {
    actionSteps: [],
    episodes: [],
    wins: [],
    achievements: [],
    attendance: {
      attendedCount: 0,
      totalCount: 0,
      periodLabel: '60-day snapshot',
      streakLabel: null,
      recent: [],
    },
    coachingAttendance,
    helpSteps: buildHelpSteps(support),
    // Momentum uses live search. This remains for the older home variants.
    searchIndex: [],
  };

  return {
    data,
    extras,
    meetings,
    priorities,
    requiredTraining,
    trainingStanding,
    // Required next pass: rank the tagged catalogue against the active sprint.
    recommended: [],
    content,
    isLegend: guard.roleCodes.includes('legend'),
    year,
  };
}
