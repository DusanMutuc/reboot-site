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
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
// import DescriptionIcon from '@mui/icons-material/Description'; // unused
import ImageIcon from '@mui/icons-material/Image';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import LinkIcon from '@mui/icons-material/Link';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { supabase } from '@/lib/supabaseClient';
import DiscoveryTagPicker from '@/components/admin/discovery/DiscoveryTagPicker';
import DiscoveryCategories from '@/components/admin/discovery/DiscoveryCategories';
import StandaloneUseSection from '@/components/admin/discovery/StandaloneUseSection';
import { fetchItemDecision, recordDecision, setBrowseApproval } from '@/lib/discoveryJobsClient';
import { DISCOVERY_BROWSE_BLOCKERS } from '@/lib/discoveryJobTypes';
import { splitDiscoveryNames } from '@/lib/discoveryAdminTypes';
import { adminCompactLabelSx } from '@/lib/theme';
import {
  discoveryVisibility,
  DISCOVERY_VISIBILITY_LABELS,
  type DiscoveryVisibility,
} from '@/lib/discoveryVisibility';

type ResourceType = 'video' | 'podcast' | 'pdf' | 'document' | 'audio' | 'image' | 'link';
type ResourceState = 'draft' | 'published' | 'archived';
type SortValue =
  | 'relevance'
  | 'date_desc'
  | 'date_asc'
  | 'alpha_asc'
  | 'alpha_desc'
  | 'duration_asc'
  | 'duration_desc'
  | 'placement_library'
  | 'placement_course'
  | 'placement_search_only';
type ResourceTag = {
  id: number;
  name: string;
  category: string | null;
  tag_kind?: 'browse_category' | 'topic' | 'alias' | 'format' | 'audience' | 'legacy';
  browse_category?: string | null;
  is_active?: boolean;
};
type ResourcePlacement = {
  inLibrary: boolean;
  inCourse: boolean;
  librarySources: string[];
  courseSources: string[];
};
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
  is_discoverable: boolean;
  is_browsable: boolean;
  discovery_open_mode?: 'context' | 'direct';
  search_names?: string[];
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
const PLACEMENT_SORTS: ReadonlySet<SortValue> = new Set([
  'placement_library',
  'placement_course',
  'placement_search_only',
]);

const resourceCardTagChipSx = {
  height: 22,
  borderRadius: 1,
  bgcolor: 'grey.100',
  color: 'text.secondary',
  '& .MuiChip-label': {
    px: 1,
    ...adminCompactLabelSx,
  },
} as const;

const placementItemSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  color: 'text.secondary',
  minWidth: 0,
} as const;

const metadataLabelSx = {
  fontSize: '0.8125rem',
  lineHeight: 1.35,
} as const;

function StatusIndicator({ state }: { state: ResourceState }) {
  const dotColor =
    state === 'published' ? 'success.main' : state === 'archived' ? 'error.main' : 'text.disabled';

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.625, flexShrink: 0 }}>
      <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: dotColor }} />
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={600}
        sx={{ ...metadataLabelSx, textTransform: 'capitalize' }}
      >
        {state}
      </Typography>
    </Box>
  );
}

function PlacementTooltip({
  heading,
  sources,
  children,
}: {
  heading: string;
  sources: string[];
  children: ReactElement;
}) {
  return (
    <Tooltip
      title={
        <Stack spacing={0.75}>
          <Typography variant="caption" fontWeight={700} color="inherit">
            {heading}
          </Typography>
          {sources.length > 0 ? (
            sources.map((source) => (
              <Typography key={source} variant="caption" color="inherit" sx={{ display: 'block' }}>
                {source}
              </Typography>
            ))
          ) : (
            <Typography variant="caption" color="inherit">
              Location details unavailable
            </Typography>
          )}
        </Stack>
      }
      slotProps={{ tooltip: { sx: { maxWidth: 480 } } }}
    >
      {children}
    </Tooltip>
  );
}

function PlacementInfo({
  placement,
  loading,
  unavailable,
}: {
  placement?: ResourcePlacement;
  loading: boolean;
  unavailable: boolean;
}) {
  if (loading && !placement) {
    return (
      <Box sx={placementItemSx}>
        <CircularProgress size={12} color="inherit" />
        <Typography variant="caption" color="inherit" sx={metadataLabelSx}>Checking visibility</Typography>
      </Box>
    );
  }

  if (unavailable && !placement) {
    return (
      <Tooltip title="Placement information could not be loaded.">
        <Box sx={placementItemSx}>
          <HelpOutlineIcon sx={{ fontSize: 15 }} />
          <Typography variant="caption" color="inherit" sx={metadataLabelSx}>Visibility unavailable</Typography>
        </Box>
      </Tooltip>
    );
  }

  if (!placement?.inLibrary && !placement?.inCourse) {
    return (
      <Tooltip title="Not placed inside a guide or course. Discovery visibility is managed separately.">
        <Box sx={placementItemSx}>
          <SearchIcon sx={{ fontSize: 15 }} />
          <Typography variant="caption" color="inherit" sx={metadataLabelSx}>Not in guide/course</Typography>
        </Box>
      </Tooltip>
    );
  }

  return (
    <>
      {placement.inLibrary ? (
        <PlacementTooltip heading="Library locations" sources={placement.librarySources}>
          <Box sx={placementItemSx}>
            <LibraryBooksOutlinedIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption" color="inherit" sx={metadataLabelSx}>Library</Typography>
          </Box>
        </PlacementTooltip>
      ) : null}
      {placement.inCourse ? (
        <PlacementTooltip heading="Course locations" sources={placement.courseSources}>
          <Box sx={placementItemSx}>
            <SchoolOutlinedIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption" color="inherit" sx={metadataLabelSx}>Course</Typography>
          </Box>
        </PlacementTooltip>
      ) : null}
    </>
  );
}

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
  const [placements, setPlacements] = useState<Record<number, ResourcePlacement>>({});
  const [placementsLoading, setPlacementsLoading] = useState(false);
  const [placementsUnavailable, setPlacementsUnavailable] = useState(false);

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
      const { data, error } = await supabase
        .from('tags')
        .select('id,name,category,tag_kind,browse_category,is_active')
        .eq('tag_kind', 'topic')
        .order('tag_kind', { ascending: true })
        .order('name', { ascending: true });
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
    is_discoverable?: boolean | null;
    is_browsable?: boolean | null;
    discovery_open_mode?: 'context' | 'direct';
    search_names?: string[];
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
      is_discoverable: r.is_discoverable ?? false,
      discovery_open_mode: r.discovery_open_mode ?? 'context',
      search_names: r.search_names ?? [],
      is_browsable: r.is_browsable ?? false,
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
    is_discoverable: boolean;
    is_browsable: boolean;
  discovery_open_mode?: 'context' | 'direct';
  search_names?: string[];
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
      is_discoverable: r.is_discoverable,
      discovery_open_mode: r.discovery_open_mode ?? 'context',
      search_names: r.search_names ?? [],
      is_browsable: r.is_browsable,
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
          const mapped: ResourceRow[] = (data ?? []).map(mapRpcRowToResource);
          const resourceIds = mapped.map((resource) => resource.id);
          const discoverability = resourceIds.length
            ? await supabase
                .from('resources')
                .select('id,is_discoverable,is_browsable,discovery_open_mode,search_names')
                .in('id', resourceIds)
            : { data: [], error: null };
          if (cancelled || runId !== runningRef.current) return;
          if (discoverability.error) throw discoverability.error;
          const discoverabilityById = new Map(
            (discoverability.data ?? []).map((resource) => [
              resource.id,
              resource,
            ]),
          );
          const enriched = mapped.map((resource) => ({
            ...resource,
            discovery_open_mode: discoverabilityById.get(resource.id)?.discovery_open_mode ?? 'context',
            search_names: discoverabilityById.get(resource.id)?.search_names ?? [],
            is_discoverable:
              discoverabilityById.get(resource.id)?.is_discoverable ?? resource.is_discoverable,
            is_browsable:
              discoverabilityById.get(resource.id)?.is_browsable ?? resource.is_browsable,
          }));
          const needsClientSort = !SUPPORTED_RPC_SORTS.has(sort);
          setRows(needsClientSort ? sortPlain(enriched, sort) : enriched);
        } else {
          let query = supabase
            .from('resources')
            .select(`
              id, title, description, type, url, thumbnail, duration, created_at, state, is_discoverable, is_browsable, discovery_open_mode, search_names,
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

  const resourceIdsKey = useMemo(
    () => rows.map((row) => row.id).sort((a, b) => a - b).join(','),
    [rows],
  );

  useEffect(() => {
    const resourceIds = resourceIdsKey ? resourceIdsKey.split(',').map(Number) : [];
    if (resourceIds.length === 0) {
      setPlacements({});
      setPlacementsLoading(false);
      setPlacementsUnavailable(false);
      return;
    }

    const controller = new AbortController();
    setPlacementsLoading(true);
    setPlacementsUnavailable(false);

    void (async () => {
      try {
        const response = await fetch('/api/admin/resources/placements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resourceIds }),
          signal: controller.signal,
        });
        const json = (await response.json()) as {
          placements?: Record<number, ResourcePlacement>;
          error?: string;
        };
        if (!response.ok) throw new Error(json.error || 'Failed to load resource placements');
        setPlacements(json.placements ?? {});
      } catch (placementError: unknown) {
        if (controller.signal.aborted) return;
        console.error('Failed to load resource placements:', placementError);
        setPlacements({});
        setPlacementsUnavailable(true);
      } finally {
        if (!controller.signal.aborted) setPlacementsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [resourceIdsKey]);

  const sortedRows = useMemo(() => {
    if (!PLACEMENT_SORTS.has(sort)) return rows;

    const matchesPlacement = (row: ResourceRow) => {
      const placement = placements[row.id];
      if (!placement) return false;
      if (sort === 'placement_library') return placement.inLibrary;
      if (sort === 'placement_course') return placement.inCourse;
      return !placement.inLibrary && !placement.inCourse;
    };

    return [...rows].sort((a, b) => Number(matchesPlacement(b)) - Number(matchesPlacement(a)));
  }, [placements, rows, sort]);

  // open dialog
  const onCreate = () => { setEditing(null); setOpen(true); };
  const onEdit = async (row: ResourceRow) => {
    // fetch the full row for state and tag IDs
    const { data, error } = await supabase
      .from('resources')
      .select(`
        id, title, description, type, url, thumbnail, duration, created_at, state, is_discoverable, is_browsable, discovery_open_mode, search_names,
        resource_tags ( tag_id )
      `)
      .eq('id', row.id)
      .maybeSingle();
    if (error) { setSnack({ msg: error.message, severity: 'error' }); return; }
    setEditing({
      ...row,
      state: (data?.state as ResourceState | undefined) ?? row.state,
      is_discoverable:
        typeof data?.is_discoverable === 'boolean' ? data.is_discoverable : row.is_discoverable,
      is_browsable:
        typeof data?.is_browsable === 'boolean' ? data.is_browsable : row.is_browsable,
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
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="flex-end" sx={{ mb: 2 }}>
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
              <MenuItem value="placement_library">Placement: Library first</MenuItem>
              <MenuItem value="placement_course">Placement: Course first</MenuItem>
              <MenuItem value="placement_search_only">Placement: Not in guide/course first</MenuItem>
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
          <Typography variant="body2" color="text.secondary">No resources yet.</Typography>
        ) : (
          <Grid container spacing={2}>
            {sortedRows.map((r) => (
              <Grid key={r.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                      <Tooltip
                        title={`Edit discovery visibility: ${DISCOVERY_VISIBILITY_LABELS[discoveryVisibility(r)]}`}
                      >
                        <IconButton size="small" onClick={() => onEdit(r)}>
                          {r.is_discoverable ? (
                            <SearchIcon color="primary" />
                          ) : (
                            <SearchIcon color="disabled" />
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

                  <Stack
                    direction="row"
                    alignItems="center"
                    columnGap={1.25}
                    rowGap={0.5}
                    sx={{ flexWrap: 'wrap', minHeight: 22 }}
                  >
                    <StatusIndicator state={r.state} />
                    <Typography
                      variant="caption"
                      color={r.is_discoverable ? 'primary.main' : 'text.disabled'}
                      sx={metadataLabelSx}
                    >
                      {DISCOVERY_VISIBILITY_LABELS[discoveryVisibility(r)]}
                    </Typography>
                    <PlacementInfo
                      placement={placements[r.id]}
                      loading={placementsLoading}
                      unavailable={placementsUnavailable}
                    />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 'auto', whiteSpace: 'nowrap', textAlign: 'right' }}
                    >
                      {r.duration ? `${formatDuration(r.duration)} · ` : ''}
                      {new Date(r.created_at).toLocaleDateString()}
                    </Typography>
                  </Stack>

                  <Typography variant="h6">{r.title}</Typography>
                  {r.description && <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.description}</Typography>}

                  {r.tags?.length > 0 ? (
                    <Box sx={{ mt: 'auto', pt: 0.75 }}>
                      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mb: 1 }} />
                      <Stack direction="row" gap={0.75} sx={{ flexWrap: 'wrap' }}>
                        {r.tags.map((tag) => (
                          <Chip key={tag.id} label={tag.name} size="small" sx={resourceCardTagChipSx} />
                        ))}
                      </Stack>
                    </Box>
                  ) : null}
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

/**
 * Discovery settings are decisions, not columns.
 *
 * Writing `is_discoverable` / `is_browsable` / `discovery_open_mode` straight onto the row did two
 * things silently: it superseded any decision recorded in the jobs or the builders — deleting the
 * record — and it set homepage approval without any of the eligibility checks
 * `admin_set_discovery_browse` exists to enforce. That made this form the only place in the product
 * that could put an unpublished or context-bound resource in front of members.
 *
 * The choice on screen stays one escalating question. Behind it sit the two separate records the
 * model needs, written through the same API every other surface uses.
 */
async function applyDiscoverySettings(resourceId: number, visibility: DiscoveryVisibility) {
  const current = await fetchItemDecision('resource', resourceId, 'visibility');
  const recorded = await recordDecision({
    item: { kind: 'resource', id: resourceId }, question: 'visibility',
    answer: visibility === 'hidden' ? 'excluded' : 'allowed',
    token: current.token,
  });
  if (!recorded.ok) {
    throw new Error(recorded.decidedBy
      ? `${recorded.decidedBy} changed the search visibility for this resource while you were editing. Reload and try again.`
      : 'The search visibility for this resource changed while you were editing. Reload and try again.');
  }

  const browse = await setBrowseApproval({ kind: 'resource', id: resourceId }, visibility === 'browse');
  if (!browse.ok) {
    const reason = DISCOVERY_BROWSE_BLOCKERS[browse.blocker]?.label ?? browse.blocker;
    throw new Error(`Saved, but it cannot go on the homepage yet — ${reason.toLowerCase()}.`);
  }
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
  const [stateValue, setStateValue] = useState<ResourceState>(editing?.state ?? 'draft');
  const [alternateNames, setAlternateNames] = useState((editing?.search_names ?? []).join('\n'));
  const [visibility, setVisibility] = useState<DiscoveryVisibility | ''>(
    editing ? discoveryVisibility(editing) : '');
  const [selectedTags, setSelectedTags] = useState<ResourceTag[]>(() => (editing?.tags ?? [])
    .flatMap(tag => { const full = allTags.find(option => option.id === tag.id); return full ? [full] : []; }));
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
    setStateValue(editing?.state ?? 'draft');
    setVisibility(editing ? discoveryVisibility(editing) : '');
    setAlternateNames((editing?.search_names ?? []).join('\n'));
    setSelectedTags((editing?.tags ?? []).flatMap(tag => {
      const full = allTags.find(option => option.id === tag.id); return full ? [full] : [];
    }));
    setUploadMode(editing?.type === 'pdf' || editing?.type === 'image' ? 'link' : 'link');
    setFile(null);
    setErr(null);
  }, [editing, allTags]);

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
      is_discoverable: boolean;
      is_browsable: boolean;
  discovery_open_mode?: 'context' | 'direct';
  search_names?: string[];
      resource_tags?: { tag: ResourceTag }[] | { tag: ResourceTag[] }[];
    };
    const { data: r2, error: e2 } = await supabase
      .from('resources')
      .select(`
        id, title, description, type, url, thumbnail, duration, created_at, state, is_discoverable, is_browsable, discovery_open_mode, search_names,
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
      is_discoverable: r2.is_discoverable,
      is_browsable: r2.is_browsable,
      discovery_open_mode: r2.discovery_open_mode ?? 'context',
      search_names: r2.search_names ?? [],
      tags,
    };
  }

  const handleSave = async () => {
    try {
      setSaving(true);
      setErr(null);

      // Resource forms only assign active canonical taxonomy rows. New topics
      // are governed separately rather than being created implicitly here.
      const tagIds = selectedTags.map((tag) => tag.id).filter((id) => id > 0);
      const searchNames = splitDiscoveryNames(alternateNames);

      // Branch: file upload via API (PDF or image)
      if (!isEdit && supportsFileUpload && uploadMode === 'upload') {
        if (!file) throw new Error(`Please choose a ${type === 'pdf' ? 'PDF' : 'image'} file.`);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('type', type);
        fd.append('title', title);
        if (description) fd.append('description', description);
        fd.append('tag_ids', JSON.stringify(tagIds));
        fd.append('search_names', JSON.stringify(searchNames));
        fd.append('state', stateValue);

        const res = await fetch('/api/resources/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Upload failed');

        if (visibility) await applyDiscoverySettings(json.id, visibility);
        const mapped = await refetchAndMap(json.id);
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
  search_names?: string[];
      };

      const payload: ResourcePayload = {
        title,
        description: description || null,
        type,
        url,
        thumbnail: thumbnail || null,
        duration: desiredDuration,
        state: stateValue,
        search_names: searchNames,
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

      if (visibility) await applyDiscoverySettings(resourceId!, visibility);

      // Sync tags to desired set
      const originalTopicIds = (editing?.tags ?? []).filter(tag => allTags.some(option => option.id === tag.id)).map(tag => tag.id).sort((a, b) => a - b);
      if (!editing || JSON.stringify([...tagIds].sort((a, b) => a - b)) !== JSON.stringify(originalTopicIds)) {
        await syncResourceTags(resourceId!, tagIds);
      }

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
              <Typography variant="adminSectionTitle" sx={{ mb: 1 }}>
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
            <DiscoveryTagPicker
              options={allTags}
              value={selectedTags}
              onChange={setSelectedTags}
            />
          </FormControl>

          <DiscoveryCategories tags={selectedTags} />

          <FormControl fullWidth>
            <InputLabel>State</InputLabel>
            <Select
              label="State"
              value={stateValue}
              onChange={(e)=>setStateValue(e.target.value as ResourceState)}
            >
              <MenuItem value="published">Published</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="archived">Archived</MenuItem>
            </Select>
          </FormControl>

          <FormControl>
            <Typography id="resource-discovery-label" variant="subtitle2">
              Where can members find this?
            </Typography>
            <RadioGroup
              aria-labelledby="resource-discovery-label"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as DiscoveryVisibility)}
            >
              <FormControlLabel value="hidden" control={<Radio />} label="Hidden from discovery" />
              <FormControlLabel value="search_only" control={<Radio />} label="Search only" />
              <FormControlLabel
                value="browse" control={<Radio />} label="Search and homepage browse"
                disabled={stateValue !== 'published'}
              />
            </RadioGroup>
            {stateValue !== 'published' && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                Homepage browse needs a published resource. Publish it first, or add it later from
                Homepage browse.
              </Typography>
            )}
            {!visibility && (
              <Typography variant="caption" sx={{ mt: 0.5, color: 'warning.dark' }}>
                Nothing chosen yet. Save without answering and this resource will not appear in search
                until someone does — you will find it under &ldquo;Not in search yet&rdquo;.
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              This does not publish a draft, grant access, or remove the item from its guide.
            </Typography>
          </FormControl>
          {/* The standalone question renders itself only when this resource actually sits inside a
              guide, and uses the same wording as the builder — the same question must never have
              two phrasings. */}
          {isEdit && editing && <StandaloneUseSection resourceId={editing.id} />}
          <TextField label="Also findable by" value={alternateNames}
            onChange={(event) => setAlternateNames(event.target.value)} multiline minRows={2}
            placeholder="One word or phrase per line"
            helperText="Words a member might search that aren't in the title. Up to 20, this item only." />
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


/** Sync resource_tags to match the desired tag IDs. */
async function syncResourceTags(resourceId: number, desiredTagIds: number[]) {
  const response = await fetch('/api/admin/discovery', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'update_items', resourceIds: [resourceId], tagIds: desiredTagIds, tagAction: 'replace' }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Tag save failed.');
}
