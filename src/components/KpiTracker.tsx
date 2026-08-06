'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Typography,
  Button,
  Stack,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Fade,
  Grow,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import {
  TrendingUp as TrendingUpIcon,
  Save as SaveIcon,
  CalendarMonth as CalendarIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';

type KpiMetricType = {
  id: number;
  key: string;
  name: string;
  description: string | null;
};

type HistoryRow = {
  user_id: string;
  period_start_date: string;
  last_updated_at: string | null;
  kpi_values: Record<string, number | null> | null;
};

export type KpiTrackerProps = {
  /** Called after a successful explicit save (Save Changes button). */
  onSaved?: () => void;
  /**
   * Optional override of the target user.
   * - If provided, KPIs are loaded and saved for this user.
   * - If omitted, the tracker uses the currently logged-in user.
   */
  userIdOverride?: string | null;
  /** Optional date whose calendar month should be selected. */
  fixedPeriodDate?: string | null;
  /** Keeps the tracker on fixedPeriodDate instead of showing period selectors. */
  lockPeriod?: boolean;
};

const isMoneyMetric = (key: string) =>
  key === 'gross_revenue' || key === 'profit';

const allowsNegativeValue = (key: string) => key === 'profit';

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TRACKER_START_YEAR = 2000;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const getPeriodStart = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}-01`;

const parsePeriodDate = (value?: string | null) => {
  const match = /^(\d{4})-(\d{2})/.exec(value ?? '');
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;

  return { year, month };
};

const getYearCacheKey = (userId: string, year: number) => `${userId}:${year}`;

const upsertHistoryRow = (rows: HistoryRow[], nextRow: HistoryRow) => {
  const withoutExisting = rows.filter(
    (row) => row.period_start_date !== nextRow.period_start_date
  );

  return [...withoutExisting, nextRow].sort((a, b) =>
    b.period_start_date.localeCompare(a.period_start_date)
  );
};

export default function KpiTracker({
  onSaved,
  userIdOverride,
  fixedPeriodDate = null,
  lockPeriod = false,
}: KpiTrackerProps) {
  const currentDate = useMemo(() => new Date(), []);
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const fixedPeriod = useMemo(
    () => parsePeriodDate(fixedPeriodDate),
    [fixedPeriodDate],
  );
  const initialYear = fixedPeriod?.year ?? currentYear;
  const initialMonth = fixedPeriod?.month ?? currentMonth;
  const periodIsLocked = lockPeriod && fixedPeriod != null;

  // This is always the *target* user (student) whose KPIs we're editing.
  const [userId, setUserId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<KpiMetricType[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [values, setValues] = useState<Record<string, string>>({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [yearLoading, setYearLoading] = useState(true);
  const [loadedYearKey, setLoadedYearKey] = useState<string | null>(null);
  const [periodReady, setPeriodReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const yearHistoryCacheRef = useRef(new Map<string, HistoryRow[]>());
  const yearRequestIdRef = useRef(0);
  const selectedYearRef = useRef(selectedYear);
  const selectedPeriodRef = useRef(getPeriodStart(selectedYear, selectedMonth));
  const userIdRef = useRef(userId);

  const selectedPeriod = getPeriodStart(selectedYear, selectedMonth);
  selectedYearRef.current = selectedYear;
  selectedPeriodRef.current = selectedPeriod;
  userIdRef.current = userId;

  const yearOptions = useMemo(
    () =>
      Array.from(
        { length: currentYear - TRACKER_START_YEAR + 1 },
        (_, index) => currentYear - index
      ),
    [currentYear]
  );

  const monthOptions = useMemo(() => {
    const monthCount = selectedYear === currentYear ? currentMonth : 12;
    return MONTH_NAMES.slice(0, monthCount).map((name, index) => ({
      name,
      value: index + 1,
    }));
  }, [currentMonth, currentYear, selectedYear]);

  const loadYearHistory = useCallback(async (uid: string, year: number) => {
    const requestId = ++yearRequestIdRef.current;
    const cacheKey = getYearCacheKey(uid, year);
    const cachedRows = yearHistoryCacheRef.current.get(cacheKey);

    setYearLoading(true);
    setLoadedYearKey(null);
    setPeriodReady(false);
    setError(null);
    setSuccess(null);

    if (cachedRows) {
      setHistory(cachedRows);
      setLoadedYearKey(cacheKey);
      setYearLoading(false);
      return;
    }

    setHistory([]);
    const { data, error: historyError } = await supabase.rpc(
      'get_monthly_kpi_history_for_year',
      {
        _user_id: uid,
        _year: year,
      }
    );

    if (requestId !== yearRequestIdRef.current) return;

    if (historyError) {
      setError(historyError.message);
      setHistory([]);
      setYearLoading(false);
      return;
    }

    const rows = (data ?? []) as HistoryRow[];
    yearHistoryCacheRef.current.set(cacheKey, rows);
    setHistory(rows);
    setLoadedYearKey(cacheKey);
    setYearLoading(false);
  }, []);

  // Initial load + re-load when the target user changes
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setInitialLoading(true);
      setError(null);
      setSuccess(null);
      setUserId(null);
      setHistory([]);
      setSelectedYear(initialYear);
      setSelectedMonth(initialMonth);
      setValues({});
      setLastUpdatedAt(null);
      setYearLoading(true);
      setLoadedYearKey(null);
      setPeriodReady(false);
      yearHistoryCacheRef.current.clear();
      yearRequestIdRef.current += 1;

      // 1) Decide which user we're targeting
      let targetUserId = userIdOverride ?? null;

      if (!targetUserId) {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (cancelled) return;

        if (authError || !authData?.user) {
          setUserId(null);
          setError('You must be logged in to use the KPI tracker.');
          setInitialLoading(false);
          return;
        }

        targetUserId = authData.user.id;
      }

      if (!targetUserId) {
        if (!cancelled) {
          setUserId(null);
          setError('No user selected for KPI tracking.');
          setInitialLoading(false);
        }
        return;
      }

      setUserId(targetUserId);

      // 2) Get metric definitions
      const { data: metricRows, error: metricsError } = await supabase
        .from('kpi_metric_types')
        .select('id, key, name, description')
        .order('id', { ascending: true });

      if (cancelled) return;

      if (metricsError) {
        setError(metricsError.message);
        setMetrics([]);
        setInitialLoading(false);
        return;
      }

      setMetrics(metricRows ?? []);

      if (!cancelled) {
        setInitialLoading(false);
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [initialMonth, initialYear, userIdOverride]);

  useEffect(() => {
    if (!userId) return;

    void loadYearHistory(userId, selectedYear);

    return () => {
      yearRequestIdRef.current += 1;
    };
  }, [loadYearHistory, selectedYear, userId]);

  // When selectedPeriod / metrics / history change -> hydrate form values
  useEffect(() => {
    const expectedYearKey = userId
      ? getYearCacheKey(userId, selectedYear)
      : null;

    if (
      !selectedPeriod ||
      metrics.length === 0 ||
      yearLoading ||
      loadedYearKey !== expectedYearKey
    ) {
      setValues({});
      setLastUpdatedAt(null);
      setPeriodReady(false);
      return;
    }

    const row =
      history.find((h) => h.period_start_date === selectedPeriod) || null;
    const nextValues: Record<string, string> = {};

    metrics.forEach((m) => {
      const rawVal = row?.kpi_values?.[m.key];
      if (rawVal === null || rawVal === undefined) {
        nextValues[m.key] = '';
      } else if (isMoneyMetric(m.key)) {
        // Format money from DB into US money style on load
        nextValues[m.key] = moneyFormatter.format(rawVal);
      } else {
        nextValues[m.key] = String(rawVal);
      }
    });

    setValues(nextValues);
    setLastUpdatedAt(row?.last_updated_at ?? null);
    setPeriodReady(true);
  }, [history, loadedYearKey, metrics, selectedPeriod, selectedYear, userId, yearLoading]);

  // Core save function (used by both autosave + button)
  const saveValues = async (opts?: { silent?: boolean }) => {
    if (!userId || !selectedPeriod || !periodReady || yearLoading) return;

    const targetUserId = userId;
    const targetYear = selectedYear;
    const targetPeriod = selectedPeriod;

    if (!opts?.silent) {
      setSaving(true);
      setError(null);
      setSuccess(null);
    }

    // Build payload: { metric_key: number|null }
    const payload: Record<string, number | null> = {};
    metrics.forEach((m) => {
      const raw = values[m.key];
      if (raw === undefined || raw === '') {
        payload[m.key] = null;
      } else {
        // Strip commas and currency-like characters
        const cleaned = raw.replace(/,/g, '').trim();
        const num = Number(cleaned);
        // Profit may be negative; all other KPI values must remain non-negative.
        if (!Number.isFinite(num) || (num < 0 && !allowsNegativeValue(m.key))) {
          payload[m.key] = null;
        } else {
          payload[m.key] = num;
        }
      }
    });

    const { error: rpcError } = await supabase.rpc('upsert_monthly_kpi_record', {
      _user_id: targetUserId,
      _period_start_date: targetPeriod,
      _kpi_values: payload,
    });

    if (rpcError) {
      setError(rpcError.message);
      if (!opts?.silent) {
        setSaving(false);
      }
      return;
    }

    const savedAt = new Date().toISOString();
    const savedRow: HistoryRow = {
      user_id: targetUserId,
      period_start_date: targetPeriod,
      last_updated_at: savedAt,
      kpi_values: payload,
    };
    const cacheKey = getYearCacheKey(targetUserId, targetYear);
    const cachedRows = yearHistoryCacheRef.current.get(cacheKey) ?? [];
    const nextRows = upsertHistoryRow(cachedRows, savedRow);
    yearHistoryCacheRef.current.set(cacheKey, nextRows);

    if (
      userIdRef.current === targetUserId &&
      selectedYearRef.current === targetYear
    ) {
      setHistory(nextRows);
    }

    if (selectedPeriodRef.current === targetPeriod) {
      setLastUpdatedAt(savedAt);
    }

    if (!opts?.silent) {
      setSuccess('KPI values saved.');
      setSaving(false);
      // Notify parent only after explicit save
      onSaved?.();
    }
  };

  // Manual save from button (with feedback)
  const handleSaveClick = () => {
    void saveValues({ silent: false });
  };

  // Change handler with basic validation; only profit may have a leading minus.
  const handleChangeValue = (key: string, raw: string) => {
    setValues((prev) => {
      const isMoney = isMoneyMetric(key);
      // Allow clearing the field
      if (raw === '') {
        return {
          ...prev,
          [key]: '',
        };
      }

      // Strip commas from formatted values so user can edit
      const cleaned = raw.replace(/,/g, '');

      // Regex: digits with optional single decimal point (for money)
      const numericRegex = isMoney
        ? allowsNegativeValue(key)
          ? /^-?\d*\.?\d*$/
          : /^\d*\.?\d*$/
        : /^\d*$/;
      if (!numericRegex.test(cleaned)) {
        return prev; // reject letters / weird symbols
      }

      return {
        ...prev,
        [key]: cleaned,
      };
    });
  };

  // On blur: format money fields as US-style money + autosave silently
  const handleFieldBlur = (key: string) => {
    if (isMoneyMetric(key)) {
      setValues((prev) => {
        const raw = prev[key];
        if (!raw) return prev;

        const cleaned = raw.replace(/,/g, '').trim();
        const num = Number(cleaned);
        if (!Number.isFinite(num) || (num < 0 && !allowsNegativeValue(key))) {
          return { ...prev, [key]: '' };
        }

        // Format as 1,234.56 style (US)
        return {
          ...prev,
          [key]: moneyFormatter.format(num),
        };
      });
    }

    // Auto-save silently when they leave a field
    void saveValues({ silent: true });
  };

  const handleChangeYear = (e: SelectChangeEvent<string>) => {
    const nextYear = Number(e.target.value);
    if (!Number.isInteger(nextYear)) return;

    setYearLoading(true);
    setLoadedYearKey(null);
    setPeriodReady(false);
    setHistory([]);
    setValues({});
    setLastUpdatedAt(null);
    setSelectedYear(nextYear);
    setSelectedMonth((month) =>
      nextYear === currentYear ? Math.min(month, currentMonth) : month
    );
    setSuccess(null);
    setError(null);
  };

  const handleChangeMonth = (e: SelectChangeEvent<string>) => {
    const nextMonth = Number(e.target.value);
    if (!Number.isInteger(nextMonth)) return;

    setPeriodReady(false);
    setValues({});
    setLastUpdatedAt(null);
    setSelectedMonth(nextMonth);
    setSuccess(null);
    setError(null);
  };

  if (initialLoading) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="400px"
        gap={2}
      >
        <CircularProgress size={48} thickness={4} />
        <Typography variant="body2" color="text.secondary">
          Loading KPIs...
        </Typography>
      </Box>
    );
  }

  if (!userId) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', mt: 6 }}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          You must be logged in to use the KPI tracker.
        </Alert>
      </Box>
    );
  }

  const canEditPeriod = periodReady && !yearLoading;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 0 }}>
      {/* Header */}
      <Box sx={{ mb: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <TrendingUpIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" fontWeight="bold" color="text.primary">
            KPI Tracking
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Log key performance indicators for the selected month.
        </Typography>
      </Box>

      {/* Alerts */}
      <Stack spacing={2} sx={{ mb: 3 }}>
        <Fade in={!!error}>
          <Box>
            {error && (
              <Alert
                severity="error"
                onClose={() => setError(null)}
                sx={{ borderRadius: 2 }}
              >
                {error}
              </Alert>
            )}
          </Box>
        </Fade>
        <Fade in={!!success}>
          <Box>
            {success && (
              <Alert
                severity="success"
                onClose={() => setSuccess(null)}
                icon={<CheckCircleIcon />}
                sx={{ borderRadius: 2 }}
              >
                {success}
              </Alert>
            )}
          </Box>
        </Fade>
      </Stack>

      {/* Period Selector Card */}
      <Paper
        elevation={3}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
          border: '2px solid',
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarIcon sx={{ color: 'text.secondary' }} />
            <Typography variant="subtitle2" fontWeight="600" color="text.primary">
              Period
            </Typography>
          </Box>

          {periodIsLocked ? (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Set by the Business Review date
              </Typography>
            </Box>
          ) : (
            <>
              <FormControl
                size="small"
                sx={{
                  minWidth: 130,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'background.paper',
                    '&:hover': {
                      borderColor: 'primary.main',
                    },
                  },
                }}
                disabled={yearLoading || saving}
              >
                <InputLabel id="year-select-label" sx={{ fontSize: '1.25rem' }}>
                  Year
                </InputLabel>
                <Select
                  labelId="year-select-label"
                  label="Year"
                  value={String(selectedYear)}
                  onChange={handleChangeYear}
                  sx={{ fontSize: '1.25rem' }}
                >
                  {yearOptions.map((year) => (
                    <MenuItem
                      key={year}
                      value={String(year)}
                      sx={{ fontSize: '1.25rem' }}
                    >
                      {year}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl
                size="small"
                sx={{
                  minWidth: 180,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'background.paper',
                    '&:hover': {
                      borderColor: 'primary.main',
                    },
                  },
                }}
                disabled={yearLoading || saving}
              >
                <InputLabel id="month-select-label" sx={{ fontSize: '1.25rem' }}>
                  Month
                </InputLabel>
                <Select
                  labelId="month-select-label"
                  label="Month"
                  value={String(selectedMonth)}
                  onChange={handleChangeMonth}
                  sx={{ fontSize: '1.25rem' }}
                >
                  {monthOptions.map((month) => (
                    <MenuItem
                      key={month.value}
                      value={String(month.value)}
                      sx={{ fontSize: '1.25rem' }}
                    >
                      {month.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          {yearLoading ? (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ ml: 'auto' }}
            >
              <CircularProgress size={18} />
              <Typography variant="caption" color="text.secondary">
                Loading {selectedYear} data...
              </Typography>
            </Stack>
          ) : lastUpdatedAt ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ml: 'auto', fontStyle: 'italic' }}
            >
              Last updated{' '}
              {new Date(lastUpdatedAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </Typography>
          ) : periodReady ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ml: 'auto', fontStyle: 'italic' }}
            >
              No saved data for {MONTH_NAMES[selectedMonth - 1]} {selectedYear} yet.
            </Typography>
          ) : null}
        </Box>
      </Paper>

      {/* KPI Metrics Grid */}
      {metrics.length === 0 ? (
        <Paper
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 3,
            bgcolor: 'background.paper',
          }}
        >
          <Typography variant="body1" color="text.secondary">
            No KPI metrics are defined yet.
          </Typography>
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              sm: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(4, minmax(0, 1fr))',
            },
            gap: 2,
            mb: 3,
          }}
        >
          {metrics.map((metric, index) => {
            const money = isMoneyMetric(metric.key);
            return (
              <Grow in key={metric.id} timeout={300 + index * 100}>
                <Card
                  elevation={2}
                  sx={{
                    transition: 'all 0.2s ease',
                    borderRadius: 3,
                    border: '2px solid',
                    borderColor: 'divider',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: 6,
                      borderColor: 'primary.light',
                    },
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Typography
                      variant="kpiTrackerMetricTitle"
                      fontWeight="700"
                      color="text.primary"
                      gutterBottom
                      sx={{
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        mb: 0.5,
                      }}
                    >
                      {metric.name}
                    </Typography>
                    {metric.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        display="block"
                        sx={{ mb: 2, lineHeight: 1.4 }}
                      >
                        {metric.description}
                      </Typography>
                    )}
                    <Box sx={{ position: 'relative' }}>
                      {money && (
                        <Typography
                          component="span"
                          sx={{
                            position: 'absolute',
                            left: 14,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: '2rem',
                            fontWeight: 700,
                            color: 'text.secondary',
                            pointerEvents: 'none',
                            zIndex: 1,
                          }}
                        >
                          $
                        </Typography>
                      )}
                      <TextField
                        type={money ? 'text' : 'number'}
                        fullWidth
                        size="medium"
                        disabled={!canEditPeriod}
                        value={values[metric.key] ?? ''}
                        onChange={(e) =>
                          handleChangeValue(metric.key, e.target.value)
                        }
                        onBlur={() => handleFieldBlur(metric.key)}
                        inputProps={
                          money
                            ? {
                                step: '0.01',
                                min: allowsNegativeValue(metric.key) ? undefined : 0,
                                inputMode: 'decimal',
                              }
                            : {
                                step: '1',
                                min: 0,
                                inputMode: 'numeric',
                              }
                        }
                        placeholder="0"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            fontSize: '2rem',
                            fontWeight: 700,
                            '& input': {
                              textAlign: 'left',
                              paddingLeft: money ? '32px' : undefined,
                            },
                          },
                        }}
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Grow>
            );
          })}
        </Box>
      )}

      {/* Save Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button
          variant="contained"
          size="large"
          onClick={handleSaveClick}
          disabled={saving || !canEditPeriod || !selectedPeriod}
          startIcon={
            saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />
          }
          sx={{
            px: 4,
            py: 1.5,
            borderRadius: 3,
            fontWeight: 600,
            textTransform: 'none',
            boxShadow: 3,
            background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
            '&:hover': {
              boxShadow: 6,
              transform: 'scale(1.02)',
              background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
            },
            '&:active': {
              transform: 'scale(0.98)',
            },
            transition: 'all 0.2s ease',
          }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </Box>
    </Box>
  );
}
