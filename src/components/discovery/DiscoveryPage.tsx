'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Pagination,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';

import { brand } from '@/lib/homeTheme';
import {
  getDiscoveryTrackingIdentity,
  recordDiscoveryEvent,
} from '@/lib/discoveryClient';
import { useDiscoveryItemTracking } from '@/components/home/useDiscoveryItemTracking';

const CATEGORIES = [
  { value: null, label: 'All' },
  { value: 'marketing', label: 'Marketing & sales' },
  { value: 'systems', label: 'Systems & operations' },
  { value: 'hiring', label: 'Hiring & team' },
  { value: 'mindset', label: 'Mindset & leadership' },
] as const;
const INACTIVITY_MS = 10 * 60 * 1000;

type ChangeReason = 'query' | 'category' | 'filter' | 'sort';

type LibraryItem = {
  id: string;
  containerTitle?: string | null;
  containerHref?: string | null;
  title: string;
  description: string | null;
  typeLabel: string;
  duration: number | null;
  thumbnailUrl: string | null;
  href: string;
  rankingTier: 'strict' | 'related';
  resultSetId: string | null;
  logicalSearchId: string | null;
  position: number;
};

type CatalogueResponse = {
  items?: LibraryItem[];
  resultSetId?: string | null;
  logicalSearchId?: string | null;
  journeyId?: string | null;
  page?: number;
  pageSize?: number;
  totalMatchCount?: number;
  eligibleCandidateCount?: number;
};

type SearchState = {
  query: string;
  category: string | null;
  type: string;
  duration: string;
  dateRange: string;
  sort: string;
  includeRelated: boolean;
};

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds < 60) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function reasonForChange(previous: SearchState | null, next: SearchState): ChangeReason {
  if (!previous || previous.query !== next.query) return 'query';
  if (previous.category !== next.category) return 'category';
  if (previous.sort !== next.sort) return 'sort';
  return 'filter';
}

function LibraryCard({ item }: { item: LibraryItem }) {
  const { elementRef, recordOpen } = useDiscoveryItemTracking({
    resultSetId: item.resultSetId,
    logicalSearchId: item.logicalSearchId,
    position: item.position,
  });
  const duration = formatDuration(item.duration);

  return (
    <Box
      ref={elementRef}
      sx={{
        display: 'block',
        height: '100%',
        overflow: 'hidden',
        borderRadius: '12px',
        border: `1px solid ${brand.border}`,
        bgcolor: brand.card,
        transition: 'border-color .16s ease, transform .16s ease',
        '&:hover': { borderColor: brand.turquoise, transform: 'translateY(-2px)' },
      }}
    >
      <Box component={Link} href={item.href} onClick={recordOpen} sx={{ display: 'block' }}>
      <Box sx={{ position: 'relative', aspectRatio: '16 / 9', bgcolor: '#e7ebea' }}>
        {item.thumbnailUrl ? (
          <Box
            component="img"
            src={item.thumbnailUrl}
            alt=""
            aria-hidden="true"
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(135deg, #dce9e6 0%, #a9d8cf 100%)',
            }}
          />
        )}
        {duration ? (
          <Typography
            component="span"
            sx={{
              position: 'absolute',
              right: 7,
              bottom: 7,
              px: 0.75,
              py: 0.25,
              borderRadius: '4px',
              bgcolor: 'rgba(18,20,20,0.78)',
              color: '#fff',
              fontSize: 11,
            }}
          >
            {duration}
          </Typography>
        ) : null}
      </Box>
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
          <Typography variant="kicker" sx={{ color: brand.inkMuted }}>
            {item.typeLabel}
          </Typography>
          {item.rankingTier === 'related' ? (
            <Chip label="Related" size="small" sx={{ height: 20, fontSize: 10 }} />
          ) : null}
        </Stack>
        <Typography sx={{ fontSize: 17, fontWeight: 600, lineHeight: 1.35, color: brand.ink }}>
          {item.title}
        </Typography>
        {item.description ? (
          <Typography
            sx={{
              mt: 0.75,
              fontSize: 13,
              lineHeight: 1.45,
              color: brand.inkMuted,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.description}
          </Typography>
        ) : null}
      </Box>
      </Box>
      {item.containerHref && item.containerTitle ? (
        <Typography component={Link} href={item.containerHref}
          sx={{ display: 'block', px: 2, pb: 2, fontSize: 13, color: brand.inkMuted, textDecoration: 'underline' }}>
          From {item.containerTitle}
        </Typography>
      ) : null}
    </Box>
  );
}

export default function DiscoveryPage({
  initialQuery = '',
  initialCategory,
}: {
  initialQuery?: string;
  initialCategory?: string;
}) {
  const [query, setQuery] = useState(initialQuery.slice(0, 100));
  const debouncedQuery = useDebounced(query.trim(), 300);
  const [category, setCategory] = useState<string | null>(
    CATEGORIES.find((option) => option.value === initialCategory)?.value ?? null,
  );
  const [type, setType] = useState('all');
  const [duration, setDuration] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [sort, setSort] = useState('relevance');
  const [includeRelated, setIncludeRelated] = useState(false);
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<CatalogueResponse>({ items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestedStateRef = useRef<SearchState | null>(null);
  const requestedStateKeyRef = useRef<string | null>(null);
  const currentLogicalSearchIdRef = useRef<string | null>(null);
  const lastRecordedLogicalSearchIdRef = useRef<string | null>(null);
  const journeyIdRef = useRef<string | null>(null);
  const executionNumberRef = useRef(0);
  const inactivityTimerRef = useRef<number | null>(null);
  const shownResultSetsRef = useRef(new Set<string>());

  const normalizedQuery = debouncedQuery.length >= 2 ? debouncedQuery : '';
  const state = useMemo<SearchState>(
    () => ({
      query: normalizedQuery,
      category,
      type: normalizedQuery || type !== 'guide' ? type : 'all',
      duration,
      dateRange,
      sort,
      includeRelated: normalizedQuery ? includeRelated : false,
    }),
    [category, dateRange, duration, includeRelated, normalizedQuery, sort, type],
  );
  const stateKey = JSON.stringify(state);

  useEffect(() => {
    const nextUrl = new URL(window.location.href);
    if (debouncedQuery.length >= 2) nextUrl.searchParams.set('q', debouncedQuery);
    else nextUrl.searchParams.delete('q');
    if (category) nextUrl.searchParams.set('category', category);
    else nextUrl.searchParams.delete('category');
    window.history.replaceState(window.history.state, '', nextUrl.toString());
  }, [category, debouncedQuery]);

  useEffect(() => {
    const handlePageHide = () => {
      recordDiscoveryEvent(
        {
          eventType: 'tab_session_ended',
          logicalSearchId: lastRecordedLogicalSearchIdRef.current,
        },
        { keepalive: true },
      );
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      if (inactivityTimerRef.current !== null) window.clearTimeout(inactivityTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (debouncedQuery.length === 1) {
      setLoading(false);
      setResponse({ items: [] });
      return;
    }

    const controller = new AbortController();
    const stateChanged = requestedStateKeyRef.current !== stateKey;
    const previousState = requestedStateRef.current;
    let logicalSearchId: string | null = null;
    let parentLogicalSearchId: string | null = null;
    let journeyId: string | null = null;
    let changeReason: ChangeReason = 'query';

    if (normalizedQuery) {
      if (stateChanged || !currentLogicalSearchIdRef.current) {
        logicalSearchId = crypto.randomUUID();
        parentLogicalSearchId = lastRecordedLogicalSearchIdRef.current;
        journeyId = journeyIdRef.current ?? crypto.randomUUID();
        changeReason = reasonForChange(previousState, state);
        currentLogicalSearchIdRef.current = logicalSearchId;
        journeyIdRef.current = journeyId;
        executionNumberRef.current = 1;
      } else {
        logicalSearchId = currentLogicalSearchIdRef.current;
        journeyId = journeyIdRef.current ?? crypto.randomUUID();
        executionNumberRef.current += 1;
      }
    } else {
      if (previousState?.query && lastRecordedLogicalSearchIdRef.current) {
        recordDiscoveryEvent({
          eventType: 'search_cleared',
          logicalSearchId: lastRecordedLogicalSearchIdRef.current,
        });
      }
      currentLogicalSearchIdRef.current = null;
      lastRecordedLogicalSearchIdRef.current = null;
      journeyIdRef.current = null;
      executionNumberRef.current = 0;
    }

    requestedStateKeyRef.current = stateKey;
    requestedStateRef.current = state;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const identity = getDiscoveryTrackingIdentity();
        const result = await fetch('/api/discovery/catalogue', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: normalizedQuery,
            category,
            types: state.type === 'all' ? [] : [state.type],
            duration,
            dateRange,
            sort,
            includeRelated: normalizedQuery ? includeRelated : false,
            page,
            tracking: normalizedQuery
              ? {
                  ...identity,
                  journeyId,
                  logicalSearchId,
                  parentLogicalSearchId,
                  changeReason,
                  executionNumber: executionNumberRef.current,
                }
              : undefined,
          }),
          signal: controller.signal,
        });
        if (!result.ok) throw new Error('Discovery is unavailable right now.');

        const payload = (await result.json()) as CatalogueResponse;
        setResponse({ ...payload, items: Array.isArray(payload.items) ? payload.items : [] });

        if (payload.logicalSearchId) {
          if (parentLogicalSearchId) {
            recordDiscoveryEvent({
              eventType: 'search_reformulated',
              logicalSearchId: payload.logicalSearchId,
              metadata: { changeReason },
            });
          }
          currentLogicalSearchIdRef.current = payload.logicalSearchId;
          lastRecordedLogicalSearchIdRef.current = payload.logicalSearchId;
          journeyIdRef.current = payload.journeyId ?? journeyId;
          if (inactivityTimerRef.current !== null) {
            window.clearTimeout(inactivityTimerRef.current);
          }
          inactivityTimerRef.current = window.setTimeout(() => {
            requestedStateKeyRef.current = null;
            currentLogicalSearchIdRef.current = null;
            lastRecordedLogicalSearchIdRef.current = null;
            journeyIdRef.current = null;
          }, INACTIVITY_MS);
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        setResponse({ items: [] });
        setError(caught instanceof Error ? caught.message : 'Discovery is unavailable right now.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [category, dateRange, debouncedQuery, duration, includeRelated, normalizedQuery, page, sort, state, stateKey, type]);

  useEffect(() => {
    const resultSetId = response.resultSetId;
    if (!resultSetId || shownResultSetsRef.current.has(resultSetId)) return;
    shownResultSetsRef.current.add(resultSetId);
    recordDiscoveryEvent({
      eventType: 'result_set_shown',
      resultSetId,
      logicalSearchId: response.logicalSearchId,
      metadata: {
        surface: 'discovery_catalogue',
        page: response.page ?? page,
        returnedCount: response.items?.length ?? 0,
      },
    });
  }, [page, response]);

  const items = response.items ?? [];
  const total = response.totalMatchCount ?? 0;
  const pageSize = response.pageSize ?? 24;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hasOneCharacter = debouncedQuery.length === 1;

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: '#f5f7f6' }}>
      <Box sx={{ borderBottom: `1px solid ${brand.border}`, bgcolor: brand.card }}>
        <Container maxWidth="lg" sx={{ py: 2.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Box>
              <Typography component="h1" sx={{ fontSize: 28, fontWeight: 700, color: brand.ink }}>
                {normalizedQuery ? 'Search results' : 'Discover'}
              </Typography>
              <Typography sx={{ mt: 0.25, fontSize: 14, color: brand.inkMuted }}>
                {normalizedQuery
                  ? 'Find Library guides, courses, tools, and recordings. Your structured library is still separate.'
                  : 'Explore supplementary recordings and learning beyond your assigned work.'}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                component={Link}
                href="/library"
                onClick={() => recordDiscoveryEvent({
                  eventType: 'full_library_opened',
                  metadata: { source: 'discovery_catalogue' },
                }, { keepalive: true })}
              >
                Guide library
              </Button>
              <Button component={Link} href="/home" variant="outlined">
                Back home
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Stack spacing={2.5}>
          <TextField
            fullWidth
            value={query}
            onChange={(event) => {
              setQuery(event.target.value.slice(0, 100));
              setPage(1);
            }}
            placeholder="Search Library guides, courses, tools, and recordings…"
            aria-label="Search Library guides, courses, tools, and recordings"
            slotProps={{ input: { startAdornment: <SearchRoundedIcon sx={{ mr: 1, color: brand.inkMuted }} /> } }}
            sx={{ bgcolor: brand.card, '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
          />

          <Stack direction="row" gap={1} sx={{ flexWrap: 'wrap' }}>
            {CATEGORIES.map((option) => (
              <Chip
                key={option.value ?? 'all'}
                label={option.label}
                clickable
                color={category === option.value ? 'primary' : 'default'}
                variant={category === option.value ? 'filled' : 'outlined'}
                onClick={() => {
                  setCategory(option.value);
                  setPage(1);
                  recordDiscoveryEvent({
                    eventType: 'category_selected',
                    metadata: { selection: option.value ?? 'all', surface: 'discovery_catalogue' },
                  });
                }}
              />
            ))}
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Format</InputLabel>
              <Select
                label="Format"
                value={state.type}
                onChange={(event) => {
                  setType(event.target.value);
                  setPage(1);
                  recordDiscoveryEvent({ eventType: 'filter_changed', metadata: { filter: 'format' } });
                }}
              >
                <MenuItem value="all">All formats</MenuItem>
                {normalizedQuery ? <MenuItem value="guide">Library guides and courses</MenuItem> : null}
                <MenuItem value="video">Videos</MenuItem>
                <MenuItem value="podcast">Podcasts</MenuItem>
                <MenuItem value="pdf">PDFs</MenuItem>
                <MenuItem value="document">Documents</MenuItem>
                <MenuItem value="audio">Audio</MenuItem>
                <MenuItem value="link">Links</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 145 }}>
              <InputLabel>Duration</InputLabel>
              <Select
                label="Duration"
                value={duration}
                onChange={(event) => {
                  setDuration(event.target.value);
                  setPage(1);
                  recordDiscoveryEvent({ eventType: 'filter_changed', metadata: { filter: 'duration' } });
                }}
              >
                <MenuItem value="all">Any duration</MenuItem>
                <MenuItem value="short">Under 10 min</MenuItem>
                <MenuItem value="medium">10–30 min</MenuItem>
                <MenuItem value="long">Over 30 min</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 135 }}>
              <InputLabel>Added</InputLabel>
              <Select
                label="Added"
                value={dateRange}
                onChange={(event) => {
                  setDateRange(event.target.value);
                  setPage(1);
                  recordDiscoveryEvent({ eventType: 'filter_changed', metadata: { filter: 'date' } });
                }}
              >
                <MenuItem value="all">Any time</MenuItem>
                <MenuItem value="30">Last 30 days</MenuItem>
                <MenuItem value="90">Last 90 days</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Sort</InputLabel>
              <Select
                label="Sort"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(1);
                  recordDiscoveryEvent({ eventType: 'sort_changed', metadata: { sort: event.target.value } });
                }}
              >
                <MenuItem value="relevance">
                  {normalizedQuery ? 'Most relevant' : 'Catalogue order'}
                </MenuItem>
                <MenuItem value="newest">Newest</MenuItem>
                <MenuItem value="oldest">Oldest</MenuItem>
                <MenuItem value="title_asc">Title A–Z</MenuItem>
                <MenuItem value="duration_asc">Shortest</MenuItem>
              </Select>
            </FormControl>

            {normalizedQuery ? (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeRelated}
                    onChange={(event) => {
                      setIncludeRelated(event.target.checked);
                      setPage(1);
                      recordDiscoveryEvent({
                        eventType: 'filter_changed',
                        metadata: { filter: 'include_related', value: event.target.checked },
                      });
                    }}
                  />
                }
                label="Include related results"
              />
            ) : null}
          </Stack>

          {hasOneCharacter ? (
            <Typography sx={{ py: 6, textAlign: 'center', color: brand.inkMuted }}>
              Type one more character to search.
            </Typography>
          ) : loading ? (
            <Stack alignItems="center" spacing={1.5} sx={{ py: 8 }}>
              <CircularProgress size={30} />
              <Typography sx={{ color: brand.inkMuted }}>Loading resources…</Typography>
            </Stack>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : items.length === 0 ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600, color: brand.ink }}>
                {normalizedQuery || category || state.type !== 'all' || duration !== 'all' || dateRange !== 'all'
                  ? 'No matching resources'
                  : 'No supplementary resources to show yet'}
              </Typography>
              <Typography sx={{ mt: 0.75, color: brand.inkMuted }}>
                {normalizedQuery || category || state.type !== 'all' || duration !== 'all' || dateRange !== 'all'
                  ? 'Try a broader word or remove one of the filters.'
                  : 'You can still search for a guide or tool, or open the guide library.'}
              </Typography>
            </Box>
          ) : (
            <>
              <Typography sx={{ fontSize: 14, color: brand.inkMuted }}>
                {total} result{total === 1 ? '' : 's'}
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, minmax(0, 1fr))',
                    lg: 'repeat(3, minmax(0, 1fr))',
                  },
                  gap: 2.5,
                }}
              >
                {items.map((item, index) => {
                  const startsRelated =
                    item.rankingTier === 'related' &&
                    (index === 0 || items[index - 1]?.rankingTier !== 'related');
                  return (
                    <Fragment key={`${item.resultSetId ?? 'untracked'}:${item.id}`}>
                      {startsRelated ? (
                        <Typography
                          sx={{
                            gridColumn: '1 / -1',
                            mt: 1,
                            fontSize: 16,
                            fontWeight: 600,
                            color: brand.ink,
                          }}
                        >
                          Related results
                        </Typography>
                      ) : null}
                      <LibraryCard item={item} />
                    </Fragment>
                  );
                })}
              </Box>
            </>
          )}

          {!loading && !error && !hasOneCharacter && total > pageSize ? (
            <Stack alignItems="center" sx={{ pt: 2 }}>
              <Pagination
                page={Math.min(page, pageCount)}
                count={pageCount}
                color="primary"
                onChange={(_, nextPage) => {
                  setPage(nextPage);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </Stack>
          ) : null}
        </Stack>
      </Container>
    </Box>
  );
}
