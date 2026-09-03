'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Divider, Stack, Typography } from '@mui/material';
import DecisionAnswers from '@/components/admin/discovery/jobs/DecisionAnswers';
import { fetchItemDecision, recordDecision } from '@/lib/discoveryJobsClient';
import type { ItemDecision } from '@/lib/discoveryJobsClient';

/**
 * The standalone-use decision, made where the guide is already on screen.
 *
 * This is the same formal placement decision the review inbox tracks — recorded through
 * `admin_record_discovery_decision`, never by writing `discovery_open_mode` directly. That
 * distinction is load-bearing: an edit to the setting made outside the decision flow SUPERSEDES
 * the decision, deleting it. Writing the column here would silently erase the record and push the
 * item back into the queue.
 *
 * Answering here removes the item from the queue immediately, which is what stops the backlog
 * growing: a resource added to a guide today can be judged while the guide is being assembled,
 * rather than waiting to be found by a sweep months later.
 */
export default function StandaloneUseSection({ resourceId, onDecided }: {
  resourceId: number;
  onDecided?: () => void;
}) {
  const [state, setState] = useState<ItemDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setState(await fetchItemDecision('resource', resourceId, 'placement')); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load this setting.'); }
    finally { setLoading(false); }
  }, [resourceId]);

  useEffect(() => { void load(); }, [load]);

  const answer = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await recordDecision({
        item: { kind: 'resource', id: resourceId }, question: 'placement',
        answer: value, token: state?.token ?? null,
      });
      if (!result.ok) {
        setError(result.removed
          ? 'This was changed outside the builder. Reload before answering again.'
          : `${result.decidedBy ?? 'Someone else'} answered this since you opened it. Reload before answering again.`);
        return;
      }
      await load();
      onDecided?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The answer could not be saved.');
    } finally { setBusy(false); }
  };

  const placements = state?.placements ?? [];
  const elsewhere = placements.length > 1;

  // The question only exists for a resource that sits inside a guide. Asking it of a standalone
  // resource — a brand new one, say — would be asking whether it works outside a context it does
  // not have.
  if (!loading && !placements.length) return null;

  return (
    <Box>
      <Divider sx={{ mb: 2 }} />
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        Can members open this on its own?
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, lineHeight: 1.5 }}>
        Some resources only make sense alongside the lesson around them.
      </Typography>

      {loading && <Box sx={{ py: 2, textAlign: 'center' }}><CircularProgress size={18} /></Box>}

      {!loading && (
        <Stack gap={1.5}>
          {error && <Alert severity="warning" onClose={() => setError(null)}>{error}</Alert>}

          {elsewhere && (
            <Alert severity="info" icon={false} sx={{ py: 0.5 }}>
              Also used in {state!.placements.length - 1} other{' '}
              {state!.placements.length === 2 ? 'lesson' : 'lessons'}. Your answer applies everywhere it
              appears: {state!.placements.map((placement) => placement.nodeTitle).join(', ')}.
            </Alert>
          )}

          {state?.stale && (
            <Alert severity="warning" sx={{ py: 0.5 }}>
              {state.decidedLabel ?? 'Someone'} answered this
              {state.decidedAt ? ` on ${new Date(state.decidedAt).toLocaleDateString()}` : ''}, but the blocks
              around it have changed since. Worth another look.
            </Alert>
          )}

          {state?.answer && !state.stale && (
            <Typography variant="body2" sx={{ color: 'primary.dark', fontWeight: 600 }}>
              Answered: {state.answer === 'direct' ? 'yes — it works on its own' : 'no — keep it with its lesson'}
              {state.decidedLabel ? ` · ${state.decidedLabel}` : ''}
              {state.decidedAt ? ` · ${new Date(state.decidedAt).toLocaleDateString()}` : ''}
            </Typography>
          )}

          <DecisionAnswers
            compact busy={busy}
            answers={[
              {
                value: 'direct', label: 'Yes, on its own', shortcut: '1',
                hint: 'Search can return this resource by itself, with a link to its lesson.',
              },
              {
                value: 'context', label: 'No, keep with lesson', shortcut: '2',
                hint: 'Search returns the lesson containing it, rather than the resource by itself.',
              },
            ]}
            onAnswer={(value) => void answer(value)}
          />

          <Typography variant="caption" color="text.disabled">
            Either answer settles it and clears this from the standalone-use list.
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
