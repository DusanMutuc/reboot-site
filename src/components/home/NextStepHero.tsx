'use client';

import Link from 'next/link';
import { Box, Button, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { brand } from '@/lib/homeTheme';
import type { NextStep } from './types';

/**
 * The one thing the hub asks a member to do.
 *
 * Borrowed from how games handle a stuck player, deliberately without the
 * trappings — no points, no badges, no synthetic scores:
 *
 *   - exactly one action, so the decision is "do it or not", never "which"
 *   - the cost is stated up front, because an unbounded ask is easy to defer
 *   - progress is shown partial, since a half-finished bar pulls hardest
 *   - position in a sequence is visible, so the work feels finite
 *   - an escape hatch, so a single recommendation never reads as coercion
 */
export default function NextStepHero({ step }: { step: NextStep }) {
  const hasSegments = step.stepTotal !== null && step.stepTotal > 1 && step.stepTotal <= 12;
  const doneCount = step.stepIndex ?? 0;

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
        sx={{ fontSize: 12.5, letterSpacing: '0.13em', color: brand.turquoiseDeep, mb: 1.75 }}
      >
        {step.eyebrow}
      </Typography>

      <Typography
        variant="slabTitle"
        sx={{ fontSize: { xs: 28, md: 34 }, color: brand.ink, mb: 1.25, maxWidth: 720 }}
      >
        {step.title}
      </Typography>

      <Typography sx={{ fontSize: 15.5, color: brand.inkSoft, mb: 2.75 }}>
        {step.detail}
      </Typography>

      {hasSegments ? (
        <Box
          aria-hidden="true"
          sx={{ display: 'flex', gap: 0.75, mb: 3, maxWidth: 460 }}
        >
          {Array.from({ length: step.stepTotal ?? 0 }, (_, index) => {
            const complete = index < doneCount - 1;
            const current = index === doneCount - 1;
            return (
              <Box
                key={index}
                sx={{
                  flex: 1,
                  height: 7,
                  borderRadius: 4,
                  bgcolor: complete
                    ? brand.turquoise
                    : current
                      ? brand.turquoiseTint
                      : '#e7ebea',
                  border: current ? `2px solid ${brand.turquoise}` : 'none',
                  boxSizing: 'border-box',
                }}
              />
            );
          })}
        </Box>
      ) : step.progressPct !== null ? (
        <Box sx={{ height: 7, bgcolor: '#e7ebea', borderRadius: 4, overflow: 'hidden', mb: 3, maxWidth: 460 }}>
          <Box sx={{ width: `${step.progressPct}%`, height: '100%', bgcolor: brand.turquoise }} />
        </Box>
      ) : (
        <Box sx={{ mb: 1 }} />
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
        <Button
          href={step.href}
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
          {step.ctaLabel}
        </Button>

        {step.altLabel && step.altHref ? (
          <Box
            component={Link}
            href={step.altHref}
            sx={{
              fontSize: 14.5,
              color: brand.inkMuted,
              textDecorationLine: 'underline',
              textUnderlineOffset: '3px',
              textDecorationColor: brand.borderStrong,
              '&:hover': { color: brand.ink },
            }}
          >
            {step.altLabel}
          </Box>
        ) : null}
          </Box>
        </Box>

        {step.subSteps.length > 0 ? (
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
              {step.subStepsLabel}
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.375 }}>
              {step.subSteps.map((sub) => (
                <Box key={sub.label} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                  <Box
                    aria-hidden="true"
                    sx={{
                      mt: 0.25,
                      width: 15,
                      height: 15,
                      flexShrink: 0,
                      borderRadius: '50%',
                      border: `2px solid ${
                        sub.state === 'todo' ? brand.borderStrong : brand.turquoise
                      }`,
                      bgcolor: sub.state === 'done' ? brand.turquoise : 'transparent',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {sub.state === 'done' ? (
                      <CheckRoundedIcon sx={{ fontSize: 10, color: brand.ink }} />
                    ) : null}
                  </Box>

                  <Typography
                    sx={{
                      fontSize: 14,
                      lineHeight: 1.4,
                      fontWeight: sub.state === 'current' ? 600 : 400,
                      color:
                        sub.state === 'done'
                          ? brand.inkMuted
                          : sub.state === 'current'
                            ? brand.ink
                            : brand.inkSoft,
                      textDecoration: sub.state === 'done' ? 'line-through' : 'none',
                    }}
                  >
                    {sub.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
