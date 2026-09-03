'use client';

import { Chip, Stack, Tooltip, Typography } from '@mui/material';
import type { DiscoveryAdminItem } from '@/lib/discoveryAdminTypes';
import { DISCOVERY_REVIEW_LABELS, discoveryReviewStatus } from '@/lib/discoveryAdminTypes';
import { discoveryVisibility } from '@/lib/discoveryVisibility';

const pill = { height: 22, fontSize: 12, fontWeight: 600, '& .MuiChip-label': { px: 0.9 } } as const;

/**
 * Where an item can be reached from. Rendered as one pill rather than a sentence, because
 * this column is identical on most rows and only earns attention when it differs.
 */
export function VisibilityPill({ item }: { item: DiscoveryAdminItem }) {
  const value = discoveryVisibility(item);
  if (value === 'hidden') {
    return <Chip size="small" label="Hidden" variant="outlined"
      sx={{ ...pill, color: 'text.disabled', borderColor: 'divider' }} />;
  }
  if (value === 'browse') {
    return <Tooltip title="Approved for homepage browse; publication, member access and independent-use rules still apply">
      <Chip size="small" label="Browse approved" color="primary" sx={pill} />
    </Tooltip>;
  }
  return <Tooltip title="Search enabled; publication, member access and an eligible destination still apply">
    <Chip size="small" label="Search enabled" variant="outlined" sx={{ ...pill, borderColor: 'divider' }} />
  </Tooltip>;
}

/**
 * Only meaningful for a resource that actually sits inside a guide, so it is omitted
 * everywhere else instead of repeating a default on every row.
 */
export function OpenModePill({ item }: { item: DiscoveryAdminItem }) {
  if (item.kind !== 'resource' || !item.embedded) return null;
  if (discoveryReviewStatus(item) === 'pending') return <Chip size="small" label="Needs review" variant="outlined" sx={pill} />;
  if (item.discovery_open_mode === 'direct') {
    return <Tooltip title={DISCOVERY_REVIEW_LABELS.direct}>
      <Chip size="small" label="Opens on its own" color="primary" variant="outlined" sx={pill} />
    </Tooltip>;
  }
  return <Tooltip title={DISCOVERY_REVIEW_LABELS.context}>
    <Chip size="small" label="Opens its guide" variant="outlined"
      sx={{ ...pill, color: 'text.secondary', borderColor: 'divider', fontWeight: 500 }} />
  </Tooltip>;
}

/** Format, publication state, and — for an embedded resource — the guide it sits inside. */
export function ItemSubtitle({ item }: { item: DiscoveryAdminItem }) {
  const placements = item.placement_count ?? 0;
  return <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
    {item.media_type} · {item.state}
    {item.placement_title
      ? <>
        {' · in '}
        <Typography component="span" variant="caption" sx={{ color: 'text.primary', fontWeight: 500 }}>
          {item.placement_title}
        </Typography>
        {placements > 1 ? ` +${placements - 1} more` : ''}
      </>
      : item.embedded ? ' · embedded' : ''}
  </Typography>;
}

export function ItemStatus({ item }: { item: DiscoveryAdminItem }) {
  return <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
    <VisibilityPill item={item} />
    <OpenModePill item={item} />
  </Stack>;
}
