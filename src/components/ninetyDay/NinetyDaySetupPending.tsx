import Link from 'next/link';
import { Box, Button, Container, Typography } from '@mui/material';

export default function NinetyDaySetupPending({ memberFirstName }: { memberFirstName: string }) {
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: '#f4f6f4', display: 'grid', placeItems: 'center', px: 2 }}>
      <Container maxWidth="sm">
        <Box sx={{ bgcolor: '#fff', border: '1px solid #dbe2df', borderRadius: 4, p: { xs: 3, md: 5 } }}>
          <Typography component="h1" sx={{ fontSize: { xs: 30, md: 38 }, lineHeight: 1.15, fontWeight: 850, letterSpacing: '-.03em' }}>
            Your 90-day cycle is being set up
          </Typography>
          <Typography sx={{ mt: 2, color: '#5b6865', lineHeight: 1.75 }}>
            Hi {memberFirstName}. Your account is ready, but your group cycle has not been activated yet.
            Once the coach publishes it, this page will show the current system, weekly meeting,
            Set Your Compass, tracker, and all eight systems.
          </Typography>
          <Button component={Link} href="/support" variant="outlined" sx={{ mt: 3, borderColor: '#17201f', color: '#17201f' }}>
            Contact support
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
