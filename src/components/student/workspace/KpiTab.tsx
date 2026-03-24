'use client';

import { Box, Paper, Stack } from '@mui/material';
import KpiTracker from '@/components/KpiTracker';
import UserDashboardExpanded from '@/components/user/dashboard/UserDashboardExpanded';

type KpiTabProps = {
  refreshSignal: number;
  userId: string;
  onSaved: () => void;
};

export default function KpiTab({ refreshSignal, userId, onSaved }: KpiTabProps) {
  return (
    <Stack spacing={4}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          border: '1px solid',
          borderColor: 'grey.200',
          borderRadius: 3,
        }}
      >
        <KpiTracker userIdOverride={userId} onSaved={onSaved} />
      </Paper>

      <Box>
        <UserDashboardExpanded
          userId={userId}
          refreshSignal={refreshSignal}
          compactMetricLabels
          kpiContentTextBump
        />
      </Box>
    </Stack>
  );
}
