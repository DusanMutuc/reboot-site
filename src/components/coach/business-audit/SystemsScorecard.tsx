'use client';

import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';

import type {
  BusinessReviewSystemScorecard,
  SystemScorecardCategory,
  SystemScorecardStatus,
  SystemScorecardSystem,
} from '@/lib/businessReviews';

type SystemsScorecardProps = {
  scorecard: BusinessReviewSystemScorecard;
  pendingSystemIds: ReadonlySet<number>;
  pendingPrioritySystemIds: ReadonlySet<number>;
  onReviewSystem: (systemId: number, status: SystemScorecardStatus) => void;
  onTogglePriority: (systemId: number, selected: boolean) => void;
};

const STATUS_OPTIONS: Array<{
  value: SystemScorecardStatus;
  label: string;
}> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'started', label: 'Started' },
  { value: 'complete', label: 'Complete' },
  { value: 'consistent', label: 'Consistent' },
];

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function isGoodStatus(status: SystemScorecardStatus) {
  return status === 'complete' || status === 'consistent';
}

function getCategoryCounts(category: SystemScorecardCategory) {
  return category.systems.reduce(
    (counts, system) => {
      if (isGoodStatus(system.rating.status)) counts.good += 1;
      if (!system.rating.reviewedAt) counts.needReview += 1;
      if (system.rating.reviewedAt) counts.reviewed += 1;
      return counts;
    },
    { good: 0, needReview: 0, reviewed: 0 },
  );
}

function ReviewHistory({ system }: { system: SystemScorecardSystem }) {
  if (system.rating.reviewedAt) {
    return (
      <Stack direction="row" spacing={0.75} alignItems="center">
        <CheckCircleRoundedIcon color="success" sx={{ fontSize: 17 }} />
        <Typography variant="caption" color="success.main" sx={{ fontWeight: 700 }}>
          Reviewed {formatDateTime(system.rating.reviewedAt)}
        </Typography>
      </Stack>
    );
  }

  if (!system.rating.lastReviewedAt) {
    return (
      <Stack direction="row" spacing={0.75} alignItems="center">
        <WarningAmberRoundedIcon color="warning" sx={{ fontSize: 17 }} />
        <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 700 }}>
          Never reviewed
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      {system.rating.reviewOverdue ? (
        <WarningAmberRoundedIcon color="warning" sx={{ fontSize: 17 }} />
      ) : (
        <HistoryRoundedIcon color="action" sx={{ fontSize: 17 }} />
      )}
      <Typography
        variant="caption"
        color={system.rating.reviewOverdue ? 'warning.dark' : 'text.secondary'}
        sx={{ fontWeight: system.rating.reviewOverdue ? 700 : 500 }}
      >
        {system.rating.reviewOverdue ? 'Review overdue' : 'Last reviewed'} ·{' '}
        {formatDateTime(system.rating.lastReviewedAt)}
      </Typography>
    </Stack>
  );
}

function SystemRow({
  system,
  pending,
  priorityPending,
  priorityLimitReached,
  onReview,
  onTogglePriority,
}: {
  system: SystemScorecardSystem;
  pending: boolean;
  priorityPending: boolean;
  priorityLimitReached: boolean;
  onReview: (systemId: number, status: SystemScorecardStatus) => void;
  onTogglePriority: (systemId: number, selected: boolean) => void;
}) {
  const needsAttention = !system.rating.reviewedAt && system.rating.reviewOverdue;
  const isPriority = Boolean(system.priority);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          md: 'minmax(220px, 1fr) 170px 150px 146px',
        },
        gap: { xs: 1.5, md: 2 },
        alignItems: 'center',
        px: { xs: 1.5, sm: 2 },
        py: 1.75,
        borderTop: '1px solid',
        borderColor: 'grey.200',
        borderLeft: '4px solid',
        borderLeftColor: needsAttention ? 'warning.main' : 'transparent',
        bgcolor: needsAttention ? 'rgba(255, 167, 38, 0.06)' : 'transparent',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="body2" sx={{ fontWeight: 800 }}>
            {system.label}
          </Typography>
          {needsAttention ? (
            <Chip
              label={system.rating.lastReviewedAt ? '12+ months' : 'New'}
              size="small"
              color="warning"
              variant="outlined"
              sx={{ height: 22, fontWeight: 800, fontSize: 11 }}
            />
          ) : null}
        </Stack>
        <Box sx={{ mt: 0.5 }}>
          <ReviewHistory system={system} />
        </Box>
      </Box>

      <FormControl size="small" fullWidth disabled={pending}>
        <Select
          value={system.rating.status}
          inputProps={{ 'aria-label': `Status for ${system.label}` }}
          onChange={(event) =>
            onReview(system.id, event.target.value as SystemScorecardStatus)
          }
          sx={{
            bgcolor: 'background.paper',
            fontWeight: 700,
            '& .MuiSelect-select': { py: 1.1 },
          }}
        >
          {STATUS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Button
        variant={isPriority ? 'contained' : 'outlined'}
        color={isPriority ? 'warning' : 'inherit'}
        disabled={priorityPending || (!isPriority && priorityLimitReached)}
        startIcon={
          priorityPending ? (
            <CircularProgress size={15} color="inherit" />
          ) : (
            <FlagRoundedIcon />
          )
        }
        onClick={() => onTogglePriority(system.id, !isPriority)}
        title={
          !isPriority && priorityLimitReached
            ? 'Remove another priority before selecting this system.'
            : undefined
        }
        sx={{
          minHeight: 40,
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}
      >
        {priorityPending
          ? 'Saving…'
          : isPriority
            ? `Priority ${system.priority!.position}`
            : 'Set priority'}
      </Button>

      <Button
        variant={system.rating.reviewedAt ? 'outlined' : 'contained'}
        color={system.rating.reviewedAt ? 'inherit' : 'primary'}
        disabled={pending}
        startIcon={
          pending ? (
            <CircularProgress size={15} color="inherit" />
          ) : (
            <CheckCircleRoundedIcon />
          )
        }
        onClick={() => onReview(system.id, system.rating.status)}
        sx={{
          minHeight: 40,
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}
      >
        {pending
          ? 'Saving…'
          : system.rating.reviewedAt
            ? 'Review again'
            : 'Mark reviewed'}
      </Button>
    </Box>
  );
}

function CategoryAccordion({
  category,
  defaultExpanded,
  pendingSystemIds,
  pendingPrioritySystemIds,
  priorityLimitReached,
  onReviewSystem,
  onTogglePriority,
}: {
  category: SystemScorecardCategory;
  defaultExpanded: boolean;
  pendingSystemIds: ReadonlySet<number>;
  pendingPrioritySystemIds: ReadonlySet<number>;
  priorityLimitReached: boolean;
  onReviewSystem: (systemId: number, status: SystemScorecardStatus) => void;
  onTogglePriority: (systemId: number, selected: boolean) => void;
}) {
  const counts = getCategoryCounts(category);
  const total = category.systems.length;
  const progress = total > 0 ? (counts.reviewed / total) * 100 : 0;
  const priorityCount = category.systems.filter((system) => system.priority).length;

  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'grey.200',
        borderRadius: '12px !important',
        overflow: 'hidden',
        '&::before': { display: 'none' },
        '& + &': { mt: 1.5 },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        aria-controls={`${category.key}-systems`}
        id={`${category.key}-header`}
        sx={{
          px: { xs: 1.75, sm: 2.5 },
          py: 0.5,
          bgcolor: 'grey.50',
          '& .MuiAccordionSummary-content': { minWidth: 0 },
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 1, sm: 2 }}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
          sx={{ width: '100%', minWidth: 0, pr: 1 }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
              {category.label}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
              <LinearProgress
                variant="determinate"
                value={progress}
                color={counts.needReview === 0 ? 'success' : 'primary'}
                sx={{ width: { xs: 100, sm: 140 }, height: 6, borderRadius: 999 }}
              />
              <Typography variant="caption" color="text.secondary">
                {counts.reviewed}/{total} reviewed
              </Typography>
            </Stack>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {priorityCount > 0 ? (
              <Chip
                size="small"
                color="warning"
                icon={<FlagRoundedIcon />}
                label={`${priorityCount} ${priorityCount === 1 ? 'priority' : 'priorities'}`}
                sx={{ fontWeight: 800 }}
              />
            ) : null}
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label={`${counts.good} good`}
              sx={{ fontWeight: 800 }}
            />
            <Chip
              size="small"
              color={counts.needReview === 0 ? 'success' : 'warning'}
              label={
                counts.needReview === 0
                  ? 'All reviewed'
                  : `${counts.needReview} need review`
              }
              sx={{ fontWeight: 800 }}
            />
          </Stack>
        </Stack>
      </AccordionSummary>

      <AccordionDetails
        id={`${category.key}-systems`}
        aria-labelledby={`${category.key}-header`}
        sx={{ p: 0 }}
      >
        {category.systems.map((system) => (
          <SystemRow
            key={system.id}
            system={system}
            pending={pendingSystemIds.has(system.id)}
            priorityPending={pendingPrioritySystemIds.has(system.id)}
            priorityLimitReached={priorityLimitReached}
            onReview={onReviewSystem}
            onTogglePriority={onTogglePriority}
          />
        ))}
      </AccordionDetails>
    </Accordion>
  );
}

export default function SystemsScorecard({
  scorecard,
  pendingSystemIds,
  pendingPrioritySystemIds,
  onReviewSystem,
  onTogglePriority,
}: SystemsScorecardProps) {
  const allSystems = scorecard.categories.flatMap((category) => category.systems);
  const goodCount = allSystems.filter((system) => isGoodStatus(system.rating.status)).length;
  const reviewedCount = allSystems.filter((system) => system.rating.reviewedAt).length;
  const needReviewCount = allSystems.length - reviewedCount;
  const priorityCount = allSystems.filter((system) => system.priority).length;
  const priorityLimitReached = priorityCount >= 3;

  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'grey.200',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        sx={{
          px: { xs: 2, md: 3 },
          py: 2.5,
          borderBottom: '1px solid',
          borderColor: 'grey.200',
          bgcolor: 'grey.50',
        }}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="h5" sx={{ fontWeight: 900 }}>
              Systems Scorecard
            </Typography>
            <Chip
              label={scorecard.audience === 'legends' ? 'Legends' : 'Foundation'}
              size="small"
              color={scorecard.audience === 'legends' ? 'secondary' : 'primary'}
              variant="outlined"
              sx={{ fontWeight: 800 }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Review each system individually and select up to three priorities for the next
            60 days. Categories are summaries only.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            icon={<FlagRoundedIcon />}
            label={`${priorityCount}/3 priorities`}
            color={priorityLimitReached ? 'warning' : 'default'}
            variant={priorityLimitReached ? 'filled' : 'outlined'}
            sx={{ fontWeight: 800 }}
          />
          <Chip
            label={`${goodCount} good`}
            color="success"
            variant="outlined"
            sx={{ fontWeight: 800 }}
          />
          <Chip
            label={
              needReviewCount === 0
                ? 'All systems reviewed'
                : `${needReviewCount} need review`
            }
            color={needReviewCount === 0 ? 'success' : 'warning'}
            sx={{ fontWeight: 800 }}
          />
        </Stack>
      </Stack>

      <Box sx={{ p: { xs: 1.5, md: 2.5 }, bgcolor: 'background.paper' }}>
        {scorecard.categories.map((category, index) => (
          <CategoryAccordion
            key={category.id}
            category={category}
            defaultExpanded={index === 0}
            pendingSystemIds={pendingSystemIds}
            pendingPrioritySystemIds={pendingPrioritySystemIds}
            priorityLimitReached={priorityLimitReached}
            onReviewSystem={onReviewSystem}
            onTogglePriority={onTogglePriority}
          />
        ))}
      </Box>
    </Paper>
  );
}
