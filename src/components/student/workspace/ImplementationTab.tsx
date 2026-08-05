'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import {
  Alert,
  Box,
  Chip,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';

import CoachingNotesPanel from '@/components/coach/CoachingNotesPanel';
import UserWinsPanel from '@/components/coach/UserWinsPanel';
import type {
  BusinessReview,
  BusinessReviewsPayload,
  SystemScorecardSystem,
} from '@/lib/businessReviews';
import { getBusinessAuditLocalDate } from '@/lib/businessAuditConfig';
import type { ActionStepStatus, CoachingNoteActionStep } from '@/types/coaching';

const COACH_CONTENT_MAX_WIDTH = 1180;

type ImplementationTabProps = {
  selectedStudentId: string;
  studentName?: string | null;
};

type ApiErrorBody = {
  error?: string;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatReviewDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function selectImplementationCycle(reviews: BusinessReview[]): {
  activeReview: BusinessReview | null;
  nextReviewDate: string | null;
} {
  const today = getBusinessAuditLocalDate();
  const activeReview = reviews
    .filter((review) => !review.meetingCancelled && review.reviewDate <= today)
    .sort(
      (left, right) =>
        right.reviewDate.localeCompare(left.reviewDate) || right.id - left.id,
    )[0] ?? null;
  const boundaryDate = activeReview?.reviewDate ?? today;
  const nextReviewDate = reviews
    .filter((review) => !review.meetingCancelled && review.reviewDate > boundaryDate)
    .sort(
      (left, right) =>
        left.reviewDate.localeCompare(right.reviewDate) || left.id - right.id,
    )[0]?.reviewDate ?? null;

  return { activeReview, nextReviewDate };
}

function getPrioritySystems(review: BusinessReview | null): SystemScorecardSystem[] {
  if (!review?.systemScorecard) return [];

  return review.systemScorecard.categories
    .flatMap((category) => category.systems)
    .filter((system) => system.priority)
    .sort(
      (left, right) =>
        (left.priority?.position ?? 99) - (right.priority?.position ?? 99),
    );
}

export default function ImplementationTab({
  selectedStudentId,
  studentName,
}: ImplementationTabProps) {
  const [activeReview, setActiveReview] = useState<BusinessReview | null>(null);
  const [nextReviewDate, setNextReviewDate] = useState<string | null>(null);
  const [actionStepStatuses, setActionStepStatuses] = useState<
    Record<number, ActionStepStatus>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setActiveReview(null);
    setNextReviewDate(null);
    setActionStepStatuses({});

    const loadActiveReview = async () => {
      try {
        const response = await fetch(
          `/api/business-reviews?userId=${encodeURIComponent(selectedStudentId)}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        const body = (await response.json()) as BusinessReviewsPayload & ApiErrorBody;

        if (!response.ok) {
          throw new Error(body.error || 'Failed to load the active Business Audit.');
        }

        const cycle = selectImplementationCycle(body.reviews ?? []);
        setActiveReview(cycle.activeReview);
        setNextReviewDate(cycle.nextReviewDate);
      } catch (loadError) {
        if (controller.signal.aborted) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load the active Business Audit.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadActiveReview();

    return () => controller.abort();
  }, [selectedStudentId]);

  const prioritySystems = useMemo(
    () => getPrioritySystems(activeReview),
    [activeReview],
  );
  const priorityActionStepPositions = useMemo(
    () =>
      Object.fromEntries(
        prioritySystems.map((system) => [
          system.priority!.actionStepId,
          system.priority!.position,
        ]),
      ),
    [prioritySystems],
  );
  const completedPriorityCount = useMemo(
    () =>
      prioritySystems.filter(
        (system) =>
          actionStepStatuses[system.priority!.actionStepId] === 'complete',
      ).length,
    [actionStepStatuses, prioritySystems],
  );
  const allPrioritiesComplete =
    prioritySystems.length > 0 &&
    completedPriorityCount === prioritySystems.length;
  const priorityCompletionPercent =
    prioritySystems.length > 0
      ? (completedPriorityCount / prioritySystems.length) * 100
      : 0;

  const handleActionStepsChanged = useCallback(
    (steps: CoachingNoteActionStep[]) => {
      setActionStepStatuses(
        Object.fromEntries(steps.map((step) => [step.id, step.status])),
      );
    },
    [],
  );

  const removePriorityByActionStep = (actionStepId: number) => {
    setActiveReview((current) => {
      if (!current?.systemScorecard) return current;

      return {
        ...current,
        systemScorecard: {
          ...current.systemScorecard,
          categories: current.systemScorecard.categories.map((category) => ({
            ...category,
            systems: category.systems.map((system) =>
              system.priority?.actionStepId === actionStepId
                ? { ...system, priority: null }
                : system,
            ),
          })),
        },
      };
    });
  };

  if (loading) {
    return (
      <Stack spacing={2} sx={{ maxWidth: COACH_CONTENT_MAX_WIDTH, mx: 'auto' }}>
        <Skeleton variant="rounded" height={150} />
        <Skeleton variant="rounded" height={620} />
      </Stack>
    );
  }

  return (
    <Box sx={{ maxWidth: COACH_CONTENT_MAX_WIDTH, mx: 'auto' }}>
      {error ? <Alert severity="error">{error}</Alert> : null}

      {!error && !activeReview ? (
        <Alert severity="info">
          {nextReviewDate
            ? `The next implementation cycle begins with the Business Audit on ${formatReviewDate(nextReviewDate)}.`
            : 'Create a Business Audit before starting an implementation cycle.'}
        </Alert>
      ) : null}

      {activeReview ? (
        <>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 3 },
              mb: 3,
              border: '1px solid',
              borderColor: 'grey.200',
              borderRadius: 3,
              bgcolor: 'grey.50',
            }}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              alignItems={{ xs: 'flex-start', md: 'center' }}
              justifyContent="space-between"
            >
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Active 60-day cycle
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 900 }}>
                  Implementation
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {studentName ? `${studentName} · ` : ''}
                  Business Audit from {formatReviewDate(activeReview.reviewDate)}
                </Typography>
              </Box>

              <Chip
                icon={
                  allPrioritiesComplete ? (
                    <CheckCircleRoundedIcon />
                  ) : (
                    <FlagRoundedIcon />
                  )
                }
                label={
                  allPrioritiesComplete
                    ? 'All priorities complete'
                    : prioritySystems.length > 0
                      ? `${completedPriorityCount} of ${prioritySystems.length} complete`
                      : 'No priorities selected'
                }
                color={
                  allPrioritiesComplete
                    ? 'success'
                    : prioritySystems.length > 0
                      ? 'warning'
                      : 'default'
                }
                variant={allPrioritiesComplete ? 'filled' : 'outlined'}
                sx={{ fontWeight: 800 }}
              />
            </Stack>

            {prioritySystems.length > 0 ? (
              <Box
                sx={{
                  mt: 2.5,
                  pt: 2.5,
                  borderTop: '1px solid',
                  borderColor: 'grey.200',
                }}
              >
                <Stack
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                      Priority systems
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {prioritySystems.length}/3 selected for this cycle
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                    {Math.round(priorityCompletionPercent)}%
                  </Typography>
                </Stack>

                <LinearProgress
                  variant="determinate"
                  value={priorityCompletionPercent}
                  color={allPrioritiesComplete ? 'success' : 'warning'}
                  aria-label="Priority action step completion"
                  aria-valuetext={`${completedPriorityCount} of ${prioritySystems.length} complete`}
                  sx={{ mt: 1.25, height: 7, borderRadius: 999 }}
                />

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: 'minmax(0, 1fr)',
                      md: 'repeat(3, minmax(0, 1fr))',
                    },
                    gap: 1.5,
                    mt: 2,
                  }}
                >
                  {prioritySystems.map((system) => {
                    const completed =
                      actionStepStatuses[system.priority!.actionStepId] ===
                      'complete';

                    return (
                      <Box
                        key={system.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.25,
                          minWidth: 0,
                          p: 1.5,
                          border: '1px solid',
                          borderColor: completed ? 'success.light' : 'warning.light',
                          borderRadius: 2,
                          bgcolor: 'background.paper',
                        }}
                      >
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            flexShrink: 0,
                            display: 'grid',
                            placeItems: 'center',
                            borderRadius: 1.5,
                            bgcolor: completed ? 'success.50' : 'warning.50',
                            color: completed ? 'success.main' : 'warning.dark',
                          }}
                        >
                          {completed ? (
                            <CheckCircleRoundedIcon fontSize="small" />
                          ) : (
                            <FlagRoundedIcon fontSize="small" />
                          )}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 900, lineHeight: 1.25 }}
                          >
                            {system.priority!.position}. {system.label}
                          </Typography>
                          <Typography
                            variant="caption"
                            color={completed ? 'success.main' : 'text.secondary'}
                            sx={{ fontWeight: 700 }}
                          >
                            {completed ? 'Action step complete' : 'Action step in progress'}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>

                {prioritySystems.length < 3 ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 1.5 }}
                  >
                    Select {3 - prioritySystems.length} more{' '}
                    {prioritySystems.length === 2 ? 'priority' : 'priorities'} in the
                    Business Audit.
                  </Typography>
                ) : null}
              </Box>
            ) : (
              <Alert severity="warning" sx={{ mt: 2.5 }}>
                No priority systems have been selected in this Business Audit yet.
              </Alert>
            )}
          </Paper>

          <CoachingNotesPanel
            userId={selectedStudentId}
            fixedNoteId={activeReview.coachingNoteId}
            businessAuditReviewDate={activeReview.reviewDate}
            businessAuditNextReviewDate={nextReviewDate}
            priorityActionStepPositions={priorityActionStepPositions}
            onActionStepsChanged={handleActionStepsChanged}
            onPriorityActionStepDeleted={removePriorityByActionStep}
          />
        </>
      ) : null}

      <Box sx={{ mt: 3 }}>
        <UserWinsPanel userId={selectedStudentId} />
      </Box>
    </Box>
  );
}
