'use client';

import { Box, Button, Paper, Stack, Typography } from '@mui/material';

type AdminHomeProps = {
  onNavigate: (view: string) => void;
};

const quickActions = [
  { id: 'add-user', label: 'Create User', detail: 'Create a user and assign role.' },
  { id: 'assign-coach', label: 'Assign Coach', detail: 'Set up primary or implementation coach.' },
  { id: 'assign-assistant', label: 'Assign Assistant', detail: 'Grant assistant access and user assignment.' },
  { id: 'meetings', label: 'Create / Review Meetings', detail: 'Manage meeting records and attendance.' },
  { id: 'student-progress', label: 'Open Student Detail View', detail: 'Review selected student progress.' },
  { id: 'user-data-transfer', label: 'Danger Zone: User Data Transfer', detail: 'High-impact maintenance operation.' },
];

export default function AdminHome({ onNavigate }: AdminHomeProps) {
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
        Admin Home
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Start here for common workflows. Choose an action below to jump directly to the relevant admin tool.
      </Typography>

      <Stack spacing={1.5}>
        {quickActions.map((item) => (
          <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
              <Box sx={{ flex: 1 }}>
                <Typography fontWeight={600}>{item.label}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.detail}
                </Typography>
              </Box>
              <Button variant="contained" onClick={() => onNavigate(item.id)}>
                Open
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
