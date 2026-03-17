import type {
  CoachingNoteActionStep,
  CoachingNoteComment,
  Win as WinRow,
} from './coaching';

export interface RevenueProfitPoint {
  date: string;
  revenue: number;
  profit: number;
}

export interface RevenueProfitSectionProps {
  currentRevenue: number;
  currentProfit: number;
  revenueDeltaPct: number | null;
  profitDeltaPct: number | null;
  periodLabel: string;
  history: RevenueProfitPoint[];
}

export type KpiKey =
  | 'total_closed'
  | 'repeat_referral'
  | 'days_off'
  | 'fifteen_thirty';

export interface KpiMetric {
  key: KpiKey;
  label: string;
  value: number;
  deltaPct: number | null;
}

export interface KpiSectionProps {
  kpis: KpiMetric[];
  periodLabel: string;
}

export interface KpiChartPoint {
  date: string;
  total_closed: number;
  repeat_referral: number;
  days_off: number;
  fifteen_thirty: number;
}

export interface KpiChartsProps {
  series: KpiChartPoint[];
  periodLabel: string;
}

export interface AttendancePoint {
  label: string;
  weekStart: string;
  actualCumulative: number;
  driftCumulative: number;
}

export interface AttendanceSectionProps {
  series: AttendancePoint[];
  periodLabel: string;
}

export type DashboardActionStep = CoachingNoteActionStep;

export type DashboardNotePreview = Pick<
  CoachingNoteComment,
  'id' | 'body' | 'created_at'
> & {
  author_name: string;
};

export interface CoachingNotesSectionProps {
  actionSteps: DashboardActionStep[];
  notes: DashboardNotePreview[];
}

export type CoachingNoteListItem = {
  id: number;
  created_at: string;
  meeting_date?: string | null;
  label: string;
};

export type DashboardWin = Pick<WinRow, 'id' | 'body' | 'created_at'>;

export interface WinsProps {
  wins: DashboardWin[];
}

export interface DashboardAchievement {
  id: number;
  title: string;
  imageUrl: string;
  earnedAt?: string;
}

export interface AchievementsProps {
  achievements: DashboardAchievement[];
}

export interface UserDashboardData {
  revenueProfit: RevenueProfitSectionProps;
  kpi: KpiSectionProps;
  kpiChart: KpiChartsProps;
  attendance: AttendanceSectionProps;
  coachingNotes: CoachingNotesSectionProps;
  wins: WinsProps;
  achievements: AchievementsProps;
}
