'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { brand, CARD_RADIUS } from '@/lib/homeTheme';
import { supabase } from '@/lib/supabaseClient';
import { KpiDrafts } from '@/lib/kpiDrafts';
import {
  acceptKpiInput,
  formatKpiValue,
  isMoneyMetric,
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
  const [loadedPeriodsKey, setLoadedPeriodsKey] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  const [requestedPeriod, setSelectedPeriod] = useState(
    () => months[months.length - 1]?.periodStart ?? '',
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const selected = months.find((month) => month.periodStart === requestedPeriod) ?? months[months.length - 1];
  const selectedPeriod = selected?.periodStart ?? '';
  const periodsKey = months.map((month) => month.periodStart).join('|');
  const draftsRef = useRef(new KpiDrafts());
  const draftKey = userId && selectedPeriod ? `${userId}:${selectedPeriod}` : null;
  const activeDraftKeyRef = useRef(draftKey);
  activeDraftKeyRef.current = draftKey;

  useEffect(() => {
    let cancelled = false;
    const checkpoint = draftsRef.current.checkpoint();
    const periods = periodsKey.split('|').filter(Boolean);
    const years = [...new Set(periods.map((period) => Number(period.slice(0, 4))))];

    async function load() {
      setLoading(true);
      setLoadError(null);
      setLoadedPeriodsKey(null);
      setHydratedKey(null);
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (cancelled) return;

        if (authError || !authData?.user) {
          throw new Error('Sign in to see and update your numbers.');
        }

        const uid = authData.user.id;
        setUserId(uid);

        // Every requested year must load before any blank fields are editable.
        const [metricResult, ...historyResults] = await Promise.all([
          supabase.from('kpi_metric_types').select('id, key, name').order('id', { ascending: true }),
          ...years.map((year) =>
            supabase.rpc('get_monthly_kpi_history_for_year', { _user_id: uid, _year: year }),
          ),
        ]);
        if (cancelled) return;

        if (metricResult.error) {
          throw new Error(metricResult.error.message);
        }
        const historyError = historyResults.find((result) => result.error)?.error;
        if (historyError) throw new Error(`Could not load saved KPI values: ${historyError.message}`);

        const metricRows = (metricResult.data as MetricType[]) ?? [];
        const rows = historyResults.flatMap((result) => (result.data as HistoryRow[]) ?? []);
        for (const period of periods) {
          const row = rows.find((entry) => entry.period_start_date === period);
          const fresh = Object.fromEntries(metricRows.map((metric) => [
            metric.key, formatKpiValue(metric.key, row?.kpi_values?.[metric.key]),
          ]));
          draftsRef.current.refresh(`${uid}:${period}`, fresh, checkpoint);
        }
        setMetrics(metricRows);
        setHistory(rows);
        setLoadedPeriodsKey(periodsKey);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load saved KPI values.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [periodsKey, retryVersion]);

  // Reading an acknowledgement never replaces newer edits retained in a draft.
  useEffect(() => {
    if (!draftKey || loading || loadError || loadedPeriodsKey !== periodsKey || metrics.length === 0) {
      setHydratedKey(null);
      return;
    }
    const row = history.find((entry) => entry.period_start_date === selectedPeriod) ?? null;
    const next: Record<string, string> = {};
    metrics.forEach((metric) => {
      next[metric.key] = formatKpiValue(metric.key, row?.kpi_values?.[metric.key]);
    });
    setValues(draftsRef.current.seed(draftKey, next));
    const status = draftsRef.current.status(draftKey);
    setSaveState(status.state);
    setSaveError(status.error);
    setHydratedKey(draftKey);
  }, [draftKey, history, loadError, loadedPeriodsKey, loading, metrics, periodsKey, selectedPeriod]);

  const editable = !loading && !loadError && loadedPeriodsKey === periodsKey &&
    metrics.length > 0 && draftKey !== null && hydratedKey === draftKey;

  const save = async (field?: string) => {
    if (!editable || !userId || !draftKey || activeDraftKeyRef.current !== draftKey) return;

    const period = selectedPeriod;
    const targetKey = draftKey;
    const targetUserId = userId;
    setSaveState('saving');
    try {
      const patch = await draftsRef.current.save(targetKey, field ? [field] : undefined, async (payload) => {
        const { error } = await supabase.rpc('upsert_monthly_kpi_record', {
          _user_id: targetUserId,
          _period_start_date: period,
          _kpi_values: payload,
        });
        if (error) throw new Error(error.message);
      });
      if (Object.keys(patch).length && activeDraftKeyRef.current?.startsWith(`${targetUserId}:`)) {
        setHistory((rows) => [
          ...rows.filter((row) => row.period_start_date !== period),
          { period_start_date: period, kpi_values: {
            ...rows.find((row) => row.period_start_date === period)?.kpi_values, ...patch,
          } },
        ]);
      }
    } catch {
      // Failed drafts remain available for Retry and survive month switches.
    } finally {
      if (activeDraftKeyRef.current === targetKey) {
        const status = draftsRef.current.status(targetKey);
        setSaveState(status.state);
        setSaveError(status.error);
      }
    }
  };

  function handleChange(key: string, raw: string) {
    if (!editable || !draftKey) return;
    const accepted = acceptKpiInput(key, raw);
    if (accepted === null) return;
    setValues(draftsRef.current.edit(draftKey, key, accepted));
    const status = draftsRef.current.status(draftKey);
    setSaveState(status.state);
  }

  function handleBlur(key: string) {
    if (!editable || !draftKey) return;
    const raw = draftsRef.current.values(draftKey)[key];
    setValues(draftsRef.current.format(draftKey, key, formatKpiValue(key, parseKpiValue(key, raw))));
    void save(key);
  }

  if (months.length === 0) return null;

  const rows = loading || metrics.length === 0 ? PLACEHOLDER_ROWS : metrics;

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
            <Box sx={{ position: 'relative' }}>
              {isMoneyMetric(metric.key) ? (
                <Typography
                  component="span"
                  aria-hidden="true"
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    fontFamily: '"League Spartan", "Poppins", Arial, sans-serif',
                    fontSize: 30,
                    lineHeight: 1.05,
                    fontWeight: 700,
                    color: brand.ink,
                  }}
                >
                  $
                </Typography>
              ) : null}
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
                  pl: isMoneyMetric(metric.key) ? '18px' : 0,
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
        {loadError ? (
          <Button size="small" onClick={() => setRetryVersion((version) => version + 1)}>Retry loading</Button>
        ) : saveState === 'error' ? (
          <Button size="small" onClick={() => void save()}>Retry saving</Button>
        ) : null}
      </Box>
    </Box>
  );
}
