'use client';

import { Box, Paper, Typography, Divider } from '@mui/material';

export default function HelperContacts() {
  return (
    <Paper variant="outlined" sx={{ p: 2, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Quick Contacts</Typography>
      <Divider sx={{ mb: 2 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Bri</Typography>
          <Typography>Phone: 250-609-8330</Typography>
          <Typography>
            Email: <a href="mailto:admin@agentfromwithin.com">admin@agentfromwithin.com</a>
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Jelena</Typography>
          <Typography>Phone: 778-658-5329</Typography>
          <Typography>
            Email: <a href="mailto:admin@rebootmembers.com">admin@rebootmembers.com</a>
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}
