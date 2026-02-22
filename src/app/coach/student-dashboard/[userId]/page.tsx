'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import NotesIcon from '@mui/icons-material/StickyNote2';
import NextLink from 'next/link';
import TopNav from '@/components/topNav/topNav';
import StudentsPanel from '@/components/coach/StudentsPanel';
import PrivateNotesPanel from '@/components/coach/PrivateNotesPanel';

const SIDEBAR_WIDTH = 360;

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

      <Box
        sx={{
          mt: 3,
          px: 2,
          transition: 'margin-right 0.35s cubic-bezier(0.4,0,0.2,1)',
          mr: { xs: 0, lg: notesOpen ? `${SIDEBAR_WIDTH}px` : 0 },
        }}
      >
        <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
          <Button component={NextLink} href="/coach#dashboard" variant="text" size="small" sx={{ mb: 2 }}>
            ← Back to student list
          </Button>

          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            mb={2}
            sx={{ pr: { xs: 0, sm: 3 } }}
          >
            <Typography variant="h5" fontWeight={600}>
              Student dashboard
            </Typography>
            <Box sx={{ width: 190, flexShrink: 0 }}>
              <Button
                variant={notesOpen ? 'contained' : 'outlined'}
                size="small"
                fullWidth
                startIcon={<NotesIcon />}
                onClick={() => setNotesOpen((prev) => !prev)}
              >
                Private notes
              </Button>
            </Box>
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

      <Box
        sx={{
          position: 'fixed',
          top: '56px',
          right: 0,
          bottom: 0,
          width: { xs: '100%', sm: `${SIDEBAR_WIDTH}px` },
          bgcolor: 'background.paper',
          borderLeft: '1px solid',
          borderColor: 'divider',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
          zIndex: 1200,
          transform: notesOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6" fontWeight={700}>Private notes</Typography>
            <Typography
              variant="caption"
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 99,
                bgcolor: '#fef3c7',
                color: '#92400e',
                fontWeight: 600,
              }}
            >
              🔒 Coach only
            </Typography>
          </Stack>
          <IconButton onClick={() => setNotesOpen(false)} aria-label="Close private notes panel">
            <CloseIcon />
          </IconButton>
        </Box>

        <Box sx={{ p: 2, flex: 1, minHeight: 0 }}>
          {selectedStudentId && <PrivateNotesPanel userId={selectedStudentId} />}
        </Box>
      </Box>
    </>
  );
}
