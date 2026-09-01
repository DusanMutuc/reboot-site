'use client';

import { Box, Button, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand } from '@/lib/homeTheme';
import type { CurrentFocus, ProgrammeWeek } from './types';

/** Shared line box, so the two column labels sit on one baseline. See PrioritiesModule. */
const LABEL_LINE_BOX = { xs: '18.7px', md: '19.8px' };

/**
 * The one thing this week, for everyone on the 90-day offer.
 *
 * `PrioritiesModule` with the list taken out, and deliberately nothing else.
 * Every type size, colour and margin here is that module's — the label at
 * 17/18 on `turquoiseDeep`, the title at 26/32 against a 640 measure, the
 * detail at 16 on `inkSoft`, the same slate button. Two members of the same
 * community will compare these pages, and a focus card that sat at its own
 * scale would read as a different product rather than a different length of
 * the same one.
 *
 * An earlier pass ran the title at 36 on the argument that nothing here
 * competes with it, and added a line under the ruler naming the focus as
 * cohort-wide. Both are gone. The first bought emphasis the card had not
 * asked for; the second was prose in a module whose whole discipline is that
 * it carries a title, one line of cost, and a button. Whether members are told
 * the focus is shared is a product decision, and it does not belong here —
 * this module states the work, and states it the way the standard home does.
 *
 * The one thing the layout cannot inherit is the right column. On the standard
 * home it holds the other two action steps, which is what stops a single
 * expanded item reading as the entire plan; here there is no second item, so
 * it holds what plays the same role — the position of this week inside the
 * thirteen. That is a fact about the calendar, not a claim about the focus:
 * an admin moves the focus on when the group is ready, so the two are related
 * without being locked together.
 */
export default function CurrentFocusModule({
  focus,
  week,
}: {
  focus: CurrentFocus | null;
  week: ProgrammeWeek;
}) {
  return (
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
          component="h3"
          sx={{
            fontSize: { xs: 17, md: 18 },
            lineHeight: LABEL_LINE_BOX,
            color: brand.turquoiseDeep,
            mb: 1.75,
          }}
        >
          Your current focus
        </Typography>

        {focus ? (
          <>
            <Typography
              variant="slabTitle"
              sx={{ fontSize: { xs: 26, md: 32 }, color: brand.ink, mb: 1.25, maxWidth: 640 }}
            >
              {focus.title}
            </Typography>

            {/* Stating what the first move costs is what lowers resistance. */}
            {focus.detail ? (
              <Typography sx={{ fontSize: 16, color: brand.inkSoft, mb: 3 }}>
                {focus.detail}
              </Typography>
            ) : (
              <Box sx={{ mb: 3 }} />
            )}

            {focus.guideHref ? (
              <Button
                href={focus.guideHref}
                endIcon={<ArrowForwardRoundedIcon />}
                sx={{
                  bgcolor: brand.slate,
                  color: '#ffffff',
                  fontSize: 17,
                  px: 3.5,
                  minHeight: 54,
                  '&:hover': { bgcolor: '#000000' },
                }}
              >
                Open the system
              </Button>
            ) : (
              <Typography sx={{ fontSize: 15, color: brand.inkMuted }}>
                No system for this one — it is covered on your next group call.
              </Typography>
            )}
          </>
        ) : (
          <>
            <Typography
              variant="slabTitle"
              sx={{ fontSize: 24, color: brand.ink, mb: 1 }}
            >
              Nothing set yet
            </Typography>
            <Typography sx={{ fontSize: 16, color: brand.inkSoft }}>
              This week&rsquo;s focus appears here before your next group call.
            </Typography>
          </>
        )}
      </Box>

      <Box
        sx={{
          borderLeft: { xs: 'none', md: `1px solid ${brand.border}` },
          borderTop: { xs: `1px solid ${brand.border}`, md: 'none' },
          pl: { xs: 0, md: 4 },
          pt: { xs: 3, md: 0 },
        }}
      >
        <Typography
          variant="sectionLabel"
          component="p"
          sx={{
            fontSize: 15,
            lineHeight: LABEL_LINE_BOX,
            color: brand.inkMuted,
            mb: 1.75,
          }}
        >
          Week {week.current} of {week.total}
        </Typography>

        <WeekRuler current={week.current} total={week.total} />
      </Box>
    </Box>
  );
}
/**
 * Thirteen weeks as thirteen marks.
 *
 * Marks rather than a percentage bar, for the reason the attendance card gives:
 * these are discrete and there are never many of them, and a bar would imply a
 * continuum thirteen weeks do not have. It also gives the "ten to go" reading
 * for free, which is the figure a member on week three actually wants.
 *
 * The current week is drawn as an outline rather than a fill. Filled, it joins
 * the run of completed weeks and the position stops being findable; hollow, it
 * is the one mark on the row that is neither done nor untouched, which is
 * exactly what it is.
 */
function WeekRuler({ current, total }: { current: number; total: number }) {
  return (
    <Box
      role="img"
      aria-label={`Week ${current} of ${total}`}
      sx={{ display: 'flex', gap: '5px', alignItems: 'stretch' }}
    >
      {Array.from({ length: total }, (_, index) => {
        const weekNumber = index + 1;
        const done = weekNumber < current;
        const isCurrent = weekNumber === current;

        return (
          <Box
            key={weekNumber}
            aria-hidden="true"
            sx={{
              flex: 1,
              minWidth: 6,
              height: 10,
              borderRadius: '3px',
              bgcolor: done ? brand.turquoise : isCurrent ? 'transparent' : brand.border,
              border: isCurrent ? `2px solid ${brand.turquoiseDeep}` : '2px solid transparent',
            }}
          />
        );
      })}
    </Box>
  );
}
