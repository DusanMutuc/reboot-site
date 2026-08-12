'use client';

import { Box, Button, Container, Typography } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import type { CallStatus, LastCall, NextCall } from './types';

type Props = {
  status: CallStatus;
  nextCall: NextCall | null;
  lastCall: LastCall | null;
  /** Anchor id. The one-page variant separates the band from its links panel. */
  id?: string;
  /** Where the "Book a call" CTA points. */
  bookHref?: string;
};

/**
 * Three visual treatments, all drawn from the existing brand palette:
 *   imminent → full turquoise slab (go)
 *   booked   → pale turquoise band (calm confirmation)
 *   none     → near-black slab with a turquoise CTA (attention without alarm)
 */
const TREATMENT: Record<CallStatus, { bg: string; fg: string; sub: string }> = {
  imminent: { bg: brand.turquoise, fg: brand.ink, sub: 'rgba(22,33,31,0.72)' },
  booked: { bg: brand.turquoiseTint, fg: brand.ink, sub: brand.inkSoft },
  none: { bg: brand.slate, fg: '#ffffff', sub: 'rgba(255,255,255,0.68)' },
};

export default function RightNowBand({
  status,
  nextCall,
  lastCall,
  id = 'calls',
  bookHref = '#calls',
}: Props) {
  const tone = TREATMENT[status];

  const eyebrow =
    status === 'imminent' ? 'Right now' : status === 'booked' ? 'Your next call' : 'Your coaching calls';

  const heading =
    status === 'none'
      ? 'You have no coaching call booked'
      : nextCall
        ? `${nextCall.kind}${nextCall.coachName ? ` with ${nextCall.coachName}` : ''}`
        : 'Your coaching calls';

  const detail =
    status === 'none'
      ? (lastCall ? `Your last one was ${lastCall.relativeLabel}` : 'Book your next one to keep your momentum')
      : nextCall
        ? `${nextCall.whenLabel} · ${nextCall.relativeLabel}`
        : '';

  return (
    <Box
      component="section"
      id={id}
      sx={{
        bgcolor: tone.bg,
        borderBottom: status === 'booked' ? `1px solid ${brand.border}` : 'none',
        animation: 'homeRise .34s ease-out both',
      }}
    >
      <Container maxWidth={false} sx={{ maxWidth: HOME_MAX_WIDTH, px: { xs: 2.5, md: 4 } }}>
        <Box
          sx={{
            py: { xs: 3.5, md: 4.5 },
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
            gap: { xs: 2.5, md: 4 },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
              <Box
                aria-hidden="true"
                sx={{ width: 18, height: 3, bgcolor: status === 'none' ? brand.turquoise : tone.fg, borderRadius: 2 }}
              />
              <Typography
                variant="sectionLabel"
                sx={{ fontSize: 13, letterSpacing: '0.14em', color: tone.fg, opacity: status === 'booked' ? 0.75 : 0.9 }}
              >
                {eyebrow}
              </Typography>
            </Box>

            <Typography variant="slabTitle" component="h1" sx={{ color: tone.fg, mb: 0.75 }}>
              {heading}
            </Typography>

            {detail ? (
              <Typography sx={{ fontSize: 15.5, color: tone.sub }}>{detail}</Typography>
            ) : null}
          </Box>

          <Box sx={{ flexShrink: 0, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {status === 'imminent' && nextCall?.joinUrl ? (
              <Button
                href={nextCall.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<VideocamRoundedIcon />}
                sx={{
                  bgcolor: brand.slate,
                  color: '#ffffff',
                  fontSize: 16,
                  px: 3,
                  minHeight: 52,
                  '&:hover': { bgcolor: '#000000' },
                }}
              >
                Join call
              </Button>
            ) : null}

            {status === 'booked' ? (
              <Button
                href={nextCall?.addToCalendarUrl ?? '#'}
                startIcon={<CalendarMonthRoundedIcon />}
                sx={{
                  bgcolor: 'transparent',
                  color: brand.turquoiseDeep,
                  border: `2px solid ${brand.turquoise}`,
                  '&:hover': { bgcolor: '#ffffff', borderColor: brand.turquoiseDark },
                }}
              >
                Add to calendar
              </Button>
            ) : null}

            {status === 'none' ? (
              <Button
                href={bookHref}
                startIcon={<EventAvailableRoundedIcon />}
                sx={{
                  bgcolor: brand.turquoise,
                  color: brand.ink,
                  fontSize: 16,
                  px: 3,
                  minHeight: 52,
                  '&:hover': { bgcolor: brand.turquoiseDark },
                }}
              >
                Book a call
              </Button>
            ) : null}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
