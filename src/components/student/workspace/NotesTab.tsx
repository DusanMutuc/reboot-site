'use client';

import { Box } from '@mui/material';
import CoachingNotesPanel from '@/components/coach/CoachingNotesPanel';
import UserWinsPanel from '@/components/coach/UserWinsPanel';

const COACH_CONTENT_MAX_WIDTH = 1180;

type NotesTabProps = {
  selectedStudentId: string;
};

export default function NotesTab({ selectedStudentId }: NotesTabProps) {
  return (
    <Box sx={{ maxWidth: COACH_CONTENT_MAX_WIDTH, mx: 'auto' }}>
      <CoachingNotesPanel userId={selectedStudentId} />

      <Box sx={{ mt: 3 }}>
        <UserWinsPanel userId={selectedStudentId} />
      </Box>
    </Box>
  );
}
