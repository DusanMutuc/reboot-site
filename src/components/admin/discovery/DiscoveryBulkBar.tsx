'use client';

import { Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import type { DiscoveryTag } from '@/lib/discoveryAdminTypes';
import { DISCOVERY_REVIEW_LABELS } from '@/lib/discoveryAdminTypes';
import DiscoveryTagPicker from './DiscoveryTagPicker';
import DiscoveryFloatingBar from './DiscoveryFloatingBar';

/** Catalogue selection bar. Appears only when rows are selected. */
export default function DiscoveryBulkBar({
  kind, selectedCount, tags, bulkTags, onBulkTags, tagAction, onTagAction,
  visibility, onVisibility, openMode, onOpenMode, busy, disabled, hasChange, onReview, onClear,
}: {
  kind: 'resource' | 'guide';
  selectedCount: number;
  tags: DiscoveryTag[];
  bulkTags: DiscoveryTag[];
  onBulkTags: (value: DiscoveryTag[]) => void;
  tagAction: string;
  onTagAction: (value: string) => void;
  visibility: string;
  onVisibility: (value: string) => void;
  openMode: string;
  onOpenMode: (value: string) => void;
  busy: boolean;
  disabled: boolean;
  hasChange: boolean;
  onReview: () => void;
  onClear: () => void;
}) {
  return <DiscoveryFloatingBar selectedCount={selectedCount} onClear={onClear} busy={busy}
    footnote={openMode === 'direct'
      ? <Typography variant="caption" color="text.secondary">
        Approving direct use asks that each selected item still makes sense without its surrounding
        guide — check that no essential instructions live around it.
      </Typography>
      : undefined}>
    <TextField select size="small" label="Topics" value={tagAction} disabled={busy}
      onChange={(event) => onTagAction(event.target.value)} sx={{ minWidth: 150 }}>
      <MenuItem value="unchanged">Leave unchanged</MenuItem>
      <MenuItem value="add">Add</MenuItem>
      <MenuItem value="remove">Remove</MenuItem>
      <MenuItem value="replace">Replace all</MenuItem>
    </TextField>

    <Box sx={{ flex: 1, minWidth: 220 }}>
      <DiscoveryTagPicker options={tags} value={bulkTags} onChange={onBulkTags} size="small" hideHelper
        allowInactive={tagAction === 'remove'} disabled={busy || tagAction === 'unchanged'} />
    </Box>

    <TextField select size="small" label="Visibility" value={visibility} disabled={busy}
      onChange={(event) => onVisibility(event.target.value)} sx={{ minWidth: 175 }}>
      <MenuItem value="unchanged">Leave unchanged</MenuItem>
      <MenuItem value="hidden">Nowhere — hidden</MenuItem>
      <MenuItem value="search_only">Search only</MenuItem>
      {kind === 'resource' && <MenuItem value="browse">Search + homepage approval</MenuItem>}
    </TextField>

    {kind === 'resource' && <TextField select size="small" label="Review decision" value={openMode} disabled={busy}
      onChange={(event) => onOpenMode(event.target.value)} sx={{ minWidth: 200 }}>
      <MenuItem value="unchanged">Leave unchanged</MenuItem>
      {Object.entries(DISCOVERY_REVIEW_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
    </TextField>}

    <Button variant="contained" disabled={busy || disabled || !hasChange} onClick={onReview}>
      Review change
    </Button>
  </DiscoveryFloatingBar>;
}
