'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Link as MuiLink, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DiscoveryTagPicker from '@/components/admin/discovery/DiscoveryTagPicker';
import DecisionAnswers from './DecisionAnswers';
import QueueList from './QueueList';
import TopicsBulkBar, { type BulkStage } from './TopicsBulkBar';
import UndoLine from './UndoLine';
import { useDiscoveryUndo } from './useDiscoveryUndo';
import { bulkTopics, fetchQueue, recordDecision } from '@/lib/discoveryJobsClient';
import {
  discoveryJobFormatLabel, durationLabel, formatLabel, refKey, sameRef, splitTitleMarker,
} from '@/lib/discoveryJobTypes';
import type {
  DiscoveryBeforeImage, DiscoveryItemRef, DiscoveryQueueItem, DiscoveryQueueResponse,
} from '@/lib/discoveryJobTypes';
import { JobHeading } from './JobHeading';
import type { DiscoveryTag } from '@/lib/discoveryAdminTypes';

const LIST_HEIGHT = 640;

/** Every per-item map is keyed by the composite identity; a bare id names two different items. */
type DraftMap = Record<string, DiscoveryTag[]>;

export default function JobATopics({ tags, onDecided, onOpenTopicsTab }: {
  tags: DiscoveryTag[];
  onDecided: () => void;
  onOpenTopicsTab: () => void;
}) {
  const [data, setData] = useState<DiscoveryQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<string>('');
  // The queue carries decided items too, so undo and review have something to point at. Showing
  // them by default makes the list stay at the full population while the job card reports what is
  // left — so the default view is unfinished work, and finished decisions are one click away.
  const [scope, setScope] = useState<'todo' | 'all'>('todo');
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [selected, setSelected] = useState<DiscoveryItemRef[]>([]);
  const [bulkStage, setBulkStage] = useState<BulkStage>({ stage: 'idle' });
  const [guard, setGuard] = useState<{ item: DiscoveryQueueItem; proceed: () => void } | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (keepFocus = true) => {
    setLoading(true);
    try {
      const next = await fetchQueue('topics', { q: query, format: format || undefined });
      setData(next);
      setError(null);
      if (!keepFocus) setFocusIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [query, format]);

  useEffect(() => { void load(false); }, [load]);

  const undo = useDiscoveryUndo(useCallback(() => { void load(); }, [load]));

  const allItems = data?.items ?? [];
  const items = scope === 'todo' ? allItems.filter((entry) => entry.needs) : allItems;
  const item = items[Math.min(focusIndex, Math.max(0, items.length - 1))] ?? null;
  const doneCount = allItems.length - allItems.filter((entry) => entry.needs).length;
  const itemKey = item ? refKey(item) : '';

  /** The saved topic set for the focused item, as the server last reported it. */
  const savedTags = useMemo(() => {
    if (!item) return [];
    return item.topics
      .map((topic) => tags.find((tag) => tag.id === topic.id))
      .filter((tag): tag is DiscoveryTag => !!tag);
  }, [item, tags]);

  const draft = itemKey in drafts ? drafts[itemKey] : savedTags;

  /**
   * An unsaved picker edit. Starting bulk on top of one would leave two uncommitted sets of topics
   * on screen at once, one of them off-screen, with nothing distinguishing them.
   */
  const hasDraft = useMemo(() => {
    if (!item || !(itemKey in drafts)) return false;
    const current = drafts[itemKey].map((tag) => tag.id).sort();
    const saved = savedTags.map((tag) => tag.id).sort();
    return current.length !== saved.length || current.some((id, index) => id !== saved[index]);
  }, [item, itemKey, drafts, savedTags]);

  const setDraft = (next: DiscoveryTag[]) => {
    if (!item) return;
    setDrafts((current) => ({ ...current, [itemKey]: next }));
  };

  const clearDraft = (key: string) => setDrafts((current) => {
    const next = { ...current };
    delete next[key];
    return next;
  });

  const advance = useCallback(() => {
    setFocusIndex((current) => Math.min(items.length - 1, current + 1));
  }, [items.length]);

  const decide = useCallback(async (target: DiscoveryQueueItem, answer: 'assigned' | 'none_needed') => {
    const key = refKey(target);
    const chosen = key in drafts ? drafts[key] : target.topics
      .map((topic) => tags.find((tag) => tag.id === topic.id))
      .filter((tag): tag is DiscoveryTag => !!tag);
    if (answer === 'assigned' && !chosen.length) return;
    setBusy(true);
    setConflict(null);
    try {
      const before: DiscoveryBeforeImage = {
        kind: target.kind, id: target.id, question: 'topics',
        answer: target.answer, tagIds: target.topics.map((topic) => topic.id), token: target.token,
      };
      const result = await recordDecision({
        item: { kind: target.kind, id: target.id }, question: 'topics', answer,
        tagIds: answer === 'assigned' ? chosen.map((tag) => tag.id) : null,
        token: target.token,
      });
      if (!result.ok) {
        setConflict(result.removed
          ? 'This decision was removed by an edit made outside the job. Reload before deciding again.'
          : `${result.decidedBy ?? 'Another administrator'} changed this since you loaded it. Reload before deciding again.`);
        return;
      }
      undo.push({
        label: answer === 'assigned' ? 'Topics saved' : 'No topic needed',
        itemLabel: target.title.slice(0, 64),
        entries: [before],
      });
      clearDraft(key);
      advance();
      await load();
      onDecided();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The decision could not be recorded.');
    } finally {
      setBusy(false);
    }
  }, [drafts, tags, undo, advance, load, onDecided]);

  const skip = useCallback(() => {
    // Skip is a fact about a session, not about an item. Nothing is stored; the item returns on
    // the next visit. Moving it to the back of the queue is what solves the real complaint.
    advance();
  }, [advance]);

  const toggleSelect = (ref: DiscoveryItemRef) => {
    setSelected((current) => {
      const exists = current.some((entry) => sameRef(entry, ref));
      const next = exists ? current.filter((entry) => !sameRef(entry, ref)) : [...current, ref];
      if (!next.length) setBulkStage({ stage: 'idle' });
      return next;
    });
  };

  /** Bulk cannot start on top of an unsaved edit. The admin decides first. */
  const startBulk = (stage: BulkStage) => {
    if (hasDraft && item) {
      setGuard({ item, proceed: () => setBulkStage(stage) });
      return;
    }
    setBulkStage(stage);
  };

  const commitBulk = async (tagIds: number[]) => {
    setBusy(true);
    try {
      const byKey = new Map(items.map((entry) => [refKey(entry), entry]));
      const tokens = selected.map((ref) => ({
        kind: ref.kind, id: ref.id, token: byKey.get(refKey(ref))?.token ?? null,
      }));
      const result = await bulkTopics({ items: selected, tagIds, tokens });
      // One undo entry for the whole write: undoing a 23-item bulk reverses all 23 as one action.
      if (result.written.length) {
        undo.push({
          label: `Added ${result.topicCount} topic${result.topicCount > 1 ? 's' : ''}`,
          itemLabel: `${result.written.length} item${result.written.length > 1 ? 's' : ''}`,
          entries: result.written.map((entry) => ({
            kind: entry.kind, id: entry.id, question: 'topics' as const,
            answer: entry.previousAnswer, tagIds: entry.previousTagIds, token: entry.token,
          })),
        });
      }
      if (result.skipped.length) {
        setConflict(`${result.skipped.length} item${result.skipped.length > 1 ? 's were' : ' was'} skipped. ${result.skipped[0].reason}`);
      }
      setSelected([]);
      setBulkStage({ stage: 'idle' });
      await load();
      onDecided();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The bulk write could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  // Shortcuts are supplementary and INERT while a text input, picker or search field has focus.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (event.key === '/' && !inField) {
        event.preventDefault();
        (document.querySelector('[data-topics-search] input') as HTMLInputElement | null)?.focus();
        return;
      }
      if (inField || !item || busy || guard) return;
      if (event.key === '1') { event.preventDefault(); if (draft.length) void decide(item, 'assigned'); }
      else if (event.key === '2') { event.preventDefault(); void decide(item, 'none_needed'); }
      else if (event.key === 's' || event.key === 'S') { event.preventDefault(); skip(); }
      else if (event.key === 'z' || event.key === 'Z') { event.preventDefault(); void undo.undo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [item, draft, busy, guard, decide, skip, undo]);

  const formats = Object.entries(data?.formats ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <Stack gap={2}>
      <JobHeading
        title="Assign topics"
        help="topics"
        trailing={
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            <Box component="strong" sx={{ fontFamily: 'monospace' }}>{data?.progress.decided ?? 0}</Box>
            {' of '}
            <Box component="strong" sx={{ fontFamily: 'monospace' }}>{data?.progress.population ?? 0}</Box>
            {' done'}
          </Typography>
        }
      >
        Choose the topics that describe each item, or record that none apply. Topics affect search only —
        nothing here publishes an item, unhides it, or puts it on the homepage.
      </JobHeading>

      <Alert severity="info">
        Topics don&rsquo;t have browse categories yet, so anything you tag will show under &ldquo;All&rdquo;.
        It&rsquo;s still worth tagging — search uses topics either way.{' '}
        <MuiLink component="button" type="button" onClick={onOpenTopicsTab} sx={{ fontWeight: 600 }}>
          Set categories on the Topics tab →
        </MuiLink>
      </Alert>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {conflict && <Alert severity="warning" onClose={() => setConflict(null)}>{conflict}</Alert>}

      <Stack direction="row" gap={1.5} flexWrap="wrap" useFlexGap alignItems="center">
        {/* Search sits first: it is directly above the list it filters. */}
        <TextField
          size="small" placeholder="Search titles…" value={query} data-topics-search
          onChange={(event) => setQuery(event.target.value)}
          sx={{ minWidth: 280 }}
        />
        <Box sx={{ width: '1px', alignSelf: 'stretch', bgcolor: 'divider' }} />
        <Chip label={`To do ${allItems.filter((entry) => entry.needs).length}`} size="small"
          onClick={() => { setScope('todo'); setFocusIndex(0); }}
          color={scope === 'todo' ? 'primary' : 'default'} variant={scope === 'todo' ? 'filled' : 'outlined'} />
        <Chip label={`Everything ${allItems.length}`} size="small"
          onClick={() => { setScope('all'); setFocusIndex(0); }}
          color={scope === 'all' ? 'primary' : 'default'} variant={scope === 'all' ? 'filled' : 'outlined'} />
        {/* Eight format chips on screen at all times was more filter than anyone needs visible.
            A select keeps the choice available and the toolbar quiet. */}
        <TextField
          select size="small" label="Format" value={format}
          onChange={(event) => { setFormat(event.target.value); setFocusIndex(0); }}
          sx={{ minWidth: 190, ml: 'auto' }}
        >
          <MenuItem value="">All formats ({allItems.length})</MenuItem>
          {formats.map(([value, count]) => (
            <MenuItem key={value} value={value}>
              {value === 'lesson' ? 'Library guide' : formatLabel(value)} ({count})
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 470px' }, gap: 2.5, alignItems: 'start' }}>
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {loading && !data ? (
            <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress size={24} /></Box>
          ) : (
            <>
              <QueueList
                listId="topics-queue" items={items} focusIndex={focusIndex} onFocusIndex={setFocusIndex}
                selected={new Set(selected.map(refKey))} onToggleSelect={toggleSelect} height={LIST_HEIGHT}
                emptyMessage={
                  query || format
                    ? 'Nothing matches these filters.'
                    : scope === 'todo'
                      ? doneCount
                        ? 'All caught up — every item has been decided.'
                        : 'Nothing to decide right now.'
                      : 'Nothing here yet.'
                }
              />
              {/* One footer, not two: the count and the shortcuts are the same kind of aside. */}
              <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap" useFlexGap
                sx={{ px: 1.75, py: 1.25, bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">
                  {items.length} shown{scope === 'todo' && doneCount ? ` · ${doneCount} done` : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                  <strong>↑ ↓</strong> move · <strong>1</strong> save · <strong>2</strong> none needed ·{' '}
                  <strong>S</strong> skip · <strong>Z</strong> undo · <strong>/</strong> search
                </Typography>
              </Stack>
            </>
          )}
        </Paper>

        <Paper variant="outlined" ref={listRef} sx={{ borderRadius: 2, overflow: 'hidden', position: 'sticky', top: 12 }}>
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

              <Box sx={{ px: 2, py: 2, maxHeight: LIST_HEIGHT - 210, overflowY: 'auto' }}>
                <ItemEvidence item={item} />
              </Box>

              <Box sx={{ px: 2, py: 1.75, bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
                <Stack gap={1.5}>
                  {item.stale && (
                    <Alert severity="warning" sx={{ py: 0.25 }}>
                      {item.decided_label ?? 'Someone'} chose{' '}
                      &ldquo;{item.answer === 'assigned' ? 'Save topics' : 'No topic needed'}&rdquo;
                      {item.decided_at ? ` on ${new Date(item.decided_at).toLocaleDateString()}` : ''}, but this item
                      has been edited since. Worth another look.
                    </Alert>
                  )}
                  {/* The picker sits on the footer's tinted ground, so left transparent it read as
                      a label with a stray arrow. A paper fill and a real border make it look like
                      the input it is. Styled from here rather than inside DiscoveryTagPicker, which
                      is shared with the Resource Library and the bulk bar. */}
                  <Box sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: 'background.paper',
                      '& .MuiOutlinedInput-notchedOutline': { borderWidth: 1.5, borderColor: 'text.disabled' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                    },
                    '& .MuiInputLabel-root': { fontWeight: 600 },
                  }}>
                    <DiscoveryTagPicker
                      options={tags} value={draft} size="small" hideHelper
                      label="Which topics describe this?"
                      placeholder="Click to choose topics…"
                      onChange={setDraft}
                    />
                  </Box>
                  <DecisionAnswers
                    busy={busy}
                    onSkip={skip}
                    onAnswer={(value) => void decide(item, value as 'assigned' | 'none_needed')}
                    answers={[
                      {
                        value: 'assigned', label: `Save topics${draft.length ? ` (${draft.length})` : ''}`, shortcut: '1',
                        blockedReason: draft.length ? undefined : 'Choose at least one topic first.',
                        hint: 'Saves the topics you have chosen and moves to the next item.',
                      },
                      {
                        value: 'none_needed', label: 'No topic needed', shortcut: '2',
                        hint: 'Records that no topic describes this item. That is a decision too — it leaves the queue.',
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

      <TopicsBulkBar
        selected={selected} stage={bulkStage} onStage={startBulk} busy={busy} tags={tags}
        onClear={() => { setSelected([]); setBulkStage({ stage: 'idle' }); }}
        onCommit={(tagIds) => void commitBulk(tagIds)}
      />

      <Dialog open={!!guard} onClose={() => setGuard(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Save your changes to this item first?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            You have chosen topics for the focused item but have not recorded them. Starting bulk work would leave
            two uncommitted sets of topics on screen at once.
          </Typography>
          <Paper variant="outlined" sx={{ mt: 1.5, p: 1.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{guard?.item.title}</Typography>
            <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              {draft.length
                ? draft.map((tag) => <Chip key={tag.id} label={tag.name} size="small" variant="outlined" />)
                : <Typography variant="caption" color="text.disabled">No topics chosen</Typography>}
            </Stack>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setGuard(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            onClick={() => { if (guard) { clearDraft(refKey(guard.item)); guard.proceed(); setGuard(null); } }}
            sx={{ textTransform: 'none' }}
          >
            Discard changes
          </Button>
          <Button
            variant="outlined"
            onClick={async () => {
              if (!guard) return;
              const proceed = guard.proceed;
              setGuard(null);
              await decide(guard.item, 'assigned');
              proceed();
            }}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Save changes
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/**
 * The panel carries the evidence relevant to THIS job — not everything known about the item.
 * Job A needs description, placements and a way to open the material; it does not need homepage
 * warnings. Where a description is absent the panel says so plainly and carries on with what exists.
 */
function ItemEvidence({ item }: { item: DiscoveryQueueItem }) {
  const length = durationLabel(item.duration);
  return (
    <Stack gap={2}>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>Item</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 14 }}>
          <Typography variant="body2" color="text.secondary">Kind</Typography>
          <Typography variant="body2">
            {item.kind === 'node' ? discoveryJobFormatLabel(item) : `Resource · ${formatLabel(item.media_type)}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">State</Typography>
          <Typography variant="body2">{item.state}</Typography>
          {length && (
            <>
              <Typography variant="body2" color="text.secondary">Length</Typography>
              <Typography variant="body2">{length}</Typography>
            </>
          )}
        </Box>
      </Box>

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Description</Typography>
        <Typography variant="body2" color={item.description ? 'text.primary' : 'text.disabled'} sx={{ lineHeight: 1.6 }}>
          {item.description || 'No description available.'}
        </Typography>
      </Box>

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
          {item.placements.length > 1 ? 'Appears inside these guides' : 'Appears inside'}
        </Typography>
        {item.placements.length ? (
          <Stack gap={0.75}>
            {item.placements.map((placement) => (
              <Paper key={`${placement.nodeId}-${placement.position}`} variant="outlined"
                sx={{ p: 1.25, borderLeft: '3px solid', borderLeftColor: 'primary.main', bgcolor: 'action.hover' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{placement.nodeTitle}</Typography>
                <Typography variant="caption" color="text.disabled">
                  {formatLabel(placement.nodeType)} · position {placement.position}
                </Typography>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.disabled">
            {item.kind === 'resource' ? 'Not used inside any guide.' : 'Not applicable to learning nodes.'}
          </Typography>
        )}
      </Box>

      <Divider />
      {/* The panel never embeds the material: a PDF or audio player in a third of a column
          serves nobody. One action, new tab. */}
      <Button
        size="small" startIcon={<OpenInNewIcon fontSize="small" />}
        component="a" target="_blank" rel="noopener noreferrer"
        href={item.kind === 'resource' ? `/r/${item.id}` : `/admin/discovery/preview/${item.id}`}
        sx={{ textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start' }}
      >
        {item.kind === 'resource'
          ? 'Open the material'
          : item.media_type === 'course' ? 'Preview this course' : 'Preview this Library guide'}
      </Button>
    </Stack>
  );
}
