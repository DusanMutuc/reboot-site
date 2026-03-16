'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import NotesIcon from '@mui/icons-material/StickyNote2';
import CloseIcon from '@mui/icons-material/Close';

import { supabase } from '@/lib/supabaseClient';
import CoursePicker from '@/components/coach/CoursePicker';
import CoachingNotesPanel from '@/components/coach/CoachingNotesPanel';
import DetailedUserProgressView from '@/components/coach/DetailedUserProgressView';
import PrivateNotesPanel from '@/components/coach/PrivateNotesPanel';
import SmartDocsAnswers from '@/components/coach/SmartDocsAnswers';
import UserWinsPanel from '@/components/coach/UserWinsPanel';
import KpiTracker from '@/components/KpiTracker';
import UserDashboard from '@/components/user/dashboard/UserDashboard';
import UserDashboardExpanded from '@/components/user/dashboard/UserDashboardExpanded';

type StudentWorkspaceMode = 'coach' | 'admin';
type StudentWorkspaceTab = 'dashboard' | 'notes' | 'progress' | 'kpi';

type StudentOption = {
  id: string;
  full_name: string;
  email: string | null;
};

type CoachRosterRow = {
  user_id: string;
  full_name: string;
  email?: string | null;
};

type AdminListUserRow = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type CourseLite = {
  id: number;
  title: string | null;
};

const TABS: StudentWorkspaceTab[] = ['dashboard', 'notes', 'progress', 'kpi'];
const NOTES_SIDEBAR_WIDTH = 360;

function normalizeTab(value: string | null): StudentWorkspaceTab {
  return value && TABS.includes(value as StudentWorkspaceTab)
    ? (value as StudentWorkspaceTab)
    : 'dashboard';
}

async function loadAdminStudents(): Promise<StudentOption[]> {
  const res = await fetch('/api/admin/list-users', { cache: 'no-store' });
  const body = (await res.json()) as { items?: AdminListUserRow[]; error?: string };
  if (!res.ok) {
    throw new Error(body.error || 'Failed to load students.');
  }

  return (body.items ?? [])
    .map((item) => ({
      id: item.id,
      full_name: item.name?.trim() || item.email?.trim() || 'Unnamed student',
      email: item.email?.trim() || null,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function loadCoachStudents(): Promise<StudentOption[]> {
  const { data, error } = await supabase.rpc('get_my_users_with_status');
  if (error) {
    throw error;
  }

  return ((data ?? []) as CoachRosterRow[])
    .map((row) => ({
      id: row.user_id,
      full_name: row.full_name || row.email || 'Unnamed student',
      email: row.email ?? null,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function loadCourses(): Promise<CourseLite[]> {
  const { data, error } = await supabase
    .from('content_nodes')
    .select('id,title')
    .eq('node_type', 'course')
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as CourseLite[];
}

export default function StudentWorkspace({ mode }: { mode: StudentWorkspaceMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab = normalizeTab(searchParams.get('tab'));
  const selectedStudentId = searchParams.get('userId');
  const courseIdFromQuery = searchParams.get('courseId');
  const selectedCourseId = courseIdFromQuery ? Number(courseIdFromQuery) : null;

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  const [courses, setCourses] = useState<CourseLite[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);

  const [privateNotesOpen, setPrivateNotesOpen] = useState(false);
  const [kpiRefreshSignal, setKpiRefreshSignal] = useState(0);

  const setQuery = useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(patch).forEach(([key, value]) => {
        if (value == null || value === '') {
          params.delete(key);
          return;
        }
        params.set(key, String(value));
      });
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname);
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setStudentsLoading(true);
        setStudentsError(null);
        const items = mode === 'admin' ? await loadAdminStudents() : await loadCoachStudents();
        if (!active) return;

        setStudents(items);

        if (!selectedStudentId && items[0]) {
          setQuery({ userId: items[0].id });
          return;
        }

        if (selectedStudentId && !items.some((item) => item.id === selectedStudentId)) {
          setQuery({ userId: items[0]?.id ?? null });
        }
      } catch (error) {
        if (!active) return;
        setStudentsError(error instanceof Error ? error.message : 'Failed to load students.');
      } finally {
        if (active) {
          setStudentsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [mode, selectedStudentId, setQuery]);

  useEffect(() => {
    if (tab !== 'progress') return;

    let active = true;

    (async () => {
      try {
        setCoursesLoading(true);
        setCoursesError(null);
        const items = await loadCourses();
        if (!active) return;

        setCourses(items);

        if (!selectedCourseId && items[0]) {
          setQuery({ courseId: items[0].id });
          return;
        }

        if (selectedCourseId && !items.some((item) => item.id === selectedCourseId)) {
          setQuery({ courseId: items[0]?.id ?? null });
        }
      } catch (error) {
        if (!active) return;
        setCoursesError(error instanceof Error ? error.message : 'Failed to load courses.');
      } finally {
        if (active) {
          setCoursesLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedCourseId, setQuery, tab]);

  useEffect(() => {
    setPrivateNotesOpen(false);
  }, [selectedStudentId]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [selectedStudentId, students],
  );

  const backHref = mode === 'admin' ? '/admin/status-overview' : '/coach';
  const backLabel = mode === 'admin' ? 'Back to Student Status' : 'Back to Coach Home';
  const scopeCopy =
    mode === 'admin'
      ? 'Showing every member in the system.'
      : 'Showing students on your roster only.';
  const sectionLabel = mode === 'admin' ? 'Admin Panel' : 'Coach Workspace';

  const renderTabContent = () => {
    if (!selectedStudentId) {
      return (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            border: '1px solid',
            borderColor: 'grey.200',
            borderRadius: 3,
            textAlign: 'center',
          }}
        >
          <Typography variant="body1" color="text.secondary">
            Choose a student above to open the workspace.
          </Typography>
        </Paper>
      );
    }

    if (tab === 'dashboard') {
      return <UserDashboard userId={selectedStudentId} refreshSignal={kpiRefreshSignal} />;
    }

    if (tab === 'notes') {
      return (
        <Stack spacing={3}>
          <Paper
            elevation={0}
            sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 3, overflow: 'hidden' }}
          >
            <CoachingNotesPanel userId={selectedStudentId} />
          </Paper>

          <UserWinsPanel userId={selectedStudentId} />
        </Stack>
      );
    }

    if (tab === 'progress') {
      return (
        <Stack spacing={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              border: '1px solid',
              borderColor: 'grey.200',
              borderRadius: 3,
            }}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              alignItems={{ xs: 'stretch', md: 'center' }}
            >
              <Box sx={{ width: { xs: '100%', md: 420 } }}>
                <CoursePicker
                  courses={courses}
                  value={selectedCourseId}
                  onChange={(nextId) => setQuery({ courseId: nextId })}
                  disabled={coursesLoading || courses.length === 0}
                />
              </Box>

              <Typography variant="body2" color="text.secondary">
                {coursesError
                  ? coursesError
                  : 'Pick a course to review detailed progress and SmartDocs.'}
              </Typography>
            </Stack>
          </Paper>

          <Paper
            elevation={0}
            sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 3, overflow: 'hidden' }}
          >
            <DetailedUserProgressView
              courseId={selectedCourseId}
              userId={selectedStudentId}
              mode={mode}
            />
          </Paper>

          <SmartDocsAnswers courseId={selectedCourseId} userId={selectedStudentId} mode={mode} />
        </Stack>
      );
    }

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
          <KpiTracker
            userIdOverride={selectedStudentId}
            onSaved={() => setKpiRefreshSignal((prev) => prev + 1)}
          />
        </Paper>

        <Box>
          <UserDashboardExpanded userId={selectedStudentId} refreshSignal={kpiRefreshSignal} />
        </Box>
      </Stack>
    );
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        transition: 'margin-right 0.35s cubic-bezier(0.4,0,0.2,1)',
        mr: { xs: 0, lg: privateNotesOpen ? `${NOTES_SIDEBAR_WIDTH}px` : 0 },
      }}
    >
      <Stack spacing={2} sx={{ px: { xs: 0, md: 1 }, pb: 2 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ pr: { xs: 0, sm: 3 } }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <IconButton
              LinkComponent={Link}
              href={backHref}
              aria-label={backLabel}
              size="medium"
            >
              <ArrowBackIosNewIcon />
            </IconButton>

            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.8 }}>
                {sectionLabel}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Student Workspace
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ width: 190, flexShrink: 0 }}>
            <Button
              variant={privateNotesOpen ? 'contained' : 'outlined'}
              size="small"
              fullWidth
              startIcon={<NotesIcon />}
              onClick={() => setPrivateNotesOpen((prev) => !prev)}
              disabled={!selectedStudentId}
            >
              Private notes
            </Button>
          </Box>
        </Stack>

        <Paper
          elevation={0}
          sx={{
            p: 2,
            border: '1px solid',
            borderColor: 'grey.200',
            borderRadius: 3,
          }}
        >
          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              alignItems={{ xs: 'stretch', md: 'center' }}
            >
              <Box sx={{ minWidth: 300, flex: 1 }}>
                <Autocomplete
                  options={students}
                  loading={studentsLoading}
                  value={selectedStudent}
                  onChange={(_event, nextValue) => {
                    setQuery({ userId: nextValue?.id ?? null });
                  }}
                  getOptionLabel={(option) => option.full_name}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Student"
                      placeholder="Search for a student"
                      error={Boolean(studentsError)}
                      helperText={studentsError ?? scopeCopy}
                    />
                  )}
                />
              </Box>

              {selectedStudent ? (
                <Box sx={{ minWidth: { xs: '100%', md: 240 } }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {selectedStudent.full_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedStudent.email || (mode === 'coach' ? 'Roster student' : 'Email unavailable')}
                  </Typography>
                </Box>
              ) : null}
            </Stack>
          </Stack>
        </Paper>

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
            value={tab}
            onChange={(_event, nextValue: StudentWorkspaceTab) => setQuery({ tab: nextValue })}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Student workspace tabs"
            sx={{
              px: 1,
              borderBottom: '1px solid',
              borderColor: 'grey.200',
            }}
          >
            <Tab value="dashboard" label="Overview" />
            <Tab value="notes" label="Coaching Notes" />
            <Tab value="progress" label="Progress" />
            <Tab value="kpi" label="KPI Tracker" />
          </Tabs>

          <Box sx={{ p: { xs: 2, md: 3 } }}>
            {studentsLoading ? (
              <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress />
              </Box>
            ) : (
              renderTabContent()
            )}
          </Box>
        </Paper>

        {!studentsLoading && students.length === 0 ? (
          <Alert severity="info">
            {mode === 'admin'
              ? 'No students are available yet.'
              : 'No students were found on your roster.'}
          </Alert>
        ) : null}
      </Stack>

      <Box
        sx={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: { xs: '100%', sm: `${NOTES_SIDEBAR_WIDTH}px` },
          bgcolor: 'background.paper',
          borderLeft: '1px solid',
          borderColor: 'divider',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
          zIndex: 1200,
          transform: privateNotesOpen ? 'translateX(0)' : 'translateX(100%)',
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
            <Typography variant="h6" fontWeight={700}>
              Private notes
            </Typography>
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
              Internal only
            </Typography>
          </Stack>
          <IconButton onClick={() => setPrivateNotesOpen(false)} aria-label="Close private notes panel">
            <CloseIcon />
          </IconButton>
        </Box>

        <Box sx={{ p: 2, flex: 1, minHeight: 0 }}>
          {selectedStudentId ? (
            <PrivateNotesPanel userId={selectedStudentId} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Pick a student above to view private notes.
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
