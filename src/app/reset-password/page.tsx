'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export default function ResetPasswordPageWrapper() {
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

  const accessToken = searchParams.get('access_token');

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
    if (!accessToken) {
      setError('No access token found. Please use the link from your email.');
      return;
    }
    setLoading(true);
    // Set the session with the access token so updateUser works
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: searchParams.get('refresh_token') || '',
    });
    if (sessionError) {
      setError('Session error: ' + sessionError.message);
      setLoading(false);
      return;
    }
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
      </Paper>
    </div>
  );
}