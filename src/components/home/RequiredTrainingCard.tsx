'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand, CARD_RADIUS } from '@/lib/homeTheme';
import type { RequiredTraining } from './types';

/**
 * The course a coach assigned for this period.
 *
 * The card used to be a status readout — a title, a count, a bar — and it had
 * so little in it that the progress had to live in a tinted well just to stop
 * the surplus height reading as a hole. That was treating the symptom. What
 * was actually missing is the thing the member is about to do, so the card now
 * names the next part, how long it is, and what it covers, and the well is
 * gone because there is no longer a gap to fill.
 *
 * It also moves the emphasis to the right place. Progress is demoted to a
 * single line of text and a hairline bar, because how far along you are
 * matters less than what is next; the next part gets the weight, and
 * "Continue the course" means something now that you can see what you are
 * continuing into.
 *
 * The bar stays segmented, but at 6px rather than the 20px pills it replaced.
 * The reason segments failed before was weight, not segmentation: at full
 * height they were indistinguishable from the attendance blocks in the card
 * alongside, so the two read as one repeated object. Thin, they keep the
 * honest reading — a course moves in discrete parts — without the collision.
 */
export default function RequiredTrainingCard({ training }: { training: RequiredTraining }) {
  const { parts } = training;
  const total = parts.length;
  const doneCount = parts.filter((part) => part.done).length;
  const nextIndex = parts.findIndex((part) => !part.done);
  const finished = nextIndex === -1;
  const nextPart = finished ? null : parts[nextIndex];
  const minutesLeft = parts.reduce((sum, part) => (part.done ? sum : sum + part.minutes), 0);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        bgcolor: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: CARD_RADIUS,
        p: { xs: 2.5, md: 3 },
        transition: 'border-color .16s ease',
        '&:hover, &:focus-within': { borderColor: brand.turquoise },
        '&:hover .rt-title': { color: brand.turquoiseDeep },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1.5,
          mb: 1.5,
        }}
      >
        <Typography variant="eyebrow" component="div" sx={{ color: brand.turquoiseDeep }}>
          Your current training
        </Typography>
        {training.contextLabel ? (
          <Typography sx={{ fontSize: 13, color: brand.inkMuted, flexShrink: 0 }}>
            {training.contextLabel}
          </Typography>
        ) : null}
      </Box>

      <Typography variant="cardTitle" sx={{ fontSize: 23, lineHeight: 1.3, mb: 2.25 }}>
        <Box
          component={Link}
          href={training.href}
          className="rt-title"
          sx={{ color: brand.ink, textDecoration: 'none', transition: 'color .16s ease' }}
        >
          {training.title}
        </Box>
      </Typography>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1.5,
          mb: 1,
        }}
      >
        <Typography sx={{ fontSize: 15, fontWeight: 500, color: brand.ink }}>
          {finished
            ? `All ${total} parts done`
            : doneCount === 0
              ? `${total} parts`
              : `Part ${doneCount} of ${total} done`}
        </Typography>
        {!finished && minutesLeft > 0 ? (
          <Typography sx={{ fontSize: 15, fontWeight: 500, color: brand.inkSoft, flexShrink: 0 }}>
            {minutesLeft} min left
          </Typography>
        ) : null}
      </Box>

      {/* Decorative: the line above states the count in words, and the block
          below names the next part outright, so a progressbar role here would
          only make a screen reader say it a third time. */}
      <Box
        aria-hidden="true"
        sx={{
          display: 'flex',
          gap: 0.5,
          '@keyframes rtSegment': {
            from: { opacity: 0, transform: 'scaleX(0)' },
            to: { opacity: 1, transform: 'scaleX(1)' },
          },
        }}
      >
        {parts.map((part, index) => (
          <Box
            key={part.title}
            sx={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              bgcolor: part.done ? brand.turquoise : '#e2e9e7',
              transformOrigin: 'left center',
              animation: 'rtSegment .42s cubic-bezier(.2,.7,.3,1) both',
              animationDelay: `${index * 70}ms`,
            }}
          />
        ))}
      </Box>

      <Box sx={{ borderTop: `1px solid ${brand.border}`, mt: 2.5, pt: 2.5, mb: 2.5 }}>
        {nextPart ? (
          <>
            <Typography
              variant="kicker"
              component="div"
              sx={{ color: brand.turquoiseDeep, mb: 0.75 }}
            >
              Up next · Part {nextIndex + 1} · {nextPart.minutes} min
            </Typography>
            <Typography variant="cardTitle" sx={{ color: brand.ink, mb: 0.75 }}>
              {nextPart.title}
            </Typography>
            <Typography sx={{ fontSize: 15, lineHeight: 1.5, color: brand.inkSoft }}>
              {nextPart.description}
            </Typography>
          </>
        ) : (
          <Typography sx={{ fontSize: 15, lineHeight: 1.5, color: brand.inkSoft }}>
            Every part is done. It stays open if you want to go back through any of it.
          </Typography>
        )}
      </Box>

      <Box
        component={Link}
        href={training.href}
        sx={{
          mt: 'auto',
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          px: 2,
          py: 1,
          borderRadius: '10px',
          border: `1px solid ${brand.borderStrong}`,
          fontSize: 15,
          fontWeight: 500,
          color: brand.ink,
          textDecoration: 'none',
          transition: 'border-color .16s ease, background-color .16s ease',
          '&:hover': { borderColor: brand.turquoise, bgcolor: brand.turquoiseTint },
        }}
      >
        {finished ? 'Review the course' : doneCount === 0 ? 'Start the course' : 'Continue the course'}
        <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
      </Box>
    </Box>
  );
}
