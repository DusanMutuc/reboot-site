'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Container,
  Paper,
  Stack,
  Tabs,
  Tab,
  Typography,
  TextField,
  MenuItem,
  IconButton,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import { supabase } from '@/lib/supabaseClient';

import UserDashboard from '@/components/user/dashboard/UserDashboard';
import CoachNotesView from '@/components/coach/CoachNotesView';
import StudentProgressView from '@/components/coach/StudentProgressView';

type Mode = 'coach' | 'admin';
type StudentRow = { user_id: string; full_name: string };

const TAB_VALUES = ['dashboard', 'notes', 'progress'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function useQuerySync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setQuery = useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      const sp = new URLSearchParams(searchParams.toString());
      Object.entries(patch).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') sp.delete(k);
        else sp.set(k, String(v));
      });
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  return { searchParams, setQuery };
}

export default function StudentsOverviewPage() {
  const { searchParams, setQuery } = useQuerySync();

  // URL state (single source of truth)
  const tabFromUrl = (searchParams.get('tab') as TabValue) || 'dashboard';
  const userId = searchParams.get('userId');      // may be null
  const courseId = searchParams.get('courseId');  // string | null
  const mode: Mode = (searchParams.get('mode') === 'admin' ? 'admin' : 'coach');

  // Local for roster picker only
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  // Load roster once (RLS will scope automatically by role)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoadingRoster(true);
        const { data, error } = await supabase.rpc('get_my_users_with_status');
        if (!active) return;
        if (error) throw error;
        const rows = (data ?? []) as StudentRow[];
        const sorted = rows.slice().sort((a, b) =>
          (a.full_name ?? '').localeCompare(b.full_name ?? '')
        );
        setStudents(sorted);

        // If there's no userId in URL yet, pick first student
        if (!userId && sorted.length > 0) {
          setQuery({ userId: sorted[0].user_id });
        }
      } finally {
        if (active) setLoadingRoster(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (_evt: React.SyntheticEvent, next: TabValue) => {
    setQuery({ tab: next });
  };

  const handlePickStudent = (nextUserId: string) => {
    setQuery({ userId: nextUserId });
  };

  // Validate tab value
  const tabValue: TabValue = useMemo(
    () => (TAB_VALUES.includes(tabFromUrl) ? tabFromUrl : 'dashboard'),
    [tabFromUrl]
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={2} sx={{ mb: 2 }}>
          {/* Header with Back to Home (/coach) */}
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <IconButton
              LinkComponent={Link}
              href="/coach"
              aria-label="Back to Coach Home"
              size="medium"
            >
              <ArrowBackIosNewIcon />
            </IconButton>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Students Overview
            </Typography>
          </Stack>

          {/* Compact student picker (shared across tabs) */}
          <Paper
            elevation={0}
            sx={{
              p: 2,
              border: '1px solid',
              borderColor: 'grey.200',
              borderRadius: 3,
              display: 'flex',
              gap: 2,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ minWidth: 280 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Student"
                value={userId ?? ''}
                onChange={(e) => handlePickStudent(e.target.value)}
                disabled={loadingRoster || students.length === 0}
                helperText={
                  students.length === 0 ? 'No students found on your roster.' : undefined
                }
              >
                {students.map((s) => (
                  <MenuItem key={s.user_id} value={s.user_id}>
                    {s.full_name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            {courseId && (
              <Typography variant="body2" color="text.secondary">
                Course: {courseId}
              </Typography>
            )}
          </Paper>

          {/* Tabs header – uses string values; keeps userId & courseId in URL */}
          <Paper
            elevation={0}
            sx={{
              border: '1px solid',
              borderColor: 'grey.200',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <Tabs
              value={tabValue}
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
              aria-label="Students overview tabs"
              sx={{
                px: 1,
                borderBottom: '1px solid',
                borderColor: 'grey.200',
              }}
            >
              <Tab value="dashboard" label="Dashboard" />
              <Tab value="notes" label="Coaching Notes" />
              <Tab value="progress" label="Progress" />
            </Tabs>

            {/* Content area */}
            <Box sx={{ p: 2 }}>
              {tabValue === 'dashboard' && (
                <Paper
                  elevation={0}
                  sx={{ p: 2, border: '1px solid', borderColor: 'grey.200', borderRadius: 3 }}
                >
                  {userId ? (
                    <UserDashboard userId={userId} />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Pick a student above to view their dashboard.
                    </Typography>
                  )}
                </Paper>
              )}

              {tabValue === 'notes' && (
                // Full component; reads ?userId= internally
                <CoachNotesView mode={mode} />
              )}

              {tabValue === 'progress' && (
                // Full component; manages ?userId=&courseId=
                <StudentProgressView mode={mode} />
              )}
            </Box>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}
