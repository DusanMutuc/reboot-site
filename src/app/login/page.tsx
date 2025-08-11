'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';

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
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef  = useRef<HTMLInputElement>(null);

  const handleLogin = async () => {
    const email = emailRef.current?.value || '';
    const password = passRef.current?.value || '';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else router.push('/dashboard');
  };

  // capture autofill after mount
  useEffect(() => {
    const grab = () => {
      setEmail(emailRef.current?.value || '');
      setPassword(passRef.current?.value || '');
    };
    grab();
    const id = setTimeout(grab, 400);
    return () => clearTimeout(id);
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        flexDirection: { xs: 'column', md: 'row' }, // stack on mobile
      }}
    >
      {/* Left Panel — Login (1/3) */}
      <Box
        sx={{
          flex: { xs: 'unset', md: '1' },
          backgroundColor: '#5cbca8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: '1.5rem', md: '2.5rem' }, // 24 / 40px
        }}
      >
        <Box sx={{ width: '100%', maxWidth: '40rem', color: '#fff' /* 400px */ }}>
          <Typography
            variant="h6"
            sx={{ mb: '2rem', fontWeight: 700, color: '#fff', fontSize: '2.5rem' }}
          >
            Login information
          </Typography>

          <TextField
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            fullWidth
            margin="normal"
            autoComplete="email"
            inputRef={emailRef}
            slotProps={{ inputLabel: { shrink: !!email } }}
            sx={{
              mb: '1rem',
              '& .MuiInputBase-input': {
                fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
                fontSize: '1.7rem',
              },
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#fff',
                '& fieldset': { borderColor: 'transparent' },
                '&:hover fieldset': { borderColor: 'transparent' },
                '&.Mui-focused fieldset': { borderColor: 'transparent' },
              },
              '& .MuiInputLabel-root': { color: '#666' },
            }}
          />

          <TextField
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            fullWidth
            margin="normal"
            autoComplete="current-password"
            inputRef={passRef}
            slotProps={{ inputLabel: { shrink: !!password } }}
            sx={{
              mb: '1.5rem',
              '& .MuiOutlinedInput-root': {
                fontSize: '1.7rem',
                backgroundColor: '#fff',
                '& fieldset': { borderColor: 'transparent' },
                '&:hover fieldset': { borderColor: 'transparent' },
                '&.Mui-focused fieldset': { borderColor: 'transparent' },
              },
              '& .MuiInputLabel-root': { color: '#666' },
            }}
          />

          <Box sx={{ textAlign: 'right', mb: '2rem' }}>
            <Button
              variant="text"
              onClick={() => setShowForgotModal(true)}
              sx={{
                textTransform: 'none',
                textDecoration: 'underline',
                color: '#fff',
                fontSize: '1rem',
              }}
            >
              Forgot Password?
            </Button>
          </Box>

          <Button
            variant="contained"
            color="secondary"
            onClick={handleLogin}
            fullWidth
            sx={{
              textTransform: 'none',
              color: '#fff',
              py: '0.875rem',       // ~14px for comfy tap target at SCALE
              fontSize: '2rem',  // 20px
              fontWeight: 700,
              borderRadius: '0.5rem',
            }}
          >
            Sign In
          </Button>

          {error && (
            <Typography
              align="center"
              sx={{ mt: '1rem', color: '#ffebee', fontSize: '0.95rem' }}
            >
              {error}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Right Panel — Branding (2/3) */}
<div
  style={{
    flex: 2,
    backgroundColor: '#2a2a2a',
    position: 'relative',
  }}
>
  {/* Main Content Centered */}
  <div
    style={{
      position: 'absolute',
      top: '45%', // move up/down here
      left: '50%',
      transform: 'translate(-50%, -50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center', // align text start with logo start
      textAlign: 'center',
    }}
  >
    {/* Logo above text */}
    <div style={{ width: 600, height: 240, marginBottom: 24 }}>
      <Image
        src="/Reboot Logo - Color.png"
        alt="Reboot logo"
        fill
        style={{ objectFit: 'contain' }}
        priority
      />
    </div>

    {/* Member Hub title */}
    <Typography
      variant="h2"
      style={{
        color: '#5cbca8',
        fontWeight: 'bold',
        fontSize: '9rem',
        marginLeft: '1rem'
      }}
    >
      MEMBER&apos;S HUB
    </Typography>
  </div>
</div>


      {/* Forgot Password Modal */}
      <Dialog
        open={showForgotModal}
        onClose={() => {
          setShowForgotModal(false);
          setForgotEmail('');
          setForgotError(null);
          setForgotMessage(null);
        }}
      >
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          <TextField
            label="Enter your email"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            fullWidth
            margin="normal"
            disabled={forgotLoading}
          />
          {forgotError && (
            <Typography color="error" sx={{ mt: 1 }}>
              {forgotError}
            </Typography>
          )}
          {forgotMessage && (
            <Typography color="success.main" sx={{ mt: 1 }}>
              {forgotMessage}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={async () => {
              setForgotLoading(true);
              setForgotError(null);
              setForgotMessage(null);
              const { error } = await supabase.auth.resetPasswordForEmail(
                forgotEmail,
                { redirectTo: 'https://reboot-site.vercel.app/reset-password' }
              );
              if (error) setForgotError(error.message);
              else setForgotMessage('If this email exists, a reset link has been sent.');
              setForgotLoading(false);
            }}
            disabled={forgotLoading || !forgotEmail}
            variant="contained"
            color="primary"
          >
            {forgotLoading ? 'Sending...' : 'Send Email'}
          </Button>
          <Button
            onClick={() => {
              setShowForgotModal(false);
              setForgotEmail('');
              setForgotError(null);
              setForgotMessage(null);
            }}
            disabled={forgotLoading}
            color="secondary"
            variant="outlined"
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
