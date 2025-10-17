import { useCallback, useRef } from 'react';

export function useNodeProgress(nodeId: number | null) {
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  const markStarted = useCallback(() => {
    if (!nodeId || startedRef.current) return;
    startedRef.current = true;
    void fetch('/api/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start', nodeId }),
    }).catch(() => {});
  }, [nodeId]);

  const markCompleted = useCallback(() => {
    if (!nodeId || completedRef.current) return;
    completedRef.current = true;
    void fetch('/api/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'complete', nodeId }),
    }).catch(() => {});
  }, [nodeId]);

  return { markStarted, markCompleted };
}
