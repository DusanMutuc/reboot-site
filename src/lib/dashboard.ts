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
  DashboardWin,
  DashboardAchievement,
} from '@/types/dashboard';

function getCurrentMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function getPreviousMonthStart(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function getDateNDaysAgo(n: number): string {
  const now = new Date();
  now.setDate(now.getDate() - n);
  return now.toISOString().slice(0, 10);
}

function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

// ---------- 1) Revenue / Profit ----------

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

  const rows = (data ?? []) as any[];

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

  const latest = history[history.length - 1] ?? { revenue: 0, profit: 0 };
  const prev = history[history.length - 2] ?? null;

  const currentRevenue = latest.revenue;
  const currentProfit = latest.profit;

  const revenueDeltaPct =
    prev && prev.revenue !== 0
      ? ((latest.revenue - prev.revenue) / prev.revenue) * 100
      : null;

  const profitDeltaPct =
    prev && prev.profit !== 0
      ? ((latest.profit - prev.profit) / prev.profit) * 100
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

// ---------- 2) KPI tiles ----------

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
        _limit: 2,
      }),
    ]);

  if (errCurrent) {
    console.error('get_monthly_kpi_record_with_values error', errCurrent);
  }
  if (errHistory) {
    console.error('get_monthly_kpi_history_with_values error', errHistory);
  }

  const currentValues = (current as any)?.kpi_values ?? {};
  const historyArr = (history as any[]) ?? [];
  const latest = historyArr.find(
    (row) => row.period_start_date === currentMonthStart,
  );
  const previous =
    historyArr.find((row) => row.period_start_date === prevMonthStart) ??
    historyArr[1];

  const prevValues = previous?.kpi_values ?? {};

  function buildKpi(
    metricKey: 'closed_deals' | 'repeat_referral' | 'days_off' | 'pipeline_15_30',
    label: string,
  ): KpiMetric {
    const value = Number(currentValues?.[metricKey] ?? 0);
    const prev = Number(prevValues?.[metricKey] ?? 0);
    const deltaPct = prev !== 0 ? ((value - prev) / prev) * 100 : null;
    return {
      key: mapMetricKeyToKpiKey(metricKey),
      label,
      value,
      deltaPct,
    };
  }

  const kpis: KpiMetric[] = [
    buildKpi('closed_deals', 'Total Closed'),
    buildKpi('repeat_referral', 'Repeat / Referral'),
    buildKpi('days_off', 'Days Off'),
    buildKpi('pipeline_15_30', '15/30'),
  ];

  return {
    kpis,
    periodLabel: 'This Month',
  };
}

// ---------- 3) Attendance (driftline) ----------

const ATTENDANCE_WEEKS = 12;
const DRIFT_DIVISOR: number = 3; // driftline = cumulativeExpected / 3

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

function formatISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
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
      periodLabel: 'Last 12 weeks',
    };
  }

  const expectedPerWeek = new Array<number>(ATTENDANCE_WEEKS).fill(0);
  const attendedPerWeek = new Array<number>(ATTENDANCE_WEEKS).fill(0);

  (data ?? []).forEach((row: any) => {
    if (!row.counts_toward_engagement) return;

    const meetingDate = new Date(row.meeting_date);
    const weekStart = startOfWeekMonday(meetingDate);

    if (weekStart < windowStart || weekStart > currentWeekStart) return;

    const index = Math.floor(
      (weekStart.getTime() - windowStart.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    if (index < 0 || index >= ATTENDANCE_WEEKS) return;

    expectedPerWeek[index] += 1;

    if (row.attended) {
      attendedPerWeek[index] += 1;
    }
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
    periodLabel: 'Last 12 weeks',
  };
}


// ---------- 4) Coaching notes & action steps ----------

async function fetchCoachingNotesSection(
  client: SupabaseClient,
): Promise<CoachingNotesSectionProps> {
  // Action steps - rely on RLS to only return current member's steps
  const { data: steps, error: stepsErr } = await client
    .from('coaching_note_action_steps')
    .select('id, label, status, library_item_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (stepsErr) {
    console.error('fetch action steps error', stepsErr);
  }

  const actionSteps: DashboardActionStep[] =
    (steps ?? []).map((row: any) => ({
      id: row.id,
      coaching_note_id: row.coaching_note_id,
      label: row.label,
      library_item_id: row.library_item_id,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.created_at,
    })) ?? [];

  // Comments preview - last few visible comments
  const { data: comments, error: commentsErr } = await client
    .from('coaching_note_comments')
    .select('id, body, created_at')
    .order('created_at', { ascending: false })
    .limit(3);

  if (commentsErr) {
    console.error('fetch coaching comments error', commentsErr);
  }

  const notes: DashboardNotePreview[] =
    (comments ?? []).map((row: any) => ({
      id: row.id,
      coaching_note_id: row.coaching_note_id,
      author_id: row.author_id,
      body:
        row.body && row.body.length > 220
          ? `${row.body.slice(0, 217)}...`
          : row.body,
      created_at: row.created_at,
    })) ?? [];

  return {
    actionSteps,
    notes,
  };
}

// ---------- 5) Wins ----------

async function fetchWins(
  client: SupabaseClient,
  userId: string,
): Promise<WinsProps> {
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

  const wins: DashboardWin[] = (data ?? []).map((row: any) => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
  }));

  return { wins };
}

// ---------- 6) Achievements ----------

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

  const achievements: DashboardAchievement[] = (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.achievement?.title ?? 'Achievement',
    imageUrl: row.achievement?.icon_url ?? '',
    earnedAt: row.achieved_at,
  }));

  return { achievements };
}

// ---------- 7) Orchestrator ----------

export async function fetchDashboardData(
  client: SupabaseClient,
  userId: string,
): Promise<UserDashboardData> {
  const [
    revenueProfit,
    kpi,
    attendance,
    coachingNotes,
    wins,
    achievements,
  ] = await Promise.all([
    fetchRevenueProfitSection(client, userId),
    fetchKpiSection(client, userId),
    fetchAttendanceSection(client, userId),
    fetchCoachingNotesSection(client),
    fetchWins(client, userId),
    fetchAchievements(client, userId),
  ]);

  return {
    revenueProfit,
    kpi,
    attendance,
    coachingNotes,
    wins,
    achievements,
  };
}
