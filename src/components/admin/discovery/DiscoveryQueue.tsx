'use client';

import { Box, ButtonBase, LinearProgress, Stack, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type { DiscoveryProgress } from '@/lib/discoveryAdminTypes';

export type QueueJob = {
  id: string;
  label: string;
  hint: string;
  count: number;
  /** Jobs whose count going down is progress, versus a standing total. */
  isBacklog: boolean;
};

export function queueJobs(progress: DiscoveryProgress, kind: 'resource' | 'guide'): QueueJob[] {
  const jobs: QueueJob[] = [
    {
      id: 'untagged',
      label: 'Need a topic tag',
      hint: 'Titles, descriptions and alternate names already help search. Topics add more ways to find these items.',
      count: Math.max(0, progress.total - progress.tagged),
      isBacklog: true,
    },
    {
      id: 'no_category',
      label: 'No category from topics',
      hint: kind === 'resource'
        ? 'Assign a topic with a category to include an approved item under a category chip. This does not approve homepage browse.'
        : 'Categorized topics help organize guide search and topic relationships. Guides never enter homepage browse.',
      count: Math.max(0, progress.total - progress.categorized),
      isBacklog: true,
    },
  ];
  if (kind === 'resource') {
    jobs.push({
      id: 'needs_review',
      label: 'Embedded resources needing review',
      hint: 'Inspect the material, then record either “keep within its guide” or “suitable independently”. Both complete the review.',
      count: progress.needsReview,
      isBacklog: true,
    });
  }
  jobs.push({
    id: 'hidden',
    label: 'Hidden from discovery',
    hint: 'Not reachable by search or browse. Review if that is unintended.',
    count: progress.hidden,
    isBacklog: false,
  });
  if (kind === 'resource') {
    jobs.push({
      id: 'browse',
      label: 'Approved for homepage browse',
      hint: 'These have your approval. Publication, access and independent-use rules still apply.',
      count: progress.browseApproved,
      isBacklog: false,
    });
  }
  return jobs;
}

/**
 * Progress across the whole catalogue for the selected content kind. These counts ignore
 * the filters below them on purpose — this is the state of the pass, not of the current view.
 */
export function DiscoveryProgressBand({ progress, kind }: { progress: DiscoveryProgress; kind: 'resource' | 'guide' }) {
  const percent = progress.total ? Math.round((progress.tagged / progress.total) * 100) : 0;
  const noun = kind === 'resource' ? 'resources' : 'learning nodes';
  const stats: Array<[number, string]> = [
    [progress.tagged, 'tagged'],
    [progress.categorized, 'categorised'],
  ];
  if (kind === 'resource') stats.push([progress.browseApproved, 'approved for homepage browse']);

  return <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2.5 }}>
    <Stack direction="row" spacing={4} alignItems="flex-end" flexWrap="wrap" useFlexGap>
      <Box>
        <Typography variant="h4" component="div" sx={{ fontWeight: 600, lineHeight: 1 }}>
          {progress.tagged}
          <Typography component="span" variant="h6" color="text.secondary" sx={{ fontWeight: 400 }}>
            {' / '}{progress.total}
          </Typography>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{noun} tagged</Typography>
      </Box>
      {stats.slice(1).map(([value, label]) => (
        <Box key={label}>
          <Typography variant="h5" component="div" sx={{ fontWeight: 600, lineHeight: 1 }}>{value}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{label}</Typography>
        </Box>
      ))}
    </Stack>
    <LinearProgress variant="determinate" value={percent}
      sx={{ mt: 2, height: 6, borderRadius: 3, bgcolor: 'action.hover' }} />
  </Box>;
}

/** Landing view: the pass as a small number of finite jobs rather than one long table. */
export default function DiscoveryQueue({ jobs, onPick, onBrowseAll, total, noun = 'items' }: {
  jobs: QueueJob[];
  onPick: (id: string) => void;
  onBrowseAll: () => void;
  total: number;
  noun?: string;
}) {
  return <Stack spacing={1.5}>
    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Where to start</Typography>
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      {jobs.map((job, index) => (
        <ButtonBase key={job.id} onClick={() => onPick(job.id)} focusRipple
          sx={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 2.5, px: 2.5, py: 2,
            textAlign: 'left', justifyContent: 'flex-start',
            borderTop: index ? '1px solid' : 'none', borderColor: 'divider',
            '&:hover': { bgcolor: 'action.hover' },
          }}>
          <Typography variant="h5" component="div" sx={{
            fontWeight: 600, minWidth: 64, textAlign: 'right',
            color: job.isBacklog && job.count ? 'text.primary' : 'text.secondary',
          }}>
            {job.count}
          </Typography>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>{job.label}</Typography>
            <Typography variant="body2" color="text.secondary">{job.hint}</Typography>
          </Box>
          <ArrowForwardIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        </ButtonBase>
      ))}
    </Box>
    <Box>
      <ButtonBase onClick={onBrowseAll} focusRipple
        sx={{ px: 1, py: 0.75, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}>
        <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
          Browse all {total} {noun} instead
        </Typography>
      </ButtonBase>
    </Box>
  </Stack>;
}
