import type { StudentOverviewCourse } from '@/lib/studentOverview';

export type StudentWorkspaceMode = 'coach' | 'admin';
export type StudentWorkspaceTab = 'overview' | 'audit' | 'notes' | 'progress' | 'kpi';

export type StudentOption = {
  id: string;
  full_name: string;
  email: string | null;
  is_legend: boolean;
};

export type WorkspaceQueryPatch = Record<string, string | number | null | undefined>;

export type CoachProgressCourse = StudentOverviewCourse;
