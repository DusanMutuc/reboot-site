'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import NotesIcon from '@mui/icons-material/StickyNote2';
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
  fetchStudentCourseModules,
  fetchStudentOverviewData,
  type StudentOverviewActionStep,
  type StudentOverviewAttendancePoint,
  type StudentOverviewCourse,
  type StudentOverviewCourseModule,
  type StudentOverviewData,
  type StudentOverviewMetric,
  type StudentOverviewRecencyKey,
} from '@/lib/studentOverview';
import LegendMemberIcon from '@/components/LegendMemberIcon';
import PrivateNotesPanel from '@/components/coach/PrivateNotesPanel';

type StudentOption = {
  id: string;
  full_name: string;
  is_legend: boolean;
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

type StudentOverviewNewProps = {
  userId?: string | null;
  embedded?: boolean;
  isLegend?: boolean;
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
const SIDEBAR_WIDTH = 360;
const PRINT_EXPORT_MAX_WIDTH = 760;

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
      margin: '10mm',
    },
    '@media print': {
      'html, body': {
        margin: 0,
        padding: 0,
        background: '#ffffff',
      },
      body: {
        background: '#ffffff',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      },
      'body.student-overview-printing > *:not(#student-overview-print-root)': {
        display: 'none !important',
      },
      '#student-overview-print-root': {
        display: 'none',
      },
      'body.student-overview-printing #student-overview-print-root': {
        display: 'block !important',
        position: 'static !important',
        width: 'auto !important',
        height: 'auto !important',
        padding: 0,
      },
      'body.student-overview-printing .student-overview-print-shell': {
        width: 'var(--student-overview-print-width, 980px)',
        zoom: 'var(--student-overview-print-scale, 1)',
      },
      'body.student-overview-printing #student-overview-print-root .student-overview-root': {
        margin: '0 !important',
        padding: '0 !important',
        background: '#ffffff !important',
        marginRight: '0 !important',
        width: 'var(--student-overview-print-width, 980px)',
      },
      'body.student-overview-printing #student-overview-print-root .student-overview-no-print': {
        display: 'none !important',
      },
      'body.student-overview-printing #student-overview-print-root .student-overview-sticky': {
        position: 'static !important',
        top: 'auto !important',
        boxShadow: 'none !important',
        background: '#ffffff !important',
        backdropFilter: 'none !important',
        borderBottom: `1px solid ${theme.palette.divider}`,
      },
      'body.student-overview-printing #student-overview-print-root .student-overview-card': {
        boxShadow: 'none !important',
        border: `1px solid ${theme.palette.divider}`,
        breakInside: 'avoid',
      },
      'body.student-overview-printing #student-overview-print-root .student-overview-chart': {
        minHeight: '320px !important',
      },
      'body.student-overview-printing #student-overview-print-root .student-overview-header-bar': {
        flexDirection: 'row !important',
        alignItems: 'center !important',
      },
      'body.student-overview-printing #student-overview-print-root .student-overview-profile-shell': {
        flexDirection: 'row !important',
        alignItems: 'flex-start !important',
      },
      'body.student-overview-printing #student-overview-print-root .student-overview-recency-grid': {
        display: 'grid !important',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) !important',
      },
      'body.student-overview-printing #student-overview-print-root .student-overview-coaching-grid': {
        display: 'grid !important',
        gridTemplateColumns: '1.05fr 0.95fr !important',
      },
      'body.student-overview-printing #student-overview-print-root .student-overview-course-grid': {
        display: 'grid !important',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr)) !important',
      },
      'body.student-overview-printing #student-overview-print-root .student-overview-metrics-grid': {
        display: 'grid !important',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) !important',
      },
      'body.student-overview-printing #student-overview-print-root .student-overview-achievements-grid': {
        display: 'grid !important',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr)) !important',
      },
      'body.student-overview-printing #student-overview-print-root .MuiCollapse-root': {
        height: 'auto !important',
        overflow: 'visible !important',
      },
      'body.student-overview-printing #student-overview-print-root .MuiCollapse-wrapper, body.student-overview-printing #student-overview-print-root .MuiCollapse-wrapperInner': {
        height: 'auto !important',
      },
    },
  };
}

function getStudentOverviewPrintRoot(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById('student-overview-print-root') as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = 'student-overview-print-root';
    document.body.appendChild(root);
  }
  return root;
}

async function loadStudentOptions(): Promise<StudentOption[]> {
  const res = await fetch('/api/admin/list-users');
  const body = (await res.json()) as
    | { items?: Array<{ id: string; name: string; email: string; is_legend?: boolean }> }
    | ApiError;

  if (!res.ok) {
    throw new Error(('error' in body ? body.error : undefined) ?? 'Failed to load students.');
  }

  const items =
    'items' in body && Array.isArray(body.items)
      ? body.items
      : [];
  return items
    .map((item: { id: string; name: string; email: string; is_legend?: boolean }) => ({
      id: item.id,
      full_name: item.name || item.email || 'Unnamed student',
      is_legend: !!item.is_legend,
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

export default function StudentOverviewNew({
  userId = null,
  embedded = false,
  isLegend,
}: StudentOverviewNewProps) {
  const printableRef = useRef<HTMLDivElement | null>(null);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [internalSelectedStudentId, setInternalSelectedStudentId] = useState<string>('');

  const [overviewData, setOverviewData] = useState<StudentOverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [expandedNotes, setExpandedNotes] = useState(false);
  const [attendanceMode, setAttendanceMode] = useState<'snapshot' | 'cumulative'>('snapshot');

  const [courseStates, setCourseStates] = useState<Record<number, CourseModuleState>>({});
  const [expandedCourses, setExpandedCourses] = useState<Record<number, boolean>>({});

  const [privateNotesOpen, setPrivateNotesOpen] = useState(false);

  const [achievementModalOpen, setAchievementModalOpen] = useState(false);
  const [achievementOptions, setAchievementOptions] = useState<AchievementOption[]>([]);
  const [achievementOptionsLoading, setAchievementOptionsLoading] = useState(false);
  const [achievementOptionsError, setAchievementOptionsError] = useState<string | null>(null);
  const [selectedAchievementId, setSelectedAchievementId] = useState<number | ''>('');
  const [achievementAwardedAt, setAchievementAwardedAt] = useState('');
  const [achievementActionError, setAchievementActionError] = useState<string | null>(null);
  const [achievementActionSuccess, setAchievementActionSuccess] = useState<string | null>(null);
  const [savingAchievement, setSavingAchievement] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const selectedStudentId = embedded ? (userId ?? '') : internalSelectedStudentId;
  const showStudentPicker = !embedded;
  const showPrivateNotes = !embedded;

  const cleanupPrintSnapshot = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.remove('student-overview-printing');
    const root = getStudentOverviewPrintRoot();
    if (root) {
      root.innerHTML = '';
    }
  }, []);

  useEffect(() => {
    if (embedded) {
      setStudentsLoading(false);
      setStudentsError(null);
      return;
    }

    let active = true;

    (async () => {
      try {
        setStudentsLoading(true);
        setStudentsError(null);
        const options = await loadStudentOptions();
        if (!active) return;
        setStudentOptions(options);
        setInternalSelectedStudentId((prev) => prev || options[0]?.id || '');
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
  }, [embedded]);

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
  const studentDisplayName =
    selectedStudent?.full_name ?? overviewData?.student.fullName ?? 'Student Overview';
  const studentIsLegend = isLegend ?? selectedStudent?.is_legend ?? false;

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

  const handleExportPdf = useCallback(() => {
    const source = printableRef.current;
    const root = getStudentOverviewPrintRoot();
    if (!source || !root || !selectedStudentId) return;

    const clone = source.cloneNode(true) as HTMLDivElement;
    const sourceRect = source.getBoundingClientRect();
    const sourceWidth = Math.max(1, Math.ceil(sourceRect.width || source.scrollWidth));
    const scale = Math.min(1, PRINT_EXPORT_MAX_WIDTH / sourceWidth);

    root.innerHTML = '';

    const shell = document.createElement('div');
    shell.className = 'student-overview-print-shell';
    shell.style.setProperty('--student-overview-print-width', `${sourceWidth}px`);
    shell.style.setProperty('--student-overview-print-scale', String(scale));
    shell.style.width = `${sourceWidth}px`;
    shell.appendChild(clone);
    root.appendChild(shell);

    document.body.classList.add('student-overview-printing');
    setExportingPdf(true);

    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        window.print();
      }, 150);
    });
  }, [selectedStudentId]);

  useEffect(() => {
    const root = getStudentOverviewPrintRoot();
    if (!root) return undefined;

    const handleAfterPrint = () => {
      cleanupPrintSnapshot();
      setExportingPdf(false);
    };

    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      cleanupPrintSnapshot();
    };
  }, [cleanupPrintSnapshot]);

  return (
    <Box
      ref={printableRef}
      className="student-overview-root"
      sx={{
        bgcolor: embedded ? 'transparent' : PAGE_BG,
        mx: embedded ? 0 : -3,
        my: embedded ? 0 : -3,
        px: embedded ? 0 : { xs: 2, md: 3 },
        py: embedded ? 0 : { xs: 2, md: 3 },
        transition: showPrivateNotes ? 'margin-right 0.35s cubic-bezier(0.4,0,0.2,1)' : undefined,
        mr: showPrivateNotes ? { xs: 0, lg: privateNotesOpen ? `${SIDEBAR_WIDTH}px` : 0 } : 0,
      }}
    >
      <GlobalStyles styles={(theme) => printStyles(theme)} />

      <Stack spacing={2.5}>
        <Paper
          className="student-overview-sticky student-overview-card"
          elevation={0}
          sx={{
            position: embedded ? 'static' : 'sticky',
            top: embedded ? 'auto' : 0,
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
            className="student-overview-header-bar"
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            spacing={1.5}
          >
            <Typography
              variant={embedded ? 'adminPageTitle' : 'h6'}
              sx={{
                fontFamily: DISPLAY_FONT,
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              {embedded ? 'Executive Overview' : 'Student Tracking'} / {studentDisplayName}
              {studentIsLegend ? <LegendMemberIcon sx={{ ml: 0.75 }} /> : null}
            </Typography>

            <Stack
              direction="row"
              spacing={1.25}
              className="student-overview-no-print"
            >
              {showPrivateNotes ? (
                <Button
                  variant={privateNotesOpen ? 'contained' : 'outlined'}
                  startIcon={<NotesIcon />}
                  onClick={() => setPrivateNotesOpen((prev) => !prev)}
                  disabled={!selectedStudentId}
                  sx={{ textTransform: 'none', borderRadius: 999 }}
                >
                  Private Notes
                </Button>
              ) : null}
              <Button
                variant="contained"
                startIcon={<PictureAsPdfIcon />}
                onClick={handleExportPdf}
                disabled={!selectedStudentId || overviewLoading || exportingPdf}
                sx={{
                  textTransform: 'none',
                  borderRadius: 999,
                  bgcolor: '#1f2937',
                  '&:hover': { bgcolor: '#111827' },
                }}
              >
                {exportingPdf ? 'Preparing PDF...' : 'Export PDF'}
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {showStudentPicker ? (
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
                  onChange={(_event, nextValue) => setInternalSelectedStudentId(nextValue?.id ?? '')}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  getOptionLabel={(option) => option.full_name}
                  renderOption={(props, option) => (
                    <Box
                      component="li"
                      {...props}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {option.full_name}
                      </Typography>
                      {option.is_legend ? <LegendMemberIcon /> : null}
                    </Box>
                  )}
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
        ) : null}

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
            <Typography variant="adminSectionTitle" sx={{ fontFamily: DISPLAY_FONT }}>
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
            <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
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
              <Stack
                className="student-overview-profile-shell"
                direction={{ xs: 'column', lg: 'row' }}
                spacing={2.5}
                justifyContent="space-between"
              >
                <Stack spacing={1.5}>
                  <Typography
                    variant="adminEyebrow"
                    sx={{ color: '#6b7280', letterSpacing: '0.12em' }}
                  >
                    Student Profile
                  </Typography>
                  <Typography
                    variant={embedded ? 'adminPageTitle' : 'h3'}
                    sx={{
                      fontFamily: DISPLAY_FONT,
                      fontWeight: 700,
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {overviewData.student.fullName}
                    {studentIsLegend ? <LegendMemberIcon sx={{ ml: 0.75 }} /> : null}
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
                  className="student-overview-recency-grid"
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
                        <Stack spacing={0.75}>
                          <Typography variant="adminEyebrow" sx={{ fontWeight: 600, color: toneColors.fg }}>
                            {RECENCY_COPY[key]}
                          </Typography>
                          <Typography
                            variant="body1"
                            sx={{
                              fontWeight: 700,
                              color: toneColors.fg,
                            }}
                          >
                            {formatDateLabel(value)}
                          </Typography>
                          <Typography variant="caption" sx={{ color: toneColors.fg, opacity: 0.9 }}>
                            {formatDaysAgo(value)}
                          </Typography>
                        </Stack>
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
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.25}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Typography
                    variant={embedded ? 'adminSectionTitle' : 'h4'}
                    sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.02em' }}
                  >
                    Coaching Workspace
                  </Typography>
                  {overviewData.coachingWorkspace.cycleKind &&
                  overviewData.coachingWorkspace.cycleDate ? (
                    <Chip
                      size="small"
                      label={`Active ${
                        overviewData.coachingWorkspace.cycleKind === 'business_audit'
                          ? 'Business Review'
                          : 'M2'
                      } · ${formatDateLabel(overviewData.coachingWorkspace.cycleDate)}`}
                      color="primary"
                      variant="outlined"
                      sx={{ fontWeight: 700 }}
                    />
                  ) : null}
                </Stack>

                <Box
                  className="student-overview-coaching-grid"
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
                    <Typography variant="adminSectionTitle" sx={{ fontFamily: DISPLAY_FONT, mb: 2 }}>
                      Action Steps
                    </Typography>

                    {overviewData.coachingWorkspace.actionSteps.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No assigned action steps on the active coaching cycle.
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
                                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                    {step.label}
                                  </Typography>
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
                    <Typography variant="adminSectionTitle" sx={{ fontFamily: DISPLAY_FONT, mb: 2 }}>
                      Coaching Notes
                    </Typography>

                    {overviewData.coachingWorkspace.notesSummary ? (
                      <>
                        <Typography
                          variant="body1"
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
                          {overviewData.coachingWorkspace.noteCount === 1 ? '' : 's'} in the active coaching cycle
                          {overviewData.coachingWorkspace.notesUpdatedAt
                            ? ` - last updated ${formatDateLabel(
                                overviewData.coachingWorkspace.notesUpdatedAt,
                              )}`
                            : ''}
                        </Typography>
                      </>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No coaching note comments available for the active coaching cycle.
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
                  variant={embedded ? 'adminSectionTitle' : 'h4'}
                  sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.02em' }}
                >
                  Course Progress
                </Typography>

                {overviewData.courses.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No course progress available for this student yet.
                  </Typography>
                ) : (
                  <Box
                    className="student-overview-course-grid"
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
                                <Typography variant="adminSectionTitle" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700 }}>
                                  {course.title}
                                </Typography>
                                <Stack direction="row" spacing={1.25} alignItems="center">
                                  <Typography
                                    variant="adminSectionTitle"
                                    sx={{
                                      fontFamily: DISPLAY_FONT,
                                      fontWeight: 700,
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
                                  <Typography variant="body2" color="text.secondary">Loading modules...</Typography>
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
                                        variant="body1"
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
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
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
                  variant={embedded ? 'adminSectionTitle' : 'h4'}
                  sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.02em' }}
                >
                  Business Metrics
                </Typography>

                <Box
                  className="student-overview-metrics-grid"
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
                      <Stack spacing={1}>
                        <Typography
                          variant="metricLabelCompact"
                          sx={{
                            color: 'text.secondary',
                          }}
                        >
                          {metric.label}
                        </Typography>
                        <Typography
                          variant="adminMetric"
                          sx={{
                            fontFamily: 'inherit',
                            lineHeight: 1.15,
                          }}
                        >
                          {formatMetricValue(metric)}
                        </Typography>
                      </Stack>
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
                    variant={embedded ? 'adminSectionTitle' : 'h4'}
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
                  <Typography variant="body2" color="text.secondary">
                    No achievements have been awarded yet.
                  </Typography>
                ) : (
                  <Box
                    className="student-overview-achievements-grid"
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
                          <Typography variant="body1" sx={{ fontWeight: 700 }}>
                            {achievement.title}
                          </Typography>
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
                    variant={embedded ? 'adminSectionTitle' : 'h4'}
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

      {showPrivateNotes ? (
        <Box
          className="student-overview-no-print"
          sx={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: { xs: '100%', sm: `${SIDEBAR_WIDTH}px` },
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
              <Typography variant="adminSectionTitle" fontWeight={700}>
                Private notes
              </Typography>
              <Typography
                variant="adminEyebrow"
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: 99,
                  bgcolor: '#fef3c7',
                  color: '#92400e',
                  fontWeight: 600,
                }}
              >
                Coach only
              </Typography>
            </Stack>
            <Button
              onClick={() => setPrivateNotesOpen(false)}
              aria-label="Close private notes panel"
              sx={{ minWidth: 0, p: 1, borderRadius: 999 }}
            >
              <CloseIcon />
            </Button>
          </Box>

          <Box
            sx={{
              p: 2,
              flex: 1,
              minHeight: 0,
            }}
          >
            {selectedStudentId ? (
              <PrivateNotesPanel userId={selectedStudentId} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Pick a student above to view private notes.
              </Typography>
            )}
          </Box>
        </Box>
      ) : null}

      <Dialog
        open={achievementModalOpen}
        onClose={handleCloseAchievementModal}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700 }}>
          Give Achievement {studentDisplayName ? `- ${studentDisplayName}` : ''}
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
