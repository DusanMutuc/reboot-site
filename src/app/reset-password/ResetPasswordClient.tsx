// src/app/reset-password/ResetPasswordClient.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import { assertAccountSessionAllowed } from '@/lib/accountLifecycleClient';

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { isSingleton: false, auth: { detectSessionInUrl: false } }
    ),
    []
  );

  const authentication = useRef<Promise<void> | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupSent, setSetupSent] = useState(false);
  const [authenticating, setAuthenticating] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!authentication.current) {
      authentication.current = (async () => {
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const at = searchParams.get('access_token') ?? hash.get('access_token');
        const rt = searchParams.get('refresh_token') ?? hash.get('refresh_token');
        const code = searchParams.get('code');
        const linkError = searchParams.get('error_description') ?? hash.get('error_description');
        // Never move tokens into the query string, referrers, or server logs.
        window.history.replaceState(null, '', window.location.pathname);
        if (linkError) throw new Error('This link is invalid or expired. Request a new link from the login page.');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw new Error('This link is invalid or expired. Request a new link from the login page.');
        } else if (at && rt) {
          const { error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt });
          if (error) throw new Error('This link is invalid or expired. Request a new link from the login page.');
        }
        await assertAccountSessionAllowed(supabase, { allowPendingSetup: true });
        const { data: { user } } = await supabase.auth.getUser();
        setSetupRequired(user?.app_metadata?.must_reset_password === true);
      })();
    }
    authentication.current.then(() => {
      if (!cancelled) setAuthenticating(false);
    }).catch((e: unknown) => {
      if (!cancelled) {
        setAuthError(e instanceof Error ? e.message : 'Authentication failed');
        setAuthenticating(false);
      }
    });
    return () => { cancelled = true; };
  }, [searchParams, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (pw1.length < 8) return setErr('Password must be at least 8 characters.');
    if (pw1 !== pw2)   return setErr('Passwords do not match.');

    setLoading(true);

    try {
      await assertAccountSessionAllowed(supabase, { allowPendingSetup: true });
      // Re-read live state before choosing the setup-only privileged endpoint.
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Please open a fresh password reset link.');
      if (user.app_metadata?.must_reset_password === true) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('Please open a fresh setup link.');
        const response = await fetch('/api/auth/clear-first-login-flag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ password: pw1 }),
        });
        const result = await response.json();
        if (!response.ok || result.ok !== true) throw new Error(result.error || 'Password could not be saved.');
      } else {
        // GoTrue enforces recovery, MFA, and secure password-change rules for
        // established users. An admin password update would bypass those rules.
        const { error } = await supabase.auth.updateUser({ password: pw1 });
        if (error) throw new Error(error.message);
      }
      // The password is saved even if refreshing an old session fails.
      await supabase.auth.signOut({ scope: 'local' });
      router.replace('/login?passwordUpdated=1');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Password could not be saved.');
    } finally {
      setLoading(false);
    }
  };

  const sendSetupLink = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user?.email) throw new Error('Request a new link from the login page.');
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: 'https://hub.rebootmembers.com/reset-password',
      });
      if (sendError) throw sendError;
      setSetupSent(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'The link could not be sent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f5f5', padding:16 }}>
      <Paper elevation={6} style={{ padding:32, width:'100%', maxWidth:420 }}>
        <Typography variant="h5" align="center" gutterBottom>Choose your password</Typography>

        {authenticating ? (
          <Stack spacing={2} alignItems="center" sx={{ py: 3 }}>
            <CircularProgress />
            <Typography>Authenticating…</Typography>
          </Stack>
        ) : authError ? (
          <Stack spacing={2}><Typography color="error" align="center">{authError}</Typography><Button href="/login">Request a new link</Button></Stack>
        ) : (
          <form onSubmit={handleSubmit}>
            <Typography variant="body2" sx={{ mb: 2, fontSize: '14px' }}>
              Choose a password with at least 8 characters. After saving it, you’ll return to the login page to sign in with your new password.
            </Typography>
            {setupRequired && <Stack spacing={1}>
              <Typography variant="body2" sx={{ fontSize: '14px' }}>To finish setting up your account, open the latest setup link in your email, then enter your new password below. If you already opened that link, you can continue here.</Typography>
              <Button onClick={sendSetupLink} disabled={loading || setupSent}>{setupSent ? 'Setup link sent — check your inbox and spam folder' : 'Send a fresh setup link'}</Button>
            </Stack>}
            <TextField label="New password" type="password" value={pw1} onChange={(e)=>setPw1(e.target.value)} fullWidth margin="normal" disabled={loading} autoComplete="new-password" helperText="At least 8 characters" />
            <TextField label="Confirm new password" type="password" value={pw2} onChange={(e)=>setPw2(e.target.value)} fullWidth margin="normal" disabled={loading} autoComplete="new-password" />
            {err && <Typography color="error" align="center" sx={{ mt: 1 }}>{err}</Typography>}
            <Button type="submit" variant="contained" color="primary" fullWidth disabled={loading} sx={{ mt: 2 }}>
              {loading ? 'Saving…' : 'Save password & return to sign in'}
            </Button>
          </form>
        )}
      </Paper>
    </div>
  );
}
