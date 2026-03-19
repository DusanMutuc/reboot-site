'use client';

import {
  Alert,
  Box,
  CircularProgress,
  LinearProgress,
  List,
  ListItemButton,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import DetailedUserProgressView from '@/components/coach/DetailedUserProgressView';
import SmartDocsAnswers from '@/components/coach/SmartDocsAnswers';
import type { CoachProgressCourse, StudentWorkspaceMode } from './types';

const COACH_PANEL_HEIGHT = '70vh';
const COACH_CONTENT_MAX_WIDTH = 1180;

type ProgressTabProps = {
  coachCourses: CoachProgressCourse[];
  coachError: string | null;
  coachLoading: boolean;
  mode: StudentWorkspaceMode;
  selectedCourseId: number | null;
  selectedStudentId: string;
  onSelectCourse: (courseId: number | null) => void;
};

export default function ProgressTab({
  coachCourses,
  coachError,
  coachLoading,
  mode,
  selectedCourseId,
  selectedStudentId,
  onSelectCourse,
}: ProgressTabProps) {
  const isNarrow = useMediaQuery('(max-width:900px)');
  const selectedCourse = coachCourses.find((course) => course.id === selectedCourseId) ?? null;

  return (
    <Box sx={{ maxWidth: COACH_CONTENT_MAX_WIDTH, mx: 'auto' }}>
      {coachError ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          {coachError}
        </Alert>
      ) : null}

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
              Courses
            </Typography>
          </Box>

          {coachLoading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : coachCourses.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <Typography variant="body2" color="text.secondary">
                No courses with progress are available for this student yet.
              </Typography>
            </Box>
          ) : (
            <List sx={{ py: 1, maxHeight: isNarrow ? 360 : COACH_PANEL_HEIGHT, overflowY: 'auto' }}>
              {coachCourses.map((course) => {
                const isSelected = course.id === selectedCourseId;

                return (
                  <ListItemButton
                    key={course.id}
                    selected={isSelected}
                    onClick={() => onSelectCourse(course.id)}
                    sx={{
                      display: 'block',
                      py: 2,
                      px: 2.5,
                      mx: 0.75,
                      mb: 1,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: isSelected ? 'primary.main' : 'grey.200',
                      bgcolor: isSelected ? 'primary.50' : 'background.paper',
                      '&.Mui-selected': {
                        bgcolor: 'primary.50',
                      },
                    }}
                  >
                    <Stack spacing={1.25}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        spacing={1.5}
                        alignItems="center"
                      >
                        <Typography
                          sx={{
                            fontWeight: 700,
                            color: isSelected ? 'primary.main' : 'text.primary',
                          }}
                        >
                          {course.title}
                        </Typography>
                        <Typography sx={{ fontWeight: 800 }}>{course.progressPercent}%</Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={course.progressPercent}
                        sx={{
                          height: 8,
                          borderRadius: 999,
                          bgcolor: 'grey.200',
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 999,
                            bgcolor:
                              course.progressPercent === 100 ? 'success.main' : 'primary.main',
                          },
                        }}
                      />
                    </Stack>
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Paper>

        <Paper
          elevation={0}
          sx={{
            flexGrow: 1,
            width: '100%',
            minHeight: isNarrow ? 'auto' : COACH_PANEL_HEIGHT,
            border: '1px solid',
            borderColor: 'grey.200',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <Stack spacing={0}>
            <Box
              sx={{
                px: 3,
                py: 2.5,
                borderBottom: '1px solid',
                borderColor: 'grey.200',
                bgcolor: 'grey.50',
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {selectedCourse ? selectedCourse.title : 'Select a course'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedCourse
                  ? 'Course progress details and SmartDocs for the selected course.'
                  : 'Choose a course from the left to review progress.'}
              </Typography>
            </Box>

            <Box sx={{ borderBottom: '1px solid', borderColor: 'grey.200' }}>
              <DetailedUserProgressView
                courseId={selectedCourseId}
                userId={selectedStudentId}
                mode={mode}
              />
            </Box>

            <Box sx={{ p: { xs: 2, md: 3 } }}>
              <SmartDocsAnswers
                courseId={selectedCourseId}
                userId={selectedStudentId}
                mode={mode}
              />
            </Box>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
