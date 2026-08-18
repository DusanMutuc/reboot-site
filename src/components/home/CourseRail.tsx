'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Box, Typography } from '@mui/material';
import { brand, CARD_RADIUS } from '@/lib/homeTheme';
import Rail, { RAIL_GAP } from './Rail';
import { thumbFor } from './thumbnails';
import type { CourseItem } from './types';

const CARD_WIDTH = 304;
const MAX_SEGMENTS = 10;

/**
 * A rail of courses.
 *
 * Deliberately a different object from a resource card: wider, because a course
 * is a bigger commitment; segmented rather than a flat bar, because segments
 * are how this design already says "sequence" (see NextStepHero); and it leads
 * with part count and position rather than a duration, since what a member
 * needs to know about a course is how far in they are, not how long one sitting
 * takes.
 */
export default function CourseRail({
  label,
  courses,
}: {
  label: string;
  courses: CourseItem[];
}) {
  if (courses.length === 0) return null;

  return (
    <Rail
      label={label}
      scrollStep={CARD_WIDTH + RAIL_GAP}
      endCap={{ label: 'All training', href: '/courses' }}
    >
      {courses.map((course) => {
        const started = course.completedParts > 0;
        const segments = Math.min(course.partCount, MAX_SEGMENTS);

        return (
          <Box
            key={course.id}
            component={Link}
            href={course.href}
            sx={{
              flex: `0 0 ${CARD_WIDTH}px`,
              scrollSnapAlign: 'start',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: CARD_RADIUS,
              overflow: 'hidden',
              border: `1px solid ${started ? brand.turquoise : brand.border}`,
              bgcolor: brand.card,
              transition: 'border-color .16s ease, transform .16s ease',
              '&:hover': { borderColor: brand.turquoise, transform: 'translateY(-2px)' },
              '&:hover .cr-title': { color: brand.turquoiseDeep },
            }}
          >
            <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', bgcolor: '#e7ebea' }}>
              <Image
                src={thumbFor(course.thumbIndex).src}
                alt=""
                aria-hidden="true"
                fill
                quality={55}
                sizes="304px"
                style={{
                  objectFit: 'cover',
                  objectPosition: thumbFor(course.thumbIndex).objectPosition,
                }}
              />
              <Typography
                component="span"
                sx={{
                  position: 'absolute',
                  left: 8,
                  bottom: 8,
                  px: 0.875,
                  py: 0.25,
                  borderRadius: '4px',
                  bgcolor: brand.turquoise,
                  color: brand.ink,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Training
              </Typography>
            </Box>

            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', flex: 1 }}>
              <Typography
                className="cr-title"
                sx={{
                  fontSize: 17,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  color: brand.ink,
                  mb: 0.5,
                  transition: 'color .16s ease',
                }}
              >
                {course.title}
              </Typography>

              <Typography sx={{ fontSize: 13, color: brand.inkMuted, mb: 1.75 }}>
                {course.partCount} parts · {course.durationLabel}
              </Typography>

              <Box aria-hidden="true" sx={{ mt: 'auto', display: 'flex', gap: 0.5, mb: 1 }}>
                {Array.from({ length: segments }, (_, index) => (
                  <Box
                    key={index}
                    sx={{
                      flex: 1,
                      height: 5,
                      borderRadius: 3,
                      bgcolor: index < course.completedParts ? brand.turquoise : '#e7ebea',
                    }}
                  />
                ))}
              </Box>

              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: started ? brand.turquoiseDeep : brand.inkMuted,
                }}
              >
                {started
                  ? `Continue · part ${Math.min(course.completedParts + 1, course.partCount)}`
                  : 'Not started'}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Rail>
  );
}
