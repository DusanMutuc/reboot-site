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

export function parseEditorDeepLinkId(raw: string | null): number | null {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** `?node=` and `?block=` let another screen deep-link into a specific place in a guide. */
function initialFromUrl(key: string): number | null {
  if (typeof window === 'undefined') return null;
  return parseEditorDeepLinkId(new URLSearchParams(window.location.search).get(key));
}

export function EditorStoreProvider({ children }: { children: ReactNode }) {
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(() => initialFromUrl('node'));
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(() => initialFromUrl('block'));
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
