'use client';

import { useEffect, useMemo, useState } from 'react';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import type {
  ScorecardVersionPublishPreview,
  ScorecardVersionReviewResolution,
} from '@/types/systemScorecardLibrary';

type LocalResolution = Omit<ScorecardVersionReviewResolution, 'action'> & {
  action: '' | 'upgrade' | 'skip';
};

type Props = {
  preview: ScorecardVersionPublishPreview | null;
  pending: boolean;
  onClose: () => void;
  onPublish: (resolutions: ScorecardVersionReviewResolution[]) => Promise<void>;
};

function initialResolutions(preview: ScorecardVersionPublishPreview) {
  return Object.fromEntries(
    preview.conflicts.map((conflict) => [
      conflict.reviewId,
      {
        reviewId: conflict.reviewId,
        action: '',
        priorityReplacements: {},
        confirmReviewedRemoval: conflict.reviewedSystems.length === 0,
      } satisfies LocalResolution,
    ]),
  ) as Record<number, LocalResolution>;
}

function formatReviewDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export default function ScorecardPublishDialog({ preview, pending, onClose, onPublish }: Props) {
  const [resolutions, setResolutions] = useState<Record<number, LocalResolution>>({});

  useEffect(() => {
    setResolutions(preview ? initialResolutions(preview) : {});
  }, [preview]);

  const ready = useMemo(() => {
    if (!preview) return false;
    return preview.conflicts.every((conflict) => {
      const resolution = resolutions[conflict.reviewId];
      if (!resolution || !resolution.action) return false;
      if (resolution.action === 'skip') return true;
      if (conflict.reviewedSystems.length > 0 && !resolution.confirmReviewedRemoval) return false;

      const usedKeys = new Set(conflict.retainedPriorityKeys);
      return conflict.priorities.every((priority) => {
        if (!Object.prototype.hasOwnProperty.call(resolution.priorityReplacements, priority.systemKey)) {
          return false;
        }
        const replacement = resolution.priorityReplacements[priority.systemKey];
        if (replacement == null) return true;
        if (usedKeys.has(replacement)) return false;
        usedKeys.add(replacement);
        return true;
      });
    });
  }, [preview, resolutions]);

  if (!preview) return null;

  const submit = async () => {
    const payload = preview.conflicts.map((conflict) => {
      const resolution = resolutions[conflict.reviewId];
      return {
        reviewId: conflict.reviewId,
        action: resolution.action as 'upgrade' | 'skip',
        priorityReplacements: resolution.priorityReplacements,
        confirmReviewedRemoval: resolution.confirmReviewedRemoval,
      };
    });
    await onPublish(payload);
  };

  return (
    <Dialog
      open
      onClose={pending ? undefined : onClose}
      fullWidth
      maxWidth="md"
      slotProps={{ paper: { sx: { maxHeight: '88vh' } } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        {preview.isActive ? 'Upgrade pending reviews' : `Publish scorecard v${preview.version}`}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 850 }}>
                {preview.eligibleReviewCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Incomplete reviews found
              </Typography>
            </Box>
            <Box>
              <Typography variant="h5" color="success.main" sx={{ fontWeight: 850 }}>
                {preview.automaticReviewCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Safe automatic upgrades
              </Typography>
            </Box>
            <Box>
              <Typography
                variant="h5"
                color={preview.conflictReviewCount ? 'warning.main' : 'text.primary'}
                sx={{ fontWeight: 850 }}
              >
                {preview.conflictReviewCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Reviews needing a decision
              </Typography>
            </Box>
          </Box>

          {(preview.addedSystems.length > 0 || preview.removedSystems.length > 0) ? (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
                Version changes
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {preview.addedSystems.map((system) => (
                  <Chip key={`added:${system.key}`} size="small" color="success" variant="outlined" label={`+ ${system.label}`} />
                ))}
                {preview.removedSystems.map((system) => (
                  <Chip key={`removed:${system.key}`} size="small" color="warning" variant="outlined" label={`− ${system.label}`} />
                ))}
              </Stack>
            </Box>
          ) : null}

          {preview.conflicts.length === 0 ? (
            <Alert severity="success">
              No priorities or reviewed systems conflict with this version. Every incomplete review can be upgraded automatically.
            </Alert>
          ) : (
            <Stack spacing={2.5}>
              <Alert severity="warning" icon={<WarningAmberRoundedIcon />}>
                Safe reviews will upgrade automatically. Resolve only the reviews below.
              </Alert>

              {preview.conflicts.map((conflict) => {
                const resolution = resolutions[conflict.reviewId];
                const selectedReplacementKeys = new Set(
                  Object.values(resolution?.priorityReplacements ?? {}).filter(
                    (value): value is string => typeof value === 'string',
                  ),
                );

                return (
                  <Box
                    key={conflict.reviewId}
                    sx={{
                      borderTop: '2px solid',
                      borderColor: 'warning.light',
                      pt: 2,
                      '@keyframes conflictIn': {
                        from: { opacity: 0, transform: 'translateY(4px)' },
                        to: { opacity: 1, transform: 'translateY(0)' },
                      },
                      animation: 'conflictIn 180ms ease-out both',
                    }}
                  >
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'flex-start', sm: 'baseline' }}
                      justifyContent="space-between"
                    >
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 850 }}>
                          {conflict.memberName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Review #{conflict.reviewId} · {formatReviewDate(conflict.reviewDate)} · v{conflict.fromVersion}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={`${conflict.priorities.length + conflict.reviewedSystems.length} issue${conflict.priorities.length + conflict.reviewedSystems.length === 1 ? '' : 's'}`}
                      />
                    </Stack>

                    <RadioGroup
                      row
                      value={resolution?.action ?? ''}
                      onChange={(event) => {
                        const action = event.target.value as 'upgrade' | 'skip';
                        setResolutions((current) => ({
                          ...current,
                          [conflict.reviewId]: { ...current[conflict.reviewId], action },
                        }));
                      }}
                      sx={{ mt: 1 }}
                    >
                      <FormControlLabel value="upgrade" control={<Radio size="small" />} label="Upgrade this review" />
                      <FormControlLabel value="skip" control={<Radio size="small" />} label="Keep it on the old version" />
                    </RadioGroup>

                    {resolution?.action === 'upgrade' ? (
                      <Stack spacing={2} sx={{ mt: 1.5, pl: { sm: 1 } }}>
                        {conflict.priorities.map((priority) => {
                          const hasValue = Object.prototype.hasOwnProperty.call(
                            resolution.priorityReplacements,
                            priority.systemKey,
                          );
                          const storedValue = resolution.priorityReplacements[priority.systemKey];
                          const selectValue = !hasValue ? '' : storedValue == null ? '__remove__' : storedValue;

                          return (
                            <TextField
                              key={priority.systemKey}
                              select
                              size="small"
                              label={`Replace “${priority.systemLabel}”`}
                              value={selectValue}
                              onChange={(event) => {
                                const value = event.target.value;
                                setResolutions((current) => ({
                                  ...current,
                                  [conflict.reviewId]: {
                                    ...current[conflict.reviewId],
                                    priorityReplacements: {
                                      ...current[conflict.reviewId].priorityReplacements,
                                      [priority.systemKey]: value === '__remove__' ? null : value,
                                    },
                                  },
                                }));
                              }}
                              helperText="The linked action step will be updated automatically."
                            >
                              <MenuItem value="" disabled>Choose a replacement or remove it</MenuItem>
                              <MenuItem value="__remove__">Remove this priority and action step</MenuItem>
                              {preview.targetSystems
                                .filter(
                                  (system) =>
                                    !conflict.retainedPriorityKeys.includes(system.key) &&
                                    (!selectedReplacementKeys.has(system.key) || storedValue === system.key),
                                )
                                .map((system) => (
                                  <MenuItem key={system.key} value={system.key}>
                                    {system.label} · {system.categoryLabel}
                                  </MenuItem>
                                ))}
                            </TextField>
                          );
                        })}

                        {conflict.reviewedSystems.length > 0 ? (
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 750 }}>
                              Reviewed systems being removed
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                              {conflict.reviewedSystems.map((system) => system.systemLabel).join(', ')}
                            </Typography>
                            <FormControlLabel
                              sx={{ mt: 0.5 }}
                              control={(
                                <Checkbox
                                  checked={resolution.confirmReviewedRemoval}
                                  onChange={(event) => {
                                    setResolutions((current) => ({
                                      ...current,
                                      [conflict.reviewId]: {
                                        ...current[conflict.reviewId],
                                        confirmReviewedRemoval: event.target.checked,
                                      },
                                    }));
                                  }}
                                />
                              )}
                              label="I understand these reviewed entries will be removed from this incomplete review"
                            />
                          </Box>
                        ) : null}
                      </Stack>
                    ) : null}
                  </Box>
                );
              })}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button color="inherit" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={pending || !ready} onClick={() => void submit()}>
          {pending
            ? 'Applying changes…'
            : preview.isActive
              ? 'Upgrade reviews'
              : `Publish v${preview.version}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
