'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  GlobalStyles,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabaseClient';
import {
  addPrivateNote,
  fetchPrivateNotes,
  fetchStudentCourseModules,
  fetchStudentOverviewData,
  type StudentOverviewActionStep,
  type StudentOverviewAttendancePoint,
  type StudentOverviewCourse,
  type StudentOverviewCourseModule,
  type StudentOverviewData,
  type StudentOverviewMetric,
  type StudentOverviewPrivateNote,
  type StudentOverviewRecencyKey,
} from '@/lib/studentOverview';

type StudentOption = {
  id: string;
  full_name: string;
};

type AchievementOption = {
  id: number;
  title: string;
  code: string;
  is_active: boolean;
};

type ApiError = {
  error?: string;
};

type CourseModuleState = {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  modules: StudentOverviewCourseModule[];
};

type RecencyTone = 'green' | 'amber' | 'red';

const DISPLAY_FONT = 'Georgia, "Times New Roman", serif';
const PAGE_BG = '#eef1f4';
const CARD_BG = '#ffffff';

const RECENCY_COPY: Record<StudentOverviewRecencyKey, string> = {
  m2: 'Last M2 Meeting',
  impl: 'Last Impl Meeting',
  kpi: 'Last KPI Update',
};

const STATUS_COPY: Record<StudentOverviewActionStep['status'], string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  complete: 'Completed',
};

const STATUS_COLORS: Record<StudentOverviewActionStep['status'], { fg: string; bg: string }> = {
  not_started: { fg: '#6b7280', bg: '#f3f4f6' },
  in_progress: { fg: '#9a6700', bg: '#fff7d6' },
  complete: { fg: '#166534', bg: '#dcfce7' },
};

const RECENCY_COLORS: Record<RecencyTone, { bg: string; fg: string; border: string }> = {
  green: { bg: '#e9f9ef', fg: '#15693a', border: '#9dd6af' },
  amber: { bg: '#fff4df', fg: '#9a5b00', border: '#f1cb82' },
  red: { bg: '#fde8e8', fg: '#9f1d1d', border: '#efb0b0' },
};

const METRIC_FORMATTERS = {
  currency: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }),
  number: new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }),
};

function formatMetricValue(metric: StudentOverviewMetric): string {
  if (metric.value == null) return '--';
  return metric.format === 'currency'
    ? METRIC_FORMATTERS.currency.format(metric.value)
    : METRIC_FORMATTERS.number.format(metric.value);
}

function formatDateLabel(value: string | null): string {
  if (!value) return 'No date yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date yet';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAwardedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDaysAgo(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function getRecencyTone(value: string | null): RecencyTone {
  const days = getDaysAgo(value);
  if (days == null) return 'red';
  if (days <= 14) return 'green';
  if (days <= 30) return 'amber';
  return 'red';
}

function getM2RecencyTone(value: string | null): RecencyTone {
  const days = getDaysAgo(value);
  if (days == null) return 'red';
  if (days <= 48) return 'green';
  if (days <= 63) return 'amber';
  return 'red';
}

function formatDaysAgo(value: string | null): string {
  const days = getDaysAgo(value);
  if (days == null) return 'No update yet';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function buildCumulativeAttendance(
  snapshot: StudentOverviewAttendancePoint[],
): StudentOverviewAttendancePoint[] {
  let m2 = 0;
  let impl = 0;
  let group = 0;

  return snapshot.map((point) => {
    m2 += point.m2;
    impl += point.impl;
    group += point.group;
    return {
      ...point,
      m2,
      impl,
      group,
    };
  });
}

function getNotePreview(notesSummary: string, expanded: boolean): string {
  if (expanded || notesSummary.length <= 320) return notesSummary;
  return `${notesSummary.slice(0, 320).trim()}...`;
}

function getModuleStatusLabel(module: StudentOverviewCourseModule): string {
  if (module.isCompleted) return 'Completed';
  if (module.status === 'in_progress') return 'In Progress';
  return 'Not Started';
}

function printStyles(theme: Theme) {
  return {
    '@page': {
      margin: '14mm',
    },
    '@media print': {
      body: {
        background: '#ffffff',
      },
      '.student-overview-root': {
        background: '#ffffff',
      },
      '.student-overview-no-print': {
        display: 'none !important',
      },
      '.student-overview-sticky': {
        position: 'static !important',
        top: 'auto !important',
        boxShadow: 'none !important',
        background: '#ffffff !important',
        borderBottom: `1px solid ${theme.palette.divider}`,
      },
      '.student-overview-card': {
        boxShadow: 'none !important',
        border: `1px solid ${theme.palette.divider}`,
        breakInside: 'avoid',
      },
      '.student-overview-chart': {
        minHeight: '320px !important',
      },
    },
  };
}

async function loadStudentOptions(): Promise<StudentOption[]> {
  const res = await fetch('/api/admin/list-users');
  const body = (await res.json()) as
    | { items?: Array<{ id: string; name: string; email: string }> }
    | ApiError;

  if (!res.ok) {
    throw new Error(('error' in body ? body.error : undefined) ?? 'Failed to load students.');
  }

  const items =
    'items' in body && Array.isArray(body.items)
      ? body.items
      : [];
  return items
    .map((item: { id: string; name: string; email: string }) => ({
      id: item.id,
      full_name: item.name || item.email || 'Unnamed student',
    }))
    .sort((a: StudentOption, b: StudentOption) => a.full_name.localeCompare(b.full_name));
}

async function loadAchievementOptions(): Promise<AchievementOption[]> {
  const res = await fetch('/api/admin/achievements');
  const body = (await res.json()) as AchievementOption[] | ApiError;
  if (!res.ok) {
    throw new Error((body as ApiError).error ?? 'Failed to load achievements.');
  }

  return Array.isArray(body)
    ? [...body].sort(
        (a, b) => Number(b.is_active) - Number(a.is_active) || a.title.localeCompare(b.title),
      )
    : [];
}

export default function StudentOverviewNew() {
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  const [overviewData, setOverviewData] = useState<StudentOverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [expandedNotes, setExpandedNotes] = useState(false);
  const [attendanceMode, setAttendanceMode] = useState<'snapshot' | 'cumulative'>('snapshot');

  const [courseStates, setCourseStates] = useState<Record<number, CourseModuleState>>({});
  const [expandedCourses, setExpandedCourses] = useState<Record<number, boolean>>({});

  const [privateNotesOpen, setPrivateNotesOpen] = useState(false);
  const [privateNotes, setPrivateNotes] = useState<StudentOverviewPrivateNote[]>([]);
  const [privateNotesLoading, setPrivateNotesLoading] = useState(false);
  const [privateNotesError, setPrivateNotesError] = useState<string | null>(null);
  const [newPrivateNote, setNewPrivateNote] = useState('');
  const [savingPrivateNote, setSavingPrivateNote] = useState(false);

  const [achievementModalOpen, setAchievementModalOpen] = useState(false);
  const [achievementOptions, setAchievementOptions] = useState<AchievementOption[]>([]);
  const [achievementOptionsLoading, setAchievementOptionsLoading] = useState(false);
  const [achievementOptionsError, setAchievementOptionsError] = useState<string | null>(null);
  const [selectedAchievementId, setSelectedAchievementId] = useState<number | ''>('');
  const [achievementAwardedAt, setAchievementAwardedAt] = useState('');
  const [achievementActionError, setAchievementActionError] = useState<string | null>(null);
  const [achievementActionSuccess, setAchievementActionSuccess] = useState<string | null>(null);
  const [savingAchievement, setSavingAchievement] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setStudentsLoading(true);
        setStudentsError(null);
        const options = await loadStudentOptions();
        if (!active) return;
        setStudentOptions(options);
        setSelectedStudentId((prev) => prev || options[0]?.id || '');
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
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error('StudentOverviewNew auth error', error);
        setCurrentUserId(null);
        return;
      }
      setCurrentUserId(data.user?.id ?? null);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedStudentId) {
      setOverviewData(null);
      return;
    }

    let active = true;

    (async () => {
      try {
        setOverviewLoading(true);
        setOverviewError(null);
        const data = await fetchStudentOverviewData(supabase, selectedStudentId);
        if (!active) return;
        setOverviewData(data);
        setExpandedNotes(false);
        setCourseStates({});
        setExpandedCourses({});
      } catch (error) {
        if (!active) return;
        setOverviewError(error instanceof Error ? error.message : 'Failed to load student overview.');
      } finally {
        if (active) {
          setOverviewLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedStudentId, refreshToken]);

  useEffect(() => {
    if (!privateNotesOpen || !selectedStudentId) return;

    let active = true;

    (async () => {
      try {
        setPrivateNotesLoading(true);
        setPrivateNotesError(null);
        const notes = await fetchPrivateNotes(supabase, selectedStudentId);
        if (!active) return;
        setPrivateNotes(notes);
      } catch (error) {
        if (!active) return;
        setPrivateNotesError(error instanceof Error ? error.message : 'Failed to load private notes.');
      } finally {
        if (active) {
          setPrivateNotesLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [privateNotesOpen, selectedStudentId]);

  useEffect(() => {
    if (!achievementModalOpen) return;

    let active = true;

    (async () => {
      try {
        setAchievementOptionsLoading(true);
        setAchievementOptionsError(null);
        const options = await loadAchievementOptions();
        if (!active) return;
        setAchievementOptions(options);
      } catch (error) {
        if (!active) return;
        setAchievementOptionsError(
          error instanceof Error ? error.message : 'Failed to load achievements.',
        );
      } finally {
        if (active) {
          setAchievementOptionsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [achievementModalOpen]);

  const selectedStudent =
    studentOptions.find((option) => option.id === selectedStudentId) ?? null;

  const attendanceSeries = useMemo(() => {
    const snapshot = overviewData?.attendance.snapshot ?? [];
    return attendanceMode === 'snapshot' ? snapshot : buildCumulativeAttendance(snapshot);
  }, [attendanceMode, overviewData?.attendance.snapshot]);

  const notePreview = useMemo(
    () => getNotePreview(overviewData?.coachingWorkspace.notesSummary ?? '', expandedNotes),
    [expandedNotes, overviewData?.coachingWorkspace.notesSummary],
  );

  const handleToggleCourse = async (course: StudentOverviewCourse) => {
    setExpandedCourses((prev) => ({
      ...prev,
      [course.id]: !prev[course.id],
    }));

    const state = courseStates[course.id];
    if (state?.loaded || state?.loading || !selectedStudentId) return;

    setCourseStates((prev) => ({
      ...prev,
      [course.id]: {
        loading: true,
        loaded: false,
        error: null,
        modules: [],
      },
    }));

    try {
      const modules = await fetchStudentCourseModules(supabase, selectedStudentId, course.id);
      setCourseStates((prev) => ({
        ...prev,
        [course.id]: {
          loading: false,
          loaded: true,
          error: null,
          modules,
        },
      }));
    } catch (error) {
      setCourseStates((prev) => ({
        ...prev,
        [course.id]: {
          loading: false,
          loaded: true,
          error: error instanceof Error ? error.message : 'Failed to load modules.',
          modules: [],
        },
      }));
    }
  };

  const handleSavePrivateNote = async () => {
    if (!selectedStudentId || !newPrivateNote.trim()) return;

    try {
      setSavingPrivateNote(true);
      setPrivateNotesError(null);
      await addPrivateNote(supabase, {
        userId: selectedStudentId,
        authorId: currentUserId,
        body: newPrivateNote,
      });
      const notes = await fetchPrivateNotes(supabase, selectedStudentId);
      setPrivateNotes(notes);
      setNewPrivateNote('');
    } catch (error) {
      setPrivateNotesError(error instanceof Error ? error.message : 'Failed to save private note.');
    } finally {
      setSavingPrivateNote(false);
    }
  };

  const handleAwardAchievement = async () => {
    if (!selectedStudentId || !selectedAchievementId) return;

    try {
      setSavingAchievement(true);
      setAchievementActionError(null);
      setAchievementActionSuccess(null);

      const payload = {
        user_id: selectedStudentId,
        achievement_id: Number(selectedAchievementId),
        achieved_at: achievementAwardedAt
          ? new Date(achievementAwardedAt).toISOString()
          : undefined,
        overwrite: false,
      };

      const res = await fetch('/api/admin/user-achievements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({} as ApiError))) as ApiError;

      if (!res.ok) {
        throw new Error(body.error ?? 'Failed to award achievement.');
      }

      setAchievementActionSuccess('Achievement awarded.');
      setSelectedAchievementId('');
      setAchievementAwardedAt('');
      setRefreshToken((token) => token + 1);
    } catch (error) {
      setAchievementActionError(
        error instanceof Error ? error.message : 'Failed to award achievement.',
      );
    } finally {
      setSavingAchievement(false);
    }
  };

  const handleCloseAchievementModal = () => {
    setAchievementModalOpen(false);
    setAchievementActionError(null);
    setAchievementActionSuccess(null);
    setSelectedAchievementId('');
    setAchievementAwardedAt('');
  };

  return (
    <Box
      className="student-overview-root"
      sx={{
        bgcolor: PAGE_BG,
        mx: -3,
        my: -3,
        px: { xs: 2, md: 3 },
        py: { xs: 2, md: 3 },
      }}
    >
      <GlobalStyles styles={(theme) => printStyles(theme)} />

      <Stack spacing={2.5}>
        <Paper
          className="student-overview-sticky student-overview-card"
          elevation={0}
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 4,
            px: { xs: 2, md: 3 },
            py: 1.75,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            spacing={1.5}
          >
            <Typography
              variant="h6"
              sx={{
                fontFamily: DISPLAY_FONT,
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              Student Tracking / {selectedStudent?.full_name ?? 'Student Overview New'}
            </Typography>

            <Stack
              direction="row"
              spacing={1.25}
              className="student-overview-no-print"
            >
              <Button
                variant="outlined"
                startIcon={<LockOutlinedIcon />}
                onClick={() => setPrivateNotesOpen(true)}
                disabled={!selectedStudentId}
                sx={{ textTransform: 'none', borderRadius: 999 }}
              >
                Private Notes
              </Button>
              <Button
                variant="contained"
                startIcon={<PictureAsPdfIcon />}
                onClick={() => window.print()}
                disabled={!selectedStudentId}
                sx={{
                  textTransform: 'none',
                  borderRadius: 999,
                  bgcolor: '#1f2937',
                  '&:hover': { bgcolor: '#111827' },
                }}
              >
                Export PDF
              </Button>
            </Stack>
          </Stack>
        </Paper>

        <Paper
          className="student-overview-card student-overview-no-print"
          elevation={0}
          sx={{
            p: { xs: 2, md: 2.5 },
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: CARD_BG,
          }}
        >
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ xs: 'stretch', lg: 'center' }}>
            <Box sx={{ minWidth: { xs: '100%', lg: 360 }, flex: 1 }}>
              <Autocomplete
                options={studentOptions}
                loading={studentsLoading}
                value={selectedStudent}
                onChange={(_event, nextValue) => setSelectedStudentId(nextValue?.id ?? '')}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                getOptionLabel={(option) => option.full_name}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Student"
                    placeholder="Search for a student"
                    error={Boolean(studentsError)}
                    helperText={studentsError ?? 'Search or choose a student to review.'}
                  />
                )}
              />
            </Box>

            <Typography variant="body2" color="text.secondary">
              Coach-facing admin review for action steps, progress, metrics, achievements, and attendance.
            </Typography>
          </Stack>
        </Paper>

        {overviewError && <Alert severity="error">{overviewError}</Alert>}

        {!selectedStudentId && !studentsLoading && !studentsError ? (
          <Paper
            className="student-overview-card"
            elevation={0}
            sx={{
              p: 6,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              textAlign: 'center',
              bgcolor: CARD_BG,
            }}
          >
            <Typography variant="h6" sx={{ fontFamily: DISPLAY_FONT }}>
              Pick a student to open the overview.
            </Typography>
          </Paper>
        ) : overviewLoading ? (
          <Paper
            className="student-overview-card"
            elevation={0}
            sx={{
              p: 6,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              textAlign: 'center',
              bgcolor: CARD_BG,
            }}
          >
            <CircularProgress />
            <Typography sx={{ mt: 2 }} color="text.secondary">
              Loading student overview...
            </Typography>
          </Paper>
        ) : overviewData ? (
          <>
            <Paper
              className="student-overview-card"
              elevation={0}
              sx={{
                p: { xs: 2, md: 3 },
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: CARD_BG,
              }}
            >
              <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2.5} justifyContent="space-between">
                <Stack spacing={1.5}>
                  <Typography
                    variant="overline"
                    sx={{ color: '#6b7280', letterSpacing: '0.12em' }}
                  >
                    Student Profile
                  </Typography>
                  <Typography
                    variant="h3"
                    sx={{
                      fontFamily: DISPLAY_FONT,
                      fontWeight: 700,
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {overviewData.student.fullName}
                  </Typography>
                  <Box>
                    <Chip
                      label={overviewData.student.isIntroduced ? 'Introduced' : 'Not Introduced'}
                      sx={{
                        borderRadius: 999,
                        bgcolor: overviewData.student.isIntroduced ? '#e9f9ef' : '#fff4df',
                        color: overviewData.student.isIntroduced ? '#15693a' : '#9a5b00',
                        fontWeight: 700,
                      }}
                    />
                  </Box>
                </Stack>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
                    gap: 1.5,
                    width: { xs: '100%', lg: 'min(760px, 100%)' },
                  }}
                >
                  {(Object.keys(overviewData.recency) as StudentOverviewRecencyKey[]).map((key) => {
                    const value = overviewData.recency[key];
                    const tone = key === 'm2' ? getM2RecencyTone(value) : getRecencyTone(value);
                    const toneColors = RECENCY_COLORS[tone];
                    return (
                      <Box
                        key={key}
                        sx={{
                          p: 2,
                          borderRadius: 2.5,
                          border: '1px solid',
                          borderColor: toneColors.border,
                          bgcolor: toneColors.bg,
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 700, color: toneColors.fg }}>
                          {RECENCY_COPY[key]}
                        </Typography>
                        <Typography
                          sx={{
                            mt: 0.5,
                            fontFamily: DISPLAY_FONT,
                            fontWeight: 700,
                            fontSize: '1.15rem',
                            color: toneColors.fg,
                          }}
                        >
                          {formatDateLabel(value)}
                        </Typography>
                        <Typography variant="body2" sx={{ color: toneColors.fg, opacity: 0.9 }}>
                          {formatDaysAgo(value)}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Stack>
            </Paper>

            <Paper
              className="student-overview-card"
              elevation={0}
              sx={{
                p: { xs: 2, md: 3 },
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: CARD_BG,
              }}
            >
              <Stack spacing={2}>
                <Typography
                  variant="h4"
                  sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.02em' }}
                >
                  Coaching Workspace
                </Typography>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', lg: '1.05fr 0.95fr' },
                    gap: 2,
                  }}
                >
                  <Box
                    sx={{
                      p: 2.5,
                      borderRadius: 2.5,
                      bgcolor: '#f8fafc',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="h6" sx={{ fontFamily: DISPLAY_FONT, mb: 2 }}>
                      Action Steps
                    </Typography>

                    {overviewData.coachingWorkspace.actionSteps.length === 0 ? (
                      <Typography color="text.secondary">
                        No assigned action steps on the latest coaching cycle.
                      </Typography>
                    ) : (
                      <Stack spacing={1.5}>
                        {overviewData.coachingWorkspace.actionSteps.map((step) => {
                          const colors = STATUS_COLORS[step.status];
                          return (
                            <Paper
                              key={step.id}
                              elevation={0}
                              sx={{
                                p: 1.75,
                                borderRadius: 2,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: '#ffffff',
                              }}
                            >
                              <Stack spacing={1.25}>
                                <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                                  <Typography sx={{ fontWeight: 600 }}>{step.label}</Typography>
                                  <Chip
                                    label={STATUS_COPY[step.status]}
                                    size="small"
                                    sx={{
                                      bgcolor: colors.bg,
                                      color: colors.fg,
                                      fontWeight: 700,
                                    }}
                                  />
                                </Stack>

                                {step.guideHref ? (
                                  <Button
                                    href={step.guideHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    size="small"
                                    variant="text"
                                    endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
                                    sx={{
                                      alignSelf: 'flex-start',
                                      textTransform: 'none',
                                      px: 0,
                                    }}
                                  >
                                    View guide
                                  </Button>
                                ) : null}
                              </Stack>
                            </Paper>
                          );
                        })}
                      </Stack>
                    )}
                  </Box>

                  <Box
                    sx={{
                      p: 2.5,
                      borderRadius: 2.5,
                      bgcolor: '#f8fafc',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="h6" sx={{ fontFamily: DISPLAY_FONT, mb: 2 }}>
                      Coaching Notes
                    </Typography>

                    {overviewData.coachingWorkspace.notesSummary ? (
                      <>
                        <Typography
                          sx={{
                            color: 'text.primary',
                            lineHeight: 1.7,
                            whiteSpace: 'pre-line',
                          }}
                        >
                          {notePreview}
                        </Typography>

                        {overviewData.coachingWorkspace.notesSummary.length > 320 ? (
                          <Button
                            variant="text"
                            onClick={() => setExpandedNotes((open) => !open)}
                            sx={{ mt: 1.5, px: 0, textTransform: 'none' }}
                          >
                            {expandedNotes ? 'Show less' : 'Show more'}
                          </Button>
                        ) : null}

                        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                          {overviewData.coachingWorkspace.noteCount} note
                          {overviewData.coachingWorkspace.noteCount === 1 ? '' : 's'} in latest coaching cycle
                          {overviewData.coachingWorkspace.notesUpdatedAt
                            ? ` - last updated ${formatDateLabel(
                                overviewData.coachingWorkspace.notesUpdatedAt,
                              )}`
                            : ''}
                        </Typography>
                      </>
                    ) : (
                      <Typography color="text.secondary">
                        No coaching note comments available for the latest cycle.
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Stack>
            </Paper>

            <Paper
              className="student-overview-card"
              elevation={0}
              sx={{
                p: { xs: 2, md: 3 },
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: CARD_BG,
              }}
            >
              <Stack spacing={2}>
                <Typography
                  variant="h4"
                  sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.02em' }}
                >
                  Course Progress
                </Typography>

                {overviewData.courses.length === 0 ? (
                  <Typography color="text.secondary">
                    No visible course enrollments were found for this student.
                  </Typography>
                ) : (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' },
                      gap: 2,
                    }}
                  >
                    {overviewData.courses.map((course) => {
                      const expanded = Boolean(expandedCourses[course.id]);
                      const state = courseStates[course.id];

                      return (
                        <Paper
                          key={course.id}
                          elevation={0}
                          sx={{
                            borderRadius: 2.5,
                            border: '1px solid',
                            borderColor: 'divider',
                            overflow: 'hidden',
                            bgcolor: '#fcfcfd',
                          }}
                        >
                          <Box
                            role="button"
                            tabIndex={0}
                            onClick={() => void handleToggleCourse(course)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                void handleToggleCourse(course);
                              }
                            }}
                            sx={{
                              p: 2.25,
                              cursor: 'pointer',
                              outline: 'none',
                            }}
                          >
                            <Stack spacing={1.5}>
                              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                                <Typography variant="h6" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700 }}>
                                  {course.title}
                                </Typography>
                                <Stack direction="row" spacing={1.25} alignItems="center">
                                  <Typography
                                    sx={{
                                      fontFamily: DISPLAY_FONT,
                                      fontWeight: 700,
                                      fontSize: '1.25rem',
                                    }}
                                  >
                                    {course.progressPercent}%
                                  </Typography>
                                  <ExpandMoreIcon
                                    sx={{
                                      transition: 'transform 0.2s ease',
                                      transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                    }}
                                  />
                                </Stack>
                              </Stack>

                              <Box
                                sx={{
                                  height: 10,
                                  borderRadius: 999,
                                  bgcolor: '#e5e7eb',
                                  overflow: 'hidden',
                                }}
                              >
                                <Box
                                  sx={{
                                    width: `${course.progressPercent}%`,
                                    height: '100%',
                                    bgcolor:
                                      course.progressPercent === 100 ? '#1f8f58' : '#243b53',
                                  }}
                                />
                              </Box>
                            </Stack>
                          </Box>

                          <Collapse in={expanded} timeout="auto" unmountOnExit>
                            <Box
                              sx={{
                                px: 2.25,
                                pb: 2.25,
                                pt: 0.25,
                                borderTop: '1px solid',
                                borderColor: 'divider',
                                bgcolor: '#ffffff',
                              }}
                            >
                              {state?.loading ? (
                                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ py: 2 }}>
                                  <CircularProgress size={18} />
                                  <Typography color="text.secondary">Loading modules...</Typography>
                                </Stack>
                              ) : state?.error ? (
                                <Alert severity="error" sx={{ mt: 2 }}>
                                  {state.error}
                                </Alert>
                              ) : state?.modules.length ? (
                                <Stack spacing={1} sx={{ mt: 2 }}>
                                  {state.modules.map((module) => (
                                    <Box
                                      key={module.id}
                                      sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 2,
                                        px: 1.5,
                                        py: 1.15,
                                        borderRadius: 1.5,
                                        bgcolor: module.isCompleted ? '#ecfdf3' : '#f8fafc',
                                      }}
                                    >
                                      <Typography
                                        sx={{
                                          pl: `${Math.max(0, module.depth - 1) * 12}px`,
                                          fontWeight: module.depth === 1 ? 700 : 500,
                                        }}
                                      >
                                        {module.title}
                                      </Typography>
                                      <Chip
                                        size="small"
                                        label={getModuleStatusLabel(module)}
                                        sx={{
                                          bgcolor: module.isCompleted ? '#dcfce7' : '#e5e7eb',
                                          color: module.isCompleted ? '#166534' : '#374151',
                                          fontWeight: 700,
                                        }}
                                      />
                                    </Box>
                                  ))}
                                </Stack>
                              ) : (
                                <Typography color="text.secondary" sx={{ mt: 2 }}>
                                  No module details available for this course yet.
                                </Typography>
                              )}
                            </Box>
                          </Collapse>
                        </Paper>
                      );
                    })}
                  </Box>
                )}
              </Stack>
            </Paper>

            <Paper
              className="student-overview-card"
              elevation={0}
              sx={{
                p: { xs: 2, md: 3 },
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: CARD_BG,
              }}
            >
              <Stack spacing={2}>
                <Typography
                  variant="h4"
                  sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.02em' }}
                >
                  Business Metrics
                </Typography>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      sm: 'repeat(2, minmax(0, 1fr))',
                      xl: 'repeat(6, minmax(0, 1fr))',
                    },
                    gap: 1.5,
                  }}
                >
                  {overviewData.businessMetrics.map((metric) => (
                    <Box
                      key={metric.key}
                      sx={{
                        p: 2,
                        borderRadius: 2.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: '#fbfcfd',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', letterSpacing: '0.06em' }}
                      >
                        {metric.label}
                      </Typography>
                      <Typography
                        sx={{
                          mt: 0.75,
                          fontFamily: DISPLAY_FONT,
                          fontWeight: 700,
                          fontSize: '1.55rem',
                        }}
                      >
                        {formatMetricValue(metric)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Stack>
            </Paper>

            <Paper
              className="student-overview-card"
              elevation={0}
              sx={{
                p: { xs: 2, md: 3 },
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: CARD_BG,
              }}
            >
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', md: 'center' }}
                  spacing={1.5}
                >
                  <Typography
                    variant="h4"
                    sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.02em' }}
                  >
                    Achievements
                  </Typography>

                  <Button
                    className="student-overview-no-print"
                    variant="outlined"
                    startIcon={<EmojiEventsOutlinedIcon />}
                    onClick={() => setAchievementModalOpen(true)}
                    sx={{ textTransform: 'none', borderRadius: 999 }}
                  >
                    + Give Achievement
                  </Button>
                </Stack>

                {overviewData.achievements.length === 0 ? (
                  <Typography color="text.secondary">
                    No achievements have been awarded yet.
                  </Typography>
                ) : (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: 'repeat(2, minmax(0, 1fr))',
                        xl: 'repeat(4, minmax(0, 1fr))',
                      },
                      gap: 1.5,
                    }}
                  >
                    {overviewData.achievements.map((achievement) => (
                      <Box
                        key={achievement.id}
                        sx={{
                          p: 2,
                          borderRadius: 2.5,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: '#fbfcfd',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                        }}
                      >
                        {achievement.imageUrl ? (
                          <Box
                            component="img"
                            src={achievement.imageUrl}
                            alt={achievement.title}
                            sx={{ width: 52, height: 52, borderRadius: 1.5, objectFit: 'contain' }}
                          />
                        ) : (
                          <Box
                            sx={{
                              width: 52,
                              height: 52,
                              borderRadius: 1.5,
                              display: 'grid',
                              placeItems: 'center',
                              bgcolor: '#f3f4f6',
                              color: '#6b7280',
                            }}
                          >
                            <EmojiEventsOutlinedIcon />
                          </Box>
                        )}

                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 700 }}>{achievement.title}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {formatAwardedDate(achievement.achievedAt)}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Stack>
            </Paper>

            <Paper
              className="student-overview-card"
              elevation={0}
              sx={{
                p: { xs: 2, md: 3 },
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: CARD_BG,
              }}
            >
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', md: 'center' }}
                  spacing={1.5}
                >
                  <Typography
                    variant="h4"
                    sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.02em' }}
                  >
                    Attendance History
                  </Typography>

                  <ToggleButtonGroup
                    className="student-overview-no-print"
                    exclusive
                    size="small"
                    value={attendanceMode}
                    onChange={(_event, nextValue: 'snapshot' | 'cumulative' | null) => {
                      if (nextValue) setAttendanceMode(nextValue);
                    }}
                    sx={{ borderRadius: 999 }}
                  >
                    <ToggleButton value="snapshot" sx={{ textTransform: 'none' }}>
                      Snapshot
                    </ToggleButton>
                    <ToggleButton value="cumulative" sx={{ textTransform: 'none' }}>
                      Cumulative
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Stack>

                <Box className="student-overview-chart" sx={{ width: '100%', height: 340, minHeight: 340 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={attendanceSeries} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d7dee5" />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="m2" name="M2 Meetings" stroke="#1d4ed8" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="impl" name="Impl Meetings" stroke="#b45309" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="group" name="Group Sessions" stroke="#047857" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Stack>
            </Paper>
          </>
        ) : null}
      </Stack>

      <Dialog
        open={privateNotesOpen}
        onClose={() => setPrivateNotesOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700 }}>
          Private Notes {selectedStudent ? `- ${selectedStudent.full_name}` : ''}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {privateNotesError && <Alert severity="error">{privateNotesError}</Alert>}

            <TextField
              label="Add a private note"
              multiline
              minRows={3}
              value={newPrivateNote}
              onChange={(event) => setNewPrivateNote(event.target.value)}
              placeholder="Capture private coach/admin context for this student."
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={() => void handleSavePrivateNote()}
                disabled={savingPrivateNote || !newPrivateNote.trim()}
                sx={{ textTransform: 'none' }}
              >
                {savingPrivateNote ? 'Saving...' : 'Save Private Note'}
              </Button>
            </Box>

            {privateNotesLoading ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <CircularProgress />
              </Box>
            ) : privateNotes.length === 0 ? (
              <Typography color="text.secondary">
                No private notes have been added for this student yet.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {privateNotes.map((note) => (
                  <Paper
                    key={note.id}
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: '#f9fafb',
                    }}
                  >
                    <Typography sx={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                      {note.body}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      {formatAwardedDate(note.createdAt)}
                    </Typography>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrivateNotesOpen(false)} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={achievementModalOpen}
        onClose={handleCloseAchievementModal}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700 }}>
          Give Achievement {selectedStudent ? `- ${selectedStudent.full_name}` : ''}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {achievementOptionsError && <Alert severity="error">{achievementOptionsError}</Alert>}
            {achievementActionError && <Alert severity="error">{achievementActionError}</Alert>}
            {achievementActionSuccess && <Alert severity="success">{achievementActionSuccess}</Alert>}

            <TextField
              select
              label="Achievement"
              value={selectedAchievementId}
              onChange={(event) => setSelectedAchievementId(Number(event.target.value))}
              disabled={achievementOptionsLoading}
              helperText="Choose the achievement to award manually."
            >
              {achievementOptionsLoading ? (
                <MenuItem value="" disabled>
                  Loading...
                </MenuItem>
              ) : (
                achievementOptions.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.title}
                    {!option.is_active ? ' (inactive)' : ''}
                  </MenuItem>
                ))
              )}
            </TextField>

            <TextField
              label="Awarded at (optional)"
              type="datetime-local"
              value={achievementAwardedAt}
              onChange={(event) => setAchievementAwardedAt(event.target.value)}
              InputLabelProps={{ shrink: true }}
              helperText="Leave empty to use the current time."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAchievementModal} sx={{ textTransform: 'none' }}>
            Close
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleAwardAchievement()}
            disabled={savingAchievement || !selectedAchievementId}
            sx={{ textTransform: 'none' }}
          >
            {savingAchievement ? 'Saving...' : 'Award Achievement'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
