import type { UserStatus, UserStatusSource } from '@/types/coaching';

export type StatusOverviewRow = {
  user_id: string;
  full_name: string;
  user_status: UserStatus;
  user_status_source: UserStatusSource;
  user_status_manual: UserStatus | null;
  user_status_manual_reason: string | null;
  attended_count: number;
  expected_count: number;
  last_kpi_at: string | null;
  last_one_on_one_at: string | null;
  last_group_at: string | null;
  completed_courses: number;
  total_courses: number;
};

export type StatusOverviewResponse = {
  items: StatusOverviewRow[];
};
