'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand, CARD_RADIUS } from '@/lib/homeTheme';
import { supabase } from '@/lib/supabaseClient';
import {
  acceptKpiInput,
  formatKpiValue,
  isMoneyMetric,
  moneyFormatter,
  parseKpiValue,
} from '@/lib/kpiFormat';
import type { ProgrammeMonth } from './types';

type MetricType = { id: number; key: string; name: string };

type HistoryRow = {
  period_start_date: string;
  kpi_values: Record<string, number | null> | null;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Holds the grid's shape while the metric types load.
 *
 * The eight rows are fixed and known; fetching them is how the card gets their
 * live names and order, not whether there are eight. Rendering nothing until
 * that returns would collapse the card and shift everything below it, which is
 * a worse first paint than eight disabled fields that fill in.
 */
const PLACEHOLDER_ROWS: MetricType[] = [
  { id: 1, key: 'closed_deals', name: 'Closed Deals' },
  { id: 2, key: 'repeat_referral', name: 'Repeat / Referral' },
  { id: 3, key: 'pipeline_15_30', name: '15/30 Pipeline' },
  { id: 4, key: 'days_off', name: 'Days Off' },
  { id: 5, key: 'gross_revenue', name: 'Gross Revenue' },
  { id: 6, key: 'profit', name: 'Profit' },
  { id: 7, key: 'active_listings', name: 'Active Listings' },
  { id: 8, key: 'active_buyers', name: 'Active Buyers' },
];

/**
 * The whole tracker, one month at a time, editable where it stands.
 *
 * This replaces the two report cards the standard home runs side by side, and
 * both of them had to go for the same reason: they report on a period longer
 * than this member has existed. A four-figure snapshot headed "Your 2026
 * stats" summarises the ten months before the programme started, and an
 * attendance card built to compare named cadences has nothing to compare when
 * the cohort has one meeting type.
 *
 * What is left is not a snapshot at all. The argument for showing four figures
 * — that a snapshot is not the tracker — stops applying when the whole record
 * is three months long: there is nothing to hold back, so all eight are here.
 * And once all eight are on the page, a card that can only *display* them is
 * sending the member somewhere else to change a number they are already
 * looking at. So the figures are the fields. Click one and type.
 *
 * It writes through `upsert_monthly_kpi_record`, the same RPC the tracker page
 * uses, with the same validation from `@/lib/kpiFormat` — which exists because
 * two surfaces now edit one row and the rules cannot be allowed to drift. A
 * member who fills this in has filled in the tracker: there is no second copy
 * and nothing to reconcile.
 *
 * Saving is silent and happens on blur, as it does on the tracker page. That
 * is the right default for a card in the middle of a home page — a member who
 * types a number and scrolls on has saved it, where a Save button they never
 * noticed would have quietly lost it.
 */
export default function TrackerPanel({ months }: { months: ProgrammeMonth[] }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricType[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedPeriod, setSelectedPeriod] = useState(
    () => months[months.length - 1]?.periodStart ?? '',
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Read inside the async save without making it a dependency: the blur that
     triggers a save is the same event that can move focus to another field. */
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const years = useMemo(
    () => [...new Set(months.map((month) => Number(month.periodStart.slice(0, 4))))],
    [months],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (cancelled) return;

      if (authError || !authData?.user) {
        setLoadError('Sign in to see and update your numbers.');
        setLoading(false);
        return;
      }

      const uid = authData.user.id;
      setUserId(uid);

      /* The programme's three months can straddle a year end, and the history
         RPC is keyed by year — so ask for each year the set touches. Usually
         one request, occasionally two. */
      const [metricResult, ...historyResults] = await Promise.all([
        supabase.from('kpi_metric_types').select('id, key, name').order('id', { ascending: true }),
        ...years.map((year) =>
          supabase.rpc('get_monthly_kpi_history_for_year', { _user_id: uid, _year: year }),
        ),
      ]);
      if (cancelled) return;

      if (metricResult.error) {
        setLoadError(metricResult.error.message);
        setLoading(false);
        return;
      }

      setMetrics((metricResult.data as MetricType[]) ?? []);
      setHistory(
        historyResults.flatMap((result) =>
          result.error ? [] : ((result.data as HistoryRow[]) ?? []),
        ),
      );
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [years]);

  /* Hydrate the fields whenever the month or the loaded history changes. */
  useEffect(() => {
    if (metrics.length === 0) return;
    const row = history.find((entry) => entry.period_start_date === selectedPeriod) ?? null;
    const next: Record<string, string> = {};
    metrics.forEach((metric) => {
      next[metric.key] = formatKpiValue(metric.key, row?.kpi_values?.[metric.key]);
    });
    setValues(next);
    setSaveState('idle');
    setSaveError(null);
  }, [history, metrics, selectedPeriod]);

  const save = useCallback(async () => {
    if (!userId || metrics.length === 0 || !selectedPeriod) return;

    const period = selectedPeriod;
    const payload: Record<string, number | null> = {};
    metrics.forEach((metric) => {
      payload[metric.key] = parseKpiValue(metric.key, valuesRef.current[metric.key]);
    });

    setSaveState('saving');
    setSaveError(null);

    const { error } = await supabase.rpc('upsert_monthly_kpi_record', {
      _user_id: userId,
      _period_start_date: period,
      _kpi_values: payload,
    });

    if (error) {
      setSaveState('error');
      setSaveError(error.message);
      return;
    }

    /* Keep the local history in step, so switching months and back shows what
       was just entered rather than what the page loaded with. */
    setHistory((rows) => [
      ...rows.filter((row) => row.period_start_date !== period),
      { period_start_date: period, kpi_values: payload },
    ]);
    setSaveState('saved');
  }, [metrics, selectedPeriod, userId]);

  function handleChange(key: string, raw: string) {
    const accepted = acceptKpiInput(key, raw);
    if (accepted === null) return;
    setValues((prev) => ({ ...prev, [key]: accepted }));
  }

  function handleBlur(key: string) {
    if (isMoneyMetric(key)) {
      setValues((prev) => {
        const parsed = parseKpiValue(key, prev[key]);
        return { ...prev, [key]: parsed === null ? '' : moneyFormatter.format(parsed) };
      });
    }
    void save();
  }

  if (months.length === 0) return null;

  const selected = months.find((month) => month.periodStart === selectedPeriod) ?? months[0];
  const rows = loading || metrics.length === 0 ? PLACEHOLDER_ROWS : metrics;
  const editable = !loading && metrics.length > 0 && userId !== null;

  return (
    <Box
      component="section"
      id="numbers"
      sx={{
        bgcolor: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: CARD_RADIUS,
        p: { xs: 2.5, md: 3 },
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <Typography
          variant="sectionLabel"
          component="h2"
          sx={{ fontSize: { xs: 21, md: 24 }, color: brand.ink }}
        >
          Your tracker
        </Typography>

        {/* Three months, because the programme is ninety days. The same closed
            set the systems grid is: every option visible, nothing behind a
            "more" control, so the picker states the length of the programme at
            the same time as it selects a month. */}
        <Box
          role="group"
          aria-label="Tracker month"
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}
        >
          {months.map((month) => {
            const isActive = month.periodStart === selected.periodStart;
            return (
              <Box
                key={month.periodStart}
                component="button"
                type="button"
                onClick={() => setSelectedPeriod(month.periodStart)}
                aria-pressed={isActive}
                sx={{
                  cursor: 'pointer',
                  px: 1.75,
                  py: 0.75,
                  borderRadius: '999px',
                  fontFamily: '"Poppins", Arial, sans-serif',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  border: `1px solid ${isActive ? brand.slate : brand.border}`,
                  bgcolor: isActive ? brand.slate : brand.card,
                  color: isActive ? '#ffffff' : brand.inkSoft,
                  transition: 'background-color .16s ease, border-color .16s ease, color .16s ease',
                  '&:hover': isActive ? {} : { borderColor: brand.turquoise, color: brand.ink },
                }}
              >
                {month.label}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Two rows of four at desktop. Eight is the tracker's own count, and it
          divides into the same four-column field the systems grid uses below,
          so the two full-width blocks share one rhythm.

          Drawn even when the record could not be loaded. A card that collapses
          to one apologetic sentence loses its shape, shifts everything below
          it, and stops saying what it is — where eight labelled fields the
          member cannot yet type into say both what the card holds and that
          something is wrong, which is strictly more than the sentence alone. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            sm: 'repeat(4, minmax(0, 1fr))',
          },
          gap: { xs: '20px 18px', md: '26px 22px' },
          mb: 2.5,
        }}
      >
        {rows.map((metric) => (
          <Box key={metric.key} sx={{ minWidth: 0 }}>
            <Typography
              component="label"
              variant="kicker"
              htmlFor={`kpi-${metric.key}`}
              sx={{ display: 'block', color: brand.inkMuted, mb: 0.75 }}
            >
              {metric.name}
            </Typography>

            {/* The figure is the field. A card that shows all eight values and
                then sends the member elsewhere to change one is asking them to
                leave the page they are already looking at the answer on — so
                the display type and the input are the same object: the
                `metricValue` face and size, with no chrome until it is
                touched. The rule underneath appears on hover and turns
                turquoise on focus, which is enough to say "editable" without
                turning a report into a form. */}
            <Box
              component="input"
              id={`kpi-${metric.key}`}
              inputMode={isMoneyMetric(metric.key) ? 'decimal' : 'numeric'}
              disabled={!editable}
              value={values[metric.key] ?? ''}
              placeholder="—"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                handleChange(metric.key, event.target.value)
              }
              onBlur={() => handleBlur(metric.key)}
              sx={{
                width: '100%',
                p: 0,
                bgcolor: 'transparent',
                fontFamily: '"League Spartan", "Poppins", Arial, sans-serif',
                fontSize: 30,
                lineHeight: 1.05,
                fontWeight: 700,
                letterSpacing: '-0.015em',
                color: brand.ink,
                border: 0,
                borderBottom: '2px solid transparent',
                outline: 'none',
                transition: 'border-color .16s ease',
                '&::placeholder': { color: brand.borderStrong, opacity: 1 },
                '&:hover:not(:disabled)': { borderBottomColor: brand.border },
                '&:focus': { borderBottomColor: brand.turquoise },
              }}
            />
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          mt: 'auto',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1.75,
        }}
      >
        <Box
          component={Link}
          href="/tracker"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            px: 2,
            py: 1,
            borderRadius: '10px',
            border: `1px solid ${brand.borderStrong}`,
            fontSize: 14.5,
            fontWeight: 500,
            color: brand.ink,
            transition: 'border-color .16s ease, background-color .16s ease',
            '&:hover': { borderColor: brand.turquoise, bgcolor: brand.turquoiseTint },
          }}
        >
          Open the full tracker
          <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
        </Box>

        {/* Says what happened, and only after something has. The card saves on
            its own, so silence while nothing is being edited is correct — a
            standing "autosaves" notice would be instruction for a mechanism
            the member has not used yet. */}
        <Typography
          role="status"
          sx={{
            fontSize: 14.5,
            color: saveState === 'error' || loadError ? '#a13b2c' : brand.inkMuted,
          }}
        >
          {loadError
            ? loadError
            : saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved'
                ? `Saved to ${selected.label}.`
                : saveState === 'error'
                  ? (saveError ?? 'Could not save that.')
                  : ''}
        </Typography>
      </Box>
    </Box>
  );
}
