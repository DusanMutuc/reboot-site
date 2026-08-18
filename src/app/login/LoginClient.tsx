'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { extractRoleCodes, resolveHomePathForRoleCodes } from '@/lib/userRoles';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
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
import rebootLogo from '/public/Reboot Logo - Color.png'; // Add this import

type LoginClientProps = {
  redirectTo?: string | null;
};

export default function LoginClient({ redirectTo = null }: LoginClientProps) {
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
      setError(signInError.message);
      return;
    }
  
    const user = authData.user;
    if (!user) {
      setError('No user data returned');
      return;
    }
  
    try {
      const { data: rolesRows, error } = await supabase
        .from('user_roles')
        .select('roles ( code )')
        .eq('user_id', user.id);

      if (error) {
        router.push(redirectTo || '/dashboard');
        return;
      }

      const codes = extractRoleCodes(rolesRows);
      router.replace(redirectTo || resolveHomePathForRoleCodes(codes));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`Role check failed: ${message}`);
      router.push(redirectTo || '/dashboard');
    }
  };

  const handleLoginSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleLogin();
  };
  

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
                onClick={() => setShowForgotModal(true)}
                sx={{
                  p: 0,
                  textTransform: 'none',
                  textDecoration: 'underline',
                  color: '#fff',
                  fontSize: '0.95rem',
                }}
              >
                Forgot Password?
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

        {/* Forgot Password Modal (full-screen on phones) */}
        <Dialog
          open={showForgotModal}
          fullScreen
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
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
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
                  { redirectTo: 'https://hub.rebootmembers.com/reset-password' }
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
                color: '#fff !important',
                fontSize: '1.5rem',
              }}
            >
              Forgot Password?
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
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            width: '100%',
          }}
        >
          <Image
            src={rebootLogo}
            alt="Reboot logo"
            priority
            sizes="(max-width: 1200px) 60vw, 600px"
            style={{
              width: '100%',
              maxWidth: 600,
              height: 'auto',
              display: 'block',
            }}
          />

          <Typography
            variant="h2"
            style={{
              color: '#5cbca8',
              fontWeight: 'bold',
              fontSize: 'clamp(3rem, 7vw, 9rem)',
              lineHeight: 1,
              whiteSpace: 'nowrap',
              marginTop: '0.06em',
            }}
          >
            MEMBER&apos;S HUB
          </Typography>
        </div>
      </div>

      {/* Forgot Password Modal (desktop) */}
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
                { redirectTo: 'https://hub.rebootmembers.com/reset-password' }
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
