'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DonutSmallRoundedIcon from '@mui/icons-material/DonutSmallRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';

import SectionCard from './SectionCard';
import type {
  TrainingAssignmentEditorPayload,
  TrainingAssignmentSummary,
  TrainingCourseOption,
} from '@/types/trainingAssignments';

type TrainingAssignmentPanelProps = {
  userId: string;
  coachingNoteId: number;
};

async function parseResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}

function assignmentQuery(userId: string, coachingNoteId: number) {
  const query = new URLSearchParams({
    user_id: userId,
    coaching_note_id: String(coachingNoteId),
  });
  return `/api/training-assignments?${query.toString()}`;
}

function courseProgressLabel(progressPercent: number) {
  if (progressPercent >= 100) return 'Completed';
  if (progressPercent > 0) return `${progressPercent}% complete`;
  return 'Not started';
}

export default function TrainingAssignmentPanel({
  userId,
  coachingNoteId,
}: TrainingAssignmentPanelProps) {
  const [assignment, setAssignment] = useState<TrainingAssignmentSummary | null>(null);
  const [courses, setCourses] = useState<TrainingCourseOption[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<TrainingCourseOption | null>(null);
  const [contextLabel, setContextLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      setMessage(null);

      try {
        const response = await fetch(assignmentQuery(userId, coachingNoteId), {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await parseResponse<TrainingAssignmentEditorPayload>(
          response,
          'Could not load assigned training.',
        );
        if (controller.signal.aborted) return;

        setAssignment(payload.assignment);
        setCourses(payload.courses ?? []);
        setSelectedCourse(payload.assignment?.course ?? null);
        setContextLabel(payload.assignment?.contextLabel ?? '');
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Could not load assigned training.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [coachingNoteId, userId]);

  const hasChanges = useMemo(() => {
    if (!selectedCourse) return false;
    return (
      assignment?.course.id !== selectedCourse.id ||
      (assignment?.contextLabel ?? '') !== contextLabel.trim()
    );
  }, [assignment, contextLabel, selectedCourse]);

  const courseCounts = useMemo(
    () => ({
      completed: courses.filter((course) => course.progressPercent >= 100).length,
      inProgress: courses.filter(
        (course) => course.progressPercent > 0 && course.progressPercent < 100,
      ).length,
    }),
    [courses],
  );

  async function saveAssignment() {
    if (!selectedCourse) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/training-assignments', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          coachingNoteId,
          courseNodeId: selectedCourse.id,
          contextLabel,
        }),
      });
      const payload = await parseResponse<{ assignment: TrainingAssignmentSummary | null }>(
        response,
        'Could not assign training.',
      );

      setAssignment(payload.assignment);
      setSelectedCourse(payload.assignment?.course ?? selectedCourse);
      setContextLabel(payload.assignment?.contextLabel ?? '');
      setMessage(assignment ? 'Required training updated.' : 'Required training assigned.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not assign training.');
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignment() {
    if (!assignment) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(assignmentQuery(userId, coachingNoteId), {
        method: 'DELETE',
      });
      await parseResponse<{ ok: boolean }>(response, 'Could not remove assigned training.');

      setAssignment(null);
      setSelectedCourse(null);
      setContextLabel('');
      setMessage('Required training removed from this sprint.');
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : 'Could not remove assigned training.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard icon={<SchoolOutlinedIcon sx={{ fontSize: 20 }} />} title="Required training">
      <Stack spacing={2.25}>
        <Typography variant="body2" color="text.secondary">
          Assign one published course for this member&apos;s 60-day sprint. Progress comes
          from the course automatically.
        </Typography>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {message ? <Alert severity="success">{message}</Alert> : null}

        {loading ? (
          <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={22} />
          </Box>
        ) : (
          <>
            {assignment ? (
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  border: '1px solid',
                  borderColor:
                    assignment.course.progressPercent >= 100 ? 'success.light' : 'grey.200',
                  borderRadius: 1.5,
                  bgcolor:
                    assignment.course.progressPercent >= 100 ? '#eef9f1' : 'background.paper',
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography sx={{ fontWeight: 700 }}>{assignment.course.title}</Typography>
                      <Chip size="small" color="primary" label="Assigned" sx={{ height: 22 }} />
                      {assignment.course.progressPercent >= 100 ? (
                        <Chip
                          size="small"
                          color="success"
                          icon={<CheckCircleRoundedIcon />}
                          label="Completed"
                          sx={{ height: 22 }}
                        />
                      ) : assignment.course.progressPercent > 0 ? (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`${assignment.course.progressPercent}% complete`}
                          sx={{ height: 22 }}
                        />
                      ) : null}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Assigned {new Date(assignment.assignedAt).toLocaleDateString()}
                      {assignment.contextLabel ? ` · ${assignment.contextLabel}` : ''}
                    </Typography>
                  </Box>
                  <Button
                    component={Link}
                    href={`/courses/${encodeURIComponent(assignment.course.slug)}`}
                    size="small"
                    variant="text"
                    sx={{ textTransform: 'none', flexShrink: 0 }}
                  >
                    Open course
                  </Button>
                </Stack>
                {assignment.course.progressPercent > 0 &&
                assignment.course.progressPercent < 100 ? (
                  <LinearProgress
                    variant="determinate"
                    value={assignment.course.progressPercent}
                    sx={{ mt: 1.5, height: 5, borderRadius: 999 }}
                  />
                ) : null}
              </Paper>
            ) : null}

            {courses.length > 0 ? (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  size="small"
                  icon={<CheckCircleRoundedIcon />}
                  label={`${courseCounts.completed} completed`}
                  color={courseCounts.completed > 0 ? 'success' : 'default'}
                  variant="outlined"
                />
                <Chip
                  size="small"
                  icon={<DonutSmallRoundedIcon />}
                  label={`${courseCounts.inProgress} in progress`}
                  color={courseCounts.inProgress > 0 ? 'primary' : 'default'}
                  variant="outlined"
                />
              </Stack>
            ) : null}

            <Autocomplete
              options={courses}
              value={selectedCourse}
              onChange={(_, value) => {
                setSelectedCourse(value);
                setMessage(null);
              }}
              getOptionLabel={(option) => option.title}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              noOptionsText="No published courses found"
              renderOption={(props, option) => {
                const { key, ...optionProps } = props;
                const completed = option.progressPercent >= 100;
                const inProgress = option.progressPercent > 0 && option.progressPercent < 100;

                return (
                  <Box
                    component="li"
                    key={key}
                    {...optionProps}
                    sx={{
                      display: 'grid !important',
                      gridTemplateColumns: '32px minmax(0, 1fr) auto',
                      alignItems: 'center !important',
                      gap: 1.25,
                      py: '12px !important',
                      borderBottom: '1px solid',
                      borderColor: 'grey.100',
                      bgcolor: completed ? '#eef9f1' : 'background.paper',
                      '&[aria-selected="true"]': {
                        bgcolor: completed ? '#dff3e5' : 'rgba(92, 188, 168, 0.10)',
                      },
                      '&.Mui-focused': {
                        bgcolor: completed ? '#dff3e5' : 'grey.50',
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        color: completed
                          ? 'success.main'
                          : inProgress
                            ? 'primary.main'
                            : 'grey.400',
                        bgcolor: completed
                          ? '#dff3e5'
                          : inProgress
                            ? 'rgba(92, 188, 168, 0.10)'
                            : 'grey.50',
                      }}
                    >
                      {completed ? (
                        <CheckCircleRoundedIcon sx={{ fontSize: 21 }} />
                      ) : inProgress ? (
                        <DonutSmallRoundedIcon sx={{ fontSize: 20 }} />
                      ) : (
                        <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 19 }} />
                      )}
                    </Box>

                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: completed ? 700 : 600, color: 'text.primary' }}
                      >
                        {option.title}
                      </Typography>
                      {option.description ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {option.description}
                        </Typography>
                      ) : null}
                    </Box>

                    <Stack spacing={0.5} alignItems="flex-end" sx={{ minWidth: 92 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 800,
                          color: completed
                            ? 'success.dark'
                            : inProgress
                              ? 'primary.main'
                              : 'text.secondary',
                        }}
                      >
                        {courseProgressLabel(option.progressPercent)}
                      </Typography>
                      {inProgress ? (
                        <LinearProgress
                          variant="determinate"
                          value={option.progressPercent}
                          sx={{ width: 88, height: 4, borderRadius: 999 }}
                        />
                      ) : null}
                    </Stack>
                  </Box>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Course"
                  placeholder="Search published training"
                  helperText={
                    selectedCourse
                      ? courseProgressLabel(selectedCourse.progressPercent)
                      : 'Completed courses are highlighted in green.'
                  }
                />
              )}
            />

            <TextField
              label="Timing note (optional)"
              placeholder="For example: Before the next session"
              value={contextLabel}
              onChange={(event) => {
                setContextLabel(event.target.value);
                setMessage(null);
              }}
              inputProps={{ maxLength: 240 }}
              helperText={`${contextLabel.length}/240`}
              fullWidth
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <Button
                variant="contained"
                onClick={() => void saveAssignment()}
                disabled={!selectedCourse || saving || (Boolean(assignment) && !hasChanges)}
                sx={{ textTransform: 'none' }}
              >
                {saving ? 'Saving…' : assignment ? 'Update assignment' : 'Assign training'}
              </Button>
              {assignment ? (
                <Button
                  color="error"
                  variant="text"
                  onClick={() => void removeAssignment()}
                  disabled={saving}
                  sx={{ textTransform: 'none' }}
                >
                  Remove from sprint
                </Button>
              ) : null}
            </Stack>
          </>
        )}
      </Stack>
    </SectionCard>
  );
}
