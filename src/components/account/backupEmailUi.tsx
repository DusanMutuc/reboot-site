'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Box, Container, Paper, Stack, Typography } from '@mui/material';

export type BackupEmailState = {
  enabled: boolean; deliveryReady: boolean; primaryEmail: string;
  backupEmail: string | null; verifiedAt: string | null; version: number;
  pendingEmail: string | null; pendingExpiresAt: string | null;
};

export function backupEmailError(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'invalid_password': return 'Your current password was not accepted. Please try again.';
    case 'state_changed': return 'Your account details changed or this email address is unavailable. Review the latest details before trying again.';
    case 'delivery_unavailable': return 'Email delivery is temporarily unavailable. Please try again later.';
    case 'rate_limited': return 'Please wait a little before trying again.';
    case 'mfa_required': return 'Backup email is not available for accounts using two-step verification yet. Your primary email still works for sign-in and password recovery.';
    case 'account_ineligible': return 'This account cannot use backup email. Please contact support for help.';
    case 'feature_disabled': return 'Backup email is not available yet.';
    default: return fallback;
  }
}

/** Email scanners can open the page, but only an explicit POST consumes a link. */
export function useBackupEmailToken() {
  const initialized = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', window.location.pathname);
    setToken(value && value.length <= 4096 ? value : null);
    setReady(true);
  }, []);
  return { token, ready };
}

export function AccountSecurityLayout({ title, children }: { title: string; children: ReactNode }) {
  return <Box component="main" sx={{ minHeight: '100vh', bgcolor: '#f7fbfa', py: { xs: 3, md: 7 }, px: 2 }}>
    <Container maxWidth="sm">
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
        <Typography component={Link} href="/" sx={{ color: '#186e5d', fontWeight: 800, textDecoration: 'none', letterSpacing: '.04em' }}>REBOOT</Typography>
        <Link href="/support" prefetch={false}>Get help</Link>
      </Stack>
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, borderColor: '#cbd9d4', borderRadius: 2 }}>
        <Typography component="h1" variant="h4" sx={{ fontWeight: 700, mb: 3 }}>{title}</Typography>
        {children}
      </Paper>
    </Container>
  </Box>;
}
