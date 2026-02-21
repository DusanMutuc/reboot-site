// src/lib/dashboard.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  UserDashboardData,
  RevenueProfitSectionProps,
  KpiSectionProps,
  AttendanceSectionProps,
  CoachingNotesSectionProps,
  WinsProps,
  AchievementsProps,
  RevenueProfitPoint,
  KpiKey,
  KpiMetric,
  AttendancePoint,
  DashboardActionStep,
  DashboardNotePreview,
  CoachingNoteListItem,
} from '@/types/dashboard';

/** ---------- Shared RPC/Row Types (no `any`) ---------- */
type IsoDate = string;

type KpiValues = {
  gross_revenue?: number | null;
  profit?: number | null;
  closed_deals?: number | null;
  repeat_referral?: number | null;
  days_off?: number | null;
  pipeline_15_30?: number | null;
  // allow unknown keys without using `any`
  [k: string]: unknown;
};

type KpiHistoryRow = {
  period_start_date: IsoDate;
  kpi_values: KpiValues | null;
};

type KpiRecordRow = {
  kpi_values: KpiValues | null;
};

type AttendanceRow = {
  counts_toward_engagement: boolean;
  meeting_date: IsoDate;
  attended: boolean;
};

type CoachingNoteRow = {
  id: number;
  user_id: string;
  created_at: IsoDate;
};

type ActionStepRow = {
  id: number;
  coaching_note_id: number;
  label: string;
  status: DashboardActionStep['status'];
  library_item_id: number | null;
  created_at: IsoDate;
  updated_at: IsoDate | null;
};

type NoteCommentRow = {
  id: number;
  body: string;
  created_at: IsoDate;
  author: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
};

function normalizeCommentAuthor(
  author: NoteCommentRow['author'],
): { first_name: string | null; last_name: string | null } | null {
  if (!author) return null;
  if (Array.isArray(author)) return author[0] ?? null;
  return author;
}

type WinRow = {
  id: number;
  body: string;
  created_at: IsoDate;
};

type AchievementJoinedRow = {
  id: number;
  achieved_at: IsoDate;
  achievement:
    | { title: string | null; icon_url: string | null }
    | { title: string | null; icon_url: string | null }[]
    | null;
};


/** ---------- Small date helpers (may be used elsewhere) ---------- */
function getCurrentMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function getPreviousMonthStart(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ---------- 1) Revenue / Profit ---------- */
async function fetchRevenueProfitSection(
  client: SupabaseClient,
  userId: string,
): Promise<RevenueProfitSectionProps> {
  const { data, error } = await client.rpc('get_monthly_kpi_history_with_values', {
    _user_id: userId,
    _limit: 6,
  });

  if (error) {
    console.error('get_monthly_kpi_history_with_values error', error);
    return {
      currentRevenue: 0,
      currentProfit: 0,
      revenueDeltaPct: null,
      profitDeltaPct: null,
      periodLabel: 'Last 6 months',
      history: [],
    };
  }

  const rows = (data ?? []) as KpiHistoryRow[];

  // docs: history returns newest first; we want oldest → newest for graph
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(a.period_start_date).getTime() -
      new Date(b.period_start_date).getTime(),
  );

  const history: RevenueProfitPoint[] = sorted.map((row) => ({
    date: row.period_start_date,
    revenue: Number(row.kpi_values?.gross_revenue ?? 0),
    profit: Number(row.kpi_values?.profit ?? 0),
  }));

  const latestPt = history[history.length - 1] ?? { revenue: 0, profit: 0 };
  const prevPt = history[history.length - 2] ?? null;

  const currentRevenue = latestPt.revenue;
  const currentProfit = latestPt.profit;

  const revenueDeltaPct =
    prevPt && prevPt.revenue !== 0
      ? ((latestPt.revenue - prevPt.revenue) / prevPt.revenue) * 100
      : null;

  const profitDeltaPct =
    prevPt && prevPt.profit !== 0
      ? ((latestPt.profit - prevPt.profit) / prevPt.profit) * 100
      : null;

  return {
    currentRevenue,
    currentProfit,
    revenueDeltaPct,
    profitDeltaPct,
    periodLabel: 'Last 6 months',
    history,
  };
}

/** ---------- 2) KPI tiles ---------- */
function mapMetricKeyToKpiKey(metricKey: string): KpiKey {
  switch (metricKey) {
    case 'closed_deals':
      return 'total_closed';
    case 'repeat_referral':
      return 'repeat_referral';
    case 'days_off':
      return 'days_off';
    case 'pipeline_15_30':
      return 'fifteen_thirty';
    default:
      return metricKey as KpiKey;
  }
}
async function fetchKpiSection(
  client: SupabaseClient,
  userId: string,
): Promise<KpiSectionProps> {
  const currentMonthStart = getCurrentMonthStart();
  const prevMonthStart = getPreviousMonthStart();

  const [{ data: current, error: errCurrent }, { data: history, error: errHistory }] =
    await Promise.all([
      client.rpc('get_monthly_kpi_record_with_values', {
        _user_id: userId,
        _period_start_date: currentMonthStart,
      }),
      client.rpc('get_monthly_kpi_history_with_values', {
        _user_id: userId,
        _limit: 120, // enough months to approximate "lifetime"
      }),
    ]);

  if (errCurrent) console.error('get_monthly_kpi_record_with_values error', errCurrent);
  if (errHistory) console.error('get_monthly_kpi_history_with_values error', errHistory);

  // current is an array of rows
  const currentRows = (current as KpiRecordRow[] | null) ?? [];
  const currentRow = currentRows[0] ?? null;
  const currentValues = (currentRow?.kpi_values as KpiValues | null) ?? {};

  const historyArr = (history as KpiHistoryRow[] | null) ?? [];

  // find explicit current + previous month rows (by date)
  const latest = historyArr.find((row) => row.period_start_date === currentMonthStart);
  const previous =
    historyArr.find((row) => row.period_start_date === prevMonthStart) ?? historyArr[1];

  const prevValues = (previous?.kpi_values as KpiValues | null) ?? {};

  // lifetime totals across all returned months
  const lifetimeTotals = historyArr.reduce(
    (acc, row) => {
      const kv = (row.kpi_values as KpiValues | null) ?? {};
      acc.closed_deals += Number(kv.closed_deals ?? 0);
      acc.repeat_referral += Number(kv.repeat_referral ?? 0);
      acc.days_off += Number(kv.days_off ?? 0);
      acc.pipeline_15_30 += Number(kv.pipeline_15_30 ?? 0);
      return acc;
    },
    {
      closed_deals: 0,
      repeat_referral: 0,
      days_off: 0,
      pipeline_15_30: 0,
    },
  );

  // latest entry's 15/30 (historyArr is newest → oldest)
  const latestPipelineVal = (() => {
    for (const row of historyArr) {
      const kv = (row.kpi_values as KpiValues | null) ?? {};
      if (kv.pipeline_15_30 != null) {
        return Number(kv.pipeline_15_30);
      }
    }
    return 0;
  })();

  function buildKpi(
    metricKey: 'closed_deals' | 'repeat_referral' | 'days_off' | 'pipeline_15_30',
    label: string,
    mode: 'lifetime' | 'current',
    overrideValue?: number | null,
  ): KpiMetric {
    const currentMonthVal = Number(currentValues?.[metricKey] ?? 0);
    const prevMonthVal = Number(prevValues?.[metricKey] ?? 0);

    // delta is still "this month vs last month"
    const deltaPct =
      prevMonthVal !== 0 ? ((currentMonthVal - prevMonthVal) / prevMonthVal) * 100 : null;

    const value =
      overrideValue != null
        ? overrideValue
        : mode === 'current'
          ? currentMonthVal
          : lifetimeTotals[metricKey];

    return {
      key: mapMetricKeyToKpiKey(metricKey),
      label,
      value,
      deltaPct,
    };
  }

  const kpis: KpiMetric[] = [
    // lifetime totals
    buildKpi('closed_deals', 'Total Closed', 'lifetime'),
    buildKpi('repeat_referral', 'Repeat / Referral', 'lifetime'),
    buildKpi('days_off', 'Days Off', 'lifetime'),
    // 15/30 card: latest entry's 15/30, not lifetime
    buildKpi('pipeline_15_30', '15/30', 'current', latestPipelineVal),
  ];

  return {
    kpis,
    periodLabel: 'This Month',
  };
}


/** ---------- 2b) KPI charts (this calendar year, cumulative) ---------- */
async function fetchKpiCharts(
  client: SupabaseClient,
  userId: string,
): Promise<import('@/types/dashboard').KpiChartsProps> {
  const year = new Date().getFullYear();

  const { data, error } = await client.rpc('get_monthly_kpi_history_for_year', {
    _user_id: userId,
    _year: year,
  });

  if (error) {
    console.error('get_monthly_kpi_history_for_year (kpi charts) error', error);
    return { series: [], periodLabel: String(year) };
  }

  const rows = (data ?? []) as KpiHistoryRow[];

  // Safety: ensure oldest → newest just in case
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(a.period_start_date).getTime() -
      new Date(b.period_start_date).getTime(),
  );

  // Running totals per metric
  let closedCum = 0;
  let repeatCum = 0;
  let daysOffCum = 0;
  let fifteenThirtyCum = 0;

  const series = sorted.map((row) => {
    const v = row.kpi_values ?? {};

    const closedMonthly = Number(v.closed_deals ?? 0);
    const repeatMonthly = Number(v.repeat_referral ?? 0);
    const daysOffMonthly = Number(v.days_off ?? 0);
    const fifteenThirtyMonthly = Number(v.pipeline_15_30 ?? 0);

    closedCum += closedMonthly;
    repeatCum += repeatMonthly;
    daysOffCum += daysOffMonthly;
    fifteenThirtyCum = fifteenThirtyMonthly;

    return {
      date: row.period_start_date,
      total_closed: closedCum,
      repeat_referral: repeatCum,
      days_off: daysOffCum,
      fifteen_thirty: fifteenThirtyCum,
    };
  });

  return {
    series,
    periodLabel: String(year),
  };
}



/** ---------- 3) Attendance (driftline) ---------- */
const ATTENDANCE_WEEKS = 8;
const DRIFT_DIVISOR = 3; // driftline = cumulativeExpected / 3

function startOfWeekMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun, 1=Mon, ...
  const diff = (day + 6) % 7; // days since Monday
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - diff);
  return date;
}

function addWeeks(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n * 7);
  return date;
}

async function fetchAttendanceSection(
  client: SupabaseClient,
  userId: string,
): Promise<AttendanceSectionProps> {
  const today = new Date();
  const currentWeekStart = startOfWeekMonday(today);
  const windowStart = addWeeks(currentWeekStart, -(ATTENDANCE_WEEKS - 1));

  const { data, error } = await client.rpc('get_user_meetings', {
    _user_id: userId,
    _from: formatISODate(windowStart),
    _to: formatISODate(addWeeks(currentWeekStart, 1)), // inclusive of current week
  });

  if (error) {
    console.error('get_user_meetings error (attendance)', error);
    return {
      series: [],
      periodLabel: 'Last 8 weeks',
    };
  }

  const rows = (data ?? []) as AttendanceRow[];
  const expectedPerWeek = new Array<number>(ATTENDANCE_WEEKS).fill(0);
  const attendedPerWeek = new Array<number>(ATTENDANCE_WEEKS).fill(0);

  rows.forEach((row) => {
    if (!row.counts_toward_engagement) return;

    const meetingDate = new Date(row.meeting_date);
    const weekStart = startOfWeekMonday(meetingDate);

    if (weekStart < windowStart || weekStart > currentWeekStart) return;

    const index = Math.floor(
      (weekStart.getTime() - windowStart.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    if (index < 0 || index >= ATTENDANCE_WEEKS) return;

    expectedPerWeek[index] += 1;
    if (row.attended) attendedPerWeek[index] += 1;
  });

  const series: AttendancePoint[] = [];
  let cumulativeActual = 0;
  let cumulativeExpected = 0;

  for (let i = 0; i < ATTENDANCE_WEEKS; i++) {
    const weekStart = addWeeks(windowStart, i);

    const thisWeekExpected = expectedPerWeek[i] || 0;
    const thisWeekAttended = attendedPerWeek[i] || 0;

    cumulativeExpected += thisWeekExpected;
    cumulativeActual += thisWeekAttended;

    const driftCumulative = cumulativeExpected / DRIFT_DIVISOR;

    series.push({
      label: `W${i + 1}`,
      weekStart: formatISODate(weekStart),
      actualCumulative: cumulativeActual,
      driftCumulative,
    });
  }

  return {
    series,
    periodLabel: 'Last 8 weeks',
  };
}

/** ---------- 4) Coaching notes & action steps ---------- */
function sortActionSteps(steps: DashboardActionStep[]): DashboardActionStep[] {
  const statusRank: Record<DashboardActionStep['status'], number> = {
    in_progress: 0,
    not_started: 1,
    complete: 2,
  };

  return [...steps].sort((a, b) => {
    const diff = statusRank[a.status] - statusRank[b.status];
    if (diff !== 0) return diff;
    // tie-breaker: newer first within the same status
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

async function fetchCoachingNotesSection(
  client: SupabaseClient,
  userId: string,
): Promise<CoachingNotesSectionProps> {
  type CoachingNoteWithMeetingIdRow = CoachingNoteRow & {
    m2_meeting_id?: number | null;
  };

  // 1) Fetch all coaching notes for this user, including m2_meeting_id
  const {
    data: notesData,
    error: noteErr,
  } = await client
    .from('coaching_notes')
    .select('id, user_id, created_at, m2_meeting_id')
    .eq('user_id', userId);

  if (noteErr) {
    console.error('fetch coaching notes for dashboard error', noteErr);
    return { actionSteps: [], notes: [] };
  }

  const notesRows = (notesData ?? []) as CoachingNoteWithMeetingIdRow[];
  if (!notesRows.length) return { actionSteps: [], notes: [] };

  // 2) Fetch all meetings for this user (we'll pick out the M2 ones by id)
  const {
    data: meetingsData,
    error: meetingsErr,
  } = await client.rpc('get_user_meetings', {
    _user_id: userId,
    _from: '2000-01-01',
    _to: '2100-01-01',
  });

  if (meetingsErr) {
    console.error('get_user_meetings error (coaching notes section)', meetingsErr);
  }

  type UserMeetingRowForDashboard = {
    meeting_id: number;
    meeting_date: IsoDate;
    meeting_type_code: string;
    attended: boolean | null;
  };

  const meetings = (meetingsData ?? []) as UserMeetingRowForDashboard[];

  // Build a map: meeting_id -> meeting_date for M2 meetings
  const m2DateById = new Map<number, IsoDate>();
  for (const m of meetings) {
    if (m.meeting_type_code === 'M2_MEETING') {
      m2DateById.set(m.meeting_id, m.meeting_date);
    }
  }

  const getEffectiveDate = (row: CoachingNoteWithMeetingIdRow): IsoDate => {
    const meetingId = row.m2_meeting_id ?? null;
    if (meetingId != null && m2DateById.has(meetingId)) {
      return m2DateById.get(meetingId)!; // YYYY-MM-DD
    }
    // fallback: created_at timestamp
    return row.created_at;
  };

  // 3) Pick the "latest" coaching note by effective date (M2 date or created_at)
  const latestNote = notesRows.reduce((latest, current) => {
    const latestTime = new Date(getEffectiveDate(latest)).getTime();
    const currentTime = new Date(getEffectiveDate(current)).getTime();
    return currentTime > latestTime ? current : latest;
  }, notesRows[0]);

  // 4) Fetch action steps ONLY for this latest note
  const { data: steps, error: stepsErr } = await client
    .from('coaching_note_action_steps')
    .select('id, coaching_note_id, label, status, library_item_id, created_at, updated_at')
    .eq('coaching_note_id', latestNote.id)
    .order('created_at', { ascending: true });

  if (stepsErr) console.error('fetch action steps for latest note error', stepsErr);

  const rawActionSteps: DashboardActionStep[] =
    ((steps ?? []) as ActionStepRow[]).map((row) => ({
      id: row.id,
      coaching_note_id: row.coaching_note_id,
      label: row.label,
      library_item_id: row.library_item_id,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at ?? row.created_at,
    }));

  const actionSteps = sortActionSteps(rawActionSteps);

  // 5) Fetch COMMENTS for this latest note
  const { data: comments, error: commentsErr } = await client
    .from('coaching_note_comments')
    .select('id, body, created_at, author:profiles!coaching_note_comments_author_id_fkey(first_name, last_name)')
    .eq('coaching_note_id', latestNote.id)
    .order('created_at', { ascending: false });

  if (commentsErr) console.error('fetch coaching comments for latest note error', commentsErr);

  const notes: DashboardNotePreview[] =
    ((comments ?? []) as NoteCommentRow[]).map((row) => {
      const author = normalizeCommentAuthor(row.author);
      return {
        id: row.id,
        created_at: row.created_at,
        body: row.body && row.body.length > 220 ? `${row.body.slice(0, 217)}...` : row.body,
        author_name: `${author?.first_name ?? ''} ${author?.last_name ?? ''}`.trim() || 'Unknown author',
      };
    });

  return { actionSteps, notes };
}


export async function listUserCoachingNotes(
  client: SupabaseClient,
  userId: string,
): Promise<CoachingNoteListItem[]> {
  const { data, error } = await client
    .from('coaching_notes')
    .select('id, created_at')
    .eq('user_id', userId) // member sees their own notes; coaches/admins’ RLS should also pass
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('listUserCoachingNotes error', error);
    return [];
  }

  const fmt = (iso: IsoDate) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (data as CoachingNoteRow[]).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    meeting_date: null, // not in this schema; keep field for type compatibility
    label: fmt(row.created_at), // e.g., "Nov 19, 2025"
  }));
}

/** Fetch action steps + comments for a specific note */
export async function fetchCoachingNotesByNoteId(
  client: SupabaseClient,
  noteId: number,
): Promise<CoachingNotesSectionProps> {
  // Steps
  const { data: steps, error: stepsErr } = await client
    .from('coaching_note_action_steps')
    .select('id, coaching_note_id, label, status, library_item_id, created_at, updated_at')
    .eq('coaching_note_id', noteId)
    .order('created_at', { ascending: true });

  if (stepsErr) console.error('stepsErr', stepsErr);

  const rawSteps: DashboardActionStep[] = ((steps ?? []) as ActionStepRow[]).map((r) => ({
    id: r.id,
    coaching_note_id: r.coaching_note_id,
    label: r.label,
    status: r.status,
    library_item_id: r.library_item_id,
    created_at: r.created_at,
    updated_at: r.updated_at ?? r.created_at,
  }));

  // Same sort as your dashboard (in_progress → not_started → complete; newer first within ties)
  const statusRank: Record<DashboardActionStep['status'], number> = {
    in_progress: 0,
    not_started: 1,
    complete: 2,
  };
  const actionSteps = [...rawSteps].sort((a, b) => {
    const d = statusRank[a.status] - statusRank[b.status];
    return d !== 0 ? d : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Comments
  const { data: comments, error: commentsErr } = await client
    .from('coaching_note_comments')
    .select('id, body, created_at, author:profiles!coaching_note_comments_author_id_fkey(first_name, last_name)')
    .eq('coaching_note_id', noteId)
    .order('created_at', { ascending: false });

  if (commentsErr) console.error('commentsErr', commentsErr);

  const notes: DashboardNotePreview[] = ((comments ?? []) as NoteCommentRow[]).map((r) => {
    const author = normalizeCommentAuthor(r.author);
    return {
      id: r.id,
      created_at: r.created_at,
      body: r.body && r.body.length > 220 ? `${r.body.slice(0, 217)}...` : r.body,
      author_name: `${author?.first_name ?? ''} ${author?.last_name ?? ''}`.trim() || 'Unknown author',
    };
  });

  return { actionSteps, notes };
}

/** ---------- 5) Wins ---------- */
async function fetchWins(client: SupabaseClient, userId: string): Promise<WinsProps> {
  const { data, error } = await client
    .from('wins')
    .select('id, body, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('fetch wins error', error);
    return { wins: [] };
  }

  const wins: WinsProps['wins'] = ((data ?? []) as WinRow[]).map((row) => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
  }));

  return { wins };
}

/** ---------- 6) Achievements ---------- */
async function fetchAchievements(
  client: SupabaseClient,
  userId: string,
): Promise<AchievementsProps> {
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
    console.error('fetch achievements error', error);
    return { achievements: [] };
  }

  const achievements: AchievementsProps['achievements'] =
  ((data ?? []) as AchievementJoinedRow[]).map((row) => {
    const ach = Array.isArray(row.achievement) ? row.achievement[0] ?? null : row.achievement;
    const title = ach?.title ?? 'Achievement';
    const imageUrl = ach?.icon_url ?? '';
    return {
      id: row.id,
      title,
      imageUrl,
      earnedAt: row.achieved_at,
    };
  });


  return { achievements };
}

/** ---------- Aggregated fetch ---------- */
export async function fetchDashboardData(
  client: SupabaseClient,
  userId: string,
): Promise<UserDashboardData> {
  const [revenueProfit, kpi, kpiChart, attendance, coachingNotes, wins, achievements] =
    await Promise.all([
      fetchRevenueProfitSection(client, userId),
      fetchKpiSection(client, userId),
      fetchKpiCharts(client, userId),
      fetchAttendanceSection(client, userId),
      fetchCoachingNotesSection(client, userId),
      fetchWins(client, userId),
      fetchAchievements(client, userId),
    ]);

  return {
    revenueProfit,
    kpi,
    kpiChart,
    attendance,
    coachingNotes,
    wins,
    achievements,
  };
}
