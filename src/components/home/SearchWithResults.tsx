'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Box, InputAdornment, TextField, Typography } from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand } from '@/lib/homeTheme';
import type { SearchItem } from './types';

const MAX_VISIBLE = 5;

/**
 * Results resolve inline rather than navigating away, which is the whole point
 * of keeping search on a single page. Filtering is client-side against a
 * placeholder index; the real version queries the library search endpoint.
 */
export default function SearchWithResults({ index }: { index: SearchItem[] }) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  const matches = useMemo(() => {
    if (trimmed.length < 2) return [];
    const needle = trimmed.toLowerCase();
    return index.filter((item) => item.title.toLowerCase().includes(needle));
  }, [index, trimmed]);

  const visible = matches.slice(0, MAX_VISIBLE);
  const hasQuery = trimmed.length >= 2;

  return (
    <Box>
      <TextField
        fullWidth
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search playbooks, courses, recordings…"
        aria-label="Search training content"
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon sx={{ fontSize: 21, color: brand.inkMuted }} />
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
          {visible.length === 0 ? (
            <Box sx={{ px: 1.75, py: 1.75 }}>
              <Typography sx={{ fontSize: 14.5, color: brand.inkSoft }}>
                Nothing matches “{trimmed}”. Try a shorter word.
              </Typography>
            </Box>
          ) : (
            <>
              {visible.map((item, index_) => (
                <Box
                  key={item.title}
                  component={Link}
                  href={item.href}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1.5,
                    px: 1.75,
                    py: 1.375,
                    borderTop: index_ === 0 ? 'none' : `1px solid ${brand.border}`,
                    transition: 'background-color .14s ease',
                    '&:hover': { bgcolor: brand.turquoiseTint },
                  }}
                >
                  <Typography sx={{ fontSize: 14.5, fontWeight: 500, color: brand.ink, minWidth: 0 }}>
                    {item.title}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: brand.inkMuted, flexShrink: 0 }}>
                    {item.typeLabel}
                  </Typography>
                </Box>
              ))}

              <Box
                component={Link}
                href="/library"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.625,
                  px: 1.75,
                  py: 1.25,
                  borderTop: `1px solid ${brand.border}`,
                  bgcolor: '#fbfcfc',
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: brand.turquoiseDeep,
                  '&:hover': { bgcolor: brand.turquoiseTint },
                }}
              >
                See all {matches.length} result{matches.length === 1 ? '' : 's'}
                <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
              </Box>
            </>
          )}
        </Box>
      ) : null}
    </Box>
  );
}
