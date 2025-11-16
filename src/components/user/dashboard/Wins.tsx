// src/components/user/dashboard/Wins.tsx
import { Box, Paper, Typography, Stack } from '@mui/material';
import type { WinsProps, DashboardWin } from '@/types/dashboard';

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function Wins({ wins }: WinsProps) {
  return (
    <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
      <Typography variant="h6" fontWeight={600} mb={2.5}>
        Wins
      </Typography>

      {wins.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No wins logged yet.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {wins.map((win: DashboardWin) => (
            <Box
              key={win.id}
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: '#FFFBF0',
                border: '1px solid #FFE599',
                borderLeft: '4px solid #FFB800',
                transition: 'all 0.2s ease-in-out',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(255, 184, 0, 0.15)',
                },
              }}
            >
              <Typography 
                variant="body2" 
                sx={{ 
                  fontSize: '11px',
                  lineHeight: 1.5,
                  color: 'text.primary',
                  fontWeight: 500,
                }}
              >
                {win.body}
              </Typography>
              <Typography
                variant="caption"
                sx={{ 
                  display: 'block', 
                  mt: 0.5,
                  color: 'text.secondary',
                  fontSize: '11px',
                }}
              >
                {formatDate(win.created_at)}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  );
}