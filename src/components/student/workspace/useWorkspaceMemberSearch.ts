'use client';

import { useEffect, useState } from 'react';

type Member = { id: string; full_name: string };
type InputState = { kind: 'search'; text: string } | { kind: 'selection'; text: string; id: string };

// Search belongs to the field, not to the asynchronously loaded member value.
// Keep it local so typing does not render the active coaching workspace again.
export function useWorkspaceMemberSearch(selectedMember: Member | null) {
  const [input, setInput] = useState<InputState | null>(null);

  useEffect(() => {
    if (input?.kind === 'selection' && input.id === selectedMember?.id) setInput(null);
  }, [input, selectedMember?.id]);

  return {
    inputValue: input?.text ?? selectedMember?.full_name ?? '',
    onInputChange: (_event: unknown, text: string, reason: string) => {
      // MUI emits reset when the roster arrives or a selected member is reloaded.
      // It can also restore the label on blur; neither should erase a search.
      if (reason === 'input' || reason === 'clear') setInput({ kind: 'search', text });
    },
    selectionApplied: (member: Member) => setInput({ kind: 'selection', id: member.id, text: member.full_name }),
  };
}
