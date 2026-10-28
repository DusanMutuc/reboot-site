'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { AccountSecurityLayout, backupEmailError, useBackupEmailToken } from '@/components/account/backupEmailUi';

export default function RecoverBackupEmailClient() {
  const router = useRouter();
  const { token, ready } = useBackupEmailToken();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const terminal = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || inFlight.current || terminal.current) return;
    if (password.length < 8) { setError('Use at least 8 characters for your new password.'); return; }
    if (password !== confirmation) { setError('Your passwords do not match.'); return; }
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/auth/backup-recovery/complete', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }),
      });
      const body = await response.json();
      if (body.code === 'invalid_link') { terminal.current = true; setInvalid(true); return; }
      if (body.code === 'recovery_uncertain') { terminal.current = true; setUncertain(true); return; }
      if (!response.ok || body.ok !== true) {
        setError(body.code === 'password_policy' ? 'That password does not meet the account security requirements. Choose a stronger password and try again.'
          : backupEmailError(body.code, 'Your password could not be changed. Please request a new link.'));
        return;
      }
      setPassword(''); setConfirmation('');
      terminal.current = true;
      router.replace('/login?passwordUpdated=1');
    } catch {
      // The request might have changed the password before its response was lost.
      terminal.current = true;
      setUncertain(true);
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <AccountSecurityLayout title="Choose your new password">
    <Stack spacing={2.5}>
      {!ready ? <CircularProgress aria-label="Reading recovery link" /> : !token || invalid ? <>
        <Alert severity="warning">This password link has expired, was already used, or its backup email was removed. Request a new password link to continue.</Alert>
        <Button component={Link} href="/login">Request a new password link</Button>
      </> : uncertain ? <>
        <Alert severity="warning">We could not confirm whether your password changed. Try signing in with your new password. If that does not work, request a new password link. This link will not be submitted again.</Alert>
        <Button component={Link} href="/login" variant="contained">Go to sign in</Button>
      </> : <Box component="form" onSubmit={submit}>
        <Stack spacing={2}>
          <Typography>Use at least 8 characters. This changes the password for both your primary and verified backup email.</Typography>
          <TextField label="New password" type="password" required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} fullWidth />
          <TextField label="Confirm new password" type="password" required autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} fullWidth />
          {error ? <Alert severity="error" role="alert">{error}</Alert> : null}
          <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Saving…' : 'Save password and return to sign in'}</Button>
        </Stack>
      </Box>}
    </Stack>
  </AccountSecurityLayout>;
}
