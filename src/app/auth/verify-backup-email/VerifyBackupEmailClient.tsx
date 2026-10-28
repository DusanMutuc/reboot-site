'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { AccountSecurityLayout, backupEmailError, useBackupEmailToken } from '@/components/account/backupEmailUi';

export default function VerifyBackupEmailClient() {
  const { token, ready } = useBackupEmailToken();
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [signInRequired, setSignInRequired] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const terminal = useRef(false);

  async function verify() {
    if (!token || inFlight.current || terminal.current) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/auth/backup-email/verify', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      });
      const body = await response.json();
      if (response.status === 401 || body.code === 'authentication_required') { terminal.current = true; setSignInRequired(true); return; }
      if (body.code === 'invalid_link') { terminal.current = true; setInvalid(true); return; }
      if (!response.ok || body.ok !== true) throw new Error(backupEmailError(body.code, 'This address could not be verified. Please try again.'));
      terminal.current = true;
      setVerified(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Verification could not be confirmed. Check account settings or try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <AccountSecurityLayout title={verified ? 'Backup email verified' : 'Verify your backup email'}>
    <Stack spacing={2.5}>
      {!ready ? <CircularProgress aria-label="Reading verification link" /> : verified ? <>
        <Alert severity="success">Your backup email is ready. Use it with your existing password to sign in, or request a password reset at that address.</Alert>
        <Button component={Link} href="/account" variant="contained">Go to account settings</Button>
      </> : signInRequired ? <>
        <Alert severity="info">Sign in to the Reboot account that requested this backup email, then reopen the verification link from your email.</Alert>
        <Button component={Link} href="/login" variant="contained">Sign in</Button>
      </> : !token || invalid ? <>
        <Alert severity="warning">This verification link has expired, was already used, or is no longer active. Open account settings to check your backup email or send a new link.</Alert>
        <Button component={Link} href="/account">Open account settings</Button>
      </> : <>
        <Typography>Confirm that you want to use this email as the backup for your signed-in Reboot account.</Typography>
        {error ? <Alert severity="error" role="alert">{error}</Alert> : null}
        <Button variant="contained" onClick={() => void verify()} disabled={busy}>{busy ? 'Verifying…' : 'Verify backup email'}</Button>
        <Link href="/account">Back to account settings</Link>
      </>}
    </Stack>
  </AccountSecurityLayout>;
}
