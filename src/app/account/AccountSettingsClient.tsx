'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, CircularProgress, Divider, Stack, TextField, Typography } from '@mui/material';
import { AccountSecurityLayout, backupEmailError, type BackupEmailState } from '@/components/account/backupEmailUi';

export default function AccountSettingsClient() {
  const [state, setState] = useState<BackupEmailState | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [signInRequired, setSignInRequired] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const response = await fetch('/api/auth/backup-email', { cache: 'no-store', credentials: 'same-origin' });
      const body = await response.json();
      if (sequence !== requestSequence.current) return;
      if (response.status === 401) { setState(null); setSignInRequired(true); return; }
      if (response.status === 404 || body.enabled === false) { setState(null); setUnavailable(true); return; }
      if (!response.ok || typeof body.primaryEmail !== 'string' || !Number.isSafeInteger(body.version)) {
        throw new Error(backupEmailError(body.code, 'Account settings could not be loaded. Please try again.'));
      }
      setState(body as BackupEmailState);
      setSignInRequired(false);
      setRefreshRequired(false);
      setUnavailable(false);
    } catch (failure) {
      if (sequence === requestSequence.current) {
        setRefreshRequired(true);
        setError(failure instanceof Error ? failure.message : 'Account settings could not be loaded. Please try again.');
      }
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, []);

  useEffect(() => { void load(); return () => { requestSequence.current += 1; }; }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state || busy || loading || refreshRequired) return;
    const remove = removing;
    if (!remove && !state.deliveryReady) return;
    setBusy(true); setError(null); setMessage(null);
    const currentPassword = password;
    setPassword('');
    let confirmedResponse = false;
    try {
      const response = await fetch('/api/auth/backup-email', {
        method: remove ? 'DELETE' : 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, version: state.version,
          ...(!remove ? { email: state.pendingEmail ?? email.trim() } : {}) }),
      });
      const body = await response.json();
      confirmedResponse = typeof body?.code === 'string' || body?.ok === true;
      if (!response.ok || body.ok !== true) {
        if (response.status === 401) { setState(null); setSignInRequired(true); return; }
        if (body.code === 'state_changed') { setRemoving(false); await load(); }
        else if (body.code === 'delivery_unavailable') await load();
        throw new Error(backupEmailError(body.code, 'The change could not be confirmed. Refresh status before trying again.'));
      }
      setRemoving(false); setEmail('');
      setMessage(remove ? 'Backup email removed. Use your primary email to sign in or reset your password.'
        : 'Open the latest verification email to finish adding your backup address. It cannot be used until verified.');
      await load();
    } catch (failure) {
      if (!confirmedResponse) setRefreshRequired(true);
      setError(confirmedResponse && failure instanceof Error ? failure.message : 'The change could not be confirmed. Refresh status before trying again.');
    } finally { setBusy(false); }
  }

  const hasBackup = Boolean(state?.backupEmail);
  const hasPending = Boolean(state?.pendingEmail);
  const pendingExpired = state?.pendingExpiresAt ? new Date(state.pendingExpiresAt).getTime() <= Date.now() : false;
  const showForm = Boolean(state && (!hasBackup || hasPending || removing));

  return <AccountSecurityLayout title="Account settings">
    <Stack spacing={2.5}>
      {error ? <Alert severity="error" role="alert">{error}</Alert> : null}
      {message ? <Alert severity="success" role="status">{message}</Alert> : null}
      {loading && !state ? <CircularProgress aria-label="Loading account settings" /> : null}
      {unavailable ? <Typography>Backup email is not available yet. Your primary email still works as usual.</Typography> : null}
      {signInRequired ? <Alert severity="info">Sign in again to manage your account. <Link href="/login?redirectTo=%2Faccount">Go to sign in</Link>.</Alert> : null}
      {state ? <>
        <Box>
          <Typography variant="subtitle2" component="h2">Primary email</Typography>
          <Typography sx={{ overflowWrap: 'anywhere', mt: 0.5 }}>{state.primaryEmail}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Your primary email remains the address for account messages.</Typography>
        </Box>
        <Divider />
        <Box>
          <Typography variant="h6" component="h2">Backup email</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Add one other address you own. Once verified, you can sign in with either email and the same password, or request a password reset at either address.</Typography>
        </Box>
        {hasBackup ? <Alert severity="success"><strong>{state.backupEmail}</strong><br />Verified for sign-in and password recovery.</Alert> : null}
        {hasPending ? <Alert severity="warning">
          <strong>{state.pendingEmail}</strong><br />
          {pendingExpired ? 'Verification expired. Send a new link to finish adding this address.' : 'Awaiting verification. This address cannot be used to sign in or recover your account yet.'}
          {state.pendingExpiresAt && !pendingExpired ? <Typography variant="body2" sx={{ mt: 1 }}>Link expires {new Date(state.pendingExpiresAt).toLocaleString()}.</Typography> : null}
        </Alert> : null}
        {!state.deliveryReady ? <Alert severity="info">Verification email is temporarily unavailable. You can still remove an existing backup address.</Alert> : null}
        {showForm ? <Box component="form" onSubmit={submit}>
          <Stack spacing={2}>
            {removing ? <Typography>Remove {hasBackup ? 'your backup email' : 'the pending address'}? It will no longer work for sign-in or password recovery, and its unused email links will stop working.</Typography>
              : !hasPending ? <TextField label="Backup email address" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy || loading || !state.deliveryReady} fullWidth /> : null}
            <TextField label="Current password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy || loading} fullWidth helperText="Confirm your current password to make this change." />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button type="submit" variant="contained" color={removing ? 'error' : 'primary'} disabled={busy || loading || refreshRequired || !password || (!removing && (!state.deliveryReady || (!hasPending && !email.trim())))}>
                {busy ? 'Saving…' : removing ? (hasBackup ? 'Remove backup email' : 'Cancel pending verification') : hasPending ? 'Send a new verification link' : 'Send verification link'}
              </Button>
              {removing ? <Button type="button" disabled={busy} onClick={() => { setRemoving(false); setPassword(''); }}>Keep this address</Button> : null}
            </Stack>
          </Stack>
        </Box> : null}
        {(hasBackup || hasPending) && !removing ? <Button color="error" sx={{ alignSelf: 'flex-start' }} disabled={busy || loading} onClick={() => { setRemoving(true); setPassword(''); setError(null); setMessage(null); }}>{hasBackup ? 'Remove backup email' : 'Cancel pending verification'}</Button> : null}
      </> : null}
      {!unavailable && !signInRequired ? <Button onClick={() => { setError(null); void load(); }} disabled={loading || busy} sx={{ alignSelf: 'flex-start' }}>Refresh status</Button> : null}
      <Link href="/">Back to the hub</Link>
    </Stack>
  </AccountSecurityLayout>;
}
