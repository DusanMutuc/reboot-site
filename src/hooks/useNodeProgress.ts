import { useCallback, useRef } from 'react';

async function extractErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    try {
      return await response.clone().text();
    } catch {
      return null;
    }
  }
}

function formatProgressErrorDetail(body: unknown): string | undefined {
  if (body == null || body === '') {
    return undefined;
  }

  if (typeof body === 'string') {
    return body;
  }

  try {
    return JSON.stringify(body);
  } catch {
    return undefined;
  }
}

export function useNodeProgress(nodeId: number | null) {
  // A LessonContent instance survives navigation. Keep each node's acknowledged
  // and in-flight writes separate, and let concurrent callers await the same save.
  const requests = useRef(new Map<string, Promise<void>>());
  const visit = useRef({ nodeId, number: 0 });
  if (visit.current.nodeId !== nodeId) {
    visit.current = { nodeId, number: visit.current.number + 1 };
  }
  const visitNumber = visit.current.number;

  const save = useCallback((action: 'start' | 'complete'): Promise<void> => {
    if (!nodeId) return Promise.resolve();
    // Starting an unfinished lesson again updates its existing server timestamp,
    // so Continue follows the latest visit on every device. Completion remains
    // deduplicated and monotonic when a completed lesson is reviewed.
    const key = action === 'start' ? `${nodeId}:start:${visitNumber}` : `${nodeId}:complete`;
    const existing = requests.current.get(`${nodeId}:complete`) ?? requests.current.get(key);
    if (existing) return existing;

    const pending = (async () => {
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, nodeId }),
      });
      if (!response.ok) {
        const detail = formatProgressErrorDetail(await extractErrorBody(response));
        throw new Error(
          `Failed to save progress for node ${nodeId} (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`,
        );
      }
    })();
    requests.current.set(key, pending);
    // Failed attempts can be retried. A late failure only clears its own node.
    void pending.catch(() => {
      if (requests.current.get(key) === pending) requests.current.delete(key);
    });
    return pending;
  }, [nodeId, visitNumber]);

  const markStarted = useCallback(() => save('start'), [save]);
  const markCompleted = useCallback(() => save('complete'), [save]);
  return { markStarted, markCompleted };
}
