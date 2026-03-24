import Grid from '@mui/material/Grid';
import { Paper, Typography } from '@mui/material';
import type { RevenueProfitSectionProps } from '@/types/dashboard';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDelta(delta: number | null): string {
  if (delta == null || Number.isNaN(delta)) return '-';
  const rounded = Math.round(delta);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

type BigMoneyCardsProps = Pick<
  RevenueProfitSectionProps,
  'currentRevenue' | 'currentProfit' | 'revenueDeltaPct' | 'profitDeltaPct' | 'periodLabel'
> & {
  compactLabels?: boolean;
};

export default function BigMoneyCards({
  currentRevenue,
  currentProfit,
  revenueDeltaPct,
  profitDeltaPct,
  periodLabel: _periodLabel,
  compactLabels = false,
}: BigMoneyCardsProps) {
  const labelVariant = compactLabels ? 'metricLabelCompact' : 'subtitle2';

  return (
    <Grid container spacing={2} sx={{ mb: 2 }}>
      <Grid size={{ xs: 12, md: 6 }}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
          <Typography variant={labelVariant} color="text.secondary">
            Gross Revenue
          </Typography>
          <Typography variant="h4" fontWeight={700} mt={0.5}>
            {formatCurrency(currentRevenue)}
          </Typography>
          <Typography
            variant="body2"
            mt={1}
            color={
              revenueDeltaPct == null
                ? 'text.secondary'
                : revenueDeltaPct >= 0
                  ? 'success.main'
                  : 'error.main'
            }
          >
            {formatDelta(revenueDeltaPct)} vs previous period
          </Typography>
        </Paper>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
          <Typography variant={labelVariant} color="text.secondary">
            Profit
          </Typography>
          <Typography variant="h4" fontWeight={700} mt={0.5}>
            {formatCurrency(currentProfit)}
          </Typography>
          <Typography
            variant="body2"
            mt={1}
            color={
              profitDeltaPct == null
                ? 'text.secondary'
                : profitDeltaPct >= 0
                  ? 'success.main'
                  : 'error.main'
            }
          >
            {formatDelta(profitDeltaPct)} vs previous period
          </Typography>
        </Paper>
      </Grid>
    </Grid>
  );
}
