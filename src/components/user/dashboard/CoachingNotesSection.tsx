// src/components/user/dashboard/CoachingNotesSection.tsx
import {
    Box,
    Paper,
    Typography,
    Chip,
    Stack,
    Button,
    Divider,
  } from '@mui/material';
  import type { CoachingNotesSectionProps, DashboardActionStep } from '@/types/dashboard';
  
  function statusColor(status: DashboardActionStep['status']) {
    switch (status) {
      case 'complete':
        return 'success';
      case 'in_progress':
        return 'warning';
      default:
        return 'default';
    }
  }
  
  export default function CoachingNotesSection({
    actionSteps,
    notes,
  }: CoachingNotesSectionProps) {
    return (
      <Paper sx={{ p: 3, borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" fontWeight={600} mb={2}>
          Coaching Notes & Action Steps
        </Typography>
  
        <Box display="flex" flexDirection="column" gap={2} flex={1}>
          {/* Action Steps */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Action Steps
            </Typography>
            {actionSteps.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No active action steps right now.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {actionSteps.map((step) => (
                  <Box
                    key={step.id}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: 'action.hover',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                    }}
                  >
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" fontWeight={600}>
                        {step.label}
                      </Typography>
                      <Chip
                        label={step.status.replace('_', ' ')}
                        size="small"
                        color={statusColor(step.status) as any}
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </Box>
                    {step.library_item_id && (
                      <Button
                        size="small"
                        variant="text"
                        sx={{ alignSelf: 'flex-start', mt: 0.5 }}
                        href={`/library/${step.library_item_id}`}
                      >
                        Open related resource
                      </Button>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
  
          <Divider />
  
          {/* Notes preview */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Recent Coaching Notes
            </Typography>
            {notes.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No recent notes yet.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {notes.map((note) => (
                  <Box
                    key={note.id}
                    sx={{
                      p: 1.25,
                      borderRadius: 2,
                      bgcolor: 'background.default',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2">
                      {note.body}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 0.5 }}
                    >
                      {new Date(note.created_at).toLocaleString()}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Box>
      </Paper>
    );
  }
  