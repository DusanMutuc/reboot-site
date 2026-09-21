'use client';

import { Box, Typography } from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { brand, CARD_RADIUS, REPORT_HEADING_HEIGHT } from '@/lib/homeTheme';
import type { CoachingAttendance } from './types';

/**
 * What the member has actually turned up to this period.
 *
 * The previous version was a single "7 of 8 meetings" ratio over an eight-box
 * strip, and it was unreadable: it never said which meetings it counted, so
 * the number could not be judged. Naming each row fixes that, and once the
 * rows are named the denominators become useful rather than cryptic. Every
 * mark on the live home maps to one attendance-backed meeting record in the
 * member's current cycle; it is not a hard-coded programme target.
 *
 * Marks rather than a bar, because these are discrete events and there are
 * never many of them. A bar would imply a continuum that six sessions do not
 * have, and would lose the "one more to go" reading a row of pips gives free.
 */
export default function AttendanceCard({ attendance }: { attendance: CoachingAttendance }) {
  return (
    <Box
      component="section"
      id="attendance"
      sx={{
        bgcolor: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: CARD_RADIUS,
        p: { xs: 2.5, md: 3 },
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Height shared with the stats card alongside — see
          REPORT_HEADING_HEIGHT. */}
      <Box sx={{ minHeight: { md: REPORT_HEADING_HEIGHT }, mb: 2.5 }}>
        <Typography
          variant="sectionLabel"
          component="h2"
          sx={{ fontSize: { xs: 19, md: 21 }, color: brand.ink, mb: 0.375 }}
        >
          Your coaching attendance
        </Typography>
        <Typography sx={{ fontSize: 14, color: brand.inkMuted }}>
          {attendance.periodLabel}
        </Typography>
      </Box>

      {/* Distributes rather than sitting at a fixed height.
       *
       * These two cards share a grid row, so the taller one sets the height
       * and the other is stretched to match. Hand-tuning this gap to land on
       * the stats card's height worked until the stats card changed, twice.
       * Filling the space it is given instead means the rows spread to
       * whatever arrives and no dead band opens at the bottom — whichever
       * card is taller, and however many rows the cadence turns out to have.
       * The gap is the floor, not the spacing. */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 2.25,
        }}
      >
        {attendance.rows.map((row) => (
          <Box key={row.label}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 1.5,
                mb: 0.875,
              }}
            >
              <Typography sx={{ fontSize: 15, fontWeight: 500, color: brand.ink, minWidth: 0 }}>
                {row.label}
              </Typography>
              <Typography
                sx={{
                  flexShrink: 0,
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: row.attended >= row.total ? brand.turquoiseDeep : brand.inkMuted,
                }}
              >
                {row.attended} of {row.total}
              </Typography>
            </Box>

            <Box
              aria-hidden="true"
              sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.625 }}
            >
              {(row.meetings ?? Array.from({ length: row.total }, (_, index) => ({
                id: `fixture-${index}`,
                dateLabel: '',
                attended: index < row.attended,
              }))).map((meeting) => {
                const attended = meeting.attended;
                return (
                  <Box
                    key={meeting.id}
                    title={
                      meeting.dateLabel
                        ? `${meeting.dateLabel} — ${attended ? 'attended' : 'not attended'}`
                        : undefined
                    }
                    sx={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: attended ? brand.turquoise : 'transparent',
                      border: attended ? 'none' : `1.5px solid ${brand.border}`,
                    }}
                  >
                    {attended ? (
                      <CheckRoundedIcon sx={{ fontSize: 14, color: brand.ink }} />
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
