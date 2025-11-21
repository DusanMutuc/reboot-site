'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Stack,
  Switch,
  FormControlLabel,
  Alert,
  Typography,
  CircularProgress,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import { supabase } from '@/lib/supabaseClient';
import type { AchievementRow, AchievementUpsert } from '@/types/achievements';

type Props = {
  initial?: AchievementRow;
  onSaved?: (a: AchievementRow) => void;
};

type AchievementFormValues = {
  id?: number;
  title: string;
  description: string;
  icon_url: string | null;
  is_active: boolean;
  library_node_ids: number[];
};

// Must match backend logic
function toAchievementCode(title: string): string {
  return title
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Library option type
type LibraryOption = {
  id: number;
  title: string | null;
  description: string | null;
};

export default function AchievementForm({ initial, onSaved }: Props) {
  const [form, setForm] = useState<AchievementFormValues>({
    id: initial?.id,
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    icon_url: initial?.icon_url ?? null,
    is_active: initial?.is_active ?? true,
    library_node_ids: initial?.library_node_ids ?? [],
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Library options state
  const [libraryOptions, setLibraryOptions] = useState<LibraryOption[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const generatedCode = useMemo(
    () => (form.title.trim() ? toAchievementCode(form.title) : ''),
    [form.title]
  );

  // Typed change handlers (no `any`)
  const handleTextChange =
    (k: 'title' | 'description') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }));
    };

  const handleActiveToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, is_active: e.target.checked }));
  };

  async function handleIconSelect(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErrorMsg(null);

    try {
      const safeName = `${Date.now()}-${file.name}`.replace(/\s+/g, '-');
      const path = `icons/${safeName}`;

      const { data, error } = await supabase.storage
        .from('achievements')
        .upload(path, file, {
          upsert: false,
          cacheControl: '3600',
        });

      if (error) {
        console.error('Icon upload error:', error);
        setErrorMsg('Failed to upload icon. Check storage configuration.');
        return;
      }

      const { data: pub } = supabase.storage.from('achievements').getPublicUrl(data.path);
      setForm((f) => ({ ...f, icon_url: pub.publicUrl || null }));
    } catch (err: unknown) {
      console.error('Unexpected upload error:', err);
      setErrorMsg('Unexpected error while uploading icon.');
    } finally {
      setUploading(false);
    }
  }

  // --- Load Library lessons (similar to LibraryPage) ---
  useEffect(() => {
    let cancelled = false;

    async function loadLibraryLessons() {
      setLibraryLoading(true);
      setLibraryError(null);
      try {
        // Resolve Library root
        let root: number | null = null;

        // 1) site_settings.library_root_id
        const { data: ss } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'library_root_id')
          .maybeSingle();

        if (ss?.value && !Number.isNaN(Number(ss.value))) {
          root = Number(ss.value);
        }

        // 2) fallback: content_nodes.slug = 'library'
        if (!root) {
          const { data: libSlug } = await supabase
            .from('content_nodes')
            .select('id')
            .eq('slug', 'library')
            .maybeSingle();
          if (libSlug?.id) root = libSlug.id;
        }

        // 3) fallback: latest collection
        if (!root) {
          const { data: anyCollection } = await supabase
            .from('content_nodes')
            .select('id')
            .eq('node_type', 'collection')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (anyCollection?.id) root = anyCollection.id;
        }

        if (!root) {
          throw new Error(
            'No Library collection found. Create one or set site_settings.library_root_id.'
          );
        }

        // Load children of Library root
        const { data: links, error: linkErr } = await supabase
          .from('node_children')
          .select('child_id, position')
          .eq('parent_id', root)
          .order('position', { ascending: true });

        if (linkErr) throw linkErr;

        const childIds = (links ?? []).map((l) => l.child_id);
        if (!childIds.length) {
          if (!cancelled) setLibraryOptions([]);
          return;
        }

        const { data: nodes, error: nodeErr } = await supabase
          .from('content_nodes')
          .select('id, title, description, node_type')
          .in('id', childIds);

        if (nodeErr) throw nodeErr;

        // Filter to lessons only
        const options: LibraryOption[] =
          nodes
            ?.filter((n) => n.node_type === 'lesson')
            .map((n) => ({
              id: n.id as number,
              title: (n.title as string | null) ?? null,
              description: (n.description as string | null) ?? null,
            })) ?? [];

        if (!cancelled) setLibraryOptions(options);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to load Library lessons.';
        console.error('loadLibraryLessons error:', err);
        if (!cancelled) setLibraryError(message);
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    }

    void loadLibraryLessons();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedLibraryOptions = useMemo(
    () => libraryOptions.filter((opt) => form.library_node_ids.includes(opt.id)),
    [libraryOptions, form.library_node_ids]
  );

  async function save() {
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload: AchievementUpsert = {
        id: form.id,
        title: form.title.trim(),
        description: form.description.trim() === '' ? null : form.description.trim(),
        icon_url: form.icon_url ?? null,
        is_active: form.is_active,
        library_node_ids: form.library_node_ids,
      };

      const res = await fetch('/api/admin/achievements', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        console.error('Save achievement error:', body || res.statusText);
        setErrorMsg((body as { error?: string } | null)?.error || 'Failed to save achievement.');
        return;
      }

      const saved: AchievementRow = await res.json();
      onSaved?.(saved);
    } catch (err: unknown) {
      console.error('Unexpected save error:', err);
      setErrorMsg('Unexpected error while saving achievement.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

      <Box>
        <TextField
          label="Title"
          value={form.title}
          onChange={handleTextChange('title')}
          required
          fullWidth
        />
        {generatedCode && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              mt: 0.5,
              fontFamily: 'monospace',
              display: 'block',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Code: {generatedCode}
          </Typography>
        )}
      </Box>

      <TextField
        label="Description"
        value={form.description}
        onChange={handleTextChange('description')}
        multiline
        minRows={2}
        fullWidth
      />

      <Stack direction="row" spacing={2} alignItems="center">
        <Button component="label" variant="outlined" disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload Icon'}
          <input type="file" hidden accept="image/*" onChange={handleIconSelect} />
        </Button>
        {form.icon_url ? <img src={form.icon_url} alt="" style={{ height: 40 }} /> : null}
      </Stack>

      {/* Link to Library lessons */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Linked Library Lessons
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          When action steps on these lessons are completed, this achievement can be awarded.
        </Typography>

        {libraryError && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            {libraryError}
          </Alert>
        )}

        <Autocomplete
          multiple
          size="small"
          options={libraryOptions}
          value={selectedLibraryOptions}
          loading={libraryLoading}
          getOptionLabel={(option) => option.title || `Lesson #${option.id}`}
          onChange={(_, newValue) => {
            setForm((f) => ({
              ...f,
              library_node_ids: newValue.map((opt) => opt.id),
            }));
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={libraryLoading ? 'Loading lessons…' : 'Select lessons…'}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {libraryLoading ? <CircularProgress color="inherit" size={16} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
      </Box>

      <FormControlLabel
        control={<Switch checked={form.is_active} onChange={handleActiveToggle} />}
        label="Active"
      />

      <Box>
        <Button variant="contained" onClick={save} disabled={saving || !form.title.trim()}>
          {form.id ? 'Save Changes' : 'Create Achievement'}
        </Button>
      </Box>
    </Stack>
  );
}
