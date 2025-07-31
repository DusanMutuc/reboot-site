'use client';

import { useState } from 'react';
import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import React from 'react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Image from 'next/image';
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

    if (error) {
      setError(error.message);
    } else {
      router.push('/dashboard');
    }
  };
  useEffect(() => {
    const grabValues = () => {
      setEmail(emailRef.current?.value || '');
      setPassword(passRef.current?.value || '');
    };
  
    grabValues();                 // 1 ️⃣ immediate try
    const id = setTimeout(grabValues, 400); // 2 ️⃣ late autofill catch
  
    return () => clearTimeout(id);
  }, []);
  return (
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh'
    }}>
      {/* Left Panel - Login Form (1/3 width) */}
      <div style={{ 
        flex: '1',
        backgroundColor: '#5cbca8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px'
      }}>
        <div style={{ 
          width: '100%', 
          maxWidth: '400px',
          color: 'white'
        }}>
          <Typography 
            variant="h6" 
            style={{ 
              marginBottom: '32px',
              fontWeight: 'bold',
              color: 'white',
            }}
          >
            Login information
          </Typography>
          
          <TextField
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}  // ← catches autofill
            fullWidth
            margin="normal"
            autoComplete="email"            // best practice
            inputRef={emailRef}             // ← new
            slotProps={{ inputLabel: { shrink: !!email } }}   // shrink if there’s text

            sx={{
              '& .MuiInputBase-input': {
                fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
                fontWeight: 'normal',
                fontSize: '1rem',
              },
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'white',
                '& fieldset': {
                  borderColor: 'transparent',
                },
                '&:hover fieldset': {
                  borderColor: 'transparent',
                },
                '&.Mui-focused fieldset': {
                  borderColor: 'transparent',
                },
              },
              '& .MuiInputLabel-root': {
                color: '#666',
              },
              marginBottom: '16px'
            }}
          />
          
          <TextField
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)} // ← catches autofill
            fullWidth
            margin="normal"
            autoComplete="current-password"  // best practice
            inputRef={passRef}              // ← new
            slotProps={{ inputLabel: { shrink: !!email } }}   // shrink if there’s text
            sx={{
              
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'white',
                '& fieldset': {
                  borderColor: 'transparent',
                },
                '&:hover fieldset': {
                  borderColor: 'transparent',
                },
                '&.Mui-focused fieldset': {
                  borderColor: 'transparent',
                },
              },
              '& .MuiInputLabel-root': {
                color: '#666',
              },
              marginBottom: '16px'
            }}
          />
          
          <div style={{ 
            textAlign: 'right', 
            marginBottom: '32px'
          }}>
            <Button
              variant="text"
              onClick={() => setShowForgotModal(true)}
              sx={{
                typography: 'h6',      // ← grabs theme.typography.h4 (font-size, weight, line-height…)
                textTransform: 'none',
                textDecoration: 'underline',
                fontWeight: 'normal',
                color: 'white',
              }}
              style={{ 
                color: 'white',
                textTransform: 'none',
                textDecoration: 'underline'
              }}
            >
              Forgot Password?
            </Button>
          </div>
          
          <Button
            variant="contained"
            color="secondary"
            onClick={handleLogin}
            fullWidth
            sx={{
              typography: 'h4',      // ← grabs theme.typography.h4 (font-size, weight, line-height…)
              textTransform: 'none',
              color: 'white',
            }}
            style={{ 
              padding: '12px',
              fontSize: '20px',
              fontWeight: 'bold'
            }}
          >
            Sign In
          </Button>
          
          {error && (
            <Typography 
              color="error" 
              align="center" 
              style={{ 
                marginTop: '16px',
                color: '#ffebee'
              }}
            >
              {error}
            </Typography>
          )}
        </div>
      </div>

      {/* Right Panel – Branding (2/3 width) */}
<div
  style={{
    flex: 2,
    backgroundColor: '#2a2a2a',
    position: 'relative',           // gives a reference for absolute children
  }}
>
  {/* Logo */}
  <div
    style={{
      position: 'absolute',
      top: 40,                      // 40 px down from the top edge
      left: '50%',                  // halfway across
      transform: 'translateX(-50%)',// pull back by half its width → horizontal center
      width: 300,
      height: 100,
    }}
  >
    <Image
      src="/Reboot Coaching Logo - White.png"
      alt="Real Estate Reboot logo"
      fill
      style={{ objectFit: 'contain' }}
    />
  </div>

  {/* Main Title */}
  <div
    style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)', // perfect center
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
    }}
  >
    <Typography
      variant="h1"
      style={{
        color: 'white',
        fontWeight: 'bold',
        fontSize: '90px',           // bumped up from 48 px
        lineHeight: 1.15,
        marginBottom: '16px',
      }}
    >
      REAL ESTATE
    </Typography>
    <Typography
      variant="h1"
      style={{
        color: 'white',
        fontWeight: 'bold',
        fontSize: '90px',
        lineHeight: 1.15,
        marginBottom: '16px',
      }}
    >
      REBOOT
    </Typography>
    <Typography
      variant="h2"
      style={{
        color: '#5cbca8',
        fontWeight: 'bold',
        fontSize: '40px',           // larger subtitle
      }}
    >
      MEMBER HUB
    </Typography>
  </div>
</div>


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
