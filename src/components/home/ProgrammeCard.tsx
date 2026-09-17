'use client';

import { Box, Typography } from '@mui/material';
import { brand, CARD_RADIUS } from '@/lib/homeTheme';
import CurrentFocusModule from './CurrentFocusModule';
import RequiredTrainingCard from './RequiredTrainingCard';
import type { CurrentFocus, ProgrammeWeek, RequiredTraining } from './types';

/**
 * Everything the 90-day offer asks of a member, in one card.
 *
 * The same argument as `SprintCard`, applied to a different programme: the
 * focus and the course are not separate things a member has to relate to each
 * other. They are two halves of one offer — one rotates weekly, one runs the
 * whole ninety days — and stacking them as separate boxes made the reader do
 * the joining that the layout should be asserting.
 *
 * The two halves are ordered by how often they change, not by importance. The
 * focus is what is different about today; the course is what has been true
 * since week one. A member returning on a Tuesday is here to find out what
 * moved, and the thing that moved goes first.
 */
export default function ProgrammeCard({
  focus,
  week,
  course,
}: {
  focus: CurrentFocus | null;
  week: ProgrammeWeek;
  /** The single course that runs the whole programme. */
  course: RequiredTraining | null;
}) {
  return (
    <Box
      component="section"
      id="next"
      sx={{
        bgcolor: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: CARD_RADIUS,
        p: { xs: 3, md: 4 },
        animation: 'homeRise .34s ease-out both',
      }}
    >
      <Typography
        variant="sectionLabel"
        component="h2"
        sx={{ fontSize: { xs: 27, md: 32 }, color: brand.ink, mb: { xs: 3, md: 3.5 } }}
      >
        Your 90 days
      </Typography>

      <CurrentFocusModule focus={focus} week={week} />

      {course ? (
        <Box
          sx={{
            mt: { xs: 3.5, md: 4 },
            pt: { xs: 3.5, md: 4 },
            borderTop: `1px solid ${brand.border}`,
          }}
        >
          {/* "Runs alongside" rather than "required", because it does. The
              course is not this week's homework and saying so stops a member
              reading it as work they are already behind on in week one. */}
          <RequiredTrainingCard training={course} label="Your course for the 90 days" />
        </Box>
      ) : null}
    </Box>
  );
}
