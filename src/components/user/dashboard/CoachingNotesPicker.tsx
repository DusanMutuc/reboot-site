// src/components/user/dashboard/CoachingNotesPicker.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { Box, Paper, Stack, Typography, FormControl, InputLabel, Select, MenuItem, CircularProgress } from '@mui/material';
import { supabase } from '@/lib/supabaseClient';
import { listUserCoachingNotes, fetchCoachingNotesByNoteId } from '@/lib/dashboard';
import type { CoachingNoteListItem, CoachingNotesSectionProps } from '@/types/dashboard';

type Props = {
  userId: string;
  title?: string;
  initialNoteId?: number;
  onSectionChange?: (section: CoachingNotesSectionProps, noteId: number) => void;
  showPreview?: boolean; // 👈 NEW: default false for sidebar-only
};

export default function CoachingNotesPicker({
  userId,
  title = 'Coaching Notes & Action Steps',
  initialNoteId,
  onSectionChange,
  showPreview = false,
}: Props) {
  const [options, setOptions] = useState<CoachingNoteListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [section, setSection] = useState<CoachingNotesSectionProps | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);

  // keep the callback stable
  const cbRef = useRef<Props['onSectionChange']>(undefined);
  cbRef.current = onSectionChange;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingList(true);
      const list = await listUserCoachingNotes(supabase, userId);
      if (!alive) return;
      setOptions(list);
      const defaultId = initialNoteId ?? list[0]?.id ?? '';
      setSelectedId(defaultId);
      if (typeof defaultId === 'number') {
        const s = await fetchCoachingNotesByNoteId(supabase, defaultId);
        if (!alive) return;
        setSection(s);
        cbRef.current?.(s, defaultId);
      } else {
        const empty = { actionSteps: [], notes: [] };
        setSection(empty);
        cbRef.current?.(empty, -1);
      }
      setLoadingList(false);
    })();
    // ❌ don't depend on onSectionChange (it changes every render)
  }, [userId, initialNoteId]);

  const onChange = async (id: number) => {
    setSelectedId(id);
    setLoadingSection(true);
    const s = await fetchCoachingNotesByNoteId(supabase, id);
    setSection(s);
    setLoadingSection(false);
    cbRef.current?.(s, id);
  };

  return (
    <Paper sx={{ p: 3, borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} mb={2}>
        <Typography variant="h6" fontWeight={600}>{title}</Typography>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel id="notes-select-label">Select session</InputLabel>
          <Select
            labelId="notes-select-label"
            label="Select session"
            value={selectedId}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={loadingList || options.length === 0}
          >
            {options.map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {/* Sidebar: hide preview to avoid layout churn */}
      {showPreview ? (
        loadingList ? (
          <Box flex={1} display="flex" alignItems="center" justifyContent="center"><CircularProgress /></Box>
        ) : loadingSection || !section ? (
          <Box flex={1} display="flex" alignItems="center" justifyContent="center"><CircularProgress size={20} /></Box>
        ) : (
          // if you want a preview, render your CoachingNotesSection here
          // <CoachingNotesSection {...section} />
          <></>
        )
      ) : null}
    </Paper>
  );
}
