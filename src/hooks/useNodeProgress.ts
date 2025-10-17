import { useCallback, useRef } from 'react';

export function useNodeProgress(nodeId: number | null) {
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  const markStarted = useCallback(async () => {
    if (!nodeId || startedRef.current) return;
    startedRef.current = true;
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[progress] markStarted', { nodeId });
      }
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start', nodeId }),
      });
    } catch (error) {
      startedRef.current = false;
      throw error;
    }
  }, [nodeId]);

  const markCompleted = useCallback(async () => {
    if (!nodeId || completedRef.current) return;
    completedRef.current = true;
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[progress] markCompleted', { nodeId });
      }
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'complete', nodeId }),
      });
    } catch (error) {
      completedRef.current = false;
      throw error;
    }
  }, [nodeId]);

  return { markStarted, markCompleted };
}
