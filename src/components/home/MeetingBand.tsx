'use client';

import Image from 'next/image';
import { Box, Button, Container, Stack, Typography } from '@mui/material';
import darkWall from '/public/dark wall.png';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
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
 *
 * A meeting the member cannot move (`reschedulable: false`) reaches state 3
 * with no action beside it, which is correct rather than unfinished: a fixed
 * cohort call is something the band reports, not something it can act on. An
 * add-to-calendar link would be the one action that still makes sense there,
 * and is worth adding once a recurring event has a URL to point at.
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
  const prepMeeting = meetings.find(
    (meeting) => meeting.id === 'business_review' && meeting.prepHref,
  );
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
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'flex-start', md: 'center' },
            justifyContent: 'space-between',
            gap: { xs: 2, md: 4 },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            {/* No leading rule. It was a decorative tick that read as part of
                the sentence, and the label is strong enough without it. */}
            <Box sx={{ mb: 0.75 }}>
              <Typography
                variant="eyebrow"
                sx={{
                  display: 'block',
                  fontSize: { xs: 13, md: 14 },
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
                sx={{ fontSize: { xs: 27, md: 34 }, color: tone.fg }}
              >
                {heading}
              </Typography>
              {primary.relativeLabel ? (
                <Typography sx={{ fontSize: 15, color: tone.sub }}>
                  {primary.relativeLabel}
                </Typography>
              ) : null}
            </Box>
            {primary.prepLabel ? (
              <Typography sx={{ mt: 0.75, fontSize: 14, color: tone.sub }}>
                {primary.prepLabel}
              </Typography>
            ) : null}
          </Box>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.25}
            sx={{ width: { xs: '100%', md: 'auto' }, flexShrink: 0 }}
          >
            {mode !== 'join' && prepMeeting?.prepHref ? (
              <Button
                href={prepMeeting.prepHref}
                startIcon={
                  prepMeeting.prepSubmitted ? (
                    <CheckCircleRoundedIcon />
                  ) : (
                    <AssignmentRoundedIcon />
                  )
                }
                sx={{
                  bgcolor: prepMeeting.prepSubmitted ? '#ffffff' : brand.turquoise,
                  color: prepMeeting.prepSubmitted ? brand.turquoiseDeep : brand.ink,
                  border: prepMeeting.prepSubmitted
                    ? `2px solid ${brand.turquoise}`
                    : '2px solid transparent',
                  minHeight: 46,
                  px: 2.5,
                  whiteSpace: 'nowrap',
                  '&:hover': {
                    bgcolor: prepMeeting.prepSubmitted ? brand.turquoiseTint : brand.turquoiseDark,
                    borderColor: brand.turquoiseDark,
                  },
                }}
              >
                {prepMeeting.prepSubmitted ? 'Review your answers' : 'Start Business Review Prep'}
              </Button>
            ) : null}

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
            ) : primary.reschedulable === false ? null : (
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

            {mode === 'join' && prepMeeting?.prepHref ? (
              <Button
                href={prepMeeting.prepHref}
                startIcon={
                  prepMeeting.prepSubmitted ? (
                    <CheckCircleRoundedIcon />
                  ) : (
                    <AssignmentRoundedIcon />
                  )
                }
                sx={{
                  bgcolor: 'rgba(255,255,255,0.92)',
                  color: brand.ink,
                  border: '2px solid rgba(22,33,31,0.18)',
                  minHeight: 48,
                  px: 2.5,
                  whiteSpace: 'nowrap',
                  '&:hover': { bgcolor: '#ffffff' },
                }}
              >
                {prepMeeting.prepSubmitted ? 'Review your answers' : 'Open Business Review Prep'}
              </Button>
            ) : null}
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
