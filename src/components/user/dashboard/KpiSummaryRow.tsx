import Grid from '@mui/material/Grid';
import { Paper, Typography } from '@mui/material';
import type { KpiMetric } from '@/types/dashboard';

type Props = {
  revenueValue: number;
  profitValue: number;
  kpis: KpiMetric[]; // your 4: total_closed, repeat_referral, days_off, fifteen_thirty
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);
}

function KpiTile({
  title,
  value,
  deltaPct,
}: {
  title: string;
  value: number;
  deltaPct?: number | null;
}) {
  const color =
    deltaPct == null ? 'text.secondary' : deltaPct >= 0 ? 'success.main' : 'error.main';
  const delta =
    deltaPct == null
      ? '—'
      : `${deltaPct > 0 ? '+' : ''}${Math.round(deltaPct)}% vs prev`;

  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Typography variant="caption" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
        {formatNumber(value)}
      </Typography>
      <Typography variant="caption" sx={{ color }}>
        {delta}
      </Typography>
    </Paper>
  );
}

export default function KpiSummaryRow({ revenueValue, profitValue, kpis }: Props) {
  // Order: Gross Revenue, Profit, Total Closed, Referral, Days Off, 15/30
  const ordered: { title: string; value: number; deltaPct?: number | null }[] = [
    { title: 'Gross Revenue', value: revenueValue }, // deltas come from revenue/profit section; optional to show here
    { title: 'Profit', value: profitValue },
    ...kpis.map((m) => ({
      title:
        m.key === 'total_closed'
          ? 'Total Closed'
          : m.key === 'repeat_referral'
          ? 'Referral'
          : m.key === 'days_off'
          ? 'Days Off'
          : m.key === 'fifteen_thirty'
          ? '15/30'
          : m.label,
      value: m.value,
      deltaPct: m.deltaPct,
    })),
  ];

  return (
    <Grid container spacing={1.5}>
      {ordered.map((it, idx) => (
        <Grid key={idx} size={{ xs: 6, sm: 4, md: 2 }}>
          <KpiTile title={it.title} value={it.value} deltaPct={it.deltaPct} />
        </Grid>
      ))}
    </Grid>
  );
}
