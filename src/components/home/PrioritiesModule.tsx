'use client';

import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { brand } from '@/lib/homeTheme';
import type { Priority } from './types';

/**
 * The member's three current action steps.
 *
 * All three are listed, but only the selected one shows its detail and its
 * guide. That keeps the sprint visible without handing over a menu: the
 * decision is still "do this or not", and swapping is a deliberate act rather
 * than something the member has to do before they can act at all.
 *
 * The guide is the only content here, because it is the only content actually
 * written for the step. Related videos are a recommendation — they resemble
 * the step rather than belonging to it — so they sit in the content zone with
 * the other things the member may or may not want.
 *
 * Wording is deliberately not "your coach asked for this" — that frames the
 * work as someone else's homework rather than the member's own plan.
 */
export default function PrioritiesModule({ priorities }: { priorities: Priority[] }) {
  const firstUnfinished = Math.max(
    priorities.findIndex((p) => p.status !== 'done'),
    0,
  );
  const [selected, setSelected] = useState(firstUnfinished);

  if (priorities.length === 0) {
    return (
      <Box
        component="section"
        id="next"
        sx={{
          bgcolor: brand.card,
          border: `1px solid ${brand.border}`,
          borderRadius: '16px',
          p: { xs: 3, md: 4 },
        }}
      >
        <Typography variant="slabTitle" sx={{ fontSize: 24, color: brand.ink, mb: 1 }}>
          Nothing set yet
        </Typography>
        <Typography sx={{ fontSize: 15.5, color: brand.inkSoft }}>
          Your priorities appear here after your next business review.
        </Typography>
      </Box>
    );
  }

  const active = priorities[Math.min(selected, priorities.length - 1)];
  const doneCount = priorities.filter((p) => p.status === 'done').length;

  return (
    <Box
      component="section"
      id="next"
      sx={{
        bgcolor: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: '16px',
        p: { xs: 3, md: 4 },
        animation: 'homeRise .34s ease-out both',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.35fr) minmax(0, 1fr)' },
          gap: { xs: 3.5, md: 6 },
          alignItems: 'start',
        }}
      >
        <Box>
          <Typography
            variant="sectionLabel"
            component="h2"
            sx={{
              display: 'block',
              fontSize: 12.5,
              letterSpacing: '0.13em',
              color: brand.turquoiseDeep,
              mb: 1.75,
            }}
          >
            What you&apos;re working on now
          </Typography>

          <Typography
            variant="slabTitle"
            sx={{ fontSize: { xs: 26, md: 32 }, color: brand.ink, mb: 1.25, maxWidth: 640 }}
          >
            {active.title}
          </Typography>

          {/* Stating what the first move costs is what lowers resistance for
              an audience that is short on patience. */}
          {active.detail ? (
            <Typography sx={{ fontSize: 15.5, color: brand.inkSoft, mb: 3 }}>
              {active.detail}
            </Typography>
          ) : (
            <Box sx={{ mb: 3 }} />
          )}

          {active.guideHref ? (
            <Button
              href={active.guideHref}
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{
                bgcolor: brand.slate,
                color: '#ffffff',
                fontSize: 16.5,
                px: 3.5,
                minHeight: 54,
                '&:hover': { bgcolor: '#000000' },
              }}
            >
              Open the guide
            </Button>
          ) : (
            <Typography sx={{ fontSize: 14.5, color: brand.inkMuted }}>
              No guide for this one — your coach will talk it through on your next call.
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            borderLeft: { xs: 'none', md: `1px solid ${brand.border}` },
            borderTop: { xs: `1px solid ${brand.border}`, md: 'none' },
            pl: { xs: 0, md: 4 },
            pt: { xs: 3, md: 0 },
          }}
        >
          <Typography
            sx={{
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: brand.inkMuted,
              mb: 1.75,
            }}
          >
            {doneCount} of {priorities.length} done
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {priorities.map((priority, index) => {
              const isActive = index === selected;
              const done = priority.status === 'done';

              return (
                <Box
                  key={priority.id}
                  component="button"
                  type="button"
                  onClick={() => setSelected(index)}
                  aria-pressed={isActive}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.25,
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    px: 1.25,
                    py: 1.25,
                    borderRadius: '9px',
                    border: `1px solid ${isActive ? brand.turquoise : 'transparent'}`,
                    bgcolor: isActive ? brand.turquoiseTint : 'transparent',
                    transition: 'background-color .14s ease, border-color .14s ease',
                    '&:hover': { bgcolor: isActive ? brand.turquoiseTint : '#f2f5f4' },
                  }}
                >
                  <Box
                    aria-hidden="true"
                    sx={{
                      mt: 0.125,
                      width: 16,
                      height: 16,
                      flexShrink: 0,
                      borderRadius: '50%',
                      border: `2px solid ${done ? brand.turquoise : brand.borderStrong}`,
                      bgcolor: done ? brand.turquoise : 'transparent',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {done ? <CheckRoundedIcon sx={{ fontSize: 11, color: brand.ink }} /> : null}
                  </Box>

                  <Typography
                    sx={{
                      fontSize: 14,
                      lineHeight: 1.4,
                      fontWeight: isActive ? 600 : 400,
                      color: done ? brand.inkMuted : brand.ink,
                      textDecoration: done ? 'line-through' : 'none',
                    }}
                  >
                    {priority.title}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
