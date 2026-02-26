// src/components/user/dashboard/ActionSteps.tsx
import { Paper, Typography, Box, Stack, Button, Chip } from '@mui/material';
import type { DashboardActionStep } from '@/types/dashboard';
import { getContentNodeHref } from '@/lib/contentNodeLinks';

// Status configuration
const statusConfig = {
  not_started: {
    label: 'Not Started',
    color: '#64748b',
    bgColor: '#f8fafc',
    borderColor: '#e2e8f0',
    buttonColor: '#64748b',
  },
  in_progress: {
    label: 'In Progress',
    color: '#2563eb',
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
    buttonColor: '#2563eb',
  },
  complete: {
    label: 'Completed',
    color: '#16a34a',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    buttonColor: '#16a34a',
  },
};

export default function ActionSteps({ steps }: { steps: DashboardActionStep[] }) {
  return (
    <Paper 
      elevation={0}
      sx={{ 
        p: 3, 
        borderRadius: 3, 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}
    >
      <Typography variant="h3" fontWeight={600} mb={2.5}>
  Action Steps
</Typography>

      {steps.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No active action steps right now.
        </Typography>
      ) : (
        <Box sx={{ overflow: 'auto', maxHeight: 520, pr: 0.5 }}>
          <Stack spacing={2}>
            {steps.map((step) => {
              const status = statusConfig[step.status];
              const isCompleted = step.status === 'complete';
              
              return (
                <Box
                  key={step.id}
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    bgcolor: status.bgColor,
                    border: '1px solid',
                    borderColor: status.borderColor,
                    borderLeft: `4px solid ${status.color}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.25,
                    transition: 'all 0.2s ease-in-out',
                    opacity: isCompleted ? 0.75 : 1,
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: `0 4px 12px ${status.color}25`,
                    }
                  }}
                >
                  {/* Header with title and status */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                    <Typography
                      variant="h6"
                      fontWeight={600}
                      sx={{
                        lineHeight: 1.4,
                        color: isCompleted ? 'text.secondary' : 'text.primary',
                        fontSize: '13px',
                        flex: 1,
                      }}
                    >
                      {step.label}
                    </Typography>
                    
                    <Chip
                      label={status.label}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '11px',
                        fontWeight: 600,
                        bgcolor: 'white',
                        color: status.color,
                        border: `1.5px solid ${status.color}`,
                        flexShrink: 0,
                        '& .MuiChip-label': {
                          px: 1,
                        }
                      }}
                    />
                  </Box>

                  {/* Action button */}
                  {step.library_item_id && (
  <Button
    size="small"
    variant="contained"
    href={getContentNodeHref({
      id: step.library_item_id,
      slug: step.linked_node?.slug ?? null,
      node_type: step.linked_node?.node_type ?? null,
    })}
    target="_blank"
    rel="noopener noreferrer"
    sx={{
      alignSelf: 'flex-start',
      height: 36,
      px: 2,
      borderRadius: 1.5,
      textTransform: 'none',
      fontWeight: 600,
      fontSize: '13px',
      bgcolor: status.buttonColor,
      color: 'white',
      boxShadow: 'none',
      '&:hover': {
        bgcolor: status.buttonColor,
        opacity: 0.85,
        boxShadow: `0 2px 8px ${status.buttonColor}40`,
      }
    }}
  >
    View Guide →
  </Button>
)}

                </Box>
              );
            })}
          </Stack>
        </Box>
      )}
    </Paper>
  );
}
