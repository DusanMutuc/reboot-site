import { Paper, Typography, Box, Stack, Chip, Button } from '@mui/material';
import type { DashboardActionStep } from '@/types/dashboard';

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

export default function ActionSteps({ steps }: { steps: DashboardActionStep[] }) {
  return (
    <Paper sx={{ p: 2, borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" fontWeight={600} mb={1}>
        Action Steps
      </Typography>
      {steps.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No active action steps right now.
        </Typography>
      ) : (
        <Box sx={{ overflow: 'auto', maxHeight: 300, pr: 0.5 }}>
          <Stack spacing={1.25}>
            {steps.map((step) => (
              <Box
                key={step.id}
                sx={{
                  p: 1.25,
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
        </Box>
      )}
    </Paper>
  );
}
