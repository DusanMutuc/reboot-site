'use client';

import { useParams, useRouter } from 'next/navigation';
import { Box, Button, Typography } from '@mui/material';
import NextLink from 'next/link';
import TopNav from '@/components/topNav/topNav';
import StudentsPanel from '@/components/coach/StudentsPanel';

export default function CoachStudentDashboardPage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const router = useRouter();

  if (!userId) {
    return (
      <>
        <TopNav
          sections={[
            { id: 'top', label: 'STUDENT DASHBOARD' },
          ]}
        />
        <Box id="top" sx={{ height: '56px' }} />
        <Box sx={{ maxWidth: 1200, mx: 'auto', mt: 3, px: 2 }}>
          <Typography variant="body1" color="error">
            Missing or invalid student id in URL.
          </Typography>
        </Box>
      </>
    );
  }

  return (
    <>
      <TopNav
        sections={[
          { id: 'top', label: 'STUDENT DASHBOARD' },
        ]}
      />

      <Box id="top" sx={{ height: '56px' }} />

      <Box sx={{ maxWidth: 1200, mx: 'auto', mt: 3, px: 2 }}>
        <Button
          component={NextLink}
          href="/coach#dashboard"
          variant="text"
          size="small"
          sx={{ mb: 2 }}
        >
          ← Back to student list
        </Button>

        <Typography variant="h5" fontWeight={600} mb={2}>
          Student dashboard
        </Typography>

        <StudentsPanel
          courseId={2}
          initialUserId={userId}
          onStudentChange={(id) => {
            // keep URL in sync, but stay on same page
            router.replace(`/coach/student-dashboard/${id}`);
          }}
        />
      </Box>
    </>
  );
}
