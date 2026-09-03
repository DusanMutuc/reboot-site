'use client';

import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, Checkbox, Chip, Collapse, FormControlLabel, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { DiscoveryTag } from '@/lib/discoveryAdminTypes';
import { findDuplicateGroups } from '@/lib/discoveryDuplicates';

/**
 * Surfaces likely spelling variants so they can be merged. Without this the duplicates
 * that motivated the closed vocabulary are invisible unless they happen to sort next to
 * each other — `p&l` and `pnl` never do.
 */
export default function DiscoveryDuplicatePanel({ tags, busy, onMerge, dismissed = [], onDismiss, onRestore }: {
  tags: DiscoveryTag[];
  busy: boolean;
  onMerge: (keepId: number, mergeIds: number[]) => void;
  dismissed?: string[];
  onDismiss: (signature: string) => void;
  onRestore: () => void;
}) {
  const allGroups = useMemo(() => findDuplicateGroups(tags), [tags]);
  const groups = allGroups.filter(group => !dismissed.includes(group.signature));
  // Collapsed by default: the coloured header carries the signal, and expanding it by
  // default would push the term list itself below the fold.
  const [open, setOpen] = useState(false);
  const [keepChoice, setKeepChoice] = useState<Record<string, number>>({});
  const [excluded, setExcluded] = useState<Record<string, number[]>>({});

  if (!groups.length) return dismissed.length ? <Button size="small" disabled={busy} onClick={onRestore}>Restore dismissed duplicate suggestions</Button> : null;

  return <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
    <ButtonBase aria-expanded={open} aria-controls="discovery-duplicates" disabled={busy}
      sx={{
        display: 'flex', width: '100%', textAlign: 'left', gap: 1, px: 2, py: 1,
        color: 'text.secondary', '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
      }}
      onClick={() => setOpen((value) => !value)}>
      <Typography variant="body2" sx={{ flex: 1 }}>
        {groups.length} {groups.length === 1 ? 'term looks' : 'terms look'} like spellings of something
        already here
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.dark' }}>
        {open ? 'Hide' : 'Review'}
      </Typography>
      <ExpandMoreIcon fontSize="small" sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: '150ms' }} />
    </ButtonBase>

    <Collapse in={open} id="discovery-duplicates">
      <Stack spacing={0} sx={{ p: 2, pt: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Terms that look like spellings of the same thing. Merging moves every assignment onto the
          term you keep and turns the others into synonyms of it. Semantic synonyms are not detected
          here — <em>profit and loss</em> will not be grouped with <em>p&amp;l</em>.
        </Typography>

        {groups.map((group) => {
          const keepId = keepChoice[group.key] ?? group.suggestedKeepId;
          const mergeIds = group.tags.filter(tag => tag.id !== keepId && !(excluded[group.signature] ?? []).includes(tag.id)).map(tag => tag.id);
          return <Stack key={group.key} spacing={1}
            sx={{ py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {group.tags.map((tag) => {
                const usage = (tag.resource_count ?? 0) + (tag.node_count ?? 0);
                return tag.id === keepId ? <Chip key={tag.id} size="small" color="primary" label={`${tag.name} · kept`} />
                  : <FormControlLabel key={tag.id} label={usage ? `${tag.name} · ${usage}` : tag.name}
                    control={<Checkbox size="small" disabled={busy} checked={mergeIds.includes(tag.id)}
                      onChange={event => setExcluded(current => ({ ...current, [group.signature]: event.target.checked
                        ? (current[group.signature] ?? []).filter(id => id !== tag.id)
                        : [...(current[group.signature] ?? []), tag.id] }))} />} />;
              })}
            </Stack>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <TextField select size="small" label="Keep" value={keepId} disabled={busy}
                onChange={(event) => setKeepChoice((current) => ({ ...current, [group.key]: Number(event.target.value) }))}
                sx={{ minWidth: 200 }}>
                {group.tags.map((tag) => <MenuItem key={tag.id} value={tag.id}>{tag.name}</MenuItem>)}
              </TextField>
              <Button size="small" variant="outlined" disabled={busy || !mergeIds.length}
                onClick={() => onMerge(keepId, mergeIds)}>
                Merge {mergeIds.length} into “{group.tags.find((tag) => tag.id === keepId)?.name}”
              </Button>
              <Button size="small" disabled={busy} onClick={() => onDismiss(group.signature)}>Not duplicates — dismiss</Button>
            </Stack>
          </Stack>;
        })}

        <Alert severity="info" sx={{ mt: 2 }}>
          Suggestions only. Uncheck any term that is a different subject. Nothing merges until you confirm. There is no one-click unmerge.
        </Alert>
        {!!dismissed.length && <Button disabled={busy} size="small" onClick={onRestore}>Restore dismissed suggestions</Button>}
      </Stack>
    </Collapse>
  </Box>;
}
