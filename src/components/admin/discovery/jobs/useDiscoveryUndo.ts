'use client';

import { useCallback, useState } from 'react';
import { undoDecisions } from '@/lib/discoveryJobsClient';
import type { DiscoveryUndoEntry } from '@/lib/discoveryJobTypes';

/**
 * The undo stack.
 *
 * It holds BEFORE-IMAGES, not operations: undo restores the exact prior state, so if topics were
 * [hiring, interviewing] and were replaced, those two come back. A bulk write is ONE entry
 * covering every item it touched, and undoing it reverses all of them as a single action.
 *
 * In-memory session state by design. It survives moving between tabs inside Discovery admin and is
 * discarded on navigating elsewhere, on refresh and on sign-out — Find content is the durable
 * recovery route, and two mechanisms claiming to be that route would be worse than one.
 */
export function useDiscoveryUndo(onAfterUndo: () => void) {
  const [stack, setStack] = useState<DiscoveryUndoEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const push = useCallback((entry: DiscoveryUndoEntry) => {
    setStack((current) => [...current.slice(-24), entry]);
    setNote(null);
  }, []);

  const clear = useCallback(() => { setStack([]); setNote(null); }, []);

  const undo = useCallback(async () => {
    const entry = stack[stack.length - 1];
    if (!entry || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await undoDecisions(entry.entries);
      setStack((current) => current.slice(0, -1));
      // A bulk undo that restores 20 of 23 must say which three it did not, and why.
      if (result.skipped.length) {
        setNote(result.skipped.length === entry.entries.length
          ? `Nothing was undone. ${result.skipped[0].reason}`
          : `${result.restored.length} of ${entry.entries.length} undone. ${result.skipped.length} skipped: ${result.skipped[0].reason}`);
      }
      onAfterUndo();
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'The undo could not be confirmed.');
    } finally {
      setBusy(false);
    }
  }, [stack, busy, onAfterUndo]);

  return { last: stack[stack.length - 1] ?? null, depth: stack.length, push, undo, clear, busy, note };
}
