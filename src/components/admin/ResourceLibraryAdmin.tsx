'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { ReactElement } from 'react';
import {
  Box, Stack, Typography, TextField, Select, MenuItem, FormControl, InputLabel,
  Button, Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Paper, Tooltip, Snackbar, Alert, CircularProgress, RadioGroup, FormControlLabel, Radio
} from '@mui/material';
import Grid from '@mui/material/Grid'; // Grid v2 (stable in MUI v6)
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
// import DescriptionIcon from '@mui/icons-material/Description'; // unused
import ImageIcon from '@mui/icons-material/Image';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import LinkIcon from '@mui/icons-material/Link';
import ClearIcon from '@mui/icons-material/Clear';
import { supabase } from '@/lib/supabaseClient';

type ResourceType = 'video' | 'podcast' | 'pdf' | 'document' | 'audio' | 'image' | 'link';
type ResourceState = 'draft' | 'published' | 'archived';
type SortValue =
  | 'relevance'
  | 'date_desc'
  | 'date_asc'
  | 'alpha_asc'
  | 'alpha_desc'
  | 'duration_asc'
  | 'duration_desc';
type ResourceTag = { id: number; name: string; category: string | null };
type ResourceRow = {
  id: number;
  title: string;
  description: string | null;
  type: ResourceType;
  url: string;
  thumbnail: string | null;
  duration: number | null;
  created_at: string;
  state: ResourceState;
  tags: ResourceTag[]; // denormalized for UI
  score?: number | null; // from RPC
};

const TYPE_ICONS: Record<ResourceType, ReactElement> = {
  video: <OndemandVideoIcon fontSize="small" />,
  podcast: <HeadphonesIcon fontSize="small" />,
  pdf: <PictureAsPdfIcon fontSize="small" />,
  document: <InsertDriveFileIcon fontSize="small" />,
  audio: <HeadphonesIcon fontSize="small" />,
  image: <ImageIcon fontSize="small" />,
  link: <LinkIcon fontSize="small" />,
};

const ALL_TYPES: ResourceType[] = ['video','podcast','pdf','document','audio','image','link'];
const SUPPORTED_RPC_SORTS: ReadonlySet<SortValue> = new Set(['relevance', 'date_desc', 'date_asc']);

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return debounced;
}

export default function ResourceLibraryAdmin() {
  // query controls
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [types, setTypes] = useState<ResourceType[]>([]);
  const [sort, setSort] = useState<SortValue>('date_desc');
  const [mode, setMode] = useState<'strict'|'balanced'|'loose'>('balanced');

  // data
  const [rows, setRows] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  // tags (for selector)
  const [allTags, setAllTags] = useState<ResourceTag[]>([]);

  // dialog
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [resourceToDelete, setResourceToDelete] = useState<ResourceRow | null>(null);

  // feedback
  const [snack, setSnack] = useState<{msg: string, severity: 'success'|'error'|'info'} | null>(null);

  // fetch tags for selectors
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('tags').select('id,name,category').order('name', { ascending: true });
      if (error) setError(error.message);
      else setAllTags((data ?? []) as ResourceTag[]);
    })();
  }, []);

  // helpers to map shapes (typed inputs)
  function mapRpcRowToResource(r: {
    id: number;
    title: string;
    description: string | null;
    type: ResourceType;
    url: string;
    thumbnail: string | null;
    duration: number | null;
    created_at: string;
    state?: ResourceState | null;
    tags?: { id: number; name: string; category: string | null }[];
    score?: number | null;
  }): ResourceRow {
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      type: r.type,
      url: r.url,
      thumbnail: r.thumbnail,
      duration: r.duration,
      created_at: r.created_at,
      state: (r.state ?? 'published') as ResourceState,
      tags: (r.tags ?? []).map((t) => ({ id: t.id, name: t.name, category: t.category })),
      score: r.score ?? null,
    };
  }

  function mapJoinedRowToResource(r: {
    id: number;
    title: string;
    description: string | null;
    type: ResourceType;
    url: string;
    thumbnail: string | null;
    duration: number | null;
    created_at: string;
    state: ResourceState;
    // Accept either single tag or array-of-tags per row
    resource_tags?: { tag: ResourceTag }[] | { tag: ResourceTag[] }[];
  }): ResourceRow {
    // Normalize to ResourceTag[]
    const tags: ResourceTag[] = (r.resource_tags ?? []).flatMap((x) => {
      const t = (x as { tag: ResourceTag | ResourceTag[] }).tag;
      return Array.isArray(t) ? t : [t];
    });
  
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      type: r.type,
      url: r.url,
      thumbnail: r.thumbnail,
      duration: r.duration,
      created_at: r.created_at,
      state: r.state,
      tags,
    };
  }
  

  const sortPlain = useCallback((list: ResourceRow[], s: SortValue) => {
    const byTitle = (a: ResourceRow, b: ResourceRow) => a.title.localeCompare(b.title);
    const byDur = (a: ResourceRow, b: ResourceRow) => (a.duration ?? 0) - (b.duration ?? 0);
    const byDate = (a: ResourceRow, b: ResourceRow) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    switch (s) {
      case 'alpha_asc': return [...list].sort(byTitle);
      case 'alpha_desc': return [...list].sort((a,b)=>-byTitle(a,b));
      case 'duration_asc': return [...list].sort(byDur);
      case 'duration_desc': return [...list].sort((a,b)=>-byDur(a,b));
      case 'date_asc': return [...list].sort(byDate);
      case 'date_desc': return [...list].sort((a,b)=>-byDate(a,b));
      default: return list; // relevance handled in RPC
    }
  }, []);

  const _typesArg = useMemo(() => (types.length ? types : null), [types]);
  const runningRef = useRef(0);

  useEffect(() => {
    const trimmed = debouncedQ.trim();
    if (!trimmed && sort === 'relevance') setSort('date_desc');
    if (trimmed && sort === 'date_desc') setSort('relevance');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  // search (admin sees all; we use RPC for ranking when q present, fallback to plain select when empty)
  useEffect(() => {
    let cancelled = false;
    const runId = ++runningRef.current;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const trimmed = debouncedQ.trim();
        if (trimmed) {
          const rpcSort = SUPPORTED_RPC_SORTS.has(sort) ? sort : 'relevance';
          const args: Record<string, unknown> = {
            _q: debouncedQ,
            _types: _typesArg,
            _tag_ids: null,
            _duration: null,
            _date_range: null,
            _sort: rpcSort,
            _limit: 200,
            _offset: 0,
            _mode: mode,
          };
          const { data, error } = await supabase.rpc('search_resources', args);
          if (cancelled || runId !== runningRef.current) return;
          if (error) throw error;
          const mapped = (data ?? []).map(mapRpcRowToResource);
          const needsClientSort = !SUPPORTED_RPC_SORTS.has(sort);
          setRows(needsClientSort ? sortPlain(mapped, sort) : mapped);
        } else {
          let query = supabase
            .from('resources')
            .select(`
              id, title, description, type, url, thumbnail, duration, created_at, state,
              resource_tags (
                tag:tags ( id, name, category )
              )
            `)
            .order('created_at', { ascending: sort === 'date_asc' });

          if (_typesArg) query = query.in('type', _typesArg);

          const { data, error } = await query.limit(200);
          if (cancelled || runId !== runningRef.current) return;
          if (error) throw error;
          const mapped = (data ?? []).map(mapJoinedRowToResource);
          setRows(sortPlain(mapped, sort));
        }
      } catch (e: unknown) {
        if (!cancelled && runId === runningRef.current) {
          console.error(e);
          setError(e instanceof Error ? e.message : 'Failed to fetch');
        }
      } finally {
        if (!cancelled && runId === runningRef.current) {
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedQ, _typesArg, sort, mode, sortPlain]);

  // open dialog
  const onCreate = () => { setEditing(null); setOpen(true); };
  const onEdit = async (row: ResourceRow) => {
    // fetch the full row for state and tag IDs
    const { data, error } = await supabase
      .from('resources')
      .select(`
        id, title, description, type, url, thumbnail, duration, created_at, state,
        resource_tags ( tag_id )
      `)
      .eq('id', row.id)
      .maybeSingle();
    if (error) { setSnack({ msg: error.message, severity: 'error' }); return; }
    setEditing({
      ...row,
      state: (data?.state as ResourceState | undefined) ?? row.state,
      tags: row.tags,
    });
    setOpen(true);
  };

  const requestDelete = (row: ResourceRow) => {
    setResourceToDelete(row);
  };

  const confirmDelete = async () => {
    if (!resourceToDelete) return;
    const { error } = await supabase.from('resources').delete().eq('id', resourceToDelete.id);
    if (error) { setSnack({ msg: error.message, severity: 'error' }); return; }
    setRows((prev) => prev.filter(x => x.id !== resourceToDelete.id));
    setResourceToDelete(null);
    setSnack({ msg: 'Resource deleted', severity: 'success' });
  };

  const onToggleState = async (row: ResourceRow) => {
    const nextState: ResourceState = row.state === 'published' ? 'draft' : 'published';
    const { data, error } = await supabase
      .from('resources')
      .update({ state: nextState })
      .eq('id', row.id)
      .select('state')
      .maybeSingle();
    if (error) { setSnack({ msg: error.message, severity: 'error' }); return; }
    const resolved = (data?.state as ResourceState | undefined) ?? nextState;
    setRows(prev => prev.map(x => x.id === row.id ? { ...x, state: resolved } : x));
  };

  const onOpen = async (row: ResourceRow) => {
    // optional: log access
    const { data: u } = await supabase.auth.getUser();
    const userId = u?.user?.id;
    if (userId) {
      void supabase.from('resource_access').insert({ resource_id: row.id, user_id: userId });
    }
    window.open(row.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={800}>Resource Library</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField
            size="small"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            InputProps={{
              endAdornment: q && <IconButton onClick={() => setQ('')}><ClearIcon /></IconButton>
            }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Type</InputLabel>
            <Select
              multiple
              label="Type"
              value={types}
              onChange={(e) => setTypes(e.target.value as ResourceType[])}
              renderValue={(sel) => (sel as ResourceType[]).join(', ')}
            >
              {ALL_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Sort</InputLabel>
            <Select value={sort} label="Sort" onChange={(e) => setSort(e.target.value as SortValue)}>
              <MenuItem value="relevance">Relevance</MenuItem>
              <MenuItem value="date_desc">Newest</MenuItem>
              <MenuItem value="date_asc">Oldest</MenuItem>
              <MenuItem value="alpha_asc">A–Z</MenuItem>
              <MenuItem value="alpha_desc">Z–A</MenuItem>
              <MenuItem value="duration_asc">Shortest</MenuItem>
              <MenuItem value="duration_desc">Longest</MenuItem>
            </Select>
          </FormControl>

          {q.trim() ? (
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Search sensitivity</InputLabel>
              <Select value={mode} label="Search sensitivity" onChange={(e) => setMode(e.target.value as typeof mode)}>
                <MenuItem value="strict">Strict</MenuItem>
                <MenuItem value="balanced">Balanced</MenuItem>
                <MenuItem value="loose">Loose</MenuItem>
              </Select>
            </FormControl>
          ) : null}

          <Button startIcon={<AddIcon />} variant="contained" onClick={onCreate}>New Resource</Button>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        {loading ? (
          <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }} color="text.secondary">Loading…</Typography>
          </Stack>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary">No resources yet.</Typography>
        ) : (
          <Grid container spacing={2}>
            {rows.map((r) => (
              <Grid key={r.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box sx={{ border: '1px solid #eee', borderRadius: 2, p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {TYPE_ICONS[r.type]}
                    <Typography variant="overline">{r.type.toUpperCase()}</Typography>
                    <Box sx={{ ml: 'auto' }}>
                      <Tooltip title={`State: ${r.state}`}>
                        <IconButton size="small" onClick={() => onToggleState(r)}>
                          {r.state === 'published' ? (
                            <ToggleOnIcon color="success" />
                          ) : (
                            <ToggleOffIcon color={r.state === 'archived' ? 'error' : 'disabled'} />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Open">
                        <IconButton size="small" onClick={() => onOpen(r)}><OpenInNewIcon /></IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => onEdit(r)}><EditIcon /></IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => requestDelete(r)}><DeleteIcon /></IconButton>
                      </Tooltip>
                    </Box>
                  </Stack>

                  <Typography variant="h6" sx={{ fontWeight: 800 }}>{r.title}</Typography>
                  {r.description && <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.description}</Typography>}

                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mt: .5 }}>
                    {r.tags?.map(t => <Chip key={t.id} label={`#${t.name}`} size="small" />)}
                    <Chip label={r.state} size="small" color={r.state === 'published' ? 'success' : r.state === 'archived' ? 'error' : 'default'} />
                  </Stack>

                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 'auto' }}>
                    {r.duration ? (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <AccessTimeIcon fontSize="inherit" />
                        <Typography variant="caption">{formatDuration(r.duration)}</Typography>
                      </Stack>
                    ) : <span />}
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </Typography>
                  </Stack>
                </Box>
              </Grid>
            ))}
          </Grid>
        )}
      </Paper>

      <ResourceDialog
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        allTags={allTags}
        onSaved={(updated) => {
          setOpen(false);
          setSnack({ msg: editing ? 'Resource updated' : 'Resource created', severity: 'success' });
          setRows(prev => {
            const exists = prev.some(x => x.id === updated.id);
            const next = exists ? prev.map(x => (x.id === updated.id ? updated : x)) : [...prev, updated];
            return sortPlain(next, sort);
          });
        }}
      />

      <Dialog open={!!resourceToDelete} onClose={() => setResourceToDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete resource?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will permanently remove {resourceToDelete?.title ? `"${resourceToDelete.title}"` : 'this resource'}.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResourceToDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {snack && (
        <Snackbar open autoHideDuration={3000} onClose={() => setSnack(null)}>
          <Alert severity={snack.severity} onClose={() => setSnack(null)}>
            {snack.msg}
          </Alert>
        </Snackbar>
      )}

    </Box>
  );
}

function formatDuration(totalSeconds?: number | null) {
  if (!totalSeconds || totalSeconds < 1) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}` : `${m}:${s.toString().padStart(2,'0')}`;
}

/** ─────────────────────────────
 *  Create / Edit dialog
 *  ────────────────────────────*/
function ResourceDialog({
  open, onClose, editing, allTags, onSaved
}: {
  open: boolean;
  onClose: () => void;
  editing: ResourceRow | null;
  allTags: ResourceTag[];
  onSaved: (r: ResourceRow) => void;
}) {
  const isEdit = !!editing;

  const [title, setTitle] = useState(editing?.title ?? '');
  const [type, setType] = useState<ResourceType>(editing?.type ?? 'video');
  const [url, setUrl] = useState(editing?.url ?? '');
  const [thumbnail, setThumbnail] = useState(editing?.thumbnail ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [duration, setDuration] = useState<string>(editing?.duration?.toString() ?? '');
  const [stateValue, setStateValue] = useState<ResourceState>(editing?.state ?? 'published');
  const [selectedTags, setSelectedTags] = useState<ResourceTag[]>(editing?.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  const supportsFileUpload = type === 'pdf' || type === 'image';

  // Upload controls (only relevant when type supports file upload)
  const [uploadMode, setUploadMode] = useState<'link' | 'upload'>(
    editing?.type === 'pdf' || editing?.type === 'image' ? 'link' : 'link'
  );
  const [file, setFile] = useState<File | null>(null);
// Put near top of ResourceDialog file scope
function isLikelyUrl(s: string): boolean {
  if (!s) return false;
  try {
    const u = new URL(s.trim());
    return !!u.protocol && !!u.host;
  } catch {
    return false;
  }
}

  useEffect(() => {
    setTitle(editing?.title ?? '');
    setType(editing?.type ?? 'video');
    setUrl(editing?.url ?? '');
    setThumbnail(editing?.thumbnail ?? '');
    setDescription(editing?.description ?? '');
    setDuration(editing?.duration?.toString() ?? '');
    setStateValue(editing?.state ?? 'published');
    setSelectedTags(editing?.tags ?? []);
    setUploadMode(editing?.type === 'pdf' || editing?.type === 'image' ? 'link' : 'link');
    setFile(null);
    setErr(null);
  }, [editing]);

  // Helper to refetch a resource row (with tags) and map to UI shape
  async function refetchAndMap(resourceId: number): Promise<ResourceRow> {
    type ResourceSelectRow = {
      id: number;
      title: string;
      description: string | null;
      type: ResourceType;
      url: string;
      thumbnail: string | null;
      duration: number | null;
      created_at: string;
      state: ResourceState;
      resource_tags?: { tag: ResourceTag }[] | { tag: ResourceTag[] }[];
    };
    const { data: r2, error: e2 } = await supabase
      .from('resources')
      .select(`
        id, title, description, type, url, thumbnail, duration, created_at, state,
        resource_tags ( tag:tags ( id, name, category ) )
      `)
      .eq('id', resourceId)
      .single<ResourceSelectRow>();
    if (e2 || !r2) throw e2 || new Error('Not found');

    const tags: ResourceTag[] = (r2.resource_tags ?? []).flatMap((x) => {
      const t = (x as { tag: ResourceTag | ResourceTag[] }).tag;
      return Array.isArray(t) ? t : [t];
    });

    return {
      id: r2.id,
      title: r2.title,
      description: r2.description,
      type: r2.type,
      url: r2.url,
      thumbnail: r2.thumbnail,
      duration: r2.duration,
      created_at: r2.created_at,
      state: r2.state,
      tags,
    };
  }

  const handleSave = async () => {
    try {
      setSaving(true);
      setErr(null);

      // Ensure tags exist (admin-only op; uses unique constraints)
      const tagIds = await ensureTags(selectedTags.map(t => t.name));

      // Branch: file upload via API (PDF or image)
      if (!isEdit && supportsFileUpload && uploadMode === 'upload') {
        if (!file) throw new Error(`Please choose a ${type === 'pdf' ? 'PDF' : 'image'} file.`);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('type', type);
        fd.append('title', title);
        if (description) fd.append('description', description);
        fd.append('tags', JSON.stringify(selectedTags.map(t => t.name)));

        const res = await fetch('/api/resources/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Upload failed');

        // Server already inserted the resource and set url=/r/<id>
        const mapped = await refetchAndMap(json.id);
        // State override if dialog selected non-default
        if (stateValue && stateValue !== mapped.state) {
          const { data: sUpd, error: sErr } = await supabase
            .from('resources')
            .update({ state: stateValue })
            .eq('id', json.id)
            .select('id')
            .maybeSingle();
          if (sErr) throw sErr;
          if (sUpd?.id) {
            const remapped = await refetchAndMap(json.id);
            onSaved(remapped);
            return;
          }
        }
        onSaved(mapped);
        return;
      }

      // Normal create/update (links, videos, or pdf-as-link, or editing existing row)
      const desiredDuration = duration ? Math.max(0, parseInt(duration, 10) || 0) : null;

      type ResourcePayload = {
        title: string;
        description: string | null;
        type: ResourceType;
        url: string;
        thumbnail: string | null;
        duration: number | null;
        state: ResourceState;
      };

      const payload: ResourcePayload = {
        title,
        description: description || null,
        type,
        url,
        thumbnail: thumbnail || null,
        duration: desiredDuration,
        state: stateValue,
      };

      let resourceId = editing?.id;

      if (!resourceId) {
        const { data, error } = await supabase
          .from('resources')
          .insert(payload)
          .select('id')
          .single<{ id: number }>();
        if (error) throw error;
        resourceId = data.id;
      } else {
        const { error } = await supabase
          .from('resources')
          .update(payload)
          .eq('id', resourceId);
        if (error) throw error;
      }

      // Sync tags to desired set
      await syncResourceTags(resourceId!, tagIds);

      // Refetch and return mapped row
      const mapped = await refetchAndMap(resourceId!);
      onSaved(mapped);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Validations
  const canSave = (() => {
    // Require a URL unless we are doing a real PDF file upload
    const requiresUrl = !(supportsFileUpload && uploadMode === 'upload');
    const urlOk = requiresUrl ? isLikelyUrl(url) : true;
  
    if (supportsFileUpload && uploadMode === 'upload') {
      return Boolean(title.trim() && file && stateValue);
    }
    return Boolean(title.trim() && stateValue && urlOk);
  })();
  
  

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{isEdit ? 'Edit Resource' : 'New Resource'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {err && <Alert severity="error">{err}</Alert>}

          <TextField label="Title" value={title} onChange={e => setTitle(e.target.value)} fullWidth />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                label="Type"
                value={type}
                onChange={(e)=> {
                  const t = e.target.value as ResourceType;
                  setType(t);
                  // reset upload controls when switching type
                  if (t !== 'pdf' && t !== 'image') {
                    setUploadMode('link');
                    setFile(null);
                  }
                }}
              >
                {ALL_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>

            <TextField
              label="Duration (seconds)"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              fullWidth
            />
          </Stack>

          {/* File-uploadable types: choose between link vs upload */}
          {supportsFileUpload && (
            <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1, p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {type === 'pdf' ? 'PDF Source' : 'Image Source'}
              </Typography>
              <RadioGroup
                row
                value={uploadMode}
                onChange={(e) => setUploadMode(e.target.value as 'link' | 'upload')}
              >
                <FormControlLabel value="link" control={<Radio />} label="Use external link" />
                <FormControlLabel
                  value="upload"
                  control={<Radio />}
                  label={type === 'pdf' ? 'Upload PDF file' : 'Upload image file'}
                />
              </RadioGroup>

              {uploadMode === 'upload' ? (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  <Button component="label" variant="outlined">
                    {file ? `Selected: ${file.name}` : type === 'pdf' ? 'Choose PDF' : 'Choose image'}
                    <input
                      hidden
                      type="file"
                      accept={type === 'pdf' ? 'application/pdf' : 'image/*'}
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </Button>
                  {description !== undefined && (
                    <TextField
                      label="Description"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      fullWidth
                      multiline
                      minRows={3}
                    />
                  )}
                </Stack>
              ) : null}
            </Box>
          )}

          {/* For all types we accept a URL, except when uploading a file */}
{(!supportsFileUpload || uploadMode === 'link') && (
  <>
    <TextField
      label="URL"
      value={url}
      onChange={(e) => setUrl(e.target.value)}
      placeholder="https://example.com/resource"
      fullWidth
      error={url.trim().length > 0 && !isLikelyUrl(url)}
      helperText={
        url.trim().length > 0 && !isLikelyUrl(url)
          ? 'Please enter a valid URL (including https://)'
          : ' '
      }
    />

    <TextField
      label="Thumbnail URL"
      value={thumbnail}
      onChange={e => setThumbnail(e.target.value)}
      fullWidth
    />

    <TextField
      label="Description"
      value={description}
      onChange={e => setDescription(e.target.value)}
      fullWidth
      multiline
      minRows={3}
    />
  </>
)}


          <FormControl>
            <InputLabel shrink>Tags</InputLabel>
            <TagSelector
              options={allTags}
              value={selectedTags}
              onChange={setSelectedTags}
              placeholder="Select or create tags…"
            />
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>State</InputLabel>
            <Select
              label="State"
              value={stateValue}
              onChange={(e)=>setStateValue(e.target.value as ResourceState)}
            >
              <MenuItem value="published">Published (visible to members)</MenuItem>
              <MenuItem value="draft">Draft (hidden from members)</MenuItem>
              <MenuItem value="archived">Archived</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!canSave || saving} onClick={handleSave}>
          {saving ? 'Saving…' : isEdit ? 'Save' : (supportsFileUpload && uploadMode === 'upload') ? 'Upload' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}


/** TagSelector: chips with ability to add new tag names */
function TagSelector({
  options, value, onChange, placeholder
}: {
  options: ResourceTag[];
  value: ResourceTag[];
  onChange: (v: ResourceTag[]) => void;
  placeholder?: string;
}) {
  // simple “add by typing & press Enter” implementation
  const [input, setInput] = useState('');
  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    return q ? options.filter(o => o.name.toLowerCase().includes(q)) : options;
  }, [input, options]);

  const addByName = (name: string) => {
    name = name.trim();
    if (!name) return;
    const existing = options.find(o => o.name.toLowerCase() === name.toLowerCase());
    const tag = existing ?? { id: -Math.floor(Math.random()*1e6), name, category: null }; // temp id until saved
    if (!value.some(v => v.name.toLowerCase() === tag.name.toLowerCase())) {
      onChange([...value, tag]);
    }
    setInput('');
  };

  const remove = (id: number) => onChange(value.filter(v => v.id !== id));

  return (
    <Box sx={{ border: '1px solid rgba(0,0,0,0.23)', borderRadius: 1, p: 1 }}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        {value.map(v => (
          <Chip key={v.id} label={`#${v.name}`} onDelete={() => remove(v.id)} />
        ))}
      </Stack>
      <TextField
        size="small"
        placeholder={placeholder ?? 'Add tag and press Enter'}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); addByName(input); }
        }}
        fullWidth
        sx={{ mt: 1 }}
      />
      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
        {filtered.slice(0, 12).map(o => (
          <Chip
            key={o.id}
            label={`#${o.name}`}
            onClick={() => addByName(o.name)}
            variant="outlined"
            size="small"
          />
        ))}
      </Stack>
    </Box>
  );
}

/** Ensure tag names exist, return IDs (creates missing ones). */
async function ensureTags(names: string[]): Promise<number[]> {
  const clean = Array.from(new Set(names.map(n => n.trim()).filter(Boolean).map(n => n.toLowerCase())));
  if (!clean.length) return [];

  // fetch existing by lower(name)
  const { data: existing, error: e1 } = await supabase.from('tags').select('id,name');
  if (e1) throw e1;
  const foundMap = new Map<string, number>();
  (existing ?? []).forEach(t => foundMap.set(String(t.name).toLowerCase(), t.id as number));

  const toCreate = clean.filter(n => !foundMap.has(n));
  const createdIds: number[] = [];
  if (toCreate.length) {
    // create individually to surface errors clearly (admin-only per RLS)
    for (const nm of toCreate) {
      const { data, error } = await supabase.from('tags').insert({ name: nm }).select('id').single();
      if (error) throw error;
      createdIds.push((data as { id: number }).id);
      foundMap.set(nm, (data as { id: number }).id);
    }
  }
  return clean.map(nm => foundMap.get(nm)!).filter(Boolean);
}

/** Sync resource_tags to match the desired tag IDs. */
async function syncResourceTags(resourceId: number, desiredTagIds: number[]) {
  // current
  const { data: links, error } = await supabase.from('resource_tags').select('tag_id').eq('resource_id', resourceId);
  if (error) throw error;
  const currentIds = new Set<number>((links ?? []).map((x: { tag_id: number }) => x.tag_id));

  const desired = new Set<number>(desiredTagIds);
  const toAdd = Array.from(desired).filter(id => !currentIds.has(id));
  const toRemove = Array.from(currentIds).filter(id => !desired.has(id));

  if (toAdd.length) {
    const rows = toAdd.map(tag_id => ({ resource_id: resourceId, tag_id }));
    const { error: e2 } = await supabase.from('resource_tags').insert(rows);
    if (e2) throw e2;
  }
  if (toRemove.length) {
    const { error: e3 } = await supabase
      .from('resource_tags')
      .delete()
      .eq('resource_id', resourceId)
      .in('tag_id', toRemove);
    if (e3) throw e3;
  }
}
