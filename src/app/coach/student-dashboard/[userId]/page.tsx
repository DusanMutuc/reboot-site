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

      <Box sx={{ mt: 3, px: 2 }}>
        <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
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
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1200px)',
              xl: '1fr minmax(0, 1200px) 320px 1fr',
            },
            gap: 2,
            justifyContent: 'center',
            alignItems: 'start',
          }}
        >
          <Box sx={{ gridColumn: { xs: '1', xl: '2' } }}>
            <StudentsPanel
              courseId={2}
              initialUserId={userId}
              onStudentChange={(id) => {
                setSelectedStudentId(id);
                if (id !== userId) router.replace(`/coach/student-dashboard/${id}`);
              }}
            />
          </Box>

          {selectedStudentId && (
            <Box sx={{ gridColumn: { xs: '1', xl: '3' } }}>
              <PrivateNotesPanel userId={selectedStudentId} />
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}
