import { getAdminClient } from '@/lib/supabaseAdmin';
import {
  fetchCurrentMemberUserIds,
  fetchCurrentMemberUserIdSet,
} from '@/lib/currentMembers';
import type { StatusOverviewRow } from '@/lib/statusOverviewTypes';
import type { UserStatus } from '@/types/coaching';

type CoachAssignmentRow = {
  user_id: string;
};

type ProfileStatusRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  attention_status_auto: UserStatus | null;
  attention_status_manual: UserStatus | null;
  attention_status_manual_reason: string | null;
};

type MeetingTypeJoin =
  | {
      counts_toward_engagement: boolean | null;
    }
  | {
      counts_toward_engagement: boolean | null;
    }[]
  | null;

type MeetingRow = {
  id: number;
  meeting_types: MeetingTypeJoin;
};

type MeetingAttendanceRow = {
  meeting_id: number;
  user_id: string;
  attended: boolean | null;
};

type StatusOverviewSummaryRow = {
  user_id: string;
  last_kpi_at: string | null;
  last_one_on_one_at: string | null;
  last_group_at: string | null;
  completed_courses: number;
  total_courses: number;
};

type RpcStatusOverviewSummaryRow = {
  user_id: string;
  last_kpi_at: string | null;
  last_one_on_one_at: string | null;
  last_group_at: string | null;
  completed_courses: number | null;
  total_courses: number | null;
};

type AttendanceCounts = {
  attended_count: number;
  expected_count: number;
};

type UserMeetingSummaryRow = {
  meeting_date: string;
  meeting_type_code: string;
  attended: boolean;
  counts_toward_engagement: boolean;
};

type KpiHistoryRow = {
  period_start_date: string;
  last_updated_at: string | null;
  kpi_values: Record<string, number | null> | null;
};

type CourseNodeRow = {
  id: number;
};

type CourseProgressRow = {
  progress: number;
};

const USER_CHUNK_SIZE = 200;
const MEETING_CHUNK_SIZE = 500;
const KPI_HISTORY_LIMIT = 24;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function uniqueIds(items: string[]): string[] {
  return Array.from(
    new Set(
      items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
    ),
  );
}

function buildFullName(profile: ProfileStatusRow | undefined): string {
  const first = profile?.first_name?.trim() ?? '';
  const last = profile?.last_name?.trim() ?? '';
  return `${first} ${last}`.trim();
}

function getAttendanceWindow(): { from: string; to: string } {
  const today = new Date();
  const start = new Date(today);
  start.setMonth(start.getMonth() - 2);

  return {
    from: start.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

function hasEngagementFlag(value: MeetingTypeJoin): boolean {
  if (!value) return false;
  if (Array.isArray(value)) {
    return Boolean(value[0]?.counts_toward_engagement);
  }
  return Boolean(value.counts_toward_engagement);
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function hasAnyMetricValue(row: KpiHistoryRow | null | undefined): boolean {
  if (!row?.kpi_values) return false;
  return Object.values(row.kpi_values).some((value) => value != null);
}

function isWednesdayOrFriday(dateValue: string): boolean {
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getUTCDay();
  return day === 3 || day === 5;
}

function defaultSummary(userId: string): StatusOverviewSummaryRow {
  return {
    user_id: userId,
    last_kpi_at: null,
    last_one_on_one_at: null,
    last_group_at: null,
    completed_courses: 0,
    total_courses: 0,
  };
}

function normalizeSummaryMap(
  userIds: string[],
  rows: RpcStatusOverviewSummaryRow[],
): Map<string, StatusOverviewSummaryRow> {
  const map = new Map<string, StatusOverviewSummaryRow>();

  userIds.forEach((userId) => {
    map.set(userId, defaultSummary(userId));
  });

  rows.forEach((row) => {
    map.set(row.user_id, {
      user_id: row.user_id,
      last_kpi_at: row.last_kpi_at ?? null,
      last_one_on_one_at: row.last_one_on_one_at ?? null,
      last_group_at: row.last_group_at ?? null,
      completed_courses: row.completed_courses ?? 0,
      total_courses: row.total_courses ?? 0,
    });
  });

  return map;
}

async function fetchProfileStatusMap(userIds: string[]): Promise<Map<string, ProfileStatusRow>> {
  const ids = uniqueIds(userIds);
  const supa = getAdminClient();
  const rows: ProfileStatusRow[] = [];

  for (const idChunk of chunk(ids, USER_CHUNK_SIZE)) {
    const { data, error } = await supa
      .from('profiles')
      .select(
        'id, first_name, last_name, attention_status_auto, attention_status_manual, attention_status_manual_reason',
      )
      .in('id', idChunk);

    if (error) {
      throw new Error(error.message);
    }

    rows.push(...((data ?? []) as ProfileStatusRow[]));
  }

  return new Map(rows.map((row) => [row.id, row]));
}

async function fetchAttendanceCounts(userIds: string[]): Promise<Map<string, AttendanceCounts>> {
  const ids = uniqueIds(userIds);
  const counts = new Map<string, AttendanceCounts>();

  ids.forEach((id) => {
    counts.set(id, { attended_count: 0, expected_count: 0 });
  });

  if (ids.length === 0) {
    return counts;
  }

  const { from, to } = getAttendanceWindow();
  const supa = getAdminClient();

  const { data: meetingRows, error: meetingError } = await supa
    .from('meetings')
    .select('id, meeting_types!inner(counts_toward_engagement)')
    .gte('date', from)
    .lte('date', to)
    .eq('meeting_types.counts_toward_engagement', true);

  if (meetingError) {
    throw new Error(meetingError.message);
  }

  const engagementMeetingIds = ((meetingRows ?? []) as MeetingRow[])
    .filter((row) => hasEngagementFlag(row.meeting_types))
    .map((row) => row.id);

  if (engagementMeetingIds.length === 0) {
    return counts;
  }

  const meetingIdChunks = chunk(engagementMeetingIds, MEETING_CHUNK_SIZE);
  const userIdChunks = chunk(ids, USER_CHUNK_SIZE);

  for (const userIdChunk of userIdChunks) {
    for (const meetingIdChunk of meetingIdChunks) {
      const { data, error } = await supa
        .from('meeting_attendance_base')
        .select('meeting_id, user_id, attended')
        .in('user_id', userIdChunk)
        .in('meeting_id', meetingIdChunk);

      if (error) {
        throw new Error(error.message);
      }

      for (const row of (data ?? []) as MeetingAttendanceRow[]) {
        const current = counts.get(row.user_id) ?? { attended_count: 0, expected_count: 0 };
        current.expected_count += 1;
        if (row.attended) {
          current.attended_count += 1;
        }
        counts.set(row.user_id, current);
      }
    }
  }

  return counts;
}

async function fetchPublishedCourseIds(): Promise<number[]> {
  const supa = getAdminClient();
  const { data, error } = await supa
    .from('content_nodes')
    .select('id')
    .eq('node_type', 'course')
    .eq('state', 'published')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as CourseNodeRow[]).map((row) => row.id);
}

async function fetchStatusOverviewSummaryFallback(
  userIds: string[],
): Promise<Map<string, StatusOverviewSummaryRow>> {
  const ids = uniqueIds(userIds);
  const supa = getAdminClient();
  const publishedCourseIds = await fetchPublishedCourseIds();
  const totalCourses = publishedCourseIds.length;

  const entries = await Promise.all(
    ids.map(async (userId) => {
      const [kpiResult, meetingsResult, progressRows] = await Promise.all([
        supa.rpc('get_monthly_kpi_history_with_values', {
          _user_id: userId,
          _limit: KPI_HISTORY_LIMIT,
        }),
        supa.rpc('get_user_meetings', {
          _user_id: userId,
          _from: '2000-01-01',
          _to: '2100-01-01',
        }),
        Promise.all(
          publishedCourseIds.map(async (courseId) => {
            const { data, error } = await supa.rpc('get_user_course_progress', {
              _user_id: userId,
              _course_id: courseId,
            });

            if (error) {
              console.error('get_user_course_progress fallback error', {
                userId,
                courseId,
                error,
              });
              return 0;
            }

            const row = one(data as CourseProgressRow | CourseProgressRow[] | null);
            return row?.progress ?? 0;
          }),
        ),
      ]);

      if (kpiResult.error) {
        console.error('get_monthly_kpi_history_with_values fallback error', {
          userId,
          error: kpiResult.error,
        });
      }

      if (meetingsResult.error) {
        console.error('get_user_meetings fallback error', {
          userId,
          error: meetingsResult.error,
        });
      }

      const kpiHistory = (kpiResult.data ?? []) as KpiHistoryRow[];
      const meetings = (meetingsResult.data ?? []) as UserMeetingSummaryRow[];

      const latestKpiRow =
        [...kpiHistory]
          .sort((left, right) => right.period_start_date.localeCompare(left.period_start_date))
          .find((row) => hasAnyMetricValue(row)) ?? null;

      const lastOneOnOne =
        meetings
          .filter(
            (meeting) =>
              meeting.attended &&
              (meeting.meeting_type_code === 'M2_MEETING' ||
                meeting.meeting_type_code === 'IMPLEMENTATION_MEETING'),
          )
          .sort((left, right) => right.meeting_date.localeCompare(left.meeting_date))[0] ?? null;

      const lastGroup =
        meetings
          .filter(
            (meeting) =>
              meeting.attended &&
              meeting.counts_toward_engagement &&
              meeting.meeting_type_code !== 'M2_MEETING' &&
              meeting.meeting_type_code !== 'IMPLEMENTATION_MEETING' &&
              isWednesdayOrFriday(meeting.meeting_date),
          )
          .sort((left, right) => right.meeting_date.localeCompare(left.meeting_date))[0] ?? null;

      const completedCourses = progressRows.filter((progress) => progress >= 1).length;

      return [
        userId,
        {
          user_id: userId,
          last_kpi_at: latestKpiRow?.last_updated_at ?? null,
          last_one_on_one_at: lastOneOnOne?.meeting_date ?? null,
          last_group_at: lastGroup?.meeting_date ?? null,
          completed_courses: completedCourses,
          total_courses: totalCourses,
        } satisfies StatusOverviewSummaryRow,
      ] as const;
    }),
  );

  return new Map(entries);
}

async function fetchStatusOverviewSummaryMap(
  userIds: string[],
): Promise<Map<string, StatusOverviewSummaryRow>> {
  const ids = uniqueIds(userIds);

  if (ids.length === 0) {
    return new Map();
  }

  const supa = getAdminClient();
  const { data, error } = await supa.rpc('get_status_overview_summary', {
    _user_ids: ids,
  });

  if (error) {
    console.warn('get_status_overview_summary unavailable, using fallback', error);
    return fetchStatusOverviewSummaryFallback(ids);
  }

  return normalizeSummaryMap(ids, (data ?? []) as RpcStatusOverviewSummaryRow[]);
}

async function buildStatusOverviewRows(userIds: string[]): Promise<StatusOverviewRow[]> {
  const ids = uniqueIds(userIds);

  if (ids.length === 0) {
    return [];
  }

  const [profileMap, attendanceMap, summaryMap] = await Promise.all([
    fetchProfileStatusMap(ids),
    fetchAttendanceCounts(ids),
    fetchStatusOverviewSummaryMap(ids),
  ]);

  return ids
    .map((userId) => {
      const profile = profileMap.get(userId);
      const attendance = attendanceMap.get(userId) ?? { attended_count: 0, expected_count: 0 };
      const summary = summaryMap.get(userId) ?? defaultSummary(userId);
      const manualStatus = profile?.attention_status_manual ?? null;
      const autoStatus = profile?.attention_status_auto ?? null;

      return {
        user_id: userId,
        full_name: buildFullName(profile),
        user_status: manualStatus ?? autoStatus ?? 'green',
        user_status_source: manualStatus ? 'manual' : 'auto',
        user_status_manual: manualStatus,
        user_status_manual_reason: profile?.attention_status_manual_reason ?? null,
        attended_count: attendance.attended_count,
        expected_count: attendance.expected_count,
        last_kpi_at: summary.last_kpi_at,
        last_one_on_one_at: summary.last_one_on_one_at,
        last_group_at: summary.last_group_at,
        completed_courses: summary.completed_courses,
        total_courses: summary.total_courses,
      } satisfies StatusOverviewRow;
    })
    .sort((left, right) => {
      const leftKey = left.full_name.toLocaleLowerCase();
      const rightKey = right.full_name.toLocaleLowerCase();
      return leftKey.localeCompare(rightKey);
    });
}

export async function getCoachStatusOverviewRows(params: {
  coachId: string;
  courseId: number | null;
}): Promise<StatusOverviewRow[]> {
  const supa = getAdminClient();

  let query = supa
    .from('user_coaches')
    .select('user_id')
    .eq('coach_id', params.coachId)
    .eq('is_active', true);

  if (params.courseId !== null) {
    query = query.eq('course_id', params.courseId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const currentMemberUserIdSet = await fetchCurrentMemberUserIdSet(supa);
  const userIds = ((data ?? []) as CoachAssignmentRow[])
    .map((row) => row.user_id)
    .filter((userId) => currentMemberUserIdSet.has(userId));
  return buildStatusOverviewRows(userIds);
}

export async function getAdminStatusOverviewRows(): Promise<StatusOverviewRow[]> {
  const supa = getAdminClient();
  const userIds = await fetchCurrentMemberUserIds(supa);
  return buildStatusOverviewRows(userIds);
}
