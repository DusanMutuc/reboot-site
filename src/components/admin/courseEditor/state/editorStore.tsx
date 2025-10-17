'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

export type SavingState = 'idle' | 'saving' | 'saved' | 'error';

export type EditorMode = 'edit' | 'preview';

export type EditorStoreValue = {
  selectedNodeId: number | null;
  selectedBlockId: number | null;
  editingBlockId: number | null;
  savingState: SavingState;
  savingMessage: string;
  editorMode: EditorMode;
  setSelectedNodeId: Dispatch<SetStateAction<number | null>>;
  setSelectedBlockId: Dispatch<SetStateAction<number | null>>;
  setEditingBlockId: Dispatch<SetStateAction<number | null>>;
  setSavingState: (state: SavingState, message?: string) => void;
  setEditorMode: (mode: EditorMode) => void;
};

const EditorStoreContext = createContext<EditorStoreValue | undefined>(undefined);

export function EditorStoreProvider({ children }: { children: ReactNode }) {
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);
  const [savingState, setSavingStateValue] = useState<SavingState>('idle');
  const [savingMessage, setSavingMessage] = useState('All changes saved');
  const [editorMode, setEditorMode] = useState<EditorMode>('edit');

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
      editingBlockId,
      savingState,
      savingMessage,
      editorMode,
      setSelectedNodeId,
      setSelectedBlockId,
      setEditingBlockId,
      setSavingState,
      setEditorMode,
    }),
    [
      selectedNodeId,
      selectedBlockId,
      editingBlockId,
      savingState,
      savingMessage,
      editorMode,
    ],
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
