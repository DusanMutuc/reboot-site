'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand } from '@/lib/homeTheme';
import type { RequiredTraining } from './types';

/**
 * The training a coach assigned for this period.
 *
 * A row with a small identity mark, and the sizing is the argument. Cover art
 * earns its place in a layout when it is doing the deciding — which is why it
 * belongs in the browse grid below, where a member is choosing. Here there is
 * nothing to choose: the course is assigned, there is one of it, and the only
 * move is to continue. Art drawn at hero scale in a slot with no decision in
 * it reads as decoration, because that is what it is.
 *
 * Small, it has a different job it can actually do. `hero_image` is the same
 * file the library shows, so at 128px it identifies the course rather than
 * selling it — and the title set into the picture, which read as a duplicate
 * of the heading beside it at 300px, has stopped being read as type at all.
 * The mechanism is the one that lets album art carry an album's name without
 * anyone seeing it twice in a track list.
 *
 * The panel is what holds the action. Two clusters on one contained field
 * means the button belongs to the row; loose on the card it sat in the right
 * margin with nothing attaching it to anything. Progress rides the artwork,
 * as it does on the browse cards. There is no play control — the eyebrow says
 * video, the meta says how much is left, and the button says what pressing it
 * does.
 */
export default function RequiredTrainingCard({
  training,
  label = 'Required core foundational video to watch',
}: {
  training: RequiredTraining;
  /**
   * The line above the row, naming what this assignment *is*.
   *
   * Overridable because the sentence is the one part of this card that does
   * not survive a change of programme. On the standard home a course is the
   * training set for this sixty days and the next review replaces it; on the
   * 90-day offer there is one course for the whole programme, and calling that
   * "required ... to watch" frames a spine as a chore. Everything below the
   * label — the small identity mark, the parts count, the single action — is
   * correct in both cases and is why the card is shared rather than forked.
   */
  label?: string;
}) {
  const { parts } = training;
  const total = parts.length;
  const doneCount = parts.filter((part) => part.done).length;
  const finished = parts.every((part) => part.done);
  const minutesLeft = parts.reduce((sum, part) => (part.done ? sum : sum + part.minutes), 0);
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  const progressLabel = finished
    ? `All ${total} parts done`
    : doneCount === 0
      ? `${total} parts`
      : `Part ${doneCount} of ${total} done`;

  const meta = [progressLabel, !finished && minutesLeft > 0 ? `${minutesLeft} min left` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box>
      <Typography
        variant="sectionLabel"
        component="h3"
        sx={{ fontSize: { xs: 17, md: 18 }, color: brand.turquoiseDeep, mb: 2 }}
      >
        {label}
      </Typography>

      <Box
        sx={{
          bgcolor: brand.page,
          border: `1px solid ${brand.border}`,
          borderRadius: '12px',
          px: { xs: 2, md: 2.25 },
          py: 2,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: { xs: 1.75, sm: 2.5 },
          '&:hover .rt-title': { color: brand.turquoiseDeep },
        }}
      >
        {/* Artwork and words stay a row at every width. Only the action drops
            below, because at 375px three things across leaves the title about
            eleven characters. */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 1.75, sm: 2.5 },
          }}
        >
          <Box
            component={Link}
            href={training.href}
            tabIndex={-1}
            aria-hidden="true"
            sx={{
              position: 'relative',
              flexShrink: 0,
              /**
               * 128 is a judgement, but it sits inside a measured range, and
               * the range is the part worth keeping. Tested against a real
               * course hero on this page: at 152 the lettering is still
               * texture; by 176 it starts resolving into words next to the
               * heading; at 224 the row plainly prints the course name twice.
               *
               * So 152 is the ceiling, and the true one is probably a little
               * under that — the checks were read off screenshots at 0.56
               * scale, which flatters legibility.
               *
               * There is a second ceiling further out: the browse cards below
               * are 266 wide, and artwork approaching that reads this block as
               * one of them, which is the catalogue framing the small mark is
               * here to avoid.
               */
              width: { xs: 96, sm: 128 },
              aspectRatio: '16 / 9',
              borderRadius: '7px',
              overflow: 'hidden',
              bgcolor: '#e7ebea',
              border: `1px solid ${brand.border}`,
            }}
          >
            {training.heroUrl ? (
              <Image
                src={training.heroUrl}
                alt=""
                fill
                sizes="(max-width: 600px) 96px, 128px"
                style={{ objectFit: 'cover' }}
              />
            ) : null}

            {/* Same treatment as the browse cards, scaled to the smaller
                artwork: fill on a dark track, riding the bottom edge. */}
            {doneCount > 0 ? (
              <Box
                sx={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 3,
                  bgcolor: 'rgba(18,20,20,0.35)',
                }}
              >
                <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: brand.turquoise }} />
              </Box>
            ) : null}
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="slabTitle"
              sx={{ fontSize: { xs: 20, md: 22 }, lineHeight: 1.06, mb: 0.75 }}
            >
              <Box
                component={Link}
                href={training.href}
                className="rt-title"
                sx={{ color: brand.ink, textDecoration: 'none', transition: 'color .16s ease' }}
              >
                {training.title}
              </Box>
            </Typography>

            <Typography sx={{ fontSize: 14.5, color: brand.inkMuted }}>
              {meta}
              {training.contextLabel ? ` · ${training.contextLabel}` : ''}
            </Typography>
          </Box>
        </Box>

        <Box
          component={Link}
          href={training.href}
          sx={{
            flexShrink: 0,
            alignSelf: { xs: 'flex-start', sm: 'center' },
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            px: 2.25,
            py: 1.125,
            borderRadius: '10px',
            bgcolor: brand.turquoise,
            fontSize: 15,
            fontWeight: 600,
            color: brand.ink,
            textDecoration: 'none',
            transition: 'background-color .16s ease',
            '&:hover': { bgcolor: brand.turquoiseDark },
          }}
        >
          {finished ? 'Review the training' : doneCount === 0 ? 'Start the training' : 'Continue the training'}
          <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
        </Box>
      </Box>
    </Box>
  );
}
