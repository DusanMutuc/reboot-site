'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

if (typeof window !== 'undefined' && window.location.hash.startsWith('#access_token=')) {
  const hashParams = window.location.hash.substring(1); // remove '#'
  const newUrl = window.location.pathname + '?' + hashParams;
  window.location.replace(newUrl);
}

export default function ResetPasswordPageWrapper() {
  // Remove useEffect for hash-to-query logic
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordPage />
    </Suspense>
  );
}

function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const accessToken = searchParams.get('access_token');
  const refreshToken = searchParams.get('refresh_token');

  // Authenticate on mount if tokens are present
  useEffect(() => {
    const authenticate = async () => {
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) {
          setAuthError('Authentication failed: ' + error.message);
        }
      } else {
        setAuthError('Missing token information in URL.');
      }
      setAuthenticating(false);
    };
    authenticate();
    // Only run on mount or if tokens change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, refreshToken]);

  const handleReset = async () => {
    setError(null);
    setSuccess(null);
    if (!password || !confirmPassword) {
      setError('Please fill in both fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess('Password updated! You can now log in with your new password.');
      setTimeout(() => router.push('/login'), 3000);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <Paper elevation={6} style={{ padding: 32, minWidth: 350, maxWidth: 400, width: '100%' }}>
        <Typography variant="h4" align="center" gutterBottom>Reset Password</Typography>
        {authenticating ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 32 }}>
            <CircularProgress />
            <Typography style={{ marginTop: 16 }}>Authenticating...</Typography>
          </div>
        ) : authError ? (
          <Typography color="error" align="center">{authError}</Typography>
        ) : (
          <>
            <TextField
              label="New password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              fullWidth
              margin="normal"
              disabled={loading}
            />
            <TextField
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              fullWidth
              margin="normal"
              disabled={loading}
            />
            <Button
              onClick={handleReset}
              disabled={loading}
              variant="contained"
              color="primary"
              fullWidth
              style={{ marginTop: 16 }}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
            {error && <Typography color="error" align="center" style={{ marginTop: 12 }}>{error}</Typography>}
            {success && <Typography color="success.main" align="center" style={{ marginTop: 12 }}>{success}</Typography>}
          </>
        )}
      </Paper>
    </div>
  );
}