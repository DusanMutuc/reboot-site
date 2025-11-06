'use client';

import { useEffect, useState, useCallback } from 'react';
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

const isMoneyMetric = (key: string) =>
  key === 'gross_revenue' || key === 'profit';

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function KpiTracker() {
  const [userId, setUserId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<KpiMetricType[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Helper: refresh history and decide which period to select
  const refreshHistory = useCallback(
    async (uid: string, preferredPeriod?: string) => {
      const { data, error } = await supabase.rpc(
        'get_monthly_kpi_history_with_values',
        {
          _user_id: uid,
          _limit: 24,
        }
      );

      if (error) {
        setError(error.message);
        setHistory([]);
        setSelectedPeriod('');
        return;
      }

      const rows = (data ?? []) as HistoryRow[];
      setHistory(rows);

      let nextPeriod = '';

      if (preferredPeriod && rows.some((r) => r.period_start_date === preferredPeriod)) {
        nextPeriod = preferredPeriod;
      } else if (rows.length > 0) {
        nextPeriod = rows[0].period_start_date;
      } else {
        nextPeriod = '';
      }

      setSelectedPeriod(nextPeriod);
    },
    []
  );

  // Initial load: user, metrics, ensure current month record, then history
  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      setError(null);

      // 1) Get user
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        setError('You must be logged in to use the KPI tracker.');
        setInitialLoading(false);
        return;
      }

      const uid = authData.user.id;
      setUserId(uid);

      // 2) Get metric definitions
      const { data: metricRows, error: metricsError } = await supabase
        .from('kpi_metric_types')
        .select('id, key, name, description')
        .order('id', { ascending: true });

      if (metricsError) {
        setError(metricsError.message);
        setInitialLoading(false);
        return;
      }

      setMetrics(metricRows ?? []);

      // 3) Compute current month start (YYYY-MM-01) in local time without timezone shenanigans
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1; // 0-based in JS, so +1
      const currentMonthIso = `${year}-${String(month).padStart(2, '0')}-01`;

      // 4) Ensure a monthly record exists for the current month
      const { error: ensureError } = await supabase.rpc(
        'ensure_monthly_kpi_record_for_month',
        {
          _user_id: uid,
          _period_start_date: currentMonthIso,
        }
      );

      if (ensureError) {
        // Not fatal; tracker still works with existing months
        console.error('ensure_monthly_kpi_record_for_month error:', ensureError);
      }

      // 5) Load history, preferring current month as the default selection
      await refreshHistory(uid, currentMonthIso);

      setInitialLoading(false);
    };

    void init();
  }, [refreshHistory]);

  // When selectedPeriod / metrics / history change -> hydrate form values
  useEffect(() => {
    if (!selectedPeriod || metrics.length === 0) {
      setValues({});
      setLastUpdatedAt(null);
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
  }, [selectedPeriod, metrics, history]);

  // Core save function (used by both autosave + button)
  const saveValues = async (opts?: { silent?: boolean }) => {
    if (!userId || !selectedPeriod) return;

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
        // Only accept finite, non-negative numbers
        if (!Number.isFinite(num) || num < 0) {
          payload[m.key] = null;
        } else {
          payload[m.key] = num;
        }
      }
    });

    const { error: rpcError } = await supabase.rpc('upsert_monthly_kpi_record', {
      _user_id: userId,
      _period_start_date: selectedPeriod,
      _kpi_values: payload,
    });

    if (rpcError) {
      setError(rpcError.message);
      if (!opts?.silent) {
        setSaving(false);
      }
      return;
    }

    if (!opts?.silent) {
      setSuccess('KPI values saved.');
      setSaving(false);
    }

    // Refresh current period's data & last_updated_at
    void refreshHistory(userId, selectedPeriod);
  };

  // Manual save from button (with feedback)
  const handleSaveClick = () => {
    void saveValues({ silent: false });
  };

  // Change handler with basic validation: only digits + optional '.' for money, no minus
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

      // Disallow minus sign
      if (raw.includes('-')) {
        return prev;
      }

      // Strip commas from formatted values so user can edit
      const cleaned = raw.replace(/,/g, '');

      // Regex: digits with optional single decimal point (for money)
      const numericRegex = isMoney ? /^\d*\.?\d*$/ : /^\d*$/;
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
        if (!Number.isFinite(num) || num < 0) {
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

  const handleChangePeriod = (e: any) => {
    setSelectedPeriod(e.target.value as string);
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
          Loading your KPIs...
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

  const hasPeriods = history.length > 0;

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <TrendingUpIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" fontWeight="bold" color="text.primary">
            KPI Tracking
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Monitor your key performance indicators
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

          <FormControl
            size="small"
            sx={{
              minWidth: 220,
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'background.paper',
                '&:hover': {
                  borderColor: 'primary.main',
                },
              },
            }}
            disabled={!hasPeriods}
          >
            <InputLabel id="period-select-label">Select Month</InputLabel>
            <Select
              labelId="period-select-label"
              label="Select Month"
              value={selectedPeriod || ''}
              onChange={handleChangePeriod}
            >
              {history.map((row) => (
                <MenuItem
                  key={row.period_start_date}
                  value={row.period_start_date}
                >
                  {new Date(row.period_start_date).toLocaleDateString(
                    undefined,
                    { year: 'numeric', month: 'long' }
                  )}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {lastUpdatedAt && hasPeriods && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ml: 'auto', fontStyle: 'italic' }}
            >
              Last updated:{' '}
              {new Date(lastUpdatedAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </Typography>
          )}
        </Box>
      </Paper>

      {/* KPI Metrics Grid */}
      {!hasPeriods ? (
        <Paper
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 3,
            background: 'linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%)',
            border: '2px solid',
            borderColor: 'info.light',
          }}
        >
          <TrendingUpIcon sx={{ fontSize: 48, color: 'info.main', mb: 2 }} />
          <Typography variant="h6" color="text.primary" gutterBottom>
            No KPI Months Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Once your first month is created, you'll be able to select it and
            update your KPI values.
          </Typography>
        </Paper>
      ) : metrics.length === 0 ? (
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
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
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
                      variant="subtitle1"
                      fontWeight="700"
                      color="text.primary"
                      gutterBottom
                      sx={{
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        fontSize: '0.95rem',
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
                        sx={{ mb: 2, fontSize: '0.875rem', lineHeight: 1.4 }}
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
                        disabled={!selectedPeriod}
                        value={values[metric.key] ?? ''}
                        onChange={(e) =>
                          handleChangeValue(metric.key, e.target.value)
                        }
                        onBlur={() => handleFieldBlur(metric.key)}
                        inputProps={{
                          step: money ? '0.01' : '1',
                          min: 0,
                          inputMode: money ? 'decimal' : 'numeric',
                        }}
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
          disabled={saving || !hasPeriods || !selectedPeriod}
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
