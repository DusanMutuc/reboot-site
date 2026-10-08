'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  operation: 'merge' | 'copy' | 'archive';
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
  dryRun: boolean;
  operation: TransferOptions['operation'];
  data?: unknown;
  error?: string;
};

type ApiUserItem = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type TransferReceipt = {
  requestId: string;
  source: UserItem;
  dest: UserItem;
  options: TransferOptions & { dry_run: false };
  createdAt: string;
};

const RECEIPTS_STORAGE_KEY = 'reboot:account-transfer:pending-receipts';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function transferIntent(sourceId: string | undefined, destId: string | undefined, options: TransferOptions) {
  return JSON.stringify([options.operation, sourceId, destId, options.kpi_merge, options.smart_doc_conflict, options.reassign_authorship]);
}

function readTransferReceipts(): TransferReceipt[] {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(RECEIPTS_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return [];
      const receipt = entry as Partial<TransferReceipt>;
      const validUser = (user: UserItem | undefined) => user && typeof user.id === 'string' && UUID_PATTERN.test(user.id)
        && typeof user.name === 'string' && typeof user.email === 'string';
      const options = receipt.options;
      if (typeof receipt.requestId !== 'string' || !UUID_PATTERN.test(receipt.requestId)
        || !validUser(receipt.source) || !validUser(receipt.dest) || receipt.source!.id.toLowerCase() === receipt.dest!.id.toLowerCase()
        || !options || options.dry_run !== false || !['merge', 'copy', 'archive'].includes(options.operation)
        || !['skip', 'prefer_source'].includes(options.kpi_merge)
        || !['keep_latest_submitted', 'keep_dest', 'keep_source'].includes(options.smart_doc_conflict)
        || typeof options.reassign_authorship !== 'boolean'
        || typeof receipt.createdAt !== 'string' || !Number.isFinite(Date.parse(receipt.createdAt))) return [];
      // Reconstruct the wire options: stored display metadata can never add
      // trusted/server-only fields to a replay request.
      return [{
        requestId: receipt.requestId.toLowerCase(),
        source: { id: receipt.source!.id, name: receipt.source!.name, email: receipt.source!.email },
        dest: { id: receipt.dest!.id, name: receipt.dest!.name, email: receipt.dest!.email },
        options: {
          operation: options.operation, dry_run: false as const, kpi_merge: options.kpi_merge,
          smart_doc_conflict: options.smart_doc_conflict, reassign_authorship: options.reassign_authorship,
        },
        createdAt: receipt.createdAt,
      }];
    });
  } catch { return []; }
}

function savedRequestId(intentKey: string): string | undefined {
  try {
    const value = window.sessionStorage.getItem(`reboot:account-transfer:${intentKey}`);
    return value && UUID_PATTERN.test(value)
      ? value.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

export default function UserDataTransfer() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [source, setSource] = useState<UserItem | null>(null);
  const [dest, setDest] = useState<UserItem | null>(null);

  const [opts, setOpts] = useState<TransferOptions>({
    operation: 'merge',
    dry_run: true,
    kpi_merge: 'prefer_source', // default: copy KPI from source, overwrite destination
    smart_doc_conflict: 'keep_latest_submitted',
    reassign_authorship: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [retryIntentKey, setRetryIntentKey] = useState<string | null>(null);
  const [completedIntents, setCompletedIntents] = useState(() => new Set<string>());
  const [pendingReceipts, setPendingReceipts] = useState<TransferReceipt[]>([]);
  const [receiptStorageFailed, setReceiptStorageFailed] = useState(false);
  const receiptsRef = useRef<TransferReceipt[]>([]);
  const requestIds = useRef(new Map<string, string>());
  const intentKey = transferIntent(source?.id, dest?.id, opts);
  const completed = completedIntents.has(intentKey);
  const retrySavedAttempt = retryIntentKey === intentKey && !completed;

  useEffect(() => {
    const receipts = readTransferReceipts();
    receiptsRef.current = receipts;
    setPendingReceipts(receipts);
    for (const receipt of receipts) {
      requestIds.current.set(transferIntent(receipt.source.id, receipt.dest.id, receipt.options), receipt.requestId);
    }
  }, []);

  function saveReceipts(receipts: TransferReceipt[]) {
    receiptsRef.current = receipts;
    setPendingReceipts(receipts);
    try {
      window.sessionStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify(receipts));
      setReceiptStorageFailed(false);
    } catch { setReceiptStorageFailed(true); }
  }

  useEffect(() => {
    const requestId = requestIds.current.get(intentKey) ?? savedRequestId(intentKey);
    if (requestId) requestIds.current.set(intentKey, requestId);
    setRetryIntentKey(requestId ? intentKey : null);
  }, [intentKey]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingUsers(true);
        const res = await fetch('/api/admin/list-users?membership=all', { cache: 'no-store' });
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
    () => !!source && !!dest && source.id !== dest.id && !submitting && !completed
      && (opts.dry_run || previewKey === intentKey || retrySavedAttempt),
    [source, dest, submitting, completed, opts.dry_run, previewKey, intentKey, retrySavedAttempt]
  );

  async function handleRun(savedAttempt?: TransferReceipt) {
    const knownReceipt = savedAttempt && receiptsRef.current.find((receipt) => receipt === savedAttempt);
    if (savedAttempt ? !knownReceipt || submitting : !source || !dest || !canSubmit) return;
    const attemptSource = savedAttempt?.source ?? source!;
    const attemptDest = savedAttempt?.dest ?? dest!;
    const attemptOptions = savedAttempt?.options ?? opts;
    const attemptKey = transferIntent(attemptSource.id, attemptDest.id, attemptOptions);
    if (completedIntents.has(attemptKey)) return;
    const retrying = Boolean(savedAttempt) || retrySavedAttempt;
    setResult(null);

    if (!attemptOptions.dry_run) {
      const ok = window.confirm(
        (retrying ? `Retry the previous account operation:\n\n` : `Operation: ${attemptOptions.operation === 'merge' ? 'Merge accounts' : attemptOptions.operation === 'archive' ? 'Archive a previously transferred account' : 'Copy history'}\n\n`) +
          `Source: ${attemptSource.name || attemptSource.email} (${attemptSource.id})\n` +
          `→ Destination: ${attemptDest.name || attemptDest.email} (${attemptDest.id})\n\n` +
          (retrying
            ? `If the transfer already completed, its saved result will be returned without copying again.\n`
            : attemptOptions.operation === 'archive' ? `Existing destination history will be kept without copying again.\n`
              : `The destination user will gain data from the source.\n`) +
          `Its GHL contact will be resolved from ${attemptDest.email}.\n` +
          (attemptOptions.operation === 'copy'
            ? `Both accounts will remain usable.\n\n`
            : `The source account will be archived as Merged, lose access, and leave active member workflows. Its original history will be preserved.\n\n`) +
          `Are you sure you want to proceed?`
      );
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      let requestId: string | undefined;
      if (!attemptOptions.dry_run) {
        // Keep the same operation ID after a lost response, including a page reload.
        const storageKey = `reboot:account-transfer:${attemptKey}`;
        requestId = savedAttempt?.requestId ?? requestIds.current.get(attemptKey);
        if (!requestId) {
          requestId = savedRequestId(attemptKey);
          requestId ??= crypto.randomUUID();
          requestIds.current.set(attemptKey, requestId);
          try { window.sessionStorage.setItem(storageKey, requestId); } catch { /* In-memory retries still work. */ }
        }
        if (!receiptsRef.current.some((receipt) => receipt.requestId === requestId)) {
          saveReceipts([...receiptsRef.current, {
            requestId, source: { ...attemptSource }, dest: { ...attemptDest },
            options: { ...attemptOptions, dry_run: false }, createdAt: new Date().toISOString(),
          }]);
        }
        if (attemptKey === intentKey) setRetryIntentKey(attemptKey);
      }
      const res = await fetch('/api/admin/transfer-user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          source: attemptSource.id,
          dest: attemptDest.id,
          options: { ...attemptOptions, ...(requestId ? { request_id: requestId } : {}) },
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
        setResult({ ok: false, dryRun: attemptOptions.dry_run, operation: attemptOptions.operation, error: errMsg });
        if (attemptOptions.dry_run) setPreviewKey(null);
      } else {
        setResult({ ok: true, dryRun: attemptOptions.dry_run, operation: attemptOptions.operation, data: json });
        if (attemptOptions.dry_run) setPreviewKey(attemptKey);
        else {
          setCompletedIntents((previous) => new Set(previous).add(attemptKey));
          saveReceipts(receiptsRef.current.filter((receipt) => receipt.requestId !== requestId));
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, dryRun: attemptOptions.dry_run, operation: attemptOptions.operation, error: message });
      if (attemptOptions.dry_run) setPreviewKey(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack spacing={2}>
        {pendingReceipts.length > 0 && (
          <Alert severity="warning" variant="outlined">
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">Finish a previous operation</Typography>
              <Typography variant="body2">These saved attempts may already have transferred the history. Retry the original operation to finish it or retrieve its result, even if the source account is now archived.</Typography>
              {pendingReceipts.map((receipt) => (
                <Box key={receipt.requestId} sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
                  <Typography variant="body2" fontWeight={600}>{receipt.source.name || receipt.source.email} → {receipt.dest.name || receipt.dest.email}</Typography>
                  <Typography variant="body2">{receipt.source.email} → {receipt.dest.email}</Typography>
                  <Typography variant="caption" component="p" color="text.secondary">
                    {receipt.options.operation === 'copy' ? 'Copy history' : receipt.options.operation === 'archive' ? 'Archive source' : 'Merge accounts'} · {new Date(receipt.createdAt).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" component="p" color="text.secondary">
                    {receipt.options.operation === 'archive' ? 'Keep the previously transferred history without copying again.' : <>
                      KPI: {receipt.options.kpi_merge === 'skip' ? 'keep destination values' : 'use source values'} · Smart Docs: {receipt.options.smart_doc_conflict === 'keep_dest' ? 'keep destination' : receipt.options.smart_doc_conflict === 'keep_source' ? 'keep source' : 'latest submitted'} · Authorship: {receipt.options.reassign_authorship ? 'reassign' : 'unchanged'}
                    </>}
                  </Typography>
                  <Button size="small" variant="outlined" disabled={submitting} onClick={() => void handleRun(receipt)} sx={{ mt: 1 }}>Retry this saved operation</Button>
                </Box>
              ))}
            </Stack>
          </Alert>
        )}
        {receiptStorageFailed && pendingReceipts.length > 0 && <Alert severity="warning">This browser could not save the recovery details. Keep this page open until the operation finishes.</Alert>}
        <Typography variant="body2">
          Merge duplicate accounts into one current member profile. The old account becomes a
          read-only archive, with its previous email and GHL identifiers kept in the merge history.
          Start with a dry run to review the proposed changes.
        </Typography>
        <FormControl fullWidth>
          <InputLabel id="account-operation-label">Account operation</InputLabel>
          <Select labelId="account-operation-label" label="Account operation" value={opts.operation}
            disabled={submitting} onChange={(event) => setOpts((previous) => ({
              ...previous, operation: event.target.value as TransferOptions['operation'], dry_run: true,
            }))}>
            <MenuItem value="merge">Merge accounts and archive the source</MenuItem>
            <MenuItem value="archive">Archive a source whose history was already transferred</MenuItem>
            <MenuItem value="copy">Copy history and keep both accounts usable</MenuItem>
          </Select>
        </FormControl>
        {opts.operation === 'archive' && <Alert severity="info">
          Requires a recorded successful transfer between these accounts. This preserves the
          destination&apos;s existing work, refreshes its GHL contact, and archives the source without copying history again.
        </Alert>}
        {opts.operation === 'copy' && <Alert severity="warning">
          Copy history leaves both accounts usable. Use Merge accounts when one account replaces the other.
        </Alert>}
        <Typography variant="body2" color="text.secondary">
          Includes Business Reviews, preparation answers, Focus Finder scores, system scorecards,
          priorities, and scorecard history, plus implementation checklists, progress, meeting history,
          and standalone coaching notes, linked to the copied notes and action steps. Scheduled
          meeting references are preserved in the copied history.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The destination&apos;s GHL contact is looked up using its account email. A missing or ambiguous
          contact must be resolved before applying changes. Complete a dry run with the same settings first.
        </Typography>

        {loadErr && <Alert severity="error">Failed to load users: {loadErr}</Alert>}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Autocomplete
              disabled={submitting}
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
              disabled={submitting}
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
                  disabled={submitting}
                  checked={opts.dry_run}
                  onChange={(e) => setOpts((o) => ({ ...o, dry_run: e.target.checked }))}
                />
              }
              label="Dry Run (no member data changes)"
            />
          </Grid>
        </Grid>

        <Button disabled={opts.operation === 'archive'} variant="outlined" onClick={() => setShowAdvanced((prev) => !prev)}>
          {showAdvanced ? 'Hide advanced options' : 'Advanced options'}
        </Button>

        <Collapse in={showAdvanced && opts.operation !== 'archive'}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth>
                <InputLabel id="kpi_merge-label">KPI handling</InputLabel>
                <Select
                  disabled={submitting}
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
                  disabled={submitting}
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
                    disabled={submitting}
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

        {completed && (
          <Alert severity="success">This account operation has completed. Retrying will not copy data again.</Alert>
        )}
        {!opts.dry_run && retrySavedAttempt && (
          <Alert severity="info">A previous attempt is saved. Retry it to retrieve its result without copying twice.</Alert>
        )}
        {!opts.dry_run && !completed && !retrySavedAttempt && previewKey !== intentKey && (
          <Alert severity="info">Run a dry test with these users and settings before applying changes.</Alert>
        )}
        <Stack direction="row" spacing={2} alignItems="center">
          <Button variant="contained" disabled={!canSubmit} onClick={() => void handleRun()}>
            {completed ? 'Completed' : opts.dry_run ? 'Run Dry Test' : retrySavedAttempt ? 'Retry Saved Operation' : opts.operation === 'copy' ? 'Copy History' : opts.operation === 'archive' ? 'Archive Source Account' : 'Merge Accounts'}
          </Button>
          {submitting && <CircularProgress size={20} />}
        </Stack>

        {result && (
          <Box>
            {result.ok ? (
              <Alert severity="success" sx={{ mb: 2 }}>
                {result.dryRun
                  ? 'Dry run completed. Review the counts below.'
                  : result.operation === 'copy' ? 'History copied. Both accounts remain usable.'
                    : 'Merge completed. The source is archived and the destination is the current account.'}
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
                      <Typography variant="adminSectionTitle" fontWeight={700} sx={{ mb: 1 }}>
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
                  <Typography variant="adminSectionTitle" fontWeight={700} sx={{ mb: 1 }}>
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
