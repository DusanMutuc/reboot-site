'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type SavingState = 'idle' | 'saving' | 'saved' | 'error';

export type EditorStoreValue = {
  selectedNodeId: number | null;
  selectedBlockId: number | null;
  savingState: SavingState;
  savingMessage: string;
  setSelectedNodeId: (nodeId: number | null) => void;
  setSelectedBlockId: (blockId: number | null) => void;
  setSavingState: (state: SavingState, message?: string) => void;
};

const EditorStoreContext = createContext<EditorStoreValue | undefined>(undefined);

export function EditorStoreProvider({ children }: { children: ReactNode }) {
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [savingState, setSavingStateValue] = useState<SavingState>('idle');
  const [savingMessage, setSavingMessage] = useState('All changes saved');

  const setSavingState = (state: SavingState, message?: string) => {
    setSavingStateValue(state);
    if (message) {
      setSavingMessage(message);
    } else if (state === 'idle') {
      setSavingMessage('All changes saved');
    }
  };

  const value = useMemo(
    () => ({
      selectedNodeId,
      selectedBlockId,
      savingState,
      savingMessage,
      setSelectedNodeId,
      setSelectedBlockId,
      setSavingState,
    }),
    [selectedNodeId, selectedBlockId, savingState, savingMessage],
  );

  return <EditorStoreContext.Provider value={value}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStore() {
  const context = useContext(EditorStoreContext);
  if (!context) {
    throw new Error('useEditorStore must be used within an EditorStoreProvider');
  }
  return context;
}
