// src/components/coach/CoachKpiTrackerPage.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { supabase } from '@/lib/supabaseClient';
import KpiTracker from '@/components/KpiTracker';
import UserDashboardExpanded from '@/components/user/dashboard/UserDashboardExpanded';
import Loading from '@/components/loading';
import ErrorMessage from '@/components/errorMessage';

type StudentRow = {
  user_id: string;
  full_name: string;
};

interface CoachKpiTrackerPageProps {
  userId: string;
}

export default function CoachKpiTrackerPage({ userId }: CoachKpiTrackerPageProps) {
  const router = useRouter();
  const [roster, setRoster] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashKey, setDashKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadRoster = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: rosterError } = await supabase.rpc(
          'get_my_users_with_status'
        );
        if (rosterError) throw rosterError;
        if (!active) return;
        const rows = (data ?? []) as StudentRow[];
        setRoster(rows);
      } catch (e: unknown) {
        if (!active) return;
        const message =
          e instanceof Error ? e.message : 'Failed to load your roster.';
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadRoster();

    return () => {
      active = false;
    };
  }, []);

  const selectedStudent = useMemo(
    () => roster.find((row) => row.user_id === userId),
    [roster, userId]
  );

  const handleKpiSaved = () => {
    setDashKey((prev) => prev + 1);
  };

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;

  if (!userId) {
    return <ErrorMessage message="No student selected for KPI tracking." />;
  }

  if (!selectedStudent) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={700}>
              Access denied
            </Typography>
            <Typography variant="body2" color="text.secondary">
              You can only edit KPIs for students on your roster.
            </Typography>
            <Box>
              <Button component={Link} href="/coach" variant="outlined" size="small">
                Back to Coach Home
              </Button>
            </Box>
          </Stack>
        </Paper>
      </Container>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        minHeight: '100vh',
        background: 'linear-gradient(to bottom right, #f8f9fa 0%, #e9f5f2 100%)',
      }}
    >
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} mb={3}>
          <Button variant="outlined" size="small" onClick={() => router.back()}>
            Back
          </Button>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            KPI Tracker
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Viewing: {selectedStudent.full_name}
          </Typography>
        </Stack>

        <KpiTracker onSaved={handleKpiSaved} userIdOverride={userId} />

        <Box sx={{ mt: 6 }}>
          <UserDashboardExpanded userId={userId} refreshSignal={dashKey} />
        </Box>
      </Container>
    </Box>
  );
}
