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
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  const markStarted = useCallback(async () => {
    if (!nodeId || startedRef.current) return;
    startedRef.current = true;
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[progress] markStarted', { nodeId });
      }
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start', nodeId }),
      });
      if (!response.ok) {
        const errorBody = await extractErrorBody(response);
        if (process.env.NODE_ENV !== 'production') {
          console.error('[progress] markStarted failed', {
            nodeId,
            status: response.status,
            statusText: response.statusText,
            body: errorBody,
          });
        }
        const detail = formatProgressErrorDetail(errorBody);
        throw new Error(
          `Failed to mark node ${nodeId} as started (${response.status} ${response.statusText})${
            detail ? `: ${detail}` : ''
          }`,
        );
      }
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[progress] markStarted succeeded', { nodeId });
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[progress] markStarted encountered an error', { nodeId, error });
      }
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
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'complete', nodeId }),
      });
      if (!response.ok) {
        const errorBody = await extractErrorBody(response);
        if (process.env.NODE_ENV !== 'production') {
          console.error('[progress] markCompleted failed', {
            nodeId,
            status: response.status,
            statusText: response.statusText,
            body: errorBody,
          });
        }
        const detail = formatProgressErrorDetail(errorBody);
        throw new Error(
          `Failed to mark node ${nodeId} as completed (${response.status} ${response.statusText})${
            detail ? `: ${detail}` : ''
          }`,
        );
      }
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[progress] markCompleted succeeded', { nodeId });
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[progress] markCompleted encountered an error', { nodeId, error });
      }
      completedRef.current = false;
      throw error;
    }
  }, [nodeId]);

  return { markStarted, markCompleted };
}
