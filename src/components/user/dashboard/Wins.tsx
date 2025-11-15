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
      <Typography variant="h6" fontWeight={600} mb={2}>
        Wins
      </Typography>

      {wins.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No wins logged yet.
        </Typography>
      ) : (
        <Stack spacing={1.25}>
          {wins.map((win: DashboardWin) => (
            <Box
              key={win.id}
              sx={{
                p: 1.25,
                borderRadius: 2,
                bgcolor: 'background.default',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="body2">{win.body}</Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5 }}
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
