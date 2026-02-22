'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Button, Typography } from '@mui/material';
import NextLink from 'next/link';
import TopNav from '@/components/topNav/topNav';
import StudentsPanel from '@/components/coach/StudentsPanel';
import PrivateNotesPanel from '@/components/coach/PrivateNotesPanel';

export default function CoachStudentDashboardPage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const router = useRouter();
  const [selectedStudentId, setSelectedStudentId] = useState<string>(userId ?? '');

  const hasValidUser = useMemo(() => Boolean(userId), [userId]);

  if (!hasValidUser) {
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

      <Box sx={{ maxWidth: 1640, mx: 'auto', mt: 3, px: 2 }}>
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

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 320px' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <StudentsPanel
            courseId={2}
            initialUserId={userId}
            onStudentChange={(id) => {
              setSelectedStudentId(id);
              router.replace(`/coach/student-dashboard/${id}`);
            }}
          />

          {selectedStudentId && <PrivateNotesPanel userId={selectedStudentId} />}
        </Box>
      </Box>
    </>
  );
}
