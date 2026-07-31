'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
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

import BusinessSnapshot from '@/components/coach/business-audit/BusinessSnapshot';
import FocusFinderChart from '@/components/coach/business-audit/FocusFinderChart';
import type { FocusFinderSaveStatus } from '@/components/coach/business-audit/FocusFinderChart';
import SystemsScorecard from '@/components/coach/business-audit/SystemsScorecard';
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

type CreateBusinessReviewResponse = ApiErrorBody & {
  review?: BusinessReview;
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

function getLocalIsoDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function EmptyAuditState({
  creating,
  studentName,
  onCreate,
}: {
  creating: boolean;
  studentName?: string | null;
  onCreate: () => void;
}) {
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
        Start the first business audit
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ maxWidth: 520, mx: 'auto', mt: 1 }}
      >
        This creates a new 60 Day Business Audit and its connected coaching note
        {studentName ? ` for ${studentName}` : ''}.
      </Typography>
      <Button
        variant="contained"
        startIcon={creating ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
        disabled={creating}
        onClick={onCreate}
        sx={{ mt: 3, fontWeight: 800 }}
      >
        {creating ? 'Creating audit…' : 'Create business audit'}
      </Button>
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
  const [creating, setCreating] = useState(false);
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
        setSelectedReviewId(body.reviews?.[0]?.id ?? null);
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

  const createAudit = async () => {
    setCreating(true);
    setLoadError(null);
    setSaveError(null);
    setSystemSaveError(null);
    setPrioritySaveError(null);

    try {
      const response = await fetch('/api/business-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedStudentId,
          reviewDate: getLocalIsoDate(),
        }),
      });
      const body = (await response.json()) as CreateBusinessReviewResponse;

      if (!response.ok || !body.review) {
        throw new Error(body.error || 'Failed to create business audit.');
      }

      setReviews((current) => [
        body.review!,
        ...current.filter((review) => review.id !== body.review!.id),
      ]);
      setSelectedReviewId(body.review.id);
      setHasSaved(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create business audit.';
      setLoadError(message);
    } finally {
      setCreating(false);
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

        <Stack direction="row" spacing={1} alignItems="center">
          {selectedReview ? (
            <Chip
              label={selectedReview.status === 'completed' ? 'Completed · editable' : 'Draft'}
              color={selectedReview.status === 'completed' ? 'success' : 'default'}
              variant="outlined"
              sx={{ fontWeight: 700, textTransform: 'capitalize' }}
            />
          ) : null}
          {reviews.length > 0 ? (
            <Button
              variant="contained"
              startIcon={creating ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
              disabled={creating}
              onClick={() => void createAudit()}
              sx={{ fontWeight: 800 }}
            >
              {creating ? 'Creating…' : 'New audit'}
            </Button>
          ) : null}
        </Stack>
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
        <EmptyAuditState
          creating={creating}
          studentName={studentName}
          onCreate={() => void createAudit()}
        />
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
                          {review.status === 'completed' ? 'Completed' : 'Draft'} ·{' '}
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
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <CalendarMonthIcon fontSize="small" color="action" />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Audit date: {formatReviewDate(selectedReview.reviewDate)}
                  </Typography>
                </Stack>
              </Stack>

              <BusinessSnapshot
                key={selectedReview.id}
                foundationsCompleted={foundationsCompleted}
                foundationsLoading={foundationsLoading}
              />

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
            </>
          ) : null}
        </>
      )}
    </Stack>
  );
}
