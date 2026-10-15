'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Box, Skeleton, Tab, Tabs, Typography } from '@mui/material';
import CoachShell, { COACH_MAX_WIDTH } from '@/components/coach/CoachShell';
import StudentStatusOverview from '@/components/StudentStatusOverview';
import BookingFollowUpPanel from '@/components/bookingFollowUp/BookingFollowUpPanel';
import { brand } from '@/lib/homeTheme';

function MemberViews() {
  const searchParams = useSearchParams();
  const view = searchParams.get('view') === 'follow-up' ? 'follow-up' : 'roster';
  return (
    <>
      <Tabs value={view} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Member views" sx={{ mb: 3, borderBottom: `1px solid ${brand.border}`, '& .MuiTab-root': { fontSize: 14, textTransform: 'none', px: 2, minHeight: 48 }, '& .Mui-selected': { color: `${brand.turquoiseDeep} !important` } }}>
        <Tab component={Link} href="/coach/members" value="roster" label="Member roster" id="members-roster-tab" aria-controls="members-roster-panel" />
        <Tab component={Link} href="/coach/members?view=follow-up" value="follow-up" label="Booking follow-up" id="members-follow-up-tab" aria-controls="members-follow-up-panel" />
      </Tabs>
      <Box role="tabpanel" id={`members-${view}-panel`} aria-labelledby={`members-${view}-tab`}>
        {view === 'follow-up' ? <BookingFollowUpPanel mode="coach" /> : <StudentStatusOverview courseId={2} workspaceMode="coach" />}
      </Box>
    </>
  );
}

export default function CoachMembersPage() {
  return (
    <CoachShell>
      <Box component="main" sx={{ maxWidth: COACH_MAX_WIDTH, mx: 'auto', px: { xs: 2.5, md: 4 }, py: { xs: 3, md: 4 } }}>
        <Typography component="h1" variant="h2" sx={{ mb: 0.75 }}>Members</Typography>
        <Typography sx={{ color: brand.inkSoft, fontSize: 14, mb: 2.5 }}>Member activity, coaching status, and bookings that need follow-up.</Typography>
        <Suspense fallback={<Skeleton variant="rounded" height={250} />}><MemberViews /></Suspense>
      </Box>
    </CoachShell>
  );
}
