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

  const save = useCallback((action: 'start' | 'complete'): Promise<void> => {
    if (!nodeId) return Promise.resolve();
    const key = `${nodeId}:${action}`;
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
  }, [nodeId]);

  const markStarted = useCallback(() => save('start'), [save]);
  const markCompleted = useCallback(() => save('complete'), [save]);
  return { markStarted, markCompleted };
}
