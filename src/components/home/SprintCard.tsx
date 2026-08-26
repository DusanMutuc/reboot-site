'use client';

import { Box, Typography } from '@mui/material';
import { brand, CARD_RADIUS } from '@/lib/homeTheme';
import PrioritiesModule from './PrioritiesModule';
import RequiredTrainingCard from './RequiredTrainingCard';
import TrainingStandingCard from './TrainingStandingCard';
import type { Priority, RequiredTraining, TrainingStanding } from './types';

/**
 * Everything the member owes this period, in one card.
 *
 * Priorities and required training used to be separate boxes stacked down the
 * page, and in review that failed for a reason worth recording: they are not
 * separate things. A coach sets both at the same business review, against the
 * same sixty days, and splitting them made the reader work out the connection
 * that the layout should have been asserting. One card, one heading, two
 * sub-headings under it — so the plan reads as a plan.
 *
 * The stats and attendance cards sit below rather than inside, because those
 * report on the member instead of asking anything of them.
 */
export default function SprintCard({
  priorities,
  requiredTraining,
  trainingStanding,
}: {
  priorities: Priority[];
  requiredTraining: RequiredTraining | null;
  trainingStanding: TrainingStanding;
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
        Your 60-day sprint
      </Typography>

      <PrioritiesModule priorities={priorities} />

      <Box sx={{ mt: { xs: 3.5, md: 4 }, pt: { xs: 3.5, md: 4 }, borderTop: `1px solid ${brand.border}` }}>
        {requiredTraining ? (
          <RequiredTrainingCard training={requiredTraining} />
        ) : (
          <TrainingStandingCard standing={trainingStanding} />
        )}
      </Box>
    </Box>
  );
}
