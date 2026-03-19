'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid'; // Grid v2 (MUI v6)
import Autocomplete from '@mui/material/Autocomplete';

type UserItem = { id: string; name: string; email: string };

type TransferOptions = {
  dry_run: boolean;
  // Backend semantics:
  //  - 'skip'          => KPI tables untouched
  //  - 'prefer_source' => overwrite dest KPI with source KPI (source intact)
  kpi_merge: 'skip' | 'prefer_source';
  smart_doc_conflict: 'keep_latest_submitted' | 'keep_dest' | 'keep_source';
  reassign_authorship: boolean;
};

type ApiResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

type ApiUserItem = {
  id: string;
  name?: string | null;
  email?: string | null;
};

export default function UserDataTransfer() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [source, setSource] = useState<UserItem | null>(null);
  const [dest, setDest] = useState<UserItem | null>(null);

  const [opts, setOpts] = useState<TransferOptions>({
    dry_run: true,
    kpi_merge: 'prefer_source', // default: copy KPI from source, overwrite destination
    smart_doc_conflict: 'keep_latest_submitted',
    reassign_authorship: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingUsers(true);
        const res = await fetch('/api/admin/list-users', { cache: 'no-store' });
        const json = (await res.json()) as { items?: ApiUserItem[]; error?: string };
        if (!res.ok) throw new Error(json?.error || 'Failed to load users');
        if (!mounted) return;

        const rawItems: ApiUserItem[] = json.items ?? [];
        const items: UserItem[] = rawItems.map((u) => ({
          id: u.id,
          name: (u.name ?? '').trim(),
          email: (u.email ?? '').toLowerCase(),
        }));

        items.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
        setUsers(items);
        setLoadErr(null);
      } catch (e: unknown) {
        if (mounted) {
          const message = e instanceof Error ? e.message : String(e);
          setLoadErr(message);
        }
      } finally {
        if (mounted) setLoadingUsers(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const canSubmit = useMemo(
    () => !!source && !!dest && source.id !== dest.id && !submitting,
    [source, dest, submitting]
  );

  async function handleRun() {
    setResult(null);
    if (!source || !dest) return;

    if (!opts.dry_run) {
      const ok = window.confirm(
        `This will copy/merge data from:\n\n` +
          `Source: ${source.name || source.email} (${source.id})\n` +
          `→ Destination: ${dest.name || dest.email} (${dest.id})\n\n` +
          `The destination user will gain data from the source.\n` +
          `The source user will remain intact (except optional authorship changes).\n\n` +
          `Are you sure you want to proceed?`
      );
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/transfer-user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          source: source.id,
          dest: dest.id,
          options: opts,
        }),
      });

      const json: unknown = await res.json();
      if (!res.ok) {
        const errMsg =
          typeof json === 'object' &&
          json !== null &&
          'error' in json &&
          typeof (json as { error: unknown }).error === 'string'
            ? (json as { error: string }).error
            : 'Unknown error';
        setResult({ ok: false, error: errMsg });
      } else {
        setResult({ ok: true, data: json });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, error: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack spacing={2}>
        <Typography variant="body2">
          Copy data from a source user into a destination user. The source user&apos;s data is left
          intact (except optional authorship reassignment). Start with a dry run to see what would
          happen.
        </Typography>

        {loadErr && <Alert severity="error">Failed to load users: {loadErr}</Alert>}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Autocomplete
              loading={loadingUsers}
              options={users}
              value={source}
              onChange={(_, v) => setSource(v)}
              getOptionLabel={(opt) => (opt ? `${opt.name || '(no name)'} — ${opt.email}` : '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Source User"
                  placeholder="Search users…"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingUsers ? <CircularProgress size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Autocomplete
              loading={loadingUsers}
              options={users}
              value={dest}
              onChange={(_, v) => setDest(v)}
              getOptionLabel={(opt) => (opt ? `${opt.name || '(no name)'} — ${opt.email}` : '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Destination User"
                  placeholder="Search users…"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingUsers ? <CircularProgress size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          </Grid>
        </Grid>

        <Divider />

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={opts.dry_run}
                  onChange={(e) => setOpts((o) => ({ ...o, dry_run: e.target.checked }))}
                />
              }
              label="Dry Run (no changes)"
            />
          </Grid>
        </Grid>

        <Button variant="outlined" onClick={() => setShowAdvanced((prev) => !prev)}>
          {showAdvanced ? 'Hide advanced options' : 'Advanced options'}
        </Button>

        <Collapse in={showAdvanced}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth>
                <InputLabel id="kpi_merge-label">KPI handling</InputLabel>
                <Select
                  labelId="kpi_merge-label"
                  label="KPI handling"
                  value={opts.kpi_merge}
                  onChange={(e) =>
                    setOpts((o) => ({ ...o, kpi_merge: e.target.value as TransferOptions['kpi_merge'] }))
                  }
                >
                  <MenuItem value="prefer_source">
                    Copy KPI data from source and replace destination values
                  </MenuItem>
                  <MenuItem value="skip">Leave KPI data unchanged</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth>
                <InputLabel id="smart_doc_conflict-label">Smart Doc conflicts</InputLabel>
                <Select
                  labelId="smart_doc_conflict-label"
                  label="Smart Doc conflicts"
                  value={opts.smart_doc_conflict}
                  onChange={(e) =>
                    setOpts((o) => ({
                      ...o,
                      smart_doc_conflict: e.target.value as TransferOptions['smart_doc_conflict'],
                    }))
                  }
                >
                  <MenuItem value="keep_latest_submitted">Keep the latest submitted version</MenuItem>
                  <MenuItem value="keep_dest">Keep the destination version</MenuItem>
                  <MenuItem value="keep_source">Keep the source version</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={opts.reassign_authorship}
                    onChange={(e) =>
                      setOpts((o) => ({ ...o, reassign_authorship: e.target.checked }))
                    }
                  />
                }
                label="Reassign content authorship"
              />
            </Grid>
          </Grid>
        </Collapse>

        <Stack direction="row" spacing={2} alignItems="center">
          <Button variant="contained" disabled={!canSubmit} onClick={handleRun}>
            {opts.dry_run ? 'Run Dry Test' : 'Run Live Copy'}
          </Button>
          {submitting && <CircularProgress size={20} />}
        </Stack>

        {result && (
          <Box>
            {result.ok ? (
              <Alert severity="success" sx={{ mb: 2 }}>
                {opts.dry_run
                  ? 'Dry run completed. Review the counts below.'
                  : 'Live copy completed. See the audit and details below.'}
              </Alert>
            ) : (
              <Alert severity="error" sx={{ mb: 2 }}>
                {result.error}
              </Alert>
            )}
            {result.ok ? (
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} flexWrap="wrap">
                  {formatTransferResult(result.data).map((section) => (
                    <Paper key={section.title} variant="outlined" sx={{ p: 2, minWidth: 220, flex: '1 1 220px' }}>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                        {section.title}
                      </Typography>
                      <Stack spacing={0.75}>
                        {section.items.map((item) => (
                          <Box key={`${section.title}-${item.label}`}>
                            <Typography variant="caption" color="text.secondary">
                              {item.label}
                            </Typography>
                            <Typography variant="body2">{item.value}</Typography>
                          </Box>
                        ))}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>

                <Paper variant="outlined" sx={{ p: 2, overflow: 'auto' }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                    Raw response
                  </Typography>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
{JSON.stringify(result.data, null, 2)}
                  </pre>
                </Paper>
              </Stack>
            ) : (
              <Paper variant="outlined" sx={{ p: 2, overflow: 'auto' }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
{JSON.stringify({ error: result.error }, null, 2)}
                </pre>
              </Paper>
            )}
          </Box>
        )}
      </Stack>
    </>
  );
}

type TransferResultSection = {
  title: string;
  items: Array<{ label: string; value: string }>;
};

function formatTransferResult(data: unknown): TransferResultSection[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return [
      {
        title: 'Outcome',
        items: [{ label: 'Result', value: formatTransferValue(data) }],
      },
    ];
  }

  const sections = Object.entries(data as Record<string, unknown>).map(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nestedItems = Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => ({
        label: humanizeKey(nestedKey),
        value: formatTransferValue(nestedValue),
      }));

      return {
        title: humanizeKey(key),
        items: nestedItems.length ? nestedItems : [{ label: humanizeKey(key), value: 'No details provided' }],
      };
    }

    return {
      title: humanizeKey(key),
      items: [{ label: humanizeKey(key), value: formatTransferValue(value) }],
    };
  });

  return sections.length
    ? sections
    : [
        {
          title: 'Outcome',
          items: [{ label: 'Result', value: 'Completed' }],
        },
      ];
}

function humanizeKey(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTransferValue(value: unknown): string {
  if (value == null) return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.length ? value.map(formatTransferValue).join(', ') : 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
