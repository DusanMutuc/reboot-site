import { useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

type UndoRedoHistory = {
  past: string[];
  future: string[];
};

type UseUndoRedoInputOptions = {
  value: string;
  onChange: (next: string) => void;
  scopeKey?: unknown;
  maxDepth?: number;
};

function createInitialHistory(): UndoRedoHistory {
  return { past: [], future: [] };
}

export function useUndoRedoInput({
  value,
  onChange,
  scopeKey,
  maxDepth = 100,
}: UseUndoRedoInputOptions) {
  const historyRef = useRef<UndoRedoHistory>(createInitialHistory());
  const valueRef = useRef(value);
  const scopeRef = useRef(scopeKey);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (scopeRef.current === scopeKey) {
      return;
    }
    scopeRef.current = scopeKey;
    historyRef.current = createInitialHistory();
    valueRef.current = value;
  }, [scopeKey, value]);

  const commitChange = useCallback(
    (next: string, recordHistory: boolean) => {
      const current = valueRef.current;
      if (recordHistory) {
        if (next === current) {
          return;
        }
        const nextPast = historyRef.current.past.concat(current);
        if (nextPast.length > maxDepth) {
          nextPast.splice(0, nextPast.length - maxDepth);
        }
        historyRef.current = { past: nextPast, future: [] };
      }
      valueRef.current = next;
      onChange(next);
    },
    [maxDepth, onChange],
  );

  const handleChange = useCallback(
    (next: string) => {
      commitChange(next, true);
    },
    [commitChange],
  );

  const handleUndo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (past.length === 0) {
      return;
    }
    const previous = past[past.length - 1];
    const current = valueRef.current;
    historyRef.current = {
      past: past.slice(0, -1),
      future: future.concat(current),
    };
    commitChange(previous, false);
  }, [commitChange]);

  const handleRedo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (future.length === 0) {
      return;
    }
    const next = future[future.length - 1];
    const current = valueRef.current;
    historyRef.current = {
      past: past.concat(current),
      future: future.slice(0, -1),
    };
    commitChange(next, false);
  }, [commitChange]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (key === 'y') {
        event.preventDefault();
        handleRedo();
      }
    },
    [handleRedo, handleUndo],
  );

  const resetHistory = useCallback(() => {
    historyRef.current = createInitialHistory();
    valueRef.current = value;
  }, [value]);

  return { handleChange, handleKeyDown, resetHistory };
}
