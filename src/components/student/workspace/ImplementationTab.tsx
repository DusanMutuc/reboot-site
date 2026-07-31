'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import {
  Alert,
  Box,
  Chip,
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

        setActiveReview(body.reviews?.[0] ?? null);
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
  const hasCompletedPriorities = completedPriorityCount > 0;

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
          Create a Business Audit before starting an implementation cycle.
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
                label={`${prioritySystems.length}/3 priority systems`}
                color={
                  allPrioritiesComplete
                    ? 'success'
                    : prioritySystems.length > 0
                      ? 'warning'
                      : 'default'
                }
                variant={
                  allPrioritiesComplete || prioritySystems.length > 0
                    ? 'filled'
                    : 'outlined'
                }
                sx={{
                  fontWeight: 800,
                  ...(hasCompletedPriorities && !allPrioritiesComplete
                    ? {
                        bgcolor: 'success.100',
                        color: 'success.dark',
                        '& .MuiChip-icon': { color: 'success.main' },
                      }
                    : {}),
                }}
              />
            </Stack>

            {prioritySystems.length > 0 ? (
              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                useFlexGap
                sx={{ mt: 2.5 }}
              >
                {prioritySystems.map((system) => {
                  const completed =
                    actionStepStatuses[system.priority!.actionStepId] ===
                    'complete';

                  return (
                    <Chip
                      key={system.id}
                      icon={
                        completed ? (
                          <CheckCircleRoundedIcon />
                        ) : (
                          <FlagRoundedIcon />
                        )
                      }
                      label={`${system.priority!.position}. ${system.label}`}
                      color={completed ? 'success' : 'warning'}
                      variant={completed ? 'filled' : 'outlined'}
                      sx={{
                        fontWeight: 800,
                        bgcolor: completed ? undefined : 'background.paper',
                      }}
                    />
                  );
                })}
              </Stack>
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
