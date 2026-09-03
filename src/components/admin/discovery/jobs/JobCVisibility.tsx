'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Chip, CircularProgress, Paper, Stack, TextField, Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { JobHeading } from './JobHeading';
import DecisionAnswers, { AnswerConsequences } from './DecisionAnswers';
import QueueList from './QueueList';
import UndoLine from './UndoLine';
import { useDiscoveryUndo } from './useDiscoveryUndo';
import { fetchQueue, recordDecision } from '@/lib/discoveryJobsClient';
import { durationLabel, formatLabel, splitTitleMarker } from '@/lib/discoveryJobTypes';
import type {
  DiscoveryBeforeImage, DiscoveryQueueItem, DiscoveryQueueResponse,
} from '@/lib/discoveryJobTypes';

const LIST_HEIGHT = 560;

/**
 * Not in search yet.
 *
 * `is_discoverable` defaults to false, so content arrives un-findable and stays that way until
 * somebody says otherwise. This is not a cleanup queue for things deliberately hidden — it is the
 * list of items nobody has answered for, which is why an untouched control must never write a
 * decision on their behalf.
 *
 * The two rules the spec is firm about, both visible on every row:
 *   1. The answer names a PERMISSION, not an outcome. A draft can be allowed and still not appear.
 *   2. The recorded decision and any current blocker are different things, shown separately.
 *      Unpublished is an observable fact, never evidence of why something was left out.
 */
export default function JobCVisibility({ onDecided }: { onDecided: () => void }) {
  const [data, setData] = useState<DiscoveryQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'todo' | 'all'>('todo');

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchQueue('visibility', { q: query })); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The list could not be loaded.'); }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const undo = useDiscoveryUndo(useCallback(() => { void load(); onDecided(); }, [load, onDecided]));

  const allItems = useMemo(() => data?.items ?? [], [data]);
  const items = scope === 'todo' ? allItems.filter((entry) => entry.needs) : allItems;
  const item = items[Math.min(focusIndex, Math.max(0, items.length - 1))] ?? null;
  const doneCount = allItems.length - allItems.filter((entry) => entry.needs).length;

  const decide = useCallback(async (target: DiscoveryQueueItem, answer: 'allowed' | 'excluded') => {
    setBusy(true);
    setConflict(null);
    try {
      const before: DiscoveryBeforeImage = {
        kind: target.kind, id: target.id, question: 'visibility',
        answer: target.answer, tagIds: null, token: target.token,
      };
      const result = await recordDecision({
        item: { kind: target.kind, id: target.id }, question: 'visibility', answer, token: target.token,
      });
      if (!result.ok) {
        setConflict(result.removed
          ? 'This was changed outside the job. Reload before answering again.'
          : `${result.decidedBy ?? 'Another administrator'} answered this since you loaded it. Reload before answering again.`);
        return;
      }
      undo.push({
        label: answer === 'allowed' ? 'Allowed in search' : 'Kept out of search',
        itemLabel: target.title.slice(0, 64),
        entries: [before],
      });
      setFocusIndex((current) => Math.min(items.length - 1, current + 1));
      await load();
      onDecided();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The answer could not be recorded.');
    } finally { setBusy(false); }
  }, [items.length, undo, load, onDecided]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (event.key === '/' && !inField) {
        event.preventDefault();
        (document.querySelector('[data-visibility-search] input') as HTMLInputElement | null)?.focus();
        return;
      }
      if (inField || !item || busy) return;
      if (event.key === '1') { event.preventDefault(); void decide(item, 'allowed'); }
      else if (event.key === '2') { event.preventDefault(); void decide(item, 'excluded'); }
      else if (event.key === 's' || event.key === 'S') {
        event.preventDefault(); setFocusIndex((current) => Math.min(items.length - 1, current + 1));
      } else if (event.key === 'z' || event.key === 'Z') { event.preventDefault(); void undo.undo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [item, busy, items.length, decide, undo]);

  return (
    <Stack gap={2}>
      <JobHeading
        title="Not in search yet"
        help="visibility"
        trailing={
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            <Box component="strong" sx={{ fontFamily: 'monospace' }}>{data?.progress.decided ?? 0}</Box>
            {' of '}
            <Box component="strong" sx={{ fontFamily: 'monospace' }}>{data?.progress.population ?? 0}</Box>
            {' done'}
          </Typography>
        }
      >
        These exist but nobody has said whether members should be able to find them. New content arrives
        this way — it stays out of search until someone answers.
      </JobHeading>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {conflict && <Alert severity="warning" onClose={() => setConflict(null)}>{conflict}</Alert>}

      <Stack direction="row" gap={1.5} flexWrap="wrap" useFlexGap alignItems="center">
        <TextField
          size="small" placeholder="Search titles…" value={query} data-visibility-search
          onChange={(event) => setQuery(event.target.value)} sx={{ minWidth: 280 }}
        />
        <Box sx={{ width: '1px', alignSelf: 'stretch', bgcolor: 'divider' }} />
        <Chip label={`To do ${allItems.filter((entry) => entry.needs).length}`} size="small"
          onClick={() => { setScope('todo'); setFocusIndex(0); }}
          color={scope === 'todo' ? 'primary' : 'default'} variant={scope === 'todo' ? 'filled' : 'outlined'} />
        <Chip label={`Everything ${allItems.length}`} size="small"
          onClick={() => { setScope('all'); setFocusIndex(0); }}
          color={scope === 'all' ? 'primary' : 'default'} variant={scope === 'all' ? 'filled' : 'outlined'} />
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 420px' }, gap: 2.5, alignItems: 'start' }}>
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {loading && !data ? (
            <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress size={24} /></Box>
          ) : (
            <>
              <QueueList
                listId="visibility-queue" items={items} focusIndex={focusIndex}
                onFocusIndex={setFocusIndex} height={LIST_HEIGHT} selectable={false}
                // The blocker, never the decision. A draft that has been allowed is still a draft,
                // and saying so on the row is the only way the permission stays honest.
                renderMeta={(entry) => <BlockerLabel item={entry} />}
                emptyMessage={
                  query
                    ? 'Nothing matches that search.'
                    : scope === 'todo'
                      ? doneCount
                        ? 'All caught up — everything has been answered.'
                        : 'Nothing waiting. New content will appear here until someone answers for it.'
                      : 'Nothing here yet.'
                }
              />
              <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap" useFlexGap
                sx={{ px: 1.75, py: 1.25, bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">
                  {items.length} shown{scope === 'todo' && doneCount ? ` · ${doneCount} done` : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                  <strong>↑ ↓</strong> move · <strong>1</strong> allow · <strong>2</strong> keep out ·{' '}
                  <strong>S</strong> skip · <strong>Z</strong> undo · <strong>/</strong> search
                </Typography>
              </Stack>
            </>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', position: 'sticky', top: 12 }}>
          {item ? (
            <>
              <Box sx={{ px: 2, py: 1.75, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  Focused item · {focusIndex + 1} of {items.length}
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.4 }}>
                  {splitTitleMarker(item.title).subject}
                  <Box component="span" sx={{ color: 'text.disabled', fontWeight: 400 }}>
                    {splitTitleMarker(item.title).marker}
                  </Box>
                </Typography>
              </Box>

              <Stack gap={2} sx={{ px: 2, py: 2 }}>
                {item.stale && (
                  <Alert severity="warning" sx={{ py: 0.25 }}>
                    {item.decided_label ?? 'Someone'} answered this
                    {item.decided_at ? ` on ${new Date(item.decided_at).toLocaleDateString()}` : ''}, but the
                    material has changed since. Worth another look.
                  </Alert>
                )}

                <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px' }}>
                  <Typography variant="body2" color="text.secondary">Kind</Typography>
                  <Typography variant="body2">
                    {item.kind === 'node' ? 'Learning node' : 'Resource'} · {formatLabel(item.media_type)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">State</Typography>
                  <Typography variant="body2">{item.state}</Typography>
                  {durationLabel(item.duration) && (
                    <>
                      <Typography variant="body2" color="text.secondary">Length</Typography>
                      <Typography variant="body2">{durationLabel(item.duration)}</Typography>
                    </>
                  )}
                  <Typography variant="body2" color="text.secondary">Now</Typography>
                  <Typography variant="body2">
                    {item.is_discoverable ? 'Can appear in search' : 'Not in search'}
                  </Typography>
                </Box>

                {!!item.placements.length && (
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Used inside</Typography>
                    {item.placements.map((placement) => (
                      <Typography key={`${placement.nodeId}-${placement.position}`} variant="body2" color="text.secondary">
                        {placement.nodeTitle}
                      </Typography>
                    ))}
                  </Box>
                )}

                <AnswerConsequences lines={[
                  ['Allow in search', 'members can be given this as a result, once it is published.'],
                  ['Keep out of search', 'never returned as a result. Members can still reach it through their learning.'],
                ]} />

                <Box
                  component="a" target="_blank" rel="noopener noreferrer"
                  href={item.kind === 'resource' ? `/r/${item.id}` : `/admin/discovery/preview/${item.id}`}
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 13,
                    fontWeight: 600, color: 'primary.dark', textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' } }}
                >
                  {item.kind === 'resource' ? 'Open the material' : 'Preview this'} <OpenInNewIcon fontSize="small" />
                </Box>
              </Stack>

              <Box sx={{ px: 2, py: 1.75, bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
                <Stack gap={1.5}>
                  <DecisionAnswers
                    busy={busy}
                    onSkip={() => setFocusIndex((current) => Math.min(items.length - 1, current + 1))}
                    onAnswer={(value) => void decide(item, value as 'allowed' | 'excluded')}
                    answers={[
                      {
                        value: 'allowed', label: 'Allow in search', shortcut: '1',
                        hint: 'A permission, not a promise — a draft stays invisible until it is published.',
                      },
                      {
                        value: 'excluded', label: 'Keep out of search', shortcut: '2',
                        hint: 'Never returned as a result. Members can still open it through their learning.',
                      },
                    ]}
                  />
                  <UndoLine last={undo.last} onUndo={() => void undo.undo()} busy={undo.busy} note={undo.note} />
                </Stack>
              </Box>
            </>
          ) : (
            <Box sx={{ p: 4 }}>
              <Typography variant="body2" color="text.secondary">
                {loading ? 'Loading…' : 'Select an item to see its details.'}
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </Stack>
  );
}

/**
 * The blocker only. Publication state is never in the visibility evidence, so publishing does not
 * reopen an answer — it is a live fact shown beside the decision, not part of it.
 */
function BlockerLabel({ item }: { item: DiscoveryQueueItem }) {
  if (item.state === 'published') {
    return <Typography variant="caption" color="text.disabled">—</Typography>;
  }
  return (
    <Typography variant="caption" sx={{ color: 'warning.dark' }}>
      {item.state === 'draft' ? 'Draft — not published' : `${item.state} — not published`}
    </Typography>
  );
}
