'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

import type { RenderableResource } from '@/components/course/BlockRenderer';
import { supabase } from '@/lib/supabaseClient';

export type ResourcePickerDialogProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (resource: RenderableResource) => void;
};

export default function ResourcePickerDialog({ open, onClose, onSelect }: ResourcePickerDialogProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RenderableResource[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (term: string) => {
      setLoading(true);
      setError(null);
      try {
        let request = supabase
          .from('resources')
          .select('id,title,type,url,thumbnail,duration')
          .order('updated_at', { ascending: false })
          .limit(50);
        const trimmed = term.trim();
        if (trimmed) {
          request = request.ilike('title', `%${trimmed}%`);
        }
        const { data, error: fetchError } = await request;
        if (fetchError) {
          throw new Error(fetchError.message);
        }
        setRows(((data ?? []) as RenderableResource[]) ?? []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load resources';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (open) {
      void load(query);
    }
  }, [open, query, load]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Select a resource</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search resources"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          {loading && (
            <Stack alignItems="center" spacing={1} sx={{ py: 4 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">
                Loading resources…
              </Typography>
            </Stack>
          )}
          {error && <Typography color="error">{error}</Typography>}
          {!loading && !error && (
            <Stack spacing={1}>
              {rows.map((row) => (
                <Button key={row.id} variant="outlined" onClick={() => onSelect(row)}>
                  {row.title ?? `Resource #${row.id}`}
                </Button>
              ))}
              {rows.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No resources found.
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
