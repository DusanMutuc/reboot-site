'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Typography,
} from '@mui/material';
import DiscoveryFloatingBar from '@/components/admin/discovery/DiscoveryFloatingBar';
import DiscoveryTagPicker from '@/components/admin/discovery/DiscoveryTagPicker';
import { fetchRepresentatives } from '@/lib/discoveryJobsClient';
import { discoveryJobFormatLabel, refKey, splitTitleMarker } from '@/lib/discoveryJobTypes';
import type { DiscoveryItemRef, DiscoveryRepresentative } from '@/lib/discoveryJobTypes';
import type { DiscoveryTag } from '@/lib/discoveryAdminTypes';

export type BulkStage =
  | { stage: 'idle' }
  | { stage: 'choose-rep' }
  | { stage: 'preview'; representative: DiscoveryRepresentative | null; tags: DiscoveryTag[] };

/**
 * Bulk topic assignment.
 *
 * The guardrail: grouping is not classification. A format marker is a good way to FIND related
 * material and no evidence at all of a shared subject — `[Coaching Replay]` spans hiring, CRM,
 * listings and mindset. So nothing may be proposed until the admin has chosen a real
 * representative and seen its exact topics, or has chosen topics directly. No representative is
 * ever inferred, defaulted or derived from a title.
 *
 * Staged in the list rather than a dialog: the list is a better review surface than a modal,
 * because it shows each title in the context the admin has been reading all along.
 */
export default function TopicsBulkBar({
  selected, stage, onStage, onClear, onCommit, busy, tags,
}: {
  selected: DiscoveryItemRef[];
  stage: BulkStage;
  onStage: (stage: BulkStage) => void;
  onClear: () => void;
  onCommit: (tagIds: number[]) => void;
  busy: boolean;
  tags: DiscoveryTag[];
}) {
  if (!selected.length) return null;

  if (stage.stage === 'choose-rep') {
    return (
      <DiscoveryFloatingBar selectedCount={selected.length} onClear={onClear} busy={busy}>
        <RepresentativePicker
          onPick={(representative) => onStage({
            stage: 'preview',
            representative,
            tags: representative.topics
              .map((topic) => tags.find((tag) => tag.id === topic.id))
              .filter((tag): tag is DiscoveryTag => !!tag),
          })}
          onCancel={() => onStage({ stage: 'idle' })}
        />
      </DiscoveryFloatingBar>
    );
  }

  if (stage.stage === 'preview') {
    const chosen = stage.tags;
    return (
      <DiscoveryFloatingBar selectedCount={selected.length} onClear={onClear} busy={busy}>
        <Stack gap={1.5} sx={{ width: '100%' }}>
          {stage.representative ? (
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
              <Typography variant="caption" color="text.secondary">Copying topics from</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25 }}>
                {stage.representative.title}
              </Typography>
              <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                {chosen.map((tag) => (
                  <Chip key={tag.id} label={tag.name} size="small" variant="outlined" />
                ))}
              </Stack>
            </Paper>
          ) : (
            <Box sx={{ maxWidth: 560 }}>
              <DiscoveryTagPicker
                options={tags} value={chosen} size="small" hideHelper
                label="Topics to add to every selected item"
                placeholder="Type to choose topics…"
                onChange={(next) => onStage({ ...stage, tags: next })}
              />
            </Box>
          )}

          <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap" useFlexGap>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '50ch', lineHeight: 1.6 }}>
              These will be added to every selected item. Topics they already have are kept. Untick a row to leave
              it out.
            </Typography>
            <Divider orientation="vertical" flexItem />
            {!!chosen.length && (
              <Chip
                label={`Add ${chosen.length} topic${chosen.length > 1 ? 's' : ''} to ${selected.length} item${selected.length > 1 ? 's' : ''}`}
                color="secondary" variant="outlined" sx={{ fontWeight: 600 }}
              />
            )}
            <Stack direction="row" gap={1} sx={{ ml: 'auto' }}>
              <Button variant="outlined" disabled={!chosen.length || busy}
                onClick={() => onCommit(chosen.map((tag) => tag.id))}
                sx={{ textTransform: 'none', fontWeight: 600 }}>
                Add topics to {selected.length} item{selected.length > 1 ? 's' : ''}
              </Button>
              <Button onClick={() => onStage({ stage: 'idle' })} disabled={busy} sx={{ textTransform: 'none' }}>
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </DiscoveryFloatingBar>
    );
  }

  return (
    <DiscoveryFloatingBar selectedCount={selected.length} onClear={onClear} busy={busy}>
      <Button variant="outlined" disabled={busy} onClick={() => onStage({ stage: 'choose-rep' })}
        sx={{ textTransform: 'none', fontWeight: 600 }}>
        Copy topics from…
      </Button>
      <Button variant="outlined" disabled={busy}
        onClick={() => onStage({ stage: 'preview', representative: null, tags: [] })}
        sx={{ textTransform: 'none', fontWeight: 600 }}>
        Choose topics directly
      </Button>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '44ch', lineHeight: 1.6 }}>
        Topics are added to every selected item. Nothing is applied until you confirm.
      </Typography>
    </DiscoveryFloatingBar>
  );
}

/** Only items that already carry topics can be a representative. */
function RepresentativePicker({ onPick, onCancel }: {
  onPick: (representative: DiscoveryRepresentative) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<DiscoveryRepresentative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchRepresentatives(query)
        .then((data) => { if (live) { setItems(data.items); setError(null); } })
        .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : 'Could not load items.'); })
        .finally(() => { if (live) setLoading(false); });
    }, query ? 220 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);

  return (
    <Stack gap={1.25} sx={{ width: '100%' }}>
      <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" useFlexGap>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Copy topics from which item?</Typography>
        <TextField
          size="small" placeholder="Search tagged items…" value={query} autoFocus
          onChange={(event) => setQuery(event.target.value)} sx={{ minWidth: 300 }}
        />
        <Button onClick={onCancel} sx={{ ml: 'auto', textTransform: 'none' }}>Cancel</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '80ch', lineHeight: 1.6 }}>
        Only items that already have topics can be copied from. You&rsquo;ll see exactly which topics before anything
        is applied.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper variant="outlined" sx={{ maxHeight: 270, overflowY: 'auto' }}>
        {loading && <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={20} /></Box>}
        {!loading && !items.length && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No tagged item matches that search.
          </Typography>
        )}
        {!loading && items.map((item) => {
          const { subject, marker } = splitTitleMarker(item.title);
          return (
            <Box
              key={refKey(item)} component="button" type="button" onClick={() => onPick(item)}
              sx={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 2, alignItems: 'center',
                width: '100%', textAlign: 'left', border: 0, borderBottom: '1px solid', borderColor: 'divider',
                bgcolor: 'transparent', font: 'inherit', px: 1.75, py: 1.25, cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {subject}
                  {marker && <Box component="span" sx={{ color: 'text.disabled' }}>{marker}</Box>}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  {discoveryJobFormatLabel(item)}{item.guide ? ` · in ${item.guide}` : ''}
                </Typography>
              </Box>
              <Stack direction="row" gap={0.5} flexWrap="wrap" justifyContent="flex-end" sx={{ maxWidth: 300 }}>
                {item.topics.map((topic) => (
                  <Chip key={topic.id} label={topic.name} size="small" variant="outlined"
                    sx={{ height: 20, fontSize: 11 }} />
                ))}
              </Stack>
            </Box>
          );
        })}
      </Paper>
    </Stack>
  );
}
