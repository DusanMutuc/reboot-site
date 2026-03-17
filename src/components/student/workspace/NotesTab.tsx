'use client';

import { useMemo } from 'react';
import {
  Box,
  List,
  ListItemButton,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import CoachingNotesPanel from '@/components/coach/CoachingNotesPanel';
import UserWinsPanel from '@/components/coach/UserWinsPanel';
import type { StudentOption } from './types';

const COACH_PANEL_HEIGHT = '70vh';
const COACH_CONTENT_MAX_WIDTH = 1180;

type NotesTabProps = {
  searchValue: string;
  selectedStudentId: string;
  students: StudentOption[];
  onSearchChange: (value: string) => void;
  onSelectStudent: (studentId: string) => void;
};

export default function NotesTab({
  searchValue,
  selectedStudentId,
  students,
  onSearchChange,
  onSelectStudent,
}: NotesTabProps) {
  const isNarrow = useMediaQuery('(max-width:900px)');

  const filteredStudents = useMemo(() => {
    const query = searchValue.trim().toLocaleLowerCase();
    if (!query) return students;

    return students.filter((student) =>
      `${student.full_name} ${student.email ?? ''}`.toLocaleLowerCase().includes(query),
    );
  }, [searchValue, students]);

  return (
    <Box sx={{ maxWidth: COACH_CONTENT_MAX_WIDTH, mx: 'auto' }}>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          border: '1px solid',
          borderColor: 'grey.200',
          borderRadius: 3,
        }}
      >
        <TextField
          size="small"
          label="Search students"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          sx={{ width: { xs: '100%', sm: 320 } }}
        />
      </Paper>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={3}
        alignItems="flex-start"
        sx={{ minHeight: 0 }}
      >
        <Paper
          elevation={0}
          sx={{
            flexBasis: isNarrow ? '100%' : 340,
            flexShrink: 0,
            alignSelf: 'flex-start',
            height: isNarrow ? 'auto' : COACH_PANEL_HEIGHT,
            maxHeight: isNarrow ? 'none' : COACH_PANEL_HEIGHT,
            border: '1px solid',
            borderColor: 'grey.200',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              px: 2.5,
              py: 2,
              bgcolor: 'grey.50',
              borderBottom: '2px solid',
              borderColor: 'grey.200',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: 0.3 }}>
              Students
            </Typography>
          </Box>
          <List sx={{ py: 0.5, maxHeight: isNarrow ? 320 : COACH_PANEL_HEIGHT, overflowY: 'auto' }}>
            {filteredStudents.map((student) => {
              const isSelected = student.id === selectedStudentId;

              return (
                <ListItemButton
                  key={student.id}
                  selected={isSelected}
                  onClick={() => onSelectStudent(student.id)}
                  sx={{
                    py: 2,
                    px: 2.5,
                    mx: 0.5,
                    mb: 0.5,
                    borderRadius: 1.5,
                    bgcolor: isSelected ? 'primary.50' : 'transparent',
                    '&:hover': {
                      bgcolor: isSelected ? 'primary.100' : 'grey.50',
                      transform: 'translateX(2px)',
                    },
                    '&.Mui-selected': {
                      bgcolor: 'primary.50',
                      borderLeft: '3px solid',
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <Box>
                    <Typography
                      sx={{
                        fontWeight: isSelected ? 700 : 600,
                        color: isSelected ? 'primary.main' : 'text.primary',
                      }}
                    >
                      {student.full_name}
                    </Typography>
                    {student.email ? (
                      <Typography variant="caption" color="text.secondary">
                        {student.email}
                      </Typography>
                    ) : null}
                  </Box>
                </ListItemButton>
              );
            })}
          </List>
        </Paper>

        <Paper
          elevation={0}
          sx={{
            flexGrow: 1,
            width: '100%',
            height: isNarrow ? 'auto' : COACH_PANEL_HEIGHT,
            maxHeight: isNarrow ? 'none' : COACH_PANEL_HEIGHT,
            border: '1px solid',
            borderColor: 'grey.200',
            borderRadius: 3,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <CoachingNotesPanel userId={selectedStudentId} />
          </Box>
        </Paper>
      </Stack>

      <Box sx={{ mt: 3 }}>
        <UserWinsPanel userId={selectedStudentId} />
      </Box>
    </Box>
  );
}
