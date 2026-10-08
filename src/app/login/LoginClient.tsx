'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { assertAccountSessionAllowed } from '@/lib/accountLifecycleClient';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import rebootLogo from '/public/Reboot Logo - Color.png'; // Add this import

type LoginClientProps = {
  redirectTo?: string | null;
  passwordUpdated?: boolean;
};

export default function LoginClient({ redirectTo = null, passwordUpdated = false }: LoginClientProps) {
  const router = useRouter();
  
  // Use useState and useEffect for hydration-safe responsive detection
  const [isMdUp, setIsMdUp] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  // Hydration-safe responsive detection
  useEffect(() => {
    setMounted(true);
    
    const checkIsDesktop = () => {
      setIsMdUp(window.innerWidth >= 900);
    };
    
    checkIsDesktop();
    window.addEventListener('resize', checkIsDesktop);
    
    return () => window.removeEventListener('resize', checkIsDesktop);
  }, []);

  const handleLogin = async () => {
    setError(null);
  
    const email = (emailRef.current?.value || '').trim();
    const password = passRef.current?.value || '';
  
    const { data: authData, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });
  
    if (signInError) {
      setError(signInError.code === 'invalid_credentials'
        ? 'We couldn’t sign you in. Check your email and password, or choose “Set up or reset password” to get an email link and choose a password.'
        : signInError.message);
      return;
    }
  
    const user = authData.user;
    if (!user) {
      setError('No user data returned');
      return;
    }
  
    try {
      await assertAccountSessionAllowed(supabase);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Account access could not be verified.');
      return;
    }
    // The root route resolves membership and the admin-selected default home.
    router.replace(redirectTo || '/');
    router.refresh();
  };

  const handleLoginSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleLogin();
  };

  const openPasswordReset = () => {
    setForgotEmail((emailRef.current?.value || email).trim());
    setForgotError(null);
    setForgotMessage(null);
    setShowForgotModal(true);
  };

  const closePasswordReset = () => {
    if (forgotLoading) return;
    setShowForgotModal(false);
    setForgotEmail('');
    setForgotError(null);
    setForgotMessage(null);
  };

  const sendPasswordResetEmail = async () => {
    setForgotLoading(true);
    setForgotError(null);
    setForgotMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        forgotEmail.trim(),
        { redirectTo: 'https://hub.rebootmembers.com/reset-password' }
      );
      if (error) setForgotError(error.message);
      else setForgotMessage('If an account exists for this email, we’ve sent a link. Check your inbox and spam folder. Open the link, choose your password, then return to sign in.');
    } catch (error) {
      setForgotError(error instanceof Error ? error.message : 'The email could not be sent. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const passwordNotice = passwordUpdated ? (
    <Alert severity="success" sx={{ mb: 2, fontSize: '14px' }}>
      Your password has been saved. Sign in below with your email and new password.
    </Alert>
  ) : (
    <Alert severity="info" sx={{ mb: 2 }}>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, fontSize: '14px' }}>
        Still using the shared starter password?
      </Typography>
      <Typography variant="body2" sx={{ fontSize: '14px' }}>
        We’ve retired the old shared starter password for security. If you used it, set your own password using an email link. If you already chose your own password, sign in as usual.
      </Typography>
      <Button type="button" onClick={openPasswordReset} size="small" sx={{ mt: 1, p: 0, fontSize: '14px', fontWeight: 600, color: 'inherit !important', textTransform: 'none', textDecoration: 'underline' }}>
        Set my password by email
      </Button>
    </Alert>
  );

  const passwordResetDialog = (
    <Dialog open={showForgotModal} fullScreen={!isMdUp} fullWidth maxWidth="sm" onClose={closePasswordReset} aria-labelledby="password-reset-title">
      <DialogTitle id="password-reset-title" sx={{ fontSize: '20px' }}>Set up or reset your password</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ fontSize: '14px' }}>
          Enter the email you use for Reboot. We’ll email you a link to choose your own password. After saving it, return to the login page and sign in with your new password.
        </Typography>
        <TextField
          label="Enter your email"
          type="email"
          value={forgotEmail}
          onChange={(e) => setForgotEmail(e.target.value)}
          fullWidth
          margin="normal"
          disabled={forgotLoading}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          sx={{ '& .MuiInputBase-input': { fontSize: '16px' }, '& .MuiInputLabel-root': { fontSize: '14px' } }}
        />
        {forgotError && <Typography color="error" role="alert" sx={{ mt: 1, fontSize: '14px' }}>{forgotError}</Typography>}
        {forgotMessage && (
          <Box role="status" sx={{ mt: 1 }}>
            <Typography color="success.main" sx={{ fontSize: '14px' }}>{forgotMessage}</Typography>
            <Typography variant="body2" sx={{ mt: 1, fontSize: '14px' }}>
              Still need help? <Link href="/support" prefetch={false}>Contact support</Link>.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={sendPasswordResetEmail} disabled={forgotLoading || !forgotEmail.trim()} variant="contained" color="primary" sx={{ fontSize: '14px' }}>
          {forgotLoading ? 'Sending…' : 'Send password link'}
        </Button>
        <Button onClick={closePasswordReset} disabled={forgotLoading} color="secondary" variant="outlined" sx={{ fontSize: '14px' }}>
          {forgotMessage ? 'Back to sign in' : 'Cancel'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  // Prevent hydration mismatch by not rendering responsive content until mounted
  if (!mounted) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: '#2a2a2a'
      }}>
        <Typography sx={{ color: '#5cbca8' }}>Loading...</Typography>
      </Box>
    );
  }

  /* ──────────────────────────
     MOBILE (hero + teal form)
     ────────────────────────── */
  if (!isMdUp) {
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: '#2a2a2a', display: 'flex', flexDirection: 'column' }}>
        {/* Dark hero with logo + title */}
        <Box
          sx={{
            flex: '0 0 70vh',
            minHeight: 300,
            maxHeight: 420,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            px: 2,
            textAlign: 'center',
          }}
        >
          <Box sx={{ position: 'relative', width: 260, height: 80, mb: 1 }}>
            <Image 
              src={rebootLogo} 
              alt="Reboot logo" 
              fill 
              style={{ objectFit: 'contain' }} 
              priority 
            />
          </Box>

          {/* REBOOT MEMBER'S HUB text in teal */}
          <Typography
            sx={{
              color: '#5cbca8',
              fontWeight: 800,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              fontSize: 'clamp(1.5rem, 6.5vw, 2.25rem)',
            }}
          >
            REBOOT MEMBER&apos;S HUB
          </Typography>
        </Box>

        {/* Teal form section (inputs are individual white fields) */}
        <Box
          sx={{
            flex: '1 1 auto',
            bgcolor: '#5cbca8',
            borderTopLeftRadius: '1.25rem',
            borderTopRightRadius: '1.25rem',
            mt: -12,
            pt: 3,
            px: 2,
            pb: 'max(1.25rem, env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <Box
            component="form"
            onSubmit={handleLoginSubmit}
            sx={{ maxWidth: 480, mx: 'auto' }}
          >
            <Typography
              variant="h6"
              sx={{
                color: '#fff',
                fontWeight: 700,
                mb: 2,
                textAlign: 'center',
                fontSize: '1.5rem',
              }}
            >
              Login information
            </Typography>

            {passwordNotice}

            <TextField
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              fullWidth
              margin="normal"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              inputRef={emailRef}
              slotProps={{ inputLabel: { shrink: !!email } }}
              sx={{
                mb: '1rem',
                '& .MuiInputBase-input': {
                  fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
                  fontSize: '1rem',
                },
                '& .MuiOutlinedInput-root': {
                  backgroundColor: '#fff',
                  borderRadius: '0.75rem',
                  boxShadow: '0 .125rem .375rem rgba(0,0,0,0.15)',
                  '& fieldset': { borderColor: 'transparent' },
                  '&:hover fieldset': { borderColor: 'transparent' },
                  '&.Mui-focused fieldset': { borderColor: 'transparent' },
                },
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
                mb: 1.5,
                '& .MuiOutlinedInput-root': {
                  fontSize: '1rem',
                  backgroundColor: '#fff',
                  borderRadius: '0.75rem',
                  boxShadow: '0 .125rem .375rem rgba(0,0,0,0.15)',
                  '& fieldset': { borderColor: 'transparent' },
                  '&:hover fieldset': { borderColor: 'transparent' },
                  '&.Mui-focused fieldset': { borderColor: 'transparent' },
                },
              }}
            />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <span /> {/* spacer to keep link at right */}
              <Button
                variant="text"
                onClick={openPasswordReset}
                sx={{
                  p: 0,
                  textTransform: 'none',
                  textDecoration: 'underline',
                  color: '#fff',
                  fontSize: '0.95rem',
                }}
              >
                Set up or reset password
              </Button>
            </Box>

            <Button
              type="submit"
              variant="contained"
              color="secondary"
              fullWidth
              sx={{
                textTransform: 'none',
                color: '#fff',
                py: 1,
                fontSize: '1.125rem',
                fontWeight: 700,
                borderRadius: '0.75rem',
                boxShadow: '0 .1875rem .5rem rgba(0,0,0,0.25)',
              }}
            >
              Sign In
            </Button>

            {error && (
              <Typography align="center" sx={{ mt: 1, color: '#ffebee', fontSize: '0.95rem' }}>
                {error}
              </Typography>
            )}

            <Box sx={{ mt: 2.5, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button
                component={Link}
                href="/support"
                prefetch={false}
                variant="text"
                sx={{
                  color: '#fff',
                  fontSize: '0.95rem',
                  p: 0,
                  textDecoration: 'underline',
                  textTransform: 'none',
                  textUnderlineOffset: '0.2em',
                }}
              >
                Support
              </Button>
              <Button
                component={Link}
                href="/delete-account"
                prefetch={false}
                variant="text"
                sx={{
                  color: '#fff',
                  fontSize: '0.95rem',
                  p: 0,
                  textDecoration: 'underline',
                  textTransform: 'none',
                  textUnderlineOffset: '0.2em',
                }}
              >
                Delete Account
              </Button>
              <Button
                component={Link}
                href="/privacy-policy"
                prefetch={false}
                variant="text"
                sx={{
                  color: '#fff',
                  fontSize: '0.95rem',
                  p: 0,
                  textDecoration: 'underline',
                  textTransform: 'none',
                  textUnderlineOffset: '0.2em',
                }}
              >
                Privacy Policy
              </Button>
            </Box>
          </Box>
        </Box>

        {passwordResetDialog}
      </Box>
    );
  }

  /* ──────────────────────────
     DESKTOP (unchanged)
     ────────────────────────── */
  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        flexDirection: { xs: 'column', md: 'row' },
      }}
    >
      {/* Left Panel — Login (unchanged) */}
      <Box
        sx={{
          flex: { xs: 'unset', md: '1' },
          backgroundColor: '#5cbca8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: '1.5rem', md: '2.5rem' },
        }}
      >
        <Box
          component="form"
          onSubmit={handleLoginSubmit}
          sx={{ width: '100%', maxWidth: '40rem', color: '#fff' }}
        >
          <Typography
            variant="h6"
            sx={{ mb: '2rem', fontWeight: 700, color: '#fff', fontSize: '2.5rem' }}
          >
            Login information
          </Typography>

          {passwordNotice}

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
              onClick={openPasswordReset}
              sx={{
                textTransform: 'none',
                textDecoration: 'underline',
                color: '#fff !important',
                fontSize: '1.5rem',
              }}
            >
              Set up or reset password
            </Button>
          </Box>

          <Button
            type="submit"
            variant="contained"
            color="secondary"
            fullWidth
            sx={{
              textTransform: 'none',
              color: '#fff',
              py: '0.875rem',
              fontSize: '2rem',
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

          <Box sx={{ mt: '2rem', display: 'flex', justifyContent: 'center', gap: 3, flexWrap: 'wrap' }}>
            <Button
              component={Link}
              href="/support"
              prefetch={false}
              variant="text"
              sx={{
                color: '#fff !important',
                fontSize: '1.25rem',
                p: 0,
                textDecoration: 'underline',
                textTransform: 'none',
                textUnderlineOffset: '0.2em',
              }}
            >
              Support
            </Button>
            <Button
              component={Link}
              href="/delete-account"
              prefetch={false}
              variant="text"
              sx={{
                color: '#fff !important',
                fontSize: '1.25rem',
                p: 0,
                textDecoration: 'underline',
                textTransform: 'none',
                textUnderlineOffset: '0.2em',
              }}
            >
              Delete Account
            </Button>
            <Button
              component={Link}
              href="/privacy-policy"
              prefetch={false}
              variant="text"
              sx={{
                color: '#fff !important',
                fontSize: '1.25rem',
                p: 0,
                textDecoration: 'underline',
                textTransform: 'none',
                textUnderlineOffset: '0.2em',
              }}
            >
              Privacy Policy
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Right Panel — Branding (unchanged) */}
      <div
        style={{
          flex: 2,
          backgroundColor: '#2a2a2a',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '45%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div style={{ width: 600, height: 240, marginBottom: 24 }}>
            <Image 
              src={rebootLogo} 
              alt="Reboot logo" 
              fill 
              style={{ objectFit: 'contain' }} 
              priority 
            />
          </div>

          <Typography
            variant="h2"
            style={{
              color: '#5cbca8',
              fontWeight: 'bold',
              fontSize: '9rem',
              marginLeft: '1rem',
            }}
          >
            MEMBER&apos;S HUB
          </Typography>
        </div>
      </div>

      {passwordResetDialog}
    </Box>
  );
}
