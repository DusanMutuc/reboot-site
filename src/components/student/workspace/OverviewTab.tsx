'use client';

import StudentOverviewNew from '@/components/admin/StudentOverviewNew';
import UserDashboard from '@/components/user/dashboard/UserDashboard';
import type { StudentWorkspaceMode } from './types';

type OverviewTabProps = {
  mode: StudentWorkspaceMode;
  userId: string;
  refreshSignal: number;
};

export default function OverviewTab({ mode, userId, refreshSignal }: OverviewTabProps) {
  if (mode === 'admin') {
    return <StudentOverviewNew userId={userId} embedded />;
  }

  return (
    <UserDashboard
      userId={userId}
      refreshSignal={refreshSignal}
      compactMetricLabels
    />
  );
}
