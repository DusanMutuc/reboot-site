'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
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
import LegendMemberIcon from '@/components/LegendMemberIcon';
import PrivateNotesPanel from '@/components/coach/PrivateNotesPanel';
import BusinessAuditTab from '@/components/student/workspace/BusinessAuditTab';
import ImplementationTab from '@/components/student/workspace/ImplementationTab';
import KpiTab from '@/components/student/workspace/KpiTab';
import OverviewTab from '@/components/student/workspace/OverviewTab';
import ProgressTab from '@/components/student/workspace/ProgressTab';
import type {
  StudentWorkspaceMode,
  StudentWorkspaceTab,
  WorkspaceQueryPatch,
} from '@/components/student/workspace/types';
import { useStudentWorkspaceState } from '@/components/student/workspace/useStudentWorkspaceState';

const TABS: StudentWorkspaceTab[] = ['overview', 'audit', 'notes', 'progress', 'kpi'];
const NOTES_SIDEBAR_WIDTH = 360;
const COACH_WORKSPACE_SHELL_MAX_WIDTH = 1200;
const PRIVATE_NOTES_OFFSET_BREAKPOINT = 1200;

function normalizeTab(value: string | null): StudentWorkspaceTab {
  if (value === 'dashboard') {
    return 'overview';
  }

  return value && TABS.includes(value as StudentWorkspaceTab)
    ? (value as StudentWorkspaceTab)
    : 'overview';
}

function EmptyStudentState() {
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

export default function StudentWorkspace({ mode }: { mode: StudentWorkspaceMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceRootRef = useRef<HTMLDivElement | null>(null);

  const tab = normalizeTab(searchParams.get('tab'));
  const selectedStudentId = searchParams.get('userId');
  const courseIdFromQuery = searchParams.get('courseId');
  const selectedCourseId = courseIdFromQuery ? Number(courseIdFromQuery) : null;

  const [privateNotesOpen, setPrivateNotesOpen] = useState(false);
  const [privateNotesOffset, setPrivateNotesOffset] = useState(0);
  const [kpiRefreshSignal, setKpiRefreshSignal] = useState(0);

  const setQuery = useCallback(
    (patch: WorkspaceQueryPatch) => {
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

  const {
    coachProgressCourses,
    coachProgressError,
    coachProgressLoading,
    selectedStudent,
    students,
    studentsError,
    studentsLoading,
  } = useStudentWorkspaceState({
    mode,
    tab,
    selectedStudentId,
    selectedCourseId,
    setQuery,
  });

  useEffect(() => {
    if (!selectedStudentId) {
      setPrivateNotesOpen(false);
    }
  }, [selectedStudentId]);

  // Measure the unshifted workspace so wide screens keep the main content centered.
  const updatePrivateNotesOffset = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (!privateNotesOpen || window.innerWidth < PRIVATE_NOTES_OFFSET_BREAKPOINT) {
      setPrivateNotesOffset(0);
      return;
    }

    const parent = workspaceRootRef.current?.parentElement;

    if (!parent) {
      setPrivateNotesOffset(NOTES_SIDEBAR_WIDTH);
      return;
    }

    const parentRect = parent.getBoundingClientRect();
    const parentStyles = window.getComputedStyle(parent);
    const paddingLeft = Number.parseFloat(parentStyles.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(parentStyles.paddingRight) || 0;
    const availableLeft = parentRect.left + paddingLeft;
    const availableWidth = Math.max(0, parentRect.width - paddingLeft - paddingRight);
    const drawerLeft = window.innerWidth - NOTES_SIDEBAR_WIDTH;

    const getWorkspaceRight = (offset: number) => {
      const widthAfterOffset = Math.max(0, availableWidth - offset);

      if (mode === 'coach') {
        const shellWidth = Math.min(COACH_WORKSPACE_SHELL_MAX_WIDTH, widthAfterOffset);
        return availableLeft + (widthAfterOffset + shellWidth) / 2;
      }

      return availableLeft + widthAfterOffset;
    };

    if (getWorkspaceRight(0) <= drawerLeft + 1) {
      setPrivateNotesOffset(0);
      return;
    }

    if (getWorkspaceRight(NOTES_SIDEBAR_WIDTH) > drawerLeft + 1) {
      setPrivateNotesOffset(NOTES_SIDEBAR_WIDTH);
      return;
    }

    let low = 0;
    let high = NOTES_SIDEBAR_WIDTH;

    for (let i = 0; i < 10; i += 1) {
      const mid = (low + high) / 2;

      if (getWorkspaceRight(mid) > drawerLeft + 1) {
        low = mid;
      } else {
        high = mid;
      }
    }

    setPrivateNotesOffset(Math.ceil(high));
  }, [mode, privateNotesOpen]);

  useEffect(() => {
    updatePrivateNotesOffset();

    if (typeof window === 'undefined') return undefined;

    window.addEventListener('resize', updatePrivateNotesOffset);

    const parent = workspaceRootRef.current?.parentElement;
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePrivateNotesOffset);

    if (parent && resizeObserver) {
      resizeObserver.observe(parent);
    }

    return () => {
      window.removeEventListener('resize', updatePrivateNotesOffset);
      resizeObserver?.disconnect();
    };
  }, [updatePrivateNotesOffset]);

  const backHref = mode === 'admin' ? '/admin/status-overview' : '/coach';
  const backLabel = mode === 'admin' ? 'Back to Student Status' : 'Back to Coach Home';
  const scopeCopy =
    mode === 'admin'
      ? 'Showing every member in the system.'
      : 'Showing students on your roster only.';
  const sectionLabel = mode === 'coach' ? 'Coach Workspace' : null;

  const renderTabContent = () => {
    if (!selectedStudentId) {
      return <EmptyStudentState />;
    }

    switch (tab) {
      case 'overview':
        return (
          <OverviewTab
            mode={mode}
            userId={selectedStudentId}
            refreshSignal={kpiRefreshSignal}
            isLegend={selectedStudent?.is_legend ?? false}
          />
        );
      case 'notes':
        return (
          <ImplementationTab
            selectedStudentId={selectedStudentId}
            studentName={selectedStudent?.full_name}
          />
        );
      case 'audit':
        return (
          <BusinessAuditTab
            selectedStudentId={selectedStudentId}
            studentName={selectedStudent?.full_name}
          />
        );
      case 'progress':
        return (
          <ProgressTab
            coachCourses={coachProgressCourses}
            coachError={coachProgressError}
            coachLoading={coachProgressLoading}
            mode={mode}
            selectedCourseId={selectedCourseId}
            selectedStudentId={selectedStudentId}
            onSelectCourse={(courseId) => setQuery({ courseId })}
          />
        );
      case 'kpi':
      default:
        return (
          <KpiTab
            refreshSignal={kpiRefreshSignal}
            userId={selectedStudentId}
            onSaved={() => setKpiRefreshSignal((prev) => prev + 1)}
          />
        );
    }
  };

  return (
    <Box
      ref={workspaceRootRef}
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        transition: 'margin-right 0.35s cubic-bezier(0.4,0,0.2,1)',
        mr: { xs: 0, lg: privateNotesOpen ? `${privateNotesOffset}px` : 0 },
      }}
    >
      <Box
        sx={
          mode === 'coach'
            ? {
                width: '100%',
                maxWidth: COACH_WORKSPACE_SHELL_MAX_WIDTH,
                mx: 'auto',
                px: { xs: 2, md: 4 },
              }
            : undefined
        }
      >
        <Stack spacing={2} sx={{ px: mode === 'coach' ? 0 : { xs: 0, md: 1 }, pb: 2 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ pr: mode === 'coach' ? 0 : { xs: 0, sm: 3 } }}
          >
            <Stack direction="row" spacing={mode === 'coach' ? 1.5 : 0} alignItems="center">
              {mode === 'coach' ? (
                <IconButton
                  LinkComponent={Link}
                  href={backHref}
                  aria-label={backLabel}
                  size="medium"
                >
                  <ArrowBackIosNewIcon />
                </IconButton>
              ) : null}
              <Box>
                {sectionLabel ? (
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ letterSpacing: 0.8 }}
                  >
                    {sectionLabel}
                  </Typography>
                ) : null}
                <Typography
                  variant={mode === 'admin' ? 'adminPageTitle' : 'h5'}
                  sx={mode === 'admin' ? undefined : { fontWeight: 800 }}
                >
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
                    renderOption={(props, option) => (
                      <Box
                        component="li"
                        {...props}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          minWidth: 0,
                        }}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {option.full_name}
                          </Typography>
                          {option.email ? (
                            <Typography variant="caption" color="text.secondary">
                              {option.email}
                            </Typography>
                          ) : null}
                        </Box>
                        {option.is_legend ? <LegendMemberIcon /> : null}
                      </Box>
                    )}
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
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Typography
                        variant={mode === 'admin' ? 'adminSectionTitle' : 'body1'}
                        sx={{ fontWeight: 700 }}
                      >
                        {selectedStudent.full_name}
                      </Typography>
                      {selectedStudent.is_legend ? <LegendMemberIcon /> : null}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {selectedStudent.email ||
                        (mode === 'coach' ? 'Roster student' : 'Email unavailable')}
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
              <Tab value="overview" label="Overview" />
              <Tab value="audit" label="Business Audit" />
              <Tab value="notes" label="Implementation" />
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
      </Box>

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
            <Typography variant={mode === 'admin' ? 'adminSectionTitle' : 'h6'} fontWeight={700}>
              Private notes
            </Typography>
            <Typography
              variant={mode === 'admin' ? 'adminEyebrow' : 'caption'}
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
