'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Box, Typography } from '@mui/material';
import { brand } from '@/lib/homeTheme';
import { thumbFor } from './thumbnails';
import type { ContentItem } from './types';

/**
 * The whole of a 90-day member's library, shown at once.
 *
 * `ContentBrowser` is a preview of a catalogue too large to show, and every
 * part of it exists to manage that: category chips convey shape without
 * needing size, "For you" ranks what would otherwise be an undifferentiated
 * pile, and "Continue exploring" admits there is more behind the eight tiles.
 * None of those problems exist here. The programme includes eight systems, the
 * grid holds eight, and so the grid is not a preview of anything — it is the
 * library.
 *
 * Which means every one of those affordances has to come out, and not for
 * tidiness. Chips over a closed set of eight would filter it down to three,
 * making a complete library look like a thin one — the mechanism that makes a
 * large catalogue feel navigable makes a small one feel empty. "Continue
 * exploring" would open a door onto material this member cannot have.
 * Recommendations rank a set you cannot see all of; ranking eight visible
 * tiles is just an opinion about reading order.
 *
 * What replaces them is a count. A closed set is the one thing a catalogue
 * cannot offer — you can finish it — and saying "3 of 8 started" turns the
 * limit into the feature it actually is. The standard home can never print a
 * denominator here, because there isn't one.
 */
export default function SystemsGrid({
  systems,
  heading = 'Your systems',
  blurb,
}: {
  systems: ContentItem[];
  heading?: string;
  /** One line saying what the set is. Omitted when the set is empty. */
  blurb?: string;
}) {
  const started = systems.filter((item) => item.progressPct !== null).length;

  /**
   * The type kicker earns its place by distinguishing. On the standard browse
   * grid it separates Video from Playbook from Script from Training, and a
   * member scanning the grid uses it to decide what they are about to open.
   *
   * When every item in the set is the same type it distinguishes nothing: it
   * prints one grey uppercase word eight times, directly under a heading that
   * has already said it. So it is drawn only when the set actually contains
   * more than one type — which also means it comes back on its own if the
   * programme's contents ever stop being uniform.
   */
  const showTypeLabel = new Set(systems.map((item) => item.typeLabel)).size > 1;

  return (
    <Box component="section" id="browse">
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1.5,
          mb: 0.75,
        }}
      >
        <Typography
          variant="sectionLabel"
          component="h2"
          sx={{ fontSize: { xs: 21, md: 24 }, color: brand.ink }}
        >
          {heading}
        </Typography>

        {systems.length > 0 ? (
          <Typography sx={{ fontSize: 15, color: brand.inkMuted }}>
            {started} of {systems.length} started
          </Typography>
        ) : null}
      </Box>

      {/* Sits where the browser's recommendation note sits, and does the same
          job: name the mechanism rather than leave the reader to infer it. */}
      <Typography sx={{ minHeight: 22, mb: 2.5, fontSize: 14, lineHeight: '22px', color: brand.inkMuted }}>
        {systems.length > 0 ? blurb ?? '' : ''}
      </Typography>

      {systems.length === 0 ? (
        <Typography sx={{ fontSize: 15, color: brand.inkMuted }}>
          Your systems appear here when the programme starts.
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
              lg: 'repeat(4, minmax(0, 1fr))',
            },
            gap: { xs: 1.75, md: 2.25 },
          }}
        >
          {systems.map((entry) => (
            <SystemCard key={entry.id} entry={entry} showTypeLabel={showTypeLabel} />
          ))}
        </Box>
      )}
    </Box>
  );
}
/**
 * Deliberately the same card as the browse grid, minus the feedback controls.
 *
 * "I've finished this" and "Not interested" tune a recommender against a
 * catalogue. There is no recommender here and nothing to tune it against —
 * "not interested" in one of eight included systems has nowhere to go, since
 * hiding it would leave the member with seven and no way back.
 */
function SystemCard({ entry, showTypeLabel }: { entry: ContentItem; showTypeLabel: boolean }) {
  return (
    <Box
      component={Link}
      href={entry.href}
      sx={{
        display: 'block',
        borderRadius: '12px',
        overflow: 'hidden',
        border: `1px solid ${brand.border}`,
        bgcolor: brand.card,
        transition: 'border-color .16s ease, transform .16s ease',
        '&:hover': { borderColor: brand.turquoise, transform: 'translateY(-2px)' },
        '&:hover .ci-title': { color: brand.turquoiseDeep },
      }}
    >
      <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', bgcolor: '#e7ebea' }}>
        {entry.thumbnailUrl ? (
          <Box
            component="img"
            src={entry.thumbnailUrl}
            alt=""
            aria-hidden="true"
            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Image
            src={thumbFor(entry.thumbIndex).src}
            alt=""
            aria-hidden="true"
            fill
            quality={55}
            sizes="(max-width: 900px) 50vw, 280px"
            style={{
              objectFit: 'cover',
              objectPosition: thumbFor(entry.thumbIndex).objectPosition,
            }}
          />
        )}

        {entry.metaLabel ? (
          <Typography
            component="span"
            sx={{
              position: 'absolute',
              right: 6,
              bottom: 10,
              px: 0.75,
              py: 0.125,
              borderRadius: '4px',
              bgcolor: 'rgba(18,20,20,0.78)',
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {entry.metaLabel}
          </Typography>
        ) : null}

        {/* On the artwork rather than under it, so a card with progress and a
            card without stay the same height across a row. */}
        {entry.progressPct !== null ? (
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 5,
              bgcolor: 'rgba(18,20,20,0.35)',
            }}
          >
            <Box sx={{ width: `${entry.progressPct}%`, height: '100%', bgcolor: brand.turquoise }} />
          </Box>
        ) : null}
      </Box>

      <Box sx={{ p: 1.5 }}>
        {showTypeLabel ? (
          <Typography variant="kicker" sx={{ color: brand.inkMuted, mb: 0.5 }}>
            {entry.typeLabel}
          </Typography>
        ) : null}
        <Typography
          className="ci-title"
          sx={{
            fontSize: 15,
            fontWeight: 500,
            lineHeight: 1.35,
            color: brand.ink,
            transition: 'color .16s ease',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: 39,
          }}
        >
          {entry.title}
        </Typography>
      </Box>
    </Box>
  );
}
