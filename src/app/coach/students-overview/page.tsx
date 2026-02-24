'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Button,
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
import NotesIcon from '@mui/icons-material/StickyNote2';
import CloseIcon from '@mui/icons-material/Close';
import { supabase } from '@/lib/supabaseClient';

import UserDashboard from '@/components/user/dashboard/UserDashboard';
import CoachNotesView from '@/components/coach/CoachNotesView';
import StudentProgressView from '@/components/coach/StudentProgressView';
import PrivateNotesPanel from '@/components/coach/PrivateNotesPanel';

type Mode = 'coach' | 'admin';
type StudentRow = { user_id: string; full_name: string };

const TAB_VALUES = ['dashboard', 'notes', 'progress'] as const;
type TabValue = (typeof TAB_VALUES)[number];
const SIDEBAR_WIDTH = 360;

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

// Inner component that *reads* useSearchParams()
function StudentsOverviewInner() {
  const { searchParams, setQuery } = useQuerySync();

  // URL state (single source of truth)
  const tabFromUrl = (searchParams.get('tab') as TabValue) || 'dashboard';
  const userId = searchParams.get('userId');      // may be null
  const courseId = searchParams.get('courseId');  // string | null
  const mode: Mode = (searchParams.get('mode') === 'admin' ? 'admin' : 'coach');

  // Local for roster picker only
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

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

  const tabValue: TabValue = useMemo(
    () => (TAB_VALUES.includes(tabFromUrl) ? tabFromUrl : 'dashboard'),
    [tabFromUrl]
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        transition: 'margin-right 0.35s cubic-bezier(0.4,0,0.2,1)',
        mr: { xs: 0, lg: notesOpen ? `${SIDEBAR_WIDTH}px` : 0 },
      }}
    >
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={2} sx={{ mb: 2 }}>
          {/* Header with Back to Home (/coach) */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ pr: { xs: 0, sm: 3 } }}>
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

            <Box sx={{ width: 190, flexShrink: 0 }}>
              <Button
                variant={notesOpen ? 'contained' : 'outlined'}
                size="small"
                fullWidth
                startIcon={<NotesIcon />}
                onClick={() => setNotesOpen((prev) => !prev)}
              >
                Private notes
              </Button>
            </Box>
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
                <CoachNotesView mode={mode} />
              )}

              {tabValue === 'progress' && (
                <StudentProgressView mode={mode} />
              )}
            </Box>
          </Paper>
        </Stack>
      </Container>

      <Box
        sx={{
          position: 'fixed',
          top: '56px',
          right: 0,
          bottom: 0,
          width: { xs: '100%', sm: `${SIDEBAR_WIDTH}px` },
          bgcolor: 'background.paper',
          borderLeft: '1px solid',
          borderColor: 'divider',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
          zIndex: 1200,
          transform: notesOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6" fontWeight={700}>Private notes</Typography>
            <Typography
              variant="caption"
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 99,
                bgcolor: '#fef3c7',
                color: '#92400e',
                fontWeight: 600,
              }}
            >
              🔒 Coach only
            </Typography>
          </Stack>
          <IconButton onClick={() => setNotesOpen(false)} aria-label="Close private notes panel">
            <CloseIcon />
          </IconButton>
        </Box>

        <Box sx={{ p: 2, flex: 1, minHeight: 0 }}>
          {userId ? <PrivateNotesPanel userId={userId} /> : (
            <Typography variant="body2" color="text.secondary">
              Pick a student above to view private notes.
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

// Outer wrapper adds the required Suspense boundary
export const dynamic = 'force-dynamic'; // avoids static prerender for query-driven page

export default function StudentsOverviewPage() {
  return (
    <Suspense fallback={null}>
      <StudentsOverviewInner />
    </Suspense>
  );
}
