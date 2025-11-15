import Grid from '@mui/material/Grid';
import { Paper, Typography } from '@mui/material';
import type { KpiSectionProps, KpiMetric } from '@/types/dashboard';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    value || 0,
  );
}

function formatDelta(delta: number | null): string {
  if (delta == null) return '—';
  const rounded = Math.round(delta);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

function KpiCard({ metric }: { metric: KpiMetric }) {
  const isPositive = metric.deltaPct != null && metric.deltaPct >= 0;

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%' }}>
      <Typography variant="subtitle2" color="text.secondary">
        {metric.label}
      </Typography>
      <Typography variant="h4" fontWeight={700} mt={0.5}>
        {formatNumber(metric.value)}
      </Typography>
      <Typography
        variant="body2"
        mt={1}
        color={
          metric.deltaPct == null
            ? 'text.secondary'
            : isPositive
            ? 'success.main'
            : 'error.main'
        }
      >
        {formatDelta(metric.deltaPct)} vs previous month
      </Typography>
    </Paper>
  );
}

export default function KpiSection({ kpis, periodLabel }: KpiSectionProps) {
  return (
    <Paper sx={{ p: 3, borderRadius: 3 }}>
      <Grid
        container
        spacing={2}
        alignItems="baseline"
        sx={{ mb: 1 }}
      >
        <Grid size="grow">
          <Typography variant="h6" fontWeight={600}>
            Key Performance Indicators
          </Typography>
        </Grid>
        <Grid size="auto">
          <Typography variant="body2" color="text.secondary">
            {periodLabel}
          </Typography>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        {kpis.map((metric) => (
          <Grid
            key={metric.key}
            size={{ xs: 12, sm: 6, md: 3 }}
          >
            <KpiCard metric={metric} />
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
}
