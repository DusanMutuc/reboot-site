import Grid from '@mui/material/Grid';
import { Paper, Typography } from '@mui/material';
import type { KpiMetric, KpiKey } from '@/types/dashboard';

function fmtNum(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);
}

type Props = {
  kpis: KpiMetric[];
  // map your UI labels to the actual KpiKey keys present in kpis
  mapping: {
    totalClosed: KpiKey;       // 'total_closed'
    fifteenThirty: KpiKey;     // 'fifteen_thirty'
    repeatReferral: KpiKey;    // 'repeat_referral'
    daysOff: KpiKey;           // 'days_off'
  };
  compactLabels?: boolean;
};

export default function KpiMiniCards({
  kpis,
  mapping,
  compactLabels = false,
}: Props) {
  const byKey = (k: KpiKey) => kpis.find((m) => m.key === k)?.value ?? 0;
  const labelVariant = compactLabels ? 'metricLabelCompact' : 'subtitle2';

  const items = [
    { title: 'Total Closed', value: byKey(mapping.totalClosed) },
    { title: '15/30', value: byKey(mapping.fifteenThirty) },
    { title: 'Repeat/Referral', value: byKey(mapping.repeatReferral) },
    { title: 'Days Off', value: byKey(mapping.daysOff) },
  ];

  return (
    <Grid container spacing={1.5}>
      {items.map((t, i) => (
        <Grid key={i} size={{ xs: 6, md: 3 }}>
          <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2 }}>
            <Typography variant={labelVariant} color="text.secondary">
              {t.title}
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: { xs: '1.4rem', md: '1.6rem' }, lineHeight: 1.1 }}>
              {fmtNum(t.value)}
            </Typography>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}
