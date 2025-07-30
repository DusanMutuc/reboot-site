'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import React from 'react';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <Paper elevation={6} style={{ padding: 32, minWidth: 350, maxWidth: 400, width: '100%' }}>
        <Typography variant="h4" align="center" gutterBottom>Login</Typography>
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          margin="normal"
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          margin="normal"
        />
        <Button
          variant="contained"
          color="primary"
          onClick={handleLogin}
          fullWidth
          style={{ marginTop: 16 }}
        >
          Login
        </Button>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Button
            variant="text"
            color="primary"
            onClick={() => setShowForgotModal(true)}
            style={{ textTransform: 'none' }}
          >
            Forgot Password?
          </Button>
        </div>
        {error && <Typography color="error" align="center" style={{ marginTop: 12 }}>{error}</Typography>}
      </Paper>

      {/* Forgot Password Modal */}
      <Dialog open={showForgotModal} onClose={() => {
        setShowForgotModal(false);
        setForgotEmail('');
        setForgotError(null);
        setForgotMessage(null);
      }}>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          <TextField
            label="Enter your email"
            value={forgotEmail}
            onChange={e => setForgotEmail(e.target.value)}
            fullWidth
            margin="normal"
            disabled={forgotLoading}
          />
          {forgotError && <Typography color="error" style={{ marginTop: 8 }}>{forgotError}</Typography>}
          {forgotMessage && <Typography color="success.main" style={{ marginTop: 8 }}>{forgotMessage}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={async () => {
              setForgotLoading(true);
              setForgotError(null);
              setForgotMessage(null);
              const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
                redirectTo: 'https://reboot-site.vercel.app/reset-password',
              });
              if (error) {
                setForgotError(error.message);
              } else {
                setForgotMessage('If this email exists, a reset link has been sent.');
              }
              setForgotLoading(false);
            }}
            disabled={forgotLoading || !forgotEmail}
            variant="contained"
            color="primary"
          >
            {forgotLoading ? 'Sending...' : 'Send Email'}
          </Button>
          <Button onClick={() => {
            setShowForgotModal(false);
            setForgotEmail('');
            setForgotError(null);
            setForgotMessage(null);
          }} disabled={forgotLoading} color="secondary" variant="outlined">
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
