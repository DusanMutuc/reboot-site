import type { SupabaseClient } from '@supabase/supabase-js';
import { getContentNodeHref } from '@/lib/contentNodeLinks';
import type { ActionStepStatus } from '@/types/coaching';

type IsoDate = string;

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  introduced_at: string | null;
};

type UserMeetingRow = {
  meeting_id: number;
  meeting_date: string;
  meeting_type_code: string;
  title: string | null;
  attended: boolean;
  counts_toward_engagement: boolean;
};

type KpiHistoryRow = {
  period_start_date: string;
  last_updated_at: string | null;
  kpi_values: Record<string, number | null> | null;
};

type KpiRecordMetaRow = {
  last_updated_at: string | null;
};

type CoachingNoteRow = {
  id: number;
  user_id: string;
  created_at: string;
  m2_meeting_id: number | null;
};

type ActionStepRow = {
  id: number;
  coaching_note_id: number;
  label: string;
  status: ActionStepStatus;
  library_item_id: number | null;
  created_at: string;
  updated_at: string | null;
};

type ContentNodeRow = {
  id: number;
  title: string | null;
  slug: string | null;
  node_type: string | null;
};

type NoteCommentRow = {
  id: number;
  body: string;
  created_at: string;
};

type AchievementRow = {
  id: number;
  achieved_at: string;
  achievement:
    | { title: string | null; icon_url: string | null }
    | { title: string | null; icon_url: string | null }[]
    | null;
};

type CourseVisibilityRow = {
  course_node_id: number;
  content_nodes:
    | { id: number; title: string | null; slug: string | null; node_type: string | null }
    | { id: number; title: string | null; slug: string | null; node_type: string | null }[]
    | null;
};

type CourseProgressRow = {
  total_leaves: number;
  completed_leaves: number;
  progress: number;
};

type CourseDetailRow = {
  node_id: number;
  parent_id: number;
  node_type: string;
  title: string | null;
  child_position: number;
  depth: number;
  path_positions: string;
  status: string;
  is_completed: boolean;
};

export type StudentOverviewRecencyKey = 'm2' | 'impl' | 'kpi';

export type StudentOverviewMetricKey =
  | 'gross_revenue'
  | 'profit'
  | 'closed_deals'
  | 'pipeline_15_30'
  | 'repeat_referral'
  | 'days_off';

export type StudentOverviewMetric = {
  key: StudentOverviewMetricKey;
  label: string;
  value: number | null;
  format: 'currency' | 'number';
};

export type StudentOverviewActionStep = {
  id: number;
  label: string;
  status: ActionStepStatus;
  guideHref: string | null;
};

export type StudentOverviewCourse = {
  id: number;
  title: string;
  progressPercent: number;
};

export type StudentOverviewCourseModule = {
  id: number;
  title: string;
  depth: number;
  status: string;
  isCompleted: boolean;
};

export type StudentOverviewAchievement = {
  id: number;
  title: string;
  imageUrl: string;
  achievedAt: string;
};

export type StudentOverviewAttendancePoint = {
  monthKey: string;
  monthLabel: string;
  m2: number;
  impl: number;
  group: number;
};

export type StudentOverviewPrivateNote = {
  id: number;
  body: string;
  createdAt: string;
  authorId: string | null;
};

export type StudentOverviewData = {
  student: {
    id: string;
    fullName: string;
    introducedAt: string | null;
    isIntroduced: boolean;
  };
  recency: Record<StudentOverviewRecencyKey, string | null>;
  coachingWorkspace: {
    actionSteps: StudentOverviewActionStep[];
    notesSummary: string;
    notesUpdatedAt: string | null;
    noteCount: number;
  };
  courses: StudentOverviewCourse[];
  businessMetrics: StudentOverviewMetric[];
  achievements: StudentOverviewAchievement[];
  attendance: {
    snapshot: StudentOverviewAttendancePoint[];
  };
};

const KPI_METRIC_CONFIG: Array<{
  key: StudentOverviewMetricKey;
  label: string;
  format: 'currency' | 'number';
}> = [
  { key: 'gross_revenue', label: 'Gross Revenue', format: 'currency' },
  { key: 'profit', label: 'Profit', format: 'currency' },
  { key: 'closed_deals', label: 'Total Deals Closed', format: 'number' },
  { key: 'pipeline_15_30', label: '15/30 Tracker Count', format: 'number' },
  { key: 'repeat_referral', label: 'Repeat / Referral Count', format: 'number' },
  { key: 'days_off', label: 'Days Off', format: 'number' },
];

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function buildFullName(profile: ProfileRow | null): string {
  const parts = [profile?.first_name, profile?.last_name].filter(
    (part): part is string => Boolean(part),
  );
  return parts.join(' ').trim() || 'Unnamed student';
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function isWednesdayOrFriday(dateValue: string): boolean {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getDay();
  return day === 3 || day === 5;
}

function getMonthWindow(monthCount: number): Date[] {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1);
  const months: Date[] = [];
  for (let i = 0; i < monthCount; i += 1) {
    months.push(new Date(first.getFullYear(), first.getMonth() + i, 1));
  }
  return months;
}

function hasAnyMetricValue(row: KpiHistoryRow | null | undefined): boolean {
  if (!row?.kpi_values) return false;
  return KPI_METRIC_CONFIG.some(({ key }) => row.kpi_values?.[key] != null);
}

function buildAttendanceSnapshot(meetings: UserMeetingRow[]): StudentOverviewAttendancePoint[] {
  const monthBuckets = getMonthWindow(12);
  const map = new Map<string, StudentOverviewAttendancePoint>();

  monthBuckets.forEach((month) => {
    const monthKey = getMonthKey(month);
    map.set(monthKey, {
      monthKey,
      monthLabel: getMonthLabel(month),
      m2: 0,
      impl: 0,
      group: 0,
    });
  });

  meetings.forEach((meeting) => {
    if (!meeting.attended) return;

    const key = `${meeting.meeting_date.slice(0, 7)}-01`;
    const bucket = map.get(key);
    if (!bucket) return;

    if (meeting.meeting_type_code === 'M2_MEETING') {
      bucket.m2 += 1;
      return;
    }

    if (meeting.meeting_type_code === 'IMPLEMENTATION_MEETING') {
      bucket.impl += 1;
      return;
    }

    if (meeting.counts_toward_engagement && isWednesdayOrFriday(meeting.meeting_date)) {
      bucket.group += 1;
    }
  });

  return Array.from(map.values());
}

async function fetchStudentProfile(
  client: SupabaseClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from('profiles')
    .select('id, first_name, last_name, introduced_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('fetchStudentProfile error', error);
    return null;
  }

  return (data as ProfileRow | null) ?? null;
}

async function fetchUserMeetings(
  client: SupabaseClient,
  userId: string,
): Promise<UserMeetingRow[]> {
  const { data, error } = await client.rpc('get_user_meetings', {
    _user_id: userId,
    _from: '2000-01-01',
    _to: '2100-01-01',
  });

  if (error) {
    console.error('fetchUserMeetings error', error);
    return [];
  }

  return (data ?? []) as UserMeetingRow[];
}

async function fetchKpiHistory(
  client: SupabaseClient,
  userId: string,
): Promise<KpiHistoryRow[]> {
  const { data, error } = await client.rpc('get_monthly_kpi_history_with_values', {
    _user_id: userId,
    _limit: 24,
  });

  if (error) {
    console.error('fetchKpiHistory error', error);
    return [];
  }

  return (data ?? []) as KpiHistoryRow[];
}

async function fetchLatestKpiUpdate(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('monthly_kpi_records_base')
    .select('last_updated_at')
    .eq('user_id', userId)
    .order('last_updated_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('fetchLatestKpiUpdate error', error);
    return null;
  }

  const rows = (data ?? []) as KpiRecordMetaRow[];
  return rows[0]?.last_updated_at ?? null;
}

async function fetchLatestCoachingWorkspace(
  client: SupabaseClient,
  userId: string,
  meetings: UserMeetingRow[],
): Promise<StudentOverviewData['coachingWorkspace']> {
  const { data: notesData, error: noteErr } = await client
    .from('coaching_notes')
    .select('id, user_id, created_at, m2_meeting_id')
    .eq('user_id', userId);

  if (noteErr) {
    console.error('fetchLatestCoachingWorkspace notes error', noteErr);
    return {
      actionSteps: [],
      notesSummary: '',
      notesUpdatedAt: null,
      noteCount: 0,
    };
  }

  const notes = (notesData ?? []) as CoachingNoteRow[];
  if (!notes.length) {
    return {
      actionSteps: [],
      notesSummary: '',
      notesUpdatedAt: null,
      noteCount: 0,
    };
  }

  const m2DateById = new Map<number, IsoDate>();
  meetings.forEach((meeting) => {
    if (meeting.meeting_type_code === 'M2_MEETING') {
      m2DateById.set(meeting.meeting_id, meeting.meeting_date);
    }
  });

  const effectiveDate = (note: CoachingNoteRow): string => {
    if (note.m2_meeting_id && m2DateById.has(note.m2_meeting_id)) {
      return m2DateById.get(note.m2_meeting_id) ?? note.created_at;
    }
    return note.created_at;
  };

  const latestNote = notes.reduce((latest, current) => {
    return new Date(effectiveDate(current)).getTime() >
      new Date(effectiveDate(latest)).getTime()
      ? current
      : latest;
  }, notes[0]);

  const [{ data: stepsData, error: stepsErr }, { data: commentsData, error: commentsErr }] =
    await Promise.all([
      client
        .from('coaching_note_action_steps')
        .select('id, coaching_note_id, label, status, library_item_id, created_at, updated_at')
        .eq('coaching_note_id', latestNote.id)
        .order('created_at', { ascending: true }),
      client
        .from('coaching_note_comments')
        .select('id, body, created_at')
        .eq('coaching_note_id', latestNote.id)
        .order('created_at', { ascending: true }),
    ]);

  if (stepsErr) console.error('fetchLatestCoachingWorkspace steps error', stepsErr);
  if (commentsErr) console.error('fetchLatestCoachingWorkspace comments error', commentsErr);

  const rawSteps = (stepsData ?? []) as ActionStepRow[];
  const comments = (commentsData ?? []) as NoteCommentRow[];

  const linkedIds = Array.from(
    new Set(rawSteps.map((step) => step.library_item_id).filter((id): id is number => typeof id === 'number')),
  );

  let nodeMap = new Map<number, ContentNodeRow>();
  if (linkedIds.length > 0) {
    const { data: nodeRows, error: nodeErr } = await client
      .from('content_nodes')
      .select('id, title, slug, node_type')
      .in('id', linkedIds);

    if (nodeErr) {
      console.error('fetchLatestCoachingWorkspace content nodes error', nodeErr);
    } else {
      nodeMap = new Map(
        ((nodeRows ?? []) as ContentNodeRow[]).map((row) => [row.id, row]),
      );
    }
  }

  const actionSteps: StudentOverviewActionStep[] = rawSteps.map((step) => {
    const linkedNode = step.library_item_id ? nodeMap.get(step.library_item_id) : null;
    return {
      id: step.id,
      label: step.label,
      status: step.status,
      guideHref:
        linkedNode && step.library_item_id
          ? getContentNodeHref({
              id: step.library_item_id,
              slug: linkedNode.slug,
              node_type: linkedNode.node_type,
            })
          : null,
    };
  });

  const notesSummary = comments.map((comment) => comment.body.trim()).filter(Boolean).join('\n\n');
  const notesUpdatedAt = comments[comments.length - 1]?.created_at ?? latestNote.created_at;

  return {
    actionSteps,
    notesSummary,
    notesUpdatedAt,
    noteCount: comments.length,
  };
}

async function fetchCourseCards(
  client: SupabaseClient,
  userId: string,
): Promise<StudentOverviewCourse[]> {
  const { data, error } = await client
    .from('user_course_visibility')
    .select('course_node_id, content_nodes!inner(id, title, slug, node_type)')
    .eq('user_id', userId);

  if (error) {
    console.error('fetchCourseCards visibility error', error);
    return [];
  }

  const visibilityRows = (data ?? []) as CourseVisibilityRow[];
  const cards = await Promise.all(
    visibilityRows.map(async (row) => {
      const course = one(row.content_nodes);
      if (!course) return null;

      const { data: progressData, error: progressErr } = await client.rpc('get_user_course_progress', {
        _user_id: userId,
        _course_id: course.id,
      });

      if (progressErr) {
        console.error('fetchCourseCards progress error', progressErr);
      }

      const progressRow = one(progressData as CourseProgressRow | CourseProgressRow[] | null);
      const progressPercent = Math.max(
        0,
        Math.min(100, Math.round((progressRow?.progress ?? 0) * 100)),
      );

      return {
        id: course.id,
        title: course.title ?? 'Untitled course',
        progressPercent,
      } satisfies StudentOverviewCourse;
    }),
  );

  return cards
    .filter((card): card is StudentOverviewCourse => Boolean(card))
    .sort((a, b) => a.title.localeCompare(b.title));
}

async function fetchAchievements(
  client: SupabaseClient,
  userId: string,
): Promise<StudentOverviewAchievement[]> {
  const { data, error } = await client
    .from('user_achievements')
    .select(
      `
      id,
      achieved_at,
      achievement:achievements (
        title,
        icon_url
      )
    `,
    )
    .eq('user_id', userId)
    .order('achieved_at', { ascending: false });

  if (error) {
    console.error('fetchAchievements error', error);
    return [];
  }

  return ((data ?? []) as AchievementRow[]).map((row) => {
    const achievement = one(row.achievement);
    return {
      id: row.id,
      title: achievement?.title ?? 'Achievement',
      imageUrl: achievement?.icon_url ?? '',
      achievedAt: row.achieved_at,
    };
  });
}

export async function fetchStudentOverviewData(
  client: SupabaseClient,
  userId: string,
): Promise<StudentOverviewData> {
  const [profile, meetings, kpiHistory, latestKpiUpdate, courses, achievements] =
    await Promise.all([
      fetchStudentProfile(client, userId),
      fetchUserMeetings(client, userId),
      fetchKpiHistory(client, userId),
      fetchLatestKpiUpdate(client, userId),
      fetchCourseCards(client, userId),
      fetchAchievements(client, userId),
    ]);

  const coachingWorkspace = await fetchLatestCoachingWorkspace(client, userId, meetings);

  const latestM2Meeting =
    meetings
      .filter(
        (meeting) =>
          meeting.meeting_type_code === 'M2_MEETING' && Boolean(meeting.attended),
      )
      .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))[0] ?? null;

  const latestImplMeeting =
    meetings
      .filter(
        (meeting) =>
          meeting.meeting_type_code === 'IMPLEMENTATION_MEETING' &&
          Boolean(meeting.attended),
      )
      .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))[0] ?? null;

  const latestKpiRowWithValues =
    [...kpiHistory]
      .sort((a, b) => b.period_start_date.localeCompare(a.period_start_date))
      .find((row) => hasAnyMetricValue(row)) ?? null;

  const businessMetrics: StudentOverviewMetric[] = KPI_METRIC_CONFIG.map((metric) => ({
    key: metric.key,
    label: metric.label,
    value: latestKpiRowWithValues?.kpi_values?.[metric.key] ?? null,
    format: metric.format,
  }));

  return {
    student: {
      id: userId,
      fullName: buildFullName(profile),
      introducedAt: profile?.introduced_at ?? null,
      isIntroduced: Boolean(profile?.introduced_at),
    },
    recency: {
      m2: latestM2Meeting?.meeting_date ?? null,
      impl: latestImplMeeting?.meeting_date ?? null,
      kpi: latestKpiUpdate,
    },
    coachingWorkspace,
    courses,
    businessMetrics,
    achievements,
    attendance: {
      snapshot: buildAttendanceSnapshot(meetings),
    },
  };
}

export async function fetchStudentCourseModules(
  client: SupabaseClient,
  userId: string,
  courseId: number,
): Promise<StudentOverviewCourseModule[]> {
  const { data, error } = await client.rpc('get_user_course_completion_detail', {
    _user_id: userId,
    _course_id: courseId,
  });

  if (error) {
    console.error('fetchStudentCourseModules error', error);
    return [];
  }

  return ((data ?? []) as CourseDetailRow[])
    .sort((a, b) => {
      if (a.path_positions !== b.path_positions) {
        return a.path_positions.localeCompare(b.path_positions, undefined, {
          numeric: true,
        });
      }
      return a.child_position - b.child_position;
    })
    .map((row) => ({
      id: row.node_id,
      title: row.title ?? 'Untitled module',
      depth: row.depth,
      status: row.status,
      isCompleted: row.is_completed,
    }));
}

export async function fetchPrivateNotes(
  client: SupabaseClient,
  userId: string,
): Promise<StudentOverviewPrivateNote[]> {
  const { data, error } = await client
    .from('coaching_private_notes')
    .select('id, body, created_at, author_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchPrivateNotes error', error);
    return [];
  }

  return ((data ?? []) as Array<{
    id: number;
    body: string;
    created_at: string;
    author_id: string | null;
  }>).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorId: row.author_id,
  }));
}

export async function addPrivateNote(
  client: SupabaseClient,
  params: {
    userId: string;
    authorId: string | null;
    body: string;
  },
): Promise<void> {
  const { error } = await client.from('coaching_private_notes').insert({
    user_id: params.userId,
    author_id: params.authorId,
    body: params.body.trim(),
  });

  if (error) {
    console.error('addPrivateNote error', error);
    throw error;
  }
}
