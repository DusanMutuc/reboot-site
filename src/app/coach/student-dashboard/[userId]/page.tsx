'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import NotesIcon from '@mui/icons-material/StickyNote2';
import NextLink from 'next/link';
import TopNav from '@/components/topNav/topNav';
import StudentsPanel from '@/components/coach/StudentsPanel';
import PrivateNotesPanel from '@/components/coach/PrivateNotesPanel';

export default function CoachStudentDashboardPage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const router = useRouter();
  const [selectedStudentId, setSelectedStudentId] = useState<string>(userId ?? '');
  const [notesOpen, setNotesOpen] = useState(false);

  const hasValidUser = useMemo(() => Boolean(userId), [userId]);

  if (!hasValidUser) {
    return (
      <>
        <TopNav sections={[{ id: 'top', label: 'STUDENT DASHBOARD' }]} />
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
      <TopNav sections={[{ id: 'top', label: 'STUDENT DASHBOARD' }]} />

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

          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} gap={1}>
            <Typography variant="h5" fontWeight={600}>
              Student dashboard
            </Typography>

            <Button
              variant="outlined"
              startIcon={<NotesIcon />}
              onClick={() => setNotesOpen(true)}
            >
              Private notes
            </Button>
          </Stack>

          <StudentsPanel
            courseId={2}
            initialUserId={userId}
            onStudentChange={(id) => {
              setSelectedStudentId(id);
              if (id !== userId) router.replace(`/coach/student-dashboard/${id}`);
            }}
          />
        </Box>
      </Box>

      <Drawer
        anchor="right"
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 420 },
            p: 2,
            bgcolor: 'background.default',
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" fontWeight={600}>Private notes</Typography>
          <IconButton onClick={() => setNotesOpen(false)} aria-label="Close private notes panel">
            <CloseIcon />
          </IconButton>
        </Box>

        {selectedStudentId && <PrivateNotesPanel userId={selectedStudentId} />}
      </Drawer>
    </>
  );
}
