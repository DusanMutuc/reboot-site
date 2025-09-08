'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

// MUI (optional)
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';

// ✅ stop static prerender + caching (optional but safe)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 1) If recovery link has #access_token=..., rewrite to query so searchParams can see it
if (typeof window !== 'undefined' && window.location.hash.startsWith('#access_token=')) {
  const hashParams = window.location.hash.substring(1);
  const newUrl = window.location.pathname + '?' + hashParams;
  window.location.replace(newUrl);
}

function parseHashParams(): URLSearchParams | null {
  if (typeof window === 'undefined') return null;
  if (!window.location.hash?.startsWith('#')) return null;
  return new URLSearchParams(window.location.hash.substring(1));
}

// ⬇️ Moved your existing component body into an inner component
function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [authenticating, setAuthenticating] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 2) If email link provided tokens, set session; otherwise assume first-login (already signed in)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        let at: string | null = searchParams.get('access_token');
        let rt: string | null = searchParams.get('refresh_token');

        // if tokens were only in hash (shouldn’t happen after rewrite, but safe)
        if (!at || !rt) {
          const hp = parseHashParams();
          if (hp) {
            at = at ?? hp.get('access_token');
            rt = rt ?? hp.get('refresh_token');
          }
        }

        if (at && rt) {
          const { error } = await supabase.auth.setSession({
            access_token: at,
            refresh_token: rt,
          });
          if (error) throw new Error('Auth failed: ' + error.message);
        }
        if (!cancelled) setAuthenticating(false);
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Authentication failed';
          setAuthError(msg);
          setAuthenticating(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [searchParams, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (pw1.length < 8) return setErr('Password must be at least 8 characters.');
    if (pw1 !== pw2) return setErr('Passwords do not match.');

    setLoading(true);

    // 3) Update password
    const { error: updateErr } = await supabase.auth.updateUser({ password: pw1 });
    if (updateErr) {
      setLoading(false);
      return setErr(updateErr.message);
    }

    // 4) Try to clear first-login flag (if they were already signed in). If 401 (recovery case), ignore.
    try {
      await fetch('/api/auth/clear-first-login-flag', { method: 'POST' });
    } catch {}

    // 5) Refresh current session just in case
    await supabase.auth.refreshSession();

    setLoading(false);

    // 6) If this was an email recovery (tokens present), go to login; else go to dashboard
    const cameViaRecovery =
      !!searchParams.get('access_token') || !!searchParams.get('refresh_token');

    router.replace(cameViaRecovery ? '/login' : '/dashboard');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
        padding: 16,
      }}
    >
      <Paper elevation={6} style={{ padding: 32, width: '100%', maxWidth: 420 }}>
        <Typography variant="h5" align="center" gutterBottom>
          Reset Password
        </Typography>

        {authenticating ? (
          <Stack spacing={2} alignItems="center" sx={{ py: 3 }}>
            <CircularProgress />
            <Typography>Authenticating…</Typography>
          </Stack>
        ) : authError ? (
          <Typography color="error" align="center">
            {authError}
          </Typography>
        ) : (
          <form onSubmit={handleSubmit}>
            <TextField
              label="New password"
              type="password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              fullWidth
              margin="normal"
              disabled={loading}
              autoComplete="new-password"
            />
            <TextField
              label="Confirm new password"
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              fullWidth
              margin="normal"
              disabled={loading}
              autoComplete="new-password"
            />

            {err && (
              <Typography color="error" align="center" sx={{ mt: 1 }}>
                {err}
              </Typography>
            )}

            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              disabled={loading}
              sx={{ mt: 2 }}
            >
              {loading ? 'Updating…' : 'Save & continue'}
            </Button>
          </form>
        )}
      </Paper>
    </div>
  );
}

// ✅ New default export: wrap in Suspense so useSearchParams is happy
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
