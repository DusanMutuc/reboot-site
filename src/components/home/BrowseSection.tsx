'use client';

import Link from 'next/link';
import { Box } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand } from '@/lib/homeTheme';
import BrowseRail from './BrowseRail';
import CourseRail from './CourseRail';
import type { BrowseRow, CourseItem } from './types';

/**
 * Browsing, as distinct from searching: no query to formulate and nothing to
 * decide before content is visible. Type filters are deliberately absent —
 * "course" versus "playbook" is our filing system, not a reason anyone picks
 * something.
 */
export default function BrowseSection({
  rows,
  courses,
}: {
  rows: BrowseRow[];
  courses: CourseItem[];
}) {
  if (rows.length === 0 && courses.length === 0) return null;

  return (
    <Box component="section" id="browse">
      {/* No section heading: the zone banner above already names this
          territory, and the rail labels carry the framings. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 3.5, md: 4 } }}>
        {rows.map((row) => (
          <BrowseRail key={row.id} row={row} />
        ))}

        {/* Courses last: the rails above are the low-friction browse, and a
            course is a larger commitment. Its cards look different enough to
            stand out despite the position. */}
        <CourseRail label="Training" courses={courses} />
      </Box>

      <Box
        component={Link}
        href="/library"
        sx={{
          mt: 3,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          fontSize: 15,
          fontWeight: 500,
          color: brand.turquoiseDeep,
          '&:hover': { color: brand.ink },
        }}
      >
        Browse everything
        <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
      </Box>
    </Box>
  );
}
