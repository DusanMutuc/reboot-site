'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';

import { supabase } from '@/lib/supabaseClient';
import { fetchCoachingNotesByNoteId } from '@/lib/dashboard';
import type { CoachingCycle, CoachingCyclesPayload } from '@/lib/coachingCycles';
import type { CoachingNotesSectionProps } from '@/types/dashboard';

type Props = {
  userId: string;
  title?: string;
  initialNoteId?: number;
  onSectionChange?: (section: CoachingNotesSectionProps, noteId: number) => void;
  showPreview?: boolean;
};

type ApiErrorBody = {
  error?: string;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatCycleDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function formatCycleLabel(cycle: CoachingCycle, activeCycleId: string | null) {
  const kind = cycle.kind === 'business_audit' ? 'Business Review' : 'M2';
  const active = cycle.id === activeCycleId ? ' · Active' : '';
  return `${kind} — ${formatCycleDate(cycle.cycleDate)}${active}`;
}

export default function CoachingNotesPicker({
  userId,
  title = 'Coaching History',
  initialNoteId,
  onSectionChange,
  showPreview = false,
}: Props) {
  const [options, setOptions] = useState<CoachingCycle[]>([]);
  const [activeCycleId, setActiveCycleId] = useState<string | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [section, setSection] = useState<CoachingNotesSectionProps | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackRef = useRef<Props['onSectionChange']>(undefined);
  callbackRef.current = onSectionChange;

  useEffect(() => {
    const controller = new AbortController();

    setLoadingList(true);
    setError(null);
    setOptions([]);
    setActiveCycleId(null);
    setSelectedCycleId('');
    setSection(null);

    const loadCycles = async () => {
      try {
        const response = await fetch(
          `/api/coaching-cycles?userId=${encodeURIComponent(userId)}`,
          { cache: 'no-store', signal: controller.signal },
        );
        const body = (await response.json()) as CoachingCyclesPayload & ApiErrorBody;

        if (!response.ok) {
          throw new Error(body.error || 'Failed to load coaching history.');
        }

        const selectable = (body.cycles ?? []).filter(
          (cycle) => !cycle.cancelled && !cycle.isFuture,
        );
        const initialCycle = initialNoteId
          ? selectable.find((cycle) => cycle.noteId === initialNoteId)
          : null;
        const defaultCycle =
          initialCycle ??
          selectable.find((cycle) => cycle.id === body.activeCycleId) ??
          selectable[0] ??
          null;

        if (controller.signal.aborted) return;

        setOptions(selectable);
        setActiveCycleId(body.activeCycleId);
        setSelectedCycleId(defaultCycle?.id ?? '');

        if (defaultCycle) {
          const nextSection = await fetchCoachingNotesByNoteId(
            supabase,
            defaultCycle.noteId,
          );
          if (controller.signal.aborted) return;
          setSection(nextSection);
          callbackRef.current?.(nextSection, defaultCycle.noteId);
        } else {
          const empty = { actionSteps: [], notes: [] };
          setSection(empty);
          callbackRef.current?.(empty, -1);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load coaching history.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingList(false);
        }
      }
    };

    void loadCycles();
    return () => controller.abort();
  }, [initialNoteId, userId]);

  const handleChange = async (cycleId: string) => {
    const cycle = options.find((option) => option.id === cycleId);
    if (!cycle) return;

    setSelectedCycleId(cycleId);
    setLoadingSection(true);
    setError(null);

    try {
      const nextSection = await fetchCoachingNotesByNoteId(supabase, cycle.noteId);
      setSection(nextSection);
      callbackRef.current?.(nextSection, cycle.noteId);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load this coaching cycle.',
      );
    } finally {
      setLoadingSection(false);
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        spacing={2}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6" fontWeight={700}>
              {title}
            </Typography>
            {selectedCycleId === activeCycleId ? (
              <Chip size="small" label="Active cycle" />
            ) : null}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Review the current cycle or open an earlier M2 or Business Review.
          </Typography>
        </Box>

        <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 300 } }}>
          <InputLabel id="coaching-cycle-select-label">Coaching cycle</InputLabel>
          <Select
            labelId="coaching-cycle-select-label"
            label="Coaching cycle"
            value={selectedCycleId}
            onChange={(event) => {
              void handleChange(String(event.target.value));
            }}
            disabled={loadingList || options.length === 0}
          >
            {options.map((cycle) => (
              <MenuItem key={cycle.id} value={cycle.id}>
                {formatCycleLabel(cycle, activeCycleId)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : null}

      {loadingList || loadingSection ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      ) : null}

      {!loadingList && options.length === 0 && !error ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          No coaching cycles are available yet.
        </Alert>
      ) : null}

      {showPreview && section ? <Box sx={{ mt: 2 }} /> : null}
    </Paper>
  );
}
