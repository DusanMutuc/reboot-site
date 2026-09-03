'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Typography,
} from '@mui/material';
import RecommendRoundedIcon from '@mui/icons-material/RecommendRounded';

import type { CoachResourceOption, CoachResourceSuggestion } from '@/lib/discoveryRemainingTypes';
import SectionCard from './SectionCard';

type Props = { userId: string; coachingNoteId: number };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Could not load resource suggestions.');
  return body;
}

function endpoint(userId: string, coachingNoteId: number, q = '') {
  const params = new URLSearchParams({ user_id: userId, coaching_note_id: String(coachingNoteId) });
  if (q) params.set('q', q);
  return `/api/coach-resource-suggestions?${params.toString()}`;
}

function resolutionLabel(value: CoachResourceSuggestion['resolution']) {
  if (value === 'finished') return 'Finished';
  if (value === 'not_interested') return 'Not for me right now';
  if (value === 'removed') return 'Removed';
  return 'Active';
}

export default function CoachResourceSuggestionPanel({ userId, coachingNoteId }: Props) {
  const [suggestions, setSuggestions] = useState<CoachResourceSuggestion[]>([]);
  const [options, setOptions] = useState<CoachResourceOption[]>([]);
  const [selected, setSelected] = useState<CoachResourceOption | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const payload = await readJson<{ suggestions: CoachResourceSuggestion[]; options: CoachResourceOption[] }>(
          await fetch(endpoint(userId, coachingNoteId, inputValue.trim()), { signal: controller.signal, cache: 'no-store' }),
        );
        if (!controller.signal.aborted) { setSuggestions(payload.suggestions); setOptions(payload.options); }
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Could not load resource suggestions.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, inputValue ? 220 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [coachingNoteId, inputValue, userId]);

  async function mutate(body: Record<string, unknown>, success: string) {
    setSaving(true); setError(null); setMessage(null);
    try {
      const payload = await readJson<{ suggestions: CoachResourceSuggestion[] }>(await fetch('/api/coach-resource-suggestions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, userId, coachingNoteId }),
      }));
      setSuggestions(payload.suggestions); setSelected(null); setInputValue(''); setMessage(success);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save the suggestion.'); }
    finally { setSaving(false); }
  }

  const active = useMemo(() => suggestions.filter((suggestion) => suggestion.active), [suggestions]);
  const resolved = useMemo(() => suggestions.filter((suggestion) => !suggestion.active).slice(0, 8), [suggestions]);

  return (
    <SectionCard icon={<RecommendRoundedIcon sx={{ fontSize: 20 }} />} title="Suggest a resource">
      <Stack spacing={2.25}>
        <Typography variant="body2" color="text.secondary">Not required. It appears at the top of their browse area with your name on it.</Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {message ? <Alert severity="success">{message}</Alert> : null}
        {active.map((suggestion) => <Paper key={suggestion.id} variant="outlined" sx={{ p: 1.75 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
            <Box sx={{ minWidth: 0 }}><Stack direction="row" gap={1} alignItems="center" flexWrap="wrap"><Typography sx={{ fontWeight: 700 }}>{suggestion.title}</Typography><Chip size="small" color="primary" label="Suggested" /></Stack><Typography variant="caption" color="text.secondary">{suggestion.mediaType} · {suggestion.coachName} · {new Date(suggestion.createdAt).toLocaleDateString()}</Typography></Box>
            <Button size="small" disabled={saving} onClick={() => void mutate({ operation: 'remove', suggestionId: suggestion.id }, 'Suggestion removed.')}>Remove</Button>
          </Stack>
        </Paper>)}

        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'flex-start' }}>
          <Autocomplete<CoachResourceOption> fullWidth options={options} value={selected} inputValue={inputValue}
            loading={loading} filterOptions={(available) => available}
            onInputChange={(_, value, reason) => { if (reason !== 'reset') setInputValue(value); }}
            onChange={(_, value) => setSelected(value)} isOptionEqualToValue={(option, value) => option.id === value.id}
            getOptionLabel={(option) => option.title}
            getOptionDisabled={(option) => !option.eligible}
            noOptionsText={inputValue ? 'No matching resources' : 'No resources available'}
            renderOption={(props, option) => { const { key, ...rest } = props; return <Box component="li" key={key} {...rest} sx={{ display: 'block!important' }}><Typography variant="body2" sx={{ fontWeight: 600 }}>{option.title}</Typography><Typography variant="caption" color={option.eligible ? 'text.secondary' : 'warning.dark'}>{option.mediaType}{option.reason ? ` · ${option.reason}` : ''}</Typography></Box>; }}
            renderInput={(params) => <TextField {...params} label="Resource" placeholder="Search published resources" helperText={selected?.reason ?? 'Homepage browse approval is not required.'} InputProps={{ ...params.InputProps, endAdornment: <>{loading ? <CircularProgress size={17} /> : null}{params.InputProps.endAdornment}</> }} />} />
          <Button variant="contained" disabled={saving || !selected?.eligible} sx={{ minWidth: 110, mt: { sm: 1 } }} onClick={() => selected && void mutate({ operation: 'add', resourceId: selected.id }, 'Resource suggested.')}>{saving ? 'Saving…' : 'Suggest'}</Button>
        </Stack>

        {resolved.length ? <><Divider /><Box><Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Recent outcomes</Typography><Stack gap={0.75}>{resolved.map((suggestion) => <Stack key={suggestion.id} direction="row" gap={1} alignItems="center"><Typography variant="body2" sx={{ flex: 1 }}>{suggestion.title}</Typography><Chip size="small" variant="outlined" color={suggestion.resolution === 'finished' ? 'success' : 'default'} label={resolutionLabel(suggestion.resolution)} /></Stack>)}</Stack></Box></> : null}
      </Stack>
    </SectionCard>
  );
}
