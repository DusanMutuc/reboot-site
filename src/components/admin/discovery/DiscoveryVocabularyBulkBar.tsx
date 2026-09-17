'use client';

import { Button, MenuItem, TextField, Typography } from '@mui/material';
import DiscoveryFloatingBar from './DiscoveryFloatingBar';
import { DISCOVERY_CATEGORY_LABELS } from '@/lib/discoveryAdminTypes';

const categories = ['marketing', 'systems', 'hiring', 'mindset'];

/** Vocabulary selection bar. Retiring and categorising are both reversible, so there is no confirm step. */
export default function DiscoveryVocabularyBulkBar({
  selectedCount, category, onCategory, status, onStatus, busy, hasChange, onApply, onClear,
}: {
  selectedCount: number;
  category: string;
  onCategory: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
  busy: boolean;
  hasChange: boolean;
  onApply: () => void;
  onClear: () => void;
}) {
  return <DiscoveryFloatingBar selectedCount={selectedCount} onClear={onClear} busy={busy}
    footnote={status === 'retire'
      ? <Typography variant="caption" color="text.secondary">
        Retiring keeps every existing assignment. The term and its synonyms just stop contributing to
        search and leave the picker — you can bring them back at any time.
      </Typography>
      : undefined}>
    <TextField select size="small" label="Browse category" value={category} disabled={busy}
      onChange={(event) => onCategory(event.target.value)} sx={{ minWidth: 190 }}>
      <MenuItem value="unchanged">Leave unchanged</MenuItem>
      <MenuItem value="none">No category</MenuItem>
      {categories.map((value) => <MenuItem key={value} value={value}>{DISCOVERY_CATEGORY_LABELS[value]}</MenuItem>)}
    </TextField>

    <TextField select size="small" label="Status" value={status} disabled={busy}
      onChange={(event) => onStatus(event.target.value)} sx={{ minWidth: 175 }}>
      <MenuItem value="unchanged">Leave unchanged</MenuItem>
      <MenuItem value="keep">Keep — active</MenuItem>
      <MenuItem value="retire">Retire — inactive</MenuItem>
    </TextField>

    <Button variant="contained" disabled={busy || !hasChange} onClick={onApply}>
      {busy ? 'Applying…' : `Apply to ${selectedCount}`}
    </Button>
  </DiscoveryFloatingBar>;
}
