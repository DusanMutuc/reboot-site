// src/types/dashboard.ts

import type {
    CoachingNoteActionStep,
    CoachingNoteComment,
    Win as WinRow,
  } from './coaching';
  import type { AchievementRow } from './achievements';
  
  // ------------- Revenue / Profit -------------
  
  export interface RevenueProfitPoint {
    date: string;   // 'YYYY-MM-01' or ISO
    revenue: number;
    profit: number;
  }
  
  export interface RevenueProfitSectionProps {
    currentRevenue: number;
    currentProfit: number;
    revenueDeltaPct: number | null;
    profitDeltaPct: number | null;
    periodLabel: string;           // e.g. "Last 6 months"
    history: RevenueProfitPoint[]; // for the graph
  }
  
  // ------------- KPIs -------------
  
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
  

  // Add after KPI section types

export interface KpiChartPoint {
    date: string;          // 'YYYY-MM-01'
    total_closed: number;
    repeat_referral: number;
    days_off: number;
    fifteen_thirty: number;
  }
  
  export interface KpiChartsProps {
    series: KpiChartPoint[];
    periodLabel: string;   // e.g. 'Last 12 months'
  }
  
  // Extend the combined dashboard data:
  export interface UserDashboardData {
    revenueProfit: RevenueProfitSectionProps;
    kpi: KpiSectionProps;
    kpiChart: KpiChartsProps;       // <— add this line
    attendance: AttendanceSectionProps;
    coachingNotes: CoachingNotesSectionProps;
    wins: WinsProps;
    achievements: AchievementsProps;
  }
  
  // ------------- Attendance -------------
  
  export interface AttendancePoint {
    label: string;            // e.g. "W1"
    weekStart: string;        // "YYYY-MM-DD" (start of week)
    actualCumulative: number; // cumulative attended meetings up to this week
    driftCumulative: number;  // ideal cumulative meetings (driftline)
  }
  
  export interface AttendanceSectionProps {
    series: AttendancePoint[];
    periodLabel: string; // e.g. "Last 12 weeks"
  }
  
  // ------------- Coaching Notes + Action Steps -------------
  
  // You already have CoachingNoteActionStep + ActionStepStatus
  // We can either use it directly or "project" it:
  
  export type DashboardActionStep = CoachingNoteActionStep;
  
  // For note previews, we don't need everything,
  // so we can derive a minimal view from CoachingNoteComment:
  export type DashboardNotePreview = Pick<
    CoachingNoteComment,
    'id' | 'body' | 'created_at'
  > & {
    author_name: string;

    // If you ever want a pre-truncated summary,
    // you can add a computed field here later.
  };
  
  export interface CoachingNotesSectionProps {
    actionSteps: DashboardActionStep[];
    notes: DashboardNotePreview[];
  }
  

  export type CoachingNoteListItem = {
    id: number;
    created_at: string;
    meeting_date?: string | null; // if you have meetings.meeting_date
    label: string; // preformatted "Nov 5, 2025 — Week 8" etc.
  };
  // ------------- Wins -------------
  
  // Dashboard only needs a subset of Win fields for display:
  export type DashboardWin = Pick<WinRow, 'id' | 'body' | 'created_at'>;
  
  export interface WinsProps {
    wins: DashboardWin[];
  }
  
  // ------------- Achievements -------------
  
  // You don't yet have a user_achievements type,
  // so for the dashboard we can define a view model:
  export interface DashboardAchievement {
    // id from user_achievements
    id: number;
    // This comes from achievements table
    title: string;
    imageUrl: string; // icon_url
    earnedAt?: string;
  }
  
  export interface AchievementsProps {
    achievements: DashboardAchievement[];
  }
  
  // ------------- Combined Dashboard Data -------------
  
  export interface UserDashboardData {
    revenueProfit: RevenueProfitSectionProps;
    kpi: KpiSectionProps;
    attendance: AttendanceSectionProps;
    coachingNotes: CoachingNotesSectionProps;
    wins: WinsProps;
    achievements: AchievementsProps;
  }
  