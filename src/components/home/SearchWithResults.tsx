'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Box, InputAdornment, TextField, Typography } from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand, CARD_RADIUS } from '@/lib/homeTheme';
import {
  getDiscoveryTrackingIdentity,
  recordDiscoveryEvent,
} from '@/lib/discoveryClient';
import type { SearchItem } from './types';
import { useDiscoveryItemTracking } from './useDiscoveryItemTracking';

const MAX_VISIBLE = 5;
const SEARCH_INACTIVITY_MS = 10 * 60 * 1000;

type SearchResponse = {
  items?: SearchItem[];
  resultSetId?: string | null;
  logicalSearchId?: string | null;
  journeyId?: string | null;
  totalMatchCount?: number;
};

function TrackedSearchResult({
  item,
  divider,
}: {
  item: SearchItem;
  divider: boolean;
}) {
  const { elementRef, recordOpen } = useDiscoveryItemTracking({
    resultSetId: item.resultSetId,
    logicalSearchId: item.logicalSearchId,
    position: item.position,
  });

  return (
    <Box
      ref={elementRef}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        px: 1.75,
        py: 1.375,
        borderTop: divider ? `1px solid ${brand.border}` : 'none',
        transition: 'background-color .14s ease',
        '&:hover': { bgcolor: brand.turquoiseTint },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography component={Link} href={item.href} onClick={recordOpen}
          sx={{ display: 'block', fontSize: 15, fontWeight: 500, color: brand.ink }}>
          {item.title}
        </Typography>
        {item.containerHref && item.containerTitle ? (
          <Typography component={Link} href={item.containerHref}
            sx={{ display: 'inline-block', mt: 0.5, fontSize: 12, color: brand.inkMuted, textDecoration: 'underline' }}>
            From {item.containerTitle}
          </Typography>
        ) : null}
      </Box>
      <Typography sx={{ fontSize: 12, color: brand.inkMuted, flexShrink: 0 }}>
        {item.typeLabel}
      </Typography>
    </Box>
  );
}

/**
 * Results resolve inline rather than navigating away, which is the whole point
 * of keeping search on a single page. Older home variants can still provide a
 * small local index; Momentum uses the authenticated discovery endpoint.
 */
export default function SearchWithResults({
  index,
  large = false,
  live = false,
  discoveryEnabled = false,
}: {
  index: SearchItem[];
  /** Centerpiece treatment: this is the primary action on the hub layout. */
  large?: boolean;
  /** Query the member's live library catalogue instead of a local index. */
  live?: boolean;
  /** Use the new search, analytics and full discovery destination. */
  discoveryEnabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [remoteResponse, setRemoteResponse] = useState<SearchResponse>({ items: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const journeyIdRef = useRef<string | null>(null);
  const lastLogicalSearchIdRef = useRef<string | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const shownResultSetsRef = useRef(new Set<string>());
  const trimmed = query.trim();

  const localMatches = useMemo(() => {
    if (trimmed.length < 2) return [];
    const needle = trimmed.toLowerCase();
    return index.filter((item) => item.title.toLowerCase().includes(needle));
  }, [index, trimmed]);

  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!discoveryEnabled) return undefined;
    const handlePageHide = () => {
      recordDiscoveryEvent(
        {
          eventType: 'tab_session_ended',
          logicalSearchId: lastLogicalSearchIdRef.current,
        },
        { keepalive: true },
      );
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [discoveryEnabled]);

  useEffect(() => {
    if (!live || trimmed.length < 2) {
      if (live && lastLogicalSearchIdRef.current) {
        recordDiscoveryEvent({
          eventType: 'search_cleared',
          logicalSearchId: lastLogicalSearchIdRef.current,
        });
      }
      journeyIdRef.current = null;
      lastLogicalSearchIdRef.current = null;
      setRemoteResponse({ items: [] });
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      const identity = getDiscoveryTrackingIdentity();
      const journeyId = journeyIdRef.current ?? crypto.randomUUID();
      const logicalSearchId = crypto.randomUUID();
      const parentLogicalSearchId = lastLogicalSearchIdRef.current;
      journeyIdRef.current = journeyId;

      try {
        const response = await fetch('/api/home/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: trimmed,
            tracking: {
              ...identity,
              journeyId,
              logicalSearchId,
              parentLogicalSearchId,
            },
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Search is unavailable right now.');

        const payload = (await response.json()) as SearchResponse;
        const items = Array.isArray(payload.items) ? payload.items : [];
        setRemoteResponse({ ...payload, items });

        if (payload.logicalSearchId) {
          if (parentLogicalSearchId) {
            recordDiscoveryEvent({
              eventType: 'search_reformulated',
              logicalSearchId: payload.logicalSearchId,
              metadata: { changeReason: 'query' },
            });
          }
          lastLogicalSearchIdRef.current = payload.logicalSearchId;
          journeyIdRef.current = payload.journeyId ?? journeyId;

          if (inactivityTimerRef.current !== null) {
            window.clearTimeout(inactivityTimerRef.current);
          }
          inactivityTimerRef.current = window.setTimeout(() => {
            journeyIdRef.current = null;
            lastLogicalSearchIdRef.current = null;
          }, SEARCH_INACTIVITY_MS);
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        setRemoteResponse({ items: [] });
        setError(caught instanceof Error ? caught.message : 'Search is unavailable right now.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [live, trimmed]);

  useEffect(() => {
    const resultSetId = remoteResponse.resultSetId;
    if (!resultSetId || shownResultSetsRef.current.has(resultSetId)) return;
    shownResultSetsRef.current.add(resultSetId);
    recordDiscoveryEvent({
      eventType: 'result_set_shown',
      resultSetId,
      logicalSearchId: remoteResponse.logicalSearchId,
      metadata: {
        surface: 'member_home_search',
        returnedCount: remoteResponse.items?.length ?? 0,
      },
    });
  }, [remoteResponse]);

  const matches = live ? (remoteResponse.items ?? []) : localMatches;
  const visible = matches.slice(0, MAX_VISIBLE);
  const hasQuery = trimmed.length >= 2;

  return (
    <Box>
      <TextField
        fullWidth
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={
          large
            ? 'Search for anything — scripts, systems, replays…'
            : 'Search playbooks, trainings, replays…'
        }
        aria-label="Search training content"
        sx={
          large
            ? {
                '& .MuiOutlinedInput-root': {
                  fontSize: 19,
                  borderRadius: CARD_RADIUS,
                  bgcolor: brand.card,
                  '& fieldset': { borderColor: brand.borderStrong, borderWidth: 2 },
                  '&:hover fieldset': { borderColor: brand.turquoise },
                  '&.Mui-focused fieldset': { borderColor: brand.turquoise, borderWidth: 2 },
                },
                '& .MuiOutlinedInput-input': { paddingTop: '19px', paddingBottom: '19px' },
              }
            : undefined
        }
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon
                  sx={{
                    fontSize: large ? 27 : 21,
                    color: large ? brand.turquoiseDeep : brand.inkMuted,
                    ml: large ? 0.5 : 0,
                  }}
                />
              </InputAdornment>
            ),
          },
        }}
      />

      {hasQuery ? (
        <Box
          sx={{
            mt: 1,
            border: `1px solid ${brand.border}`,
            borderRadius: '10px',
            overflow: 'hidden',
          }}
        >
          {loading ? (
            <Box sx={{ px: 1.75, py: 1.75 }}>
              <Typography sx={{ fontSize: 15, color: brand.inkSoft }}>
                Searching the library…
              </Typography>
            </Box>
          ) : error ? (
            <Box sx={{ px: 1.75, py: 1.75 }}>
              <Typography sx={{ fontSize: 15, color: brand.inkSoft }}>{error}</Typography>
            </Box>
          ) : visible.length === 0 ? (
            <Box sx={{ px: 1.75, py: 1.75 }}>
              <Typography sx={{ fontSize: 15, color: brand.inkSoft }}>
                Nothing matches “{trimmed}”. Try a shorter word.
              </Typography>
            </Box>
          ) : (
            <>
              {visible.map((item, index_) => {
                const startsRelated =
                  item.rankingTier === 'related' &&
                  (index_ === 0 || visible[index_ - 1]?.rankingTier !== 'related');
                return (
                  <Fragment key={`${item.resultSetId ?? 'local'}:${item.href}:${item.title}`}>
                    {startsRelated ? (
                      <Typography
                        variant="kicker"
                        sx={{
                          display: 'block',
                          px: 1.75,
                          py: 1,
                          borderTop: index_ === 0 ? 'none' : `1px solid ${brand.border}`,
                          bgcolor: '#fbfcfc',
                          color: brand.inkMuted,
                        }}
                      >
                        Related results
                      </Typography>
                    ) : null}
                    <TrackedSearchResult item={item} divider={index_ > 0 || startsRelated} />
                  </Fragment>
                );
              })}

              <Box
                component={Link}
                href={discoveryEnabled
                  ? `/discover?q=${encodeURIComponent(trimmed)}`
                  : '/library'}
                onClick={() => {
                  if (!discoveryEnabled) return;
                  recordDiscoveryEvent(
                    {
                      eventType: 'discovery_opened',
                      resultSetId: remoteResponse.resultSetId,
                      logicalSearchId: remoteResponse.logicalSearchId,
                      metadata: { source: 'member_home_search', queryPresent: true },
                    },
                    { keepalive: true },
                  );
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.625,
                  px: 1.75,
                  py: 1.25,
                  borderTop: `1px solid ${brand.border}`,
                  bgcolor: '#fbfcfc',
                  fontSize: 14,
                  fontWeight: 500,
                  color: brand.turquoiseDeep,
                  '&:hover': { bgcolor: brand.turquoiseTint },
                }}
              >
                {discoveryEnabled && live && typeof remoteResponse.totalMatchCount === 'number'
                  ? `See all ${remoteResponse.totalMatchCount} result${remoteResponse.totalMatchCount === 1 ? '' : 's'}`
                  : discoveryEnabled
                    ? `See all ${matches.length} result${matches.length === 1 ? '' : 's'}`
                    : 'Open the library'}
                <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
              </Box>
            </>
          )}
        </Box>
      ) : null}
    </Box>
  );
}
