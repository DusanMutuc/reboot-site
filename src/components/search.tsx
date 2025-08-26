'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Typography, InputBase, Chip, Button, IconButton, MenuItem, Select, FormControl, InputLabel,
  CircularProgress, Stack, Divider, Tooltip
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ClearIcon from '@mui/icons-material/Clear';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DescriptionIcon from '@mui/icons-material/Description';
import ImageIcon from '@mui/icons-material/Image';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import LinkIcon from '@mui/icons-material/Link';
import { supabase } from '@/lib/supabaseClient';
import type { ReactElement } from 'react';

type ResourceTag = { id: number; name: string; category: string | null };
type ResourceRow = {
  id: number;
  title: string;
  description: string | null;
  type: 'video' | 'podcast' | 'pdf' | 'document' | 'audio' | 'image' | 'link';
  url: string;
  thumbnail: string | null;
  duration: number | null;
  created_at: string;
  tags: ResourceTag[] | null;
  score: number | null;
};

const ALL_TYPES: ResourceRow['type'][] = ['video','podcast','pdf','document','audio','image','link'] as const;
const TYPE_ICONS: Record<ResourceRow['type'], ReactElement> = {
  video: <OndemandVideoIcon fontSize="small" />,
  podcast: <HeadphonesIcon fontSize="small" />,
  pdf: <PictureAsPdfIcon fontSize="small" />,
  document: <InsertDriveFileIcon fontSize="small" />,
  audio: <HeadphonesIcon fontSize="small" />,
  image: <ImageIcon fontSize="small" />,
  link: <LinkIcon fontSize="small" />,
};


function formatDuration(totalSeconds?: number | null) {
  if (!totalSeconds || totalSeconds < 1) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}` : `${m}:${s.toString().padStart(2,'0')}`;
}

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Search() {
  // Query & controls
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [selectedTypes, setSelectedTypes] = useState<Set<ResourceRow['type']>>(new Set());
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [sort, setSort] = useState<'relevance'|'date_desc'|'date_asc'|'alpha_asc'|'alpha_desc'|'duration_asc'|'duration_desc'>('relevance');
  const [mode, setMode] = useState<'strict'|'balanced'|'loose'>('balanced');

  // Results/paging
  const PAGE = 24;
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<ResourceRow[]>([]);
  const [totalGuess, setTotalGuess] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [broadening, setBroadening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Popular tags for suggestions
  const [popularTags, setPopularTags] = useState<ResourceTag[]>([]);

  // Decide default sort: when query empty, use date_desc; otherwise relevance
  useEffect(() => {
    if (!debouncedQ.trim() && sort === 'relevance') setSort('date_desc');
    if (debouncedQ.trim() && sort === 'date_desc') setSort('relevance');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  // Fetch popular tags
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('tag_usage').select('id,name,category').order('usage_count', { ascending: false }).limit(12);
      if (!error && data) setPopularTags(data as ResourceTag[]);
    })();
  }, []);

  // Do search
  const _typesArg = useMemo(() => (selectedTypes.size ? Array.from(selectedTypes) : null), [selectedTypes]);
  const runningRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      const runId = ++runningRef.current;

      const args: any = {
        _q: debouncedQ,
        _types: _typesArg,
        _tag_ids: selectedTagIds.length ? selectedTagIds : null,
        _sort: sort,
        _limit: PAGE,
        _offset: page * PAGE,
        _mode: mode,
      };

      const { data, error } = await supabase.rpc('search_resources', args);
      if (cancelled || runId !== runningRef.current) return;

      if (error) {
        setError(error.message);
        setResults([]);
        setLoading(false);
        return;
      }

      const rows = (data || []) as ResourceRow[];
      setResults(rows);
      setTotalGuess(rows.length < PAGE ? page * PAGE + rows.length : null);

      // Auto-broaden if too few results
      if (debouncedQ.trim().length >= 3 && rows.length < 5 && mode !== 'loose') {
        setBroadening(true);
        const { data: data2 } = await supabase.rpc('search_resources', { ...args, _mode: 'loose' });
        if (!cancelled && data2) {
          setResults(data2 as ResourceRow[]);
          setMode('loose');
        }
        setBroadening(false);
      }

      // Fire-and-forget: log search analytics (if signed in & only on page 0)
      if (page === 0) {
        supabase.auth.getUser().then(({ data: u }) => {
          const userId = u?.user?.id;
          if (userId) {
            supabase.from('search_analytics').insert({
              query: debouncedQ,
              results_count: (data as any[])?.length ?? 0,
              user_id: userId,
            }).then(() => {/* ignore */});
          }
        });
      }

      setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [debouncedQ, _typesArg, selectedTagIds, sort, page, mode]);

  const clearAll = () => {
    setQ('');
    setSelectedTypes(new Set());
    setSelectedTagIds([]);
    setPage(0);
    setMode('balanced');
  };

  const toggleType = (t: ResourceRow['type']) => {
    setPage(0);
    setSelectedTypes(prev => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  const onClickTag = (tag: ResourceTag) => {
    setPage(0);
    setSelectedTagIds(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]);
  };

  const onOpenResource = async (row: ResourceRow) => {
    // Log access (ignore errors)
    const { data: u } = await supabase.auth.getUser();
    const userId = u?.user?.id;
    if (userId) {
      supabase.from('resource_access').insert({ resource_id: row.id, user_id: userId }).then(() => {});
    }
    window.open(row.url, '_blank', 'noopener,noreferrer');
  };

  // UI helpers
  const selectionActive = selectedTagIds.length || (selectedTypes.size > 0) || debouncedQ.trim();
  const resultCountText = useMemo(() => {
    if (loading && !results.length) return 'Searching…';
    if (!selectionActive && !results.length) return 'Browse recent';
    const n = totalGuess ?? (page * PAGE + results.length);
    return `${n} result${n === 1 ? '' : 's'}`;
  }, [loading, results.length, selectionActive, page, totalGuess]);

  return (
    <section style={{ width: '100%', scrollSnapAlign: 'start' }}>
      {/* Hero banner */}
      <Box
        sx={{
          width: '100%',
          height: { xs: '14rem', md: '25rem' },
          backgroundImage: "url('/search-hero.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
          textAlign: 'center',
        }}
      >
        <Typography
          variant="h2"
          sx={{
            color: '#fff',
            fontWeight: 800,
            fontSize: { xs: 'clamp(2rem, 8vw, 3rem)', md: 'clamp(3.5rem, 6vw, 8rem)' },
          }}
        >
          REBOOT SEARCH ENGINE
        </Typography>
      </Box>

      {/* Green panel */}
      <Box sx={{ bgcolor: '#5cbca8', pt: { xs: 4, md: 6 }, pb: { xs: 6, md: 10 }, px: { xs: 2, md: 6 }, textAlign: 'center' }}>
        <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, mb: 3, fontSize: { xs: '1.25rem', md: '2rem' }, maxWidth: '38ch', mx: 'auto' }}>
          Type any keyword to find related Reboot resources, tools &amp; training
        </Typography>

        {/* Search bar */}
        <Box sx={{ maxWidth: '56rem', mx: 'auto', position: 'relative' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              bgcolor: '#fff',
              borderRadius: '3.125rem',
              px: { xs: '1rem', md: '1.5rem' },
              minHeight: { xs: 48, md: 56 },
              boxShadow: '0 .1875rem .5rem rgba(0,0,0,0.15)',
              gap: 1,
            }}
          >
            <span aria-hidden style={{ fontSize: '1.5rem', marginRight: '0.5rem', color: '#666' }}>🔍</span>
            <InputBase
              inputProps={{ 'aria-label': 'Search', role: 'searchbox' }}
              placeholder="Search…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); setMode('balanced'); }}
              sx={{ flex: 1, fontSize: { xs: '1rem', md: '1.25rem' } }}
            />
            {selectionActive && (
              <Tooltip title="Clear search & filters">
                <IconButton aria-label="Clear" onClick={clearAll}><ClearIcon /></IconButton>
              </Tooltip>
            )}
          </Box>

          <Box component="img" src="/Website Arrow 2.png" alt="" sx={{ display: { xs: 'none', md: 'block' }, position: 'absolute', top: '-3.125rem', right: '-5rem', height: '6.25rem', pointerEvents: 'none' }} />
        </Box>

        {/* Controls row: types, sort, mode */}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" justifyContent="center" sx={{ mt: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {ALL_TYPES.map((t) => (
              <Chip
                key={t}
                icon={TYPE_ICONS[t]}
                label={t.toUpperCase()}
                onClick={() => toggleType(t)}
                color={selectedTypes.has(t) ? 'primary' : 'default'}
                variant={selectedTypes.has(t) ? 'filled' : 'outlined'}
                sx={{ borderRadius: '999px' }}
              />
            ))}
          </Stack>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="sort-label" sx={{ color: '#fff' }}>Sort</InputLabel>
            <Select
              labelId="sort-label"
              value={sort}
              label="Sort"
              onChange={(e) => { setSort(e.target.value as any); setPage(0); }}
              sx={{ bgcolor: '#fff', borderRadius: 2 }}
            >
              <MenuItem value="relevance">Relevance</MenuItem>
              <MenuItem value="date_desc">Newest</MenuItem>
              <MenuItem value="date_asc">Oldest</MenuItem>
              <MenuItem value="alpha_asc">A–Z</MenuItem>
              <MenuItem value="alpha_desc">Z–A</MenuItem>
              <MenuItem value="duration_asc">Shortest</MenuItem>
              <MenuItem value="duration_desc">Longest</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="mode-label" sx={{ color: '#fff' }}>Fuzziness</InputLabel>
            <Select
              labelId="mode-label"
              value={mode}
              label="Fuzziness"
              onChange={(e) => { setMode(e.target.value as any); setPage(0); }}
              sx={{ bgcolor: '#fff', borderRadius: 2 }}
            >
              <MenuItem value="strict">Strict</MenuItem>
              <MenuItem value="balanced">Balanced</MenuItem>
              <MenuItem value="loose">Loose</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {/* Tag suggestions */}
        {popularTags.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
            {popularTags.map((t) => {
              const selected = selectedTagIds.includes(t.id);
              return (
                <Chip
                  key={t.id}
                  label={`#${t.name}`}
                  onClick={() => onClickTag(t)}
                  color={selected ? 'primary' : 'default'}
                  variant={selected ? 'filled' : 'outlined'}
                  sx={{ borderRadius: '999px' }}
                />
              );
            })}
          </Stack>
        )}

        {/* Results panel */}
        <Box
          sx={{
            maxWidth: '72rem',
            mx: 'auto',
            mt: 4,
            bgcolor: '#fff',
            borderRadius: 3,
            boxShadow: '0 .25rem .75rem rgba(0,0,0,0.2)',
            p: { xs: 2, md: 3 },
            textAlign: 'left',
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 700 }}>{resultCountText}</Typography>
            {broadening && <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>Including broader matches…</Typography>}
          </Stack>

          {error && (
            <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>
          )}

          {loading && results.length === 0 && (
            <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 160 }}>
              <CircularProgress />
              <Typography sx={{ mt: 2, color: 'text.secondary' }}>Searching…</Typography>
            </Stack>
          )}

          {!loading && results.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>No results</Typography>
              <Typography color="text.secondary">Try a different keyword, switch fuzziness to “Loose”, or click a suggested tag above.</Typography>
            </Box>
          )}

          {/* Grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
              gap: 2,
            }}
          >
            {results.map((row) => (
              <Box
                key={row.id}
                sx={{
                  p: 2,
                  border: '1px solid #eee',
                  borderRadius: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  transition: 'transform .12s ease, box-shadow .12s ease',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 .5rem 1rem rgba(0,0,0,0.12)' },
                }}
              >
                {/* Thumbnail or type icon row */}
                <Stack direction="row" alignItems="center" spacing={1}>
                  {TYPE_ICONS[row.type]}
                  <Typography variant="overline" sx={{ letterSpacing: 1 }}>{row.type.toUpperCase()}</Typography>
                  {row.duration ? (
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ ml: 'auto' }}>
                      <AccessTimeIcon fontSize="inherit" />
                      <Typography variant="caption">{formatDuration(row.duration)}</Typography>
                    </Stack>
                  ) : null}
                </Stack>

                <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                  {row.title}
                </Typography>

                {row.description && (
                  <Typography variant="body2" color="text.secondary" sx={{
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {row.description}
                  </Typography>
                )}

                {/* Tags */}
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                  {(row.tags || []).map((t) => (
                    <Chip
                      key={t.id}
                      label={`#${t.name}`}
                      size="small"
                      onClick={() => onClickTag(t)}
                      variant={selectedTagIds.includes(t.id) ? 'filled' : 'outlined'}
                    />
                  ))}
                </Stack>

                <Divider sx={{ my: 1 }} />

                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">
                    Added {new Date(row.created_at).toLocaleDateString()}
                  </Typography>
                  <Button
                    size="small"
                    endIcon={<OpenInNewIcon />}
                    onClick={() => onOpenResource(row)}
                  >
                    Open
                  </Button>
                </Stack>
              </Box>
            ))}
          </Box>

          {/* Pagination */}
          {(results.length === PAGE || page > 0) && (
            <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 3 }}>
              <Button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
              <Button disabled={results.length < PAGE} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </Stack>
          )}
        </Box>
      </Box>
    </section>
  );
}
