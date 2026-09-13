'use client';

import StudentOverviewNew from '@/components/admin/StudentOverviewNew';
import UserDashboard from '@/components/user/dashboard/UserDashboard';
import type { StudentWorkspaceMode } from './types';

type OverviewTabProps = {
  mode: StudentWorkspaceMode;
  userId: string;
  refreshSignal: number;
  isLegend?: boolean;
  pauseStartedAt?: string | null;
  pauseReason?: string | null;
};

export default function OverviewTab({ mode, userId, refreshSignal, isLegend, pauseStartedAt, pauseReason }: OverviewTabProps) {
  if (mode === 'admin') {
    return <StudentOverviewNew userId={userId} embedded isLegend={isLegend} pauseStartedAt={pauseStartedAt} pauseReason={pauseReason} />;
  }

  return (
    <UserDashboard
      userId={userId}
      refreshSignal={refreshSignal}
      compactMetricLabels
    />
  );
}
