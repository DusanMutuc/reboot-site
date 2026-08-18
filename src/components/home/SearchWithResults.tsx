'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Box, InputAdornment, TextField, Typography } from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand, CARD_RADIUS } from '@/lib/homeTheme';
import type { SearchItem } from './types';

const MAX_VISIBLE = 5;

/**
 * Results resolve inline rather than navigating away, which is the whole point
 * of keeping search on a single page. Filtering is client-side against a
 * placeholder index; the real version queries the library search endpoint.
 */
export default function SearchWithResults({
  index,
  large = false,
}: {
  index: SearchItem[];
  /** Centerpiece treatment: this is the primary action on the hub layout. */
  large?: boolean;
}) {
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
        placeholder={
          large ? 'Search for anything — scripts, systems, recordings…' : 'Search playbooks, courses, recordings…'
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
                  sx={{ fontSize: large ? 27 : 21, color: large ? brand.turquoiseDeep : brand.inkMuted, ml: large ? 0.5 : 0 }}
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
          {visible.length === 0 ? (
            <Box sx={{ px: 1.75, py: 1.75 }}>
              <Typography sx={{ fontSize: 15, color: brand.inkSoft }}>
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
                  <Typography sx={{ fontSize: 15, fontWeight: 500, color: brand.ink, minWidth: 0 }}>
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
                  fontSize: 14,
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
