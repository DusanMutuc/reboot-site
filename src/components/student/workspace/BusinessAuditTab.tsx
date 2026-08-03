'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';

import KpiTracker from '@/components/KpiTracker';
import CoachingNotesPanel from '@/components/coach/CoachingNotesPanel';
import UserWinsPanel from '@/components/coach/UserWinsPanel';
import FocusFinderChart from '@/components/coach/business-audit/FocusFinderChart';
import type { FocusFinderSaveStatus } from '@/components/coach/business-audit/FocusFinderChart';
import SystemsScorecard from '@/components/coach/business-audit/SystemsScorecard';
import { getBusinessAuditLocalDate } from '@/lib/businessAuditConfig';
import type {
  BusinessReview,
  BusinessReviewFocusValue,
  BusinessReviewSystemPriority,
  BusinessReviewSystemRating,
  BusinessReviewsPayload,
  FocusFinderDimension,
  SystemScorecardStatus,
} from '@/lib/businessReviews';

type BusinessAuditTabProps = {
  selectedStudentId: string;
  studentName?: string | null;
  foundationsCompleted?: number | null;
  foundationsLoading?: boolean;
};

type ApiErrorBody = {
  error?: string;
};

type SaveFocusValueResponse = ApiErrorBody & {
  focusValue?: BusinessReviewFocusValue;
};

type SaveSystemRatingResponse = ApiErrorBody & {
  systemRating?: BusinessReviewSystemRating;
};

type SaveSystemPriorityResponse = ApiErrorBody & {
  systemId?: number;
  priority?: BusinessReviewSystemPriority | null;
};

type SaveReviewStatusResponse = ApiErrorBody & {
  status?: 'draft' | 'completed';
  completedAt?: string | null;
  updatedAt?: string;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

function formatReviewDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function formatCreatedTime(value: string) {
  return timeFormatter.format(new Date(value));
}

function formatSavedAt(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatFoundationsCompleted(value: number | null | undefined) {
  if (value == null) return '— / 6 completed';
  return `${Math.min(Math.max(value, 0), 6)} / 6 completed`;
}

function selectDefaultReviewId(reviews: BusinessReview[]): number | null {
  const today = getBusinessAuditLocalDate();
  const available = reviews.filter((review) => !review.meetingCancelled);
  const todayReview = available
    .filter((review) => review.reviewDate === today)
    .sort((left, right) => right.id - left.id)[0];
  if (todayReview) return todayReview.id;

  const nearestUpcoming = available
    .filter((review) => review.reviewDate > today)
    .sort(
      (left, right) =>
        left.reviewDate.localeCompare(right.reviewDate) || left.id - right.id,
    )[0];
  if (nearestUpcoming) return nearestUpcoming.id;

  const latestPast = available
    .filter((review) => review.reviewDate < today)
    .sort(
      (left, right) =>
        right.reviewDate.localeCompare(left.reviewDate) || right.id - left.id,
    )[0];

  return latestPast?.id ?? reviews[0]?.id ?? null;
}

function valuesToRecord(review: BusinessReview | null): Record<number, number> {
  return Object.fromEntries(
    (review?.focusValues ?? []).map((focusValue) => [
      focusValue.dimensionId,
      focusValue.value,
    ]),
  );
}

function replaceFocusValue(
  reviews: BusinessReview[],
  reviewId: number,
  dimensionId: number,
  value: number,
  updatedAt: string,
) {
  return reviews.map((review) => {
    if (review.id !== reviewId) return review;

    const existingIndex = review.focusValues.findIndex(
      (focusValue) => focusValue.dimensionId === dimensionId,
    );
    const focusValues = [...review.focusValues];
    const nextValue = { dimensionId, value, updatedAt };

    if (existingIndex >= 0) {
      focusValues[existingIndex] = nextValue;
    } else {
      focusValues.push(nextValue);
    }

    return { ...review, focusValues };
  });
}

function replaceSystemRating(
  reviews: BusinessReview[],
  reviewId: number,
  systemRating: BusinessReviewSystemRating,
) {
  return reviews.map((review) => {
    if (review.id !== reviewId || !review.systemScorecard) return review;

    return {
      ...review,
      systemScorecard: {
        ...review.systemScorecard,
        categories: review.systemScorecard.categories.map((category) => ({
          ...category,
          systems: category.systems.map((system) =>
            system.id === systemRating.systemId
              ? { ...system, rating: systemRating }
              : system,
          ),
        })),
      },
    };
  });
}

function replaceSystemPriority(
  reviews: BusinessReview[],
  reviewId: number,
  systemId: number,
  priority: BusinessReviewSystemPriority | null,
) {
  return reviews.map((review) => {
    if (review.id !== reviewId || !review.systemScorecard) return review;

    return {
      ...review,
      systemScorecard: {
        ...review.systemScorecard,
        categories: review.systemScorecard.categories.map((category) => ({
          ...category,
          systems: category.systems.map((system) =>
            system.id === systemId ? { ...system, priority } : system,
          ),
        })),
      },
    };
  });
}

function LoadingState() {
  return (
    <Stack spacing={2}>
      <Skeleton variant="rounded" height={88} />
      <Skeleton variant="rounded" height={620} />
    </Stack>
  );
}

function EmptyAuditState({ studentName }: { studentName?: string | null }) {
  return (
    <Paper
      elevation={0}
      sx={{
        px: { xs: 3, md: 6 },
        py: { xs: 6, md: 8 },
        border: '1px dashed',
        borderColor: 'grey.300',
        borderRadius: 3,
        textAlign: 'center',
      }}
    >
      <CalendarMonthIcon color="primary" sx={{ fontSize: 42 }} />
      <Typography variant="h5" sx={{ mt: 1.5, fontWeight: 800 }}>
        No business audits yet
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ maxWidth: 520, mx: 'auto', mt: 1 }}
      >
        {studentName ? `${studentName}'s` : 'The student\'s'} next Business Audit will
        appear here after the appointment is booked in GHL and synchronized.
      </Typography>
    </Paper>
  );
}

export default function BusinessAuditTab({
  selectedStudentId,
  studentName,
  foundationsCompleted = null,
  foundationsLoading = false,
}: BusinessAuditTabProps) {
  const [dimensions, setDimensions] = useState<FocusFinderDimension[]>([]);
  const [reviews, setReviews] = useState<BusinessReview[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingReviewStatus, setSavingReviewStatus] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [systemSaveError, setSystemSaveError] = useState<string | null>(null);
  const [prioritySaveError, setPrioritySaveError] = useState<string | null>(null);
  const [pendingSaveCount, setPendingSaveCount] = useState(0);
  const [pendingSystemIds, setPendingSystemIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [pendingPrioritySystemIds, setPendingPrioritySystemIds] = useState<
    ReadonlySet<number>
  >(new Set());
  const [hasSaved, setHasSaved] = useState(false);
  const saveQueuesRef = useRef<Map<string, Promise<void>>>(new Map());
  const activeStudentIdRef = useRef(selectedStudentId);

  useEffect(() => {
    activeStudentIdRef.current = selectedStudentId;
    const controller = new AbortController();

    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSystemSaveError(null);
    setPrioritySaveError(null);
    setHasSaved(false);
    setPendingSystemIds(new Set());
    setPendingPrioritySystemIds(new Set());
    setDimensions([]);
    setReviews([]);
    setSelectedReviewId(null);

    const load = async () => {
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
          throw new Error(body.error || 'Failed to load business audits.');
        }

        if (activeStudentIdRef.current !== selectedStudentId) return;

        setDimensions(body.dimensions ?? []);
        setReviews(body.reviews ?? []);
        setSelectedReviewId(selectDefaultReviewId(body.reviews ?? []));
      } catch (error) {
        if (controller.signal.aborted) return;

        const message = error instanceof Error ? error.message : 'Failed to load business audits.';
        setLoadError(message);
      } finally {
        if (!controller.signal.aborted && activeStudentIdRef.current === selectedStudentId) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => controller.abort();
  }, [selectedStudentId]);

  const selectedReview = useMemo(
    () => reviews.find((review) => review.id === selectedReviewId) ?? null,
    [reviews, selectedReviewId],
  );
  const values = useMemo(() => valuesToRecord(selectedReview), [selectedReview]);

  const saveStatus: FocusFinderSaveStatus =
    pendingSaveCount > 0 ? 'saving' : saveError ? 'error' : hasSaved ? 'saved' : 'idle';

  const updateValue = useCallback(
    (dimensionId: number, value: number) => {
      if (!selectedReviewId) return;

      setReviews((current) =>
        replaceFocusValue(
          current,
          selectedReviewId,
          dimensionId,
          value,
          new Date().toISOString(),
        ),
      );
    },
    [selectedReviewId],
  );

  const persistValue = useCallback(
    (dimensionId: number, value: number) => {
      if (!selectedReviewId) return;

      const reviewId = selectedReviewId;
      const studentIdAtSave = selectedStudentId;
      const queueKey = `${reviewId}:${dimensionId}`;
      const previous = saveQueuesRef.current.get(queueKey) ?? Promise.resolve();

      setPendingSaveCount((count) => count + 1);
      setSaveError(null);

      const next = previous
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch(`/api/business-reviews/${reviewId}/focus-values`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dimensionId, value }),
          });
          const body = (await response.json()) as SaveFocusValueResponse;

          if (!response.ok || !body.focusValue) {
            throw new Error(body.error || 'Failed to save Focus Finder value.');
          }

          if (activeStudentIdRef.current === studentIdAtSave) {
            setReviews((current) => {
              const currentReview = current.find((review) => review.id === reviewId);
              const currentValue = currentReview?.focusValues.find(
                (focusValue) => focusValue.dimensionId === dimensionId,
              );

              if (currentValue?.value !== value) {
                return current;
              }

              return replaceFocusValue(
                current,
                reviewId,
                body.focusValue!.dimensionId,
                body.focusValue!.value,
                body.focusValue!.updatedAt,
              );
            });
            setSaveError(null);
            setHasSaved(true);
          }
        })
        .catch((error) => {
          if (activeStudentIdRef.current !== studentIdAtSave) return;

          const message =
            error instanceof Error ? error.message : 'Failed to save Focus Finder value.';
          setSaveError(message);
        })
        .finally(() => {
          setPendingSaveCount((count) => Math.max(0, count - 1));

          if (saveQueuesRef.current.get(queueKey) === next) {
            saveQueuesRef.current.delete(queueKey);
          }
        });

      saveQueuesRef.current.set(queueKey, next);
    },
    [selectedReviewId, selectedStudentId],
  );

  const persistSystemRating = useCallback(
    async (systemId: number, status: SystemScorecardStatus) => {
      if (!selectedReviewId || pendingSystemIds.has(systemId)) return;

      const reviewId = selectedReviewId;
      const studentIdAtSave = selectedStudentId;

      setPendingSystemIds((current) => {
        const next = new Set(current);
        next.add(systemId);
        return next;
      });
      setSystemSaveError(null);

      try {
        const response = await fetch(
          `/api/business-reviews/${reviewId}/system-ratings`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemId, status }),
          },
        );
        const body = (await response.json()) as SaveSystemRatingResponse;

        if (!response.ok || !body.systemRating) {
          throw new Error(body.error || 'Failed to save system status.');
        }

        if (activeStudentIdRef.current === studentIdAtSave) {
          setReviews((current) =>
            replaceSystemRating(current, reviewId, body.systemRating!),
          );
        }
      } catch (error) {
        if (activeStudentIdRef.current !== studentIdAtSave) return;

        const message =
          error instanceof Error ? error.message : 'Failed to save system status.';
        setSystemSaveError(message);
      } finally {
        setPendingSystemIds((current) => {
          const next = new Set(current);
          next.delete(systemId);
          return next;
        });
      }
    },
    [pendingSystemIds, selectedReviewId, selectedStudentId],
  );

  const persistSystemPriority = useCallback(
    async (systemId: number, selected: boolean) => {
      if (!selectedReviewId || pendingPrioritySystemIds.has(systemId)) return;

      const reviewId = selectedReviewId;
      const studentIdAtSave = selectedStudentId;

      setPendingPrioritySystemIds((current) => {
        const next = new Set(current);
        next.add(systemId);
        return next;
      });
      setPrioritySaveError(null);

      try {
        const response = await fetch(
          `/api/business-reviews/${reviewId}/system-priorities`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemId, selected }),
          },
        );
        const body = (await response.json()) as SaveSystemPriorityResponse;

        if (!response.ok || body.systemId !== systemId || body.priority === undefined) {
          throw new Error(body.error || 'Failed to update system priority.');
        }

        if (activeStudentIdRef.current === studentIdAtSave) {
          setReviews((current) =>
            replaceSystemPriority(current, reviewId, systemId, body.priority ?? null),
          );
        }
      } catch (error) {
        if (activeStudentIdRef.current !== studentIdAtSave) return;

        const message =
          error instanceof Error ? error.message : 'Failed to update system priority.';
        setPrioritySaveError(message);
      } finally {
        setPendingPrioritySystemIds((current) => {
          const next = new Set(current);
          next.delete(systemId);
          return next;
        });
      }
    },
    [pendingPrioritySystemIds, selectedReviewId, selectedStudentId],
  );

  const toggleReviewCompletion = async () => {
    if (!selectedReview || selectedReview.meetingCancelled) return;
    const completed = selectedReview.status !== 'completed';
    setSavingReviewStatus(true);
    setLoadError(null);

    try {
      const response = await fetch(`/api/business-reviews/${selectedReview.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      const body = (await response.json()) as SaveReviewStatusResponse;
      if (!response.ok || !body.status || !body.updatedAt) {
        throw new Error(body.error || 'Could not update the audit status.');
      }

      setReviews((current) =>
        current.map((review) =>
          review.id === selectedReview.id
            ? {
                ...review,
                status: body.status!,
                completedAt: body.completedAt ?? null,
                updatedAt: body.updatedAt!,
              }
            : review,
        ),
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not update the audit status.');
    } finally {
      setSavingReviewStatus(false);
    }
  };

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 1180, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
      >
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1 }}>
            60 Day Business Audit
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Business Audit
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {studentName
              ? `Build ${studentName}'s next 60-day focus plan.`
              : 'Build the student’s next 60-day focus plan.'}
          </Typography>
        </Box>

        {selectedReview ? (
          <Chip
            label={
              selectedReview.meetingCancelled
                ? 'Cancelled'
                : selectedReview.status === 'completed'
                  ? 'Completed · editable'
                  : 'Draft'
            }
            color={
              selectedReview.meetingCancelled
                ? 'error'
                : selectedReview.status === 'completed'
                  ? 'success'
                  : 'default'
            }
            variant="outlined"
            sx={{ fontWeight: 700, textTransform: 'capitalize' }}
          />
        ) : null}
      </Stack>

      {loadError ? <Alert severity="error">{loadError}</Alert> : null}
      {saveError ? (
        <Alert severity="error">
          {saveError} Your selected score is still visible; choose it again to retry.
        </Alert>
      ) : null}
      {systemSaveError ? (
        <Alert severity="error">
          {systemSaveError} The system was not marked as reviewed; try again.
        </Alert>
      ) : null}
      {prioritySaveError ? (
        <Alert severity="error">
          {prioritySaveError} The priority selection was not changed.
        </Alert>
      ) : null}

      {loading ? (
        <LoadingState />
      ) : reviews.length === 0 ? (
        <EmptyAuditState studentName={studentName} />
      ) : (
        <>
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
              spacing={1.5}
              alignItems={{ xs: 'stretch', md: 'center' }}
            >
              <Box sx={{ minWidth: 124 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  Audit history
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {reviews.length} {reviews.length === 1 ? 'audit' : 'audits'}
                </Typography>
              </Box>

              <Stack
                direction="row"
                spacing={1}
                sx={{
                  minWidth: 0,
                  overflowX: 'auto',
                  pb: 0.5,
                }}
              >
                {reviews.map((review) => {
                  const selected = review.id === selectedReviewId;

                  return (
                    <Button
                      key={review.id}
                      variant={selected ? 'contained' : 'outlined'}
                      color={selected ? 'primary' : 'inherit'}
                      onClick={() => {
                        setSelectedReviewId(review.id);
                        setSaveError(null);
                        setSystemSaveError(null);
                        setPrioritySaveError(null);
                        setHasSaved(false);
                      }}
                      sx={{
                        minWidth: 168,
                        px: 1.75,
                        py: 1,
                        justifyContent: 'flex-start',
                        textAlign: 'left',
                        textTransform: 'none',
                      }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
                          {formatReviewDate(review.reviewDate)}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ opacity: selected ? 0.84 : 0.7, lineHeight: 1.2 }}
                        >
                          {review.meetingCancelled
                            ? 'Cancelled'
                            : review.status === 'completed'
                              ? 'Completed'
                              : 'Draft'}{' '}
                          ·{' '}
                          {formatCreatedTime(review.createdAt)}
                        </Typography>
                      </Box>
                    </Button>
                  );
                })}
              </Stack>
            </Stack>
          </Paper>

          {selectedReview ? (
            <>
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
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CalendarMonthIcon fontSize="small" color="action" />
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Audit date: {formatReviewDate(selectedReview.reviewDate)}
                    </Typography>
                  </Stack>

                  {foundationsLoading ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CircularProgress size={18} />
                      <Typography variant="body2" color="text.secondary">
                        Loading Foundations progress…
                      </Typography>
                    </Stack>
                  ) : (
                    <Chip
                      icon={<SchoolOutlinedIcon />}
                      label={`Foundations videos: ${formatFoundationsCompleted(foundationsCompleted)}`}
                      color={(foundationsCompleted ?? 0) >= 6 ? 'success' : 'primary'}
                      variant="outlined"
                      sx={{ fontWeight: 800 }}
                    />
                  )}
                </Stack>
              </Paper>

              {selectedReview.meetingCancelled ? (
                <Alert severity="warning">
                  This appointment was cancelled in GHL. It remains in audit history, but it will
                  not start an Implementation cycle or count as a scheduled meeting.
                </Alert>
              ) : null}

              <Paper
                elevation={0}
                sx={{
                  p: { xs: 2, md: 3 },
                  border: '1px solid',
                  borderColor: 'grey.200',
                  borderRadius: 3,
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Student preparation
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 900 }}>
                      Pre-audit responses
                    </Typography>
                  </Box>
                  {selectedReview.preparation ? (
                    <Chip
                      label={`Submitted · ${formatSavedAt(selectedReview.preparation.updatedAt)}`}
                      color="success"
                      variant="outlined"
                      sx={{ fontWeight: 800 }}
                    />
                  ) : (
                    <Chip label="Not submitted" color="warning" sx={{ fontWeight: 800 }} />
                  )}
                </Stack>

                {selectedReview.preparation ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                      gap: 2,
                      mt: 2.5,
                    }}
                  >
                    {[
                      ['Business wins & movement', selectedReview.preparation.businessForwardWins],
                      ['Personal wins & movement', selectedReview.preparation.personalForwardWins],
                      ['Greatest business challenge', selectedReview.preparation.greatestBusinessChallenge],
                      ['Greatest personal challenge', selectedReview.preparation.greatestPersonalChallenge],
                      ['Desired outcome from this call', selectedReview.preparation.desiredCallOutcome],
                      ['Topics or situations to discuss', selectedReview.preparation.topicsToDiscuss],
                    ].map(([label, answer]) => (
                      <Box
                        key={label}
                        sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2, minWidth: 0 }}
                      >
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                          {label}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>
                          {answer}
                        </Typography>
                      </Box>
                    ))}
                    <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                        Business rating
                      </Typography>
                      <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 900 }}>
                        {selectedReview.preparation.businessRating}/10
                      </Typography>
                    </Box>
                    <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                        Personal rating
                      </Typography>
                      <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 900 }}>
                        {selectedReview.preparation.personalRating}/10
                      </Typography>
                    </Box>
                  </Box>
                ) : (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    The student has not submitted the preparation form for this audit yet.
                  </Alert>
                )}
              </Paper>

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
                  key={`business-audit-kpis-${selectedReview.id}`}
                  userIdOverride={selectedStudentId}
                  fixedPeriodDate={selectedReview.reviewDate}
                  lockPeriod
                />
              </Paper>

              <FocusFinderChart
                dimensions={dimensions}
                values={values}
                saveStatus={saveStatus}
                onValueChange={updateValue}
                onValueCommit={persistValue}
              />

              {selectedReview.systemScorecard ? (
                <SystemsScorecard
                  scorecard={selectedReview.systemScorecard}
                  pendingSystemIds={pendingSystemIds}
                  pendingPrioritySystemIds={pendingPrioritySystemIds}
                  onReviewSystem={(systemId, status) =>
                    void persistSystemRating(systemId, status)
                  }
                  onTogglePriority={(systemId, selected) =>
                    void persistSystemPriority(systemId, selected)
                  }
                />
              ) : (
                <Alert severity="warning">
                  This audit does not have a systems scorecard attached.
                </Alert>
              )}

              <Box sx={{ pt: 1 }}>
                <Typography variant="overline" color="text.secondary">
                  Meeting wrap-up
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  Notes & wins
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Capture any final context or progress worth celebrating before ending the audit.
                </Typography>
              </Box>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'minmax(0, 1fr)',
                    md: 'repeat(2, minmax(0, 1fr))',
                  },
                  gap: 3,
                  alignItems: 'start',
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <CoachingNotesPanel
                    key={`business-audit-notes-${selectedReview.id}`}
                    userId={selectedStudentId}
                    fixedNoteId={selectedReview.coachingNoteId}
                    businessAuditReviewDate={selectedReview.reviewDate}
                    contentMode="notes-only"
                  />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <UserWinsPanel userId={selectedStudentId} />
                </Box>
              </Box>
            </>
          ) : null}
          {selectedReview && !selectedReview.meetingCancelled ? (
            <Button
              variant="outlined"
              color={selectedReview.status === 'completed' ? 'inherit' : 'success'}
              disabled={savingReviewStatus}
              onClick={() => void toggleReviewCompletion()}
              sx={{ fontWeight: 800 }}
            >
              {savingReviewStatus
                ? 'Saving…'
                : selectedReview.status === 'completed'
                  ? 'Reopen audit'
                  : 'Mark complete'}
            </Button>
          ) : null}
        </>
      )}
    </Stack>
  );
}
