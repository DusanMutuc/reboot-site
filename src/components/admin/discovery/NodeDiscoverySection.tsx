'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Divider, Stack, TextField, Typography,
} from '@mui/material';
import DiscoveryTagPicker from './DiscoveryTagPicker';
import DiscoveryOutcomePreview from './DiscoveryOutcome';
import DecisionAnswers from './jobs/DecisionAnswers';
import { discoveryAdminRequest, readDiscoveryResponse } from '@/lib/discoveryAdminClient';
import { fetchItemDecision, recordDecision } from '@/lib/discoveryJobsClient';
import { splitDiscoveryNames } from '@/lib/discoveryAdminTypes';
import type { DiscoveryAdminItem, DiscoveryTag } from '@/lib/discoveryAdminTypes';
import type { ItemDecision } from '@/lib/discoveryJobsClient';

/**
 * How a Library guide or whole course is found, decided where it is being built.
 *
 * Replaces the old "Edit discovery settings" dialog, which exposed the same fields but wrote them
 * through `admin_update_discovery_items`. That is an *external* edit, so under our own supersession
 * rule it deleted the decision recorded in the jobs — tag a guide there and it reappeared in the
 * Assign topics queue with no explanation. It also replaced the whole topic set through a path the
 * jobs never use.
 *
 * Topics and visibility are recorded here as real decisions, so answering in the builder clears the
 * item from its queue instead of fighting it. Alternate names stay an ordinary field: they are
 * vocabulary, not a judgement, so there is no decision to record and nothing to supersede.
 */
export default function NodeDiscoverySection({ nodeId }: { nodeId: number }) {
  const [item, setItem] = useState<DiscoveryAdminItem | null>(null);
  const [tags, setTags] = useState<DiscoveryTag[]>([]);
  const [topicsDecision, setTopicsDecision] = useState<ItemDecision | null>(null);
  const [visibilityDecision, setVisibilityDecision] = useState<ItemDecision | null>(null);
  const [draft, setDraft] = useState<DiscoveryTag[]>([]);
  const [names, setNames] = useState('');
  const [namesBaseline, setNamesBaseline] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, vocabulary, topics, visibility] = await Promise.all([
        fetch(`/api/admin/discovery?kind=guide&id=${nodeId}`)
          .then((response) => readDiscoveryResponse<{ item: DiscoveryAdminItem }>(response)),
        fetch('/api/admin/discovery?view=vocabulary')
          .then((response) => readDiscoveryResponse<{ tags: DiscoveryTag[] }>(response)),
        fetchItemDecision('node', nodeId, 'topics'),
        fetchItemDecision('node', nodeId, 'visibility'),
      ]);
      setItem(detail.item);
      setTags(vocabulary.tags);
      setTopicsDecision(topics);
      setVisibilityDecision(visibility);
      setDraft(vocabulary.tags.filter((tag) => detail.item.tag_ids.includes(tag.id)));
      const joined = (detail.item.search_names ?? []).join('\n');
      setNames(joined);
      setNamesBaseline(joined);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'These settings could not be loaded.');
    } finally { setLoading(false); }
  }, [nodeId]);

  useEffect(() => { void load(); }, [load]);

  const answer = async (question: 'topics' | 'visibility', value: string, tagIds?: number[]) => {
    setBusy(true);
    setError(null);
    setSaved(null);
    const current = question === 'topics' ? topicsDecision : visibilityDecision;
    try {
      const result = await recordDecision({
        item: { kind: 'node', id: nodeId }, question, answer: value,
        tagIds: tagIds ?? null, token: current?.token ?? null,
      });
      if (!result.ok) {
        setError(result.removed
          ? 'This was changed outside the builder. Reload before answering again.'
          : `${result.decidedBy ?? 'Someone else'} answered this since you opened it. Reload before answering again.`);
        return;
      }
      setSaved(question === 'topics' ? 'Topics saved' : 'Search visibility saved');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be saved.');
    } finally { setBusy(false); }
  };

  const saveNames = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await discoveryAdminRequest({
        operation: 'update_items', nodeIds: [nodeId], searchNames: splitDiscoveryNames(names),
      });
      setSaved('Alternate names saved');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The names could not be saved.');
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <Box>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ py: 2, textAlign: 'center' }}><CircularProgress size={18} /></Box>
      </Box>
    );
  }
  if (!item) {
    return (
      <Box>
        <Divider sx={{ mb: 2 }} />
        {error && <Alert severity="warning">{error}</Alert>}
      </Box>
    );
  }

  const searchable = item.is_discoverable;
  const namesDirty = names !== namesBaseline;
  const topicsNote = topicsDecision?.answer
    ? (topicsDecision.answer === 'assigned' ? 'Saved' : 'Recorded as none needed')
      + (topicsDecision.decidedLabel ? ` by ${topicsDecision.decidedLabel}` : '')
    : 'Not yet recorded';

  return (
    <Box>
      <Divider sx={{ mb: 2 }} />
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>How members find this</Typography>

      <Stack gap={2.5}>
        {error && <Alert severity="warning" onClose={() => setError(null)} sx={{ py: 0 }}>{error}</Alert>}
        {saved && <Alert severity="success" onClose={() => setSaved(null)} sx={{ py: 0 }}>{saved}</Alert>}

        {/* The one part of the old dialog worth keeping: what these settings mean for a member.
            Dense here — in a sidebar the full version dominated everything below it. */}
        <DiscoveryOutcomePreview
          dense
          visibility={searchable ? 'search_only' : 'hidden'}
          openMode="context" embedded={false} kind="guide"
          mediaType={item.media_type} state={item.state}
          hasCategory={tags.some((tag) => item.tag_ids.includes(tag.id) && !!tag.browse_category)}
        />

        <Field label="Topics" note={topicsNote}>
          <DiscoveryTagPicker
            options={tags} value={draft} size="small" hideHelper label={null}
            placeholder="Click to choose topics…"
            onChange={setDraft}
          />
          {topicsDecision?.stale && (
            <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
              Answered before, but the title or description has changed since.
            </Alert>
          )}
          <Box sx={{ mt: 1 }}>
            <DecisionAnswers
              compact busy={busy}
              answers={[
                {
                  value: 'assigned', label: `Save${draft.length ? ` (${draft.length})` : ''}`, shortcut: '1',
                  blockedReason: draft.length ? undefined : 'Choose at least one topic first.',
                  hint: 'Saves exactly the topics selected above — anything you removed is removed.',
                },
                {
                  value: 'none_needed', label: 'None needed', shortcut: '2',
                  hint: 'Records that no topic describes this. That is a decision too — it leaves the queue.',
                },
              ]}
              onAnswer={(value) => void answer('topics', value, value === 'assigned' ? draft.map((tag) => tag.id) : undefined)}
            />
          </Box>
        </Field>

        <Field
          label="Appearing in search"
          note={
            <>
              {searchable ? 'Currently allowed' : 'Currently kept out'}
              {/* A setting is not a decision. Saying which of the two this is keeps the whole model
                  honest — a value nobody chose must never read as a recorded answer. */}
              {visibilityDecision?.answer
                ? ` · recorded${visibilityDecision.decidedLabel ? ` by ${visibilityDecision.decidedLabel}` : ''}`
                : ' · not yet recorded'}
            </>
          }
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, lineHeight: 1.5 }}>
            A permission, not a promise — a draft can be allowed and still not appear until published.
          </Typography>
          <DecisionAnswers
            compact busy={busy}
            answers={[
              {
                value: 'allowed', label: 'Allow', shortcut: '1',
                hint: 'Members can be given this as a search result, once it is published.',
              },
              {
                value: 'excluded', label: 'Keep out', shortcut: '2',
                hint: 'Never returned as a search result. Members can still reach it through their learning.',
              },
            ]}
            onAnswer={(value) => void answer('visibility', value)}
          />
        </Field>

        {/* "Alternate names" is the term the specs use; on screen it needs to say what it does.
            These go into this item's search vector at weight A — the same weight as its title —
            and belong to this item alone. Topics say what something is about; this just says
            "also find it by these words". */}
        <Field label="Also findable by" note="This item only">
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, lineHeight: 1.5 }}>
            Words a member might search that aren&rsquo;t in the title. Counted as strongly as the title.
          </Typography>
          <TextField
            multiline minRows={2} size="small" fullWidth value={names} disabled={busy}
            placeholder="One word or phrase per line"
            onChange={(event) => setNames(event.target.value)}
          />
          <Button
            size="small" variant="outlined" disabled={busy || !namesDirty} onClick={() => void saveNames()}
            sx={{ mt: 1, textTransform: 'none', fontWeight: 600 }}
          >
            Save
          </Button>
        </Field>
      </Stack>
    </Box>
  );
}

/** One labelled group, so three different questions do not read as one wall of teal buttons. */
function Field({ label, note, children }: {
  label: string; note?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Box>
      <Stack direction="row" alignItems="baseline" gap={1} sx={{ mb: 0.75 }} flexWrap="wrap">
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
        {note && <Typography variant="caption" color="text.disabled">{note}</Typography>}
      </Stack>
      {children}
    </Box>
  );
}
