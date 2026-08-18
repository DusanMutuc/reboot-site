'use client';

import Image from 'next/image';
import { Box, Button, Container, Typography } from '@mui/material';
import darkWall from '/public/dark wall.png';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import type { MeetingSlot } from './types';

/**
 * The member's next one-to-one, named.
 *
 * The band used to call it "your next 1-1" and show only the date, on the
 * reasoning that the date is what matters. That was wrong: the two meetings
 * ask different things of the member, and the label above the date is where
 * they find out which one is coming. Resolution order:
 *
 *   1  starting within the join window -> join it
 *   2  nothing booked at all           -> book it
 *   3  otherwise                       -> the sooner one, with its date
 */
export function resolveBand(meetings: MeetingSlot[]) {
  const imminent = meetings.find((m) => m.imminent && m.joinUrl);
  if (imminent) return { mode: 'join' as const, primary: imminent };

  const booked = meetings
    .filter((m) => m.startsAt !== null)
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));

  if (booked.length === 0) {
    const primary = meetings.find((m) => m.id === 'business_review') ?? meetings[0];
    return { mode: 'book' as const, primary };
  }

  return { mode: 'booked' as const, primary: booked[0] };
}

export default function MeetingBand({ meetings }: { meetings: MeetingSlot[] }) {
  if (meetings.length === 0) return null;

  const { mode, primary } = resolveBand(meetings);
  const textured = mode === 'book';

  const tone =
    mode === 'join'
      ? { bg: brand.turquoise, fg: brand.ink, sub: 'rgba(22,33,31,0.85)' }
      : mode === 'book'
        ? { bg: brand.slate, fg: '#ffffff', sub: 'rgba(255,255,255,0.68)' }
        : { bg: brand.turquoiseTint, fg: brand.ink, sub: brand.inkSoft };

  const heading =
    mode === 'book' ? 'Nothing booked yet' : (primary.whenLabel ?? 'Your next call');

  return (
    <Box
      component="section"
      id="now"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        bgcolor: tone.bg,
        borderBottom: mode === 'booked' ? `1px solid ${brand.border}` : 'none',
        animation: 'homeRise .34s ease-out both',
      }}
    >
      {textured ? (
        <>
          <Image
            src={darkWall}
            alt=""
            aria-hidden="true"
            fill
            quality={40}
            sizes="100vw"
            placeholder="blur"
            style={{ objectFit: 'cover' }}
          />
          <Box
            aria-hidden="true"
            sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(20,20,20,0.55)' }}
          />
        </>
      ) : null}

      <Container
        maxWidth={false}
        sx={{ position: 'relative', zIndex: 1, maxWidth: HOME_MAX_WIDTH, px: { xs: 2.5, md: 4 } }}
      >
        <Box
          sx={{
            py: { xs: 2.5, md: 3 },
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
            gap: { xs: 2, md: 4 },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
              <Box
                aria-hidden="true"
                sx={{
                  width: 16,
                  height: 3,
                  borderRadius: 2,
                  bgcolor: mode === 'book' ? brand.turquoise : tone.fg,
                }}
              />
              <Typography
                variant="eyebrow"
                sx={{
                  display: 'block',
                  color: mode === 'book' ? brand.turquoise : tone.fg,
                  opacity: mode === 'booked' ? 0.75 : 1,
                }}
              >
                Your next {primary.kind}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
              <Typography
                variant="slabTitle"
                component="h1"
                sx={{ fontSize: { xs: 24, md: 30 }, color: tone.fg }}
              >
                {heading}
              </Typography>
              {primary.relativeLabel ? (
                <Typography sx={{ fontSize: 15, color: tone.sub }}>
                  {primary.relativeLabel}
                </Typography>
              ) : null}
            </Box>
          </Box>

          <Box sx={{ flexShrink: 0 }}>
            {mode === 'join' && primary.joinUrl ? (
              <Button
                href={primary.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<VideocamRoundedIcon />}
                sx={{
                  bgcolor: brand.slate,
                  color: '#ffffff',
                  fontSize: 16,
                  px: 3,
                  minHeight: 48,
                  '&:hover': { bgcolor: '#000000' },
                }}
              >
                Join your call
              </Button>
            ) : mode === 'book' ? (
              <Button
                href={primary.bookUrl}
                startIcon={<EventAvailableRoundedIcon />}
                sx={{
                  bgcolor: brand.turquoise,
                  color: brand.ink,
                  fontSize: 16,
                  px: 3,
                  minHeight: 48,
                  '&:hover': { bgcolor: brand.turquoiseDark },
                }}
              >
                Book a call
              </Button>
            ) : (
              <Button
                href={primary.bookUrl}
                sx={{
                  bgcolor: 'transparent',
                  color: brand.turquoiseDeep,
                  border: `2px solid ${brand.turquoise}`,
                  minHeight: 44,
                  '&:hover': { bgcolor: '#ffffff', borderColor: brand.turquoiseDark },
                }}
              >
                Reschedule
              </Button>
            )}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
