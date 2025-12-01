import Grid from '@mui/material/Grid';
import { Paper, Typography } from '@mui/material';
import type { KpiMetric } from '@/types/dashboard';

type Props = {
  // money stats from revenueProfit
  profitValue: number;
  revenueValue: number;

  // full KPI list so we can pick the other four
  kpis: KpiMetric[];
};

function fmtNum(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);
}

function Tile({
  title,
  value,
}: {
  title: string;
  value: number | string;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.5, md: 2 },
        borderRadius: 2,
        minHeight: 60, // light balance so tiles feel even without deltas
      }}
    >
      <Typography
        variant="subtitle1"
        sx={{
          fontWeight: 500,
          lineHeight: 1.1,
          mb: 0.25,
        }}
      >
        {title}
      </Typography>

      <Typography
        sx={{
          fontWeight: 600,
          lineHeight: 1.1,
          fontSize: { xs: '1.65rem', md: '1.9rem' }, // bigger number
        }}
      >
        {typeof value === 'number' ? fmtNum(value) : value}
      </Typography>
    </Paper>
  );
}

export default function KpiSummaryRow({
  profitValue,
  revenueValue,
  kpis,
}: Props) {
  const byKey = (k: string) => kpis.find((m) => m.key === k)?.value ?? 0;

  const daysOff = byKey('days_off');
  const fifteenThirty = byKey('fifteen_thirty');
  const repeatReferral = byKey('repeat_referral');
  const closedDeals = byKey('total_closed');

  // Required order:
  // Profit, Gross Revenue, Days Off, 15/30, Repeat / Referral, Closed Deals
  const tiles = [
    { title: 'Profit', value: profitValue },
    { title: 'Gross Revenue', value: revenueValue },
    { title: 'Days Off', value: daysOff },
    { title: '15/30', value: fifteenThirty },
    { title: 'Repeat / Referral', value: repeatReferral },
    { title: 'Closed Deals', value: closedDeals },
  ];

  return (
    <Grid container spacing={1.5}>
      {tiles.map((t, i) => (
        <Grid key={i} size={{ xs: 6, md: 2 }}>
          <Tile {...t} />
        </Grid>
      ))}
    </Grid>
  );
}
