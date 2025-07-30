'use client';

import { useState } from 'react';
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
import CircularProgress from '@mui/material/CircularProgress';

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
            variant="h4" 
            style={{ 
              marginBottom: '32px',
              fontWeight: 'bold',
              color: 'white'
            }}
          >
            Login information
          </Typography>
          
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            margin="normal"
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
          
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            margin="normal"
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
            style={{ 
              padding: '12px',
              fontSize: '16px',
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

      {/* Right Panel - Branding (2/3 width) */}
      <div style={{ 
        flex: '2',
        backgroundColor: '#2a2a2a',
        display: 'flex',
        flexDirection: 'column',
        padding: '40px',
        position: 'relative'
      }}>
        {/* Logo and Company Name */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: '60px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            backgroundColor: 'white',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '12px',
            fontSize: '20px'
          }}>
            🔧
          </div>
          <div>
            <Typography 
              variant="h6" 
              style={{ 
                color: 'white',
                fontWeight: 'bold',
                marginBottom: '4px'
              }}
            >
              REAL ESTATE REBOOT COACHING
            </Typography>
            <Typography 
              variant="body2" 
              style={{ 
                color: '#ccc',
                fontSize: '12px'
              }}
            >
              Scale-Leadership-Life Design
            </Typography>
          </div>
        </div>

        {/* Main Title */}
        <div style={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <Typography 
            variant="h1" 
            style={{ 
              color: 'white',
              fontWeight: 'bold',
              fontSize: '48px',
              textAlign: 'center',
              lineHeight: 1.2,
              marginBottom: '16px'
            }}
          >
            REAL ESTATE
          </Typography>
          <Typography 
            variant="h1" 
            style={{ 
              color: 'white',
              fontWeight: 'bold',
              fontSize: '48px',
              textAlign: 'center',
              lineHeight: 1.2,
              marginBottom: '16px'
            }}
          >
            REBOOT
          </Typography>
          <Typography 
            variant="h2" 
            style={{ 
              color: '#5cbca8',
              fontWeight: 'bold',
              fontSize: '32px',
              textAlign: 'center'
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
