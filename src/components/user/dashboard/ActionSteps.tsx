// src/components/user/dashboard/ActionSteps.tsx
import { Paper, Typography, Box, Stack, Button } from '@mui/material';
import type { DashboardActionStep } from '@/types/dashboard';

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
      <Typography 
        variant="h3" 
        fontWeight={700} 
        mb={3}
        sx={{ 
          letterSpacing: '-0.02em',
          color: 'text.primary'
        }}
      >
        Action Steps
      </Typography>

      {steps.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No active action steps right now.
        </Typography>
      ) : (
        <Box sx={{ overflow: 'auto', maxHeight: 520, pr: 0.5 }}>
          <Stack spacing={2}>
            {steps.map((step) => (
              <Box
                key={step.id}
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  bgcolor: 'grey.50',
                  border: '1px solid',
                  borderColor: 'grey.200',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'primary.50',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
                  }
                }}
              >
                <Typography
                  variant="h6"
                  fontWeight={700}
                  sx={{
                    lineHeight: 1.4,
                    color: 'text.primary',
                    fontSize: '1.25rem',
                    letterSpacing: '-0.02em',
                    mb: 0.5
                  }}
                >
                  {step.label}
                </Typography>

                {step.library_item_id && (
                  <Button
                    size="small"
                    variant="outlined"
                    href={`/library/${step.library_item_id}`}
                    sx={{
                      alignSelf: 'flex-start',
                      height: 32,
                      px: 1.75,
                      borderRadius: 1.5,
                      textTransform: 'none',
                      fontWeight: 500,
                      fontSize: '0.8125rem',
                      borderColor: 'primary.main',
                      color: 'primary.main',
                      borderWidth: 1.5,
                      '&:hover': {
                        bgcolor: 'primary.main',
                        color: 'white',
                        borderWidth: 1.5,
                        transform: 'translateX(2px)'
                      }
                    }}
                  >
                    Open resource →
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