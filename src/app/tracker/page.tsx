import { Container, Typography, Box } from '@mui/material';
import TopNav from '@/components/topNav';
import KpiTracker from '@/components/KpiTracker';

export default function TrackerPage() {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>

      {/* Page header */}
      <Box sx={{ mt: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Tracker
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Log your key monthly KPIs here. Choose your period start date and
          update your numbers as you go through the month.
        </Typography>
      </Box>

      {/* KPI Tracker block */}
      <KpiTracker />
    </Container>
  );
}
