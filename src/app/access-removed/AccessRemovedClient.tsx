'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';

import { supabase } from '@/lib/supabaseClient';

export default function AccessRemovedClient() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      setError(null);

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw signOutError;
      }

      router.replace('/login');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to sign out right now.';
      setError(message);
      setSigningOut(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#111827',
        px: 3,
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 520,
          bgcolor: '#ffffff',
          borderRadius: 3,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)',
          p: { xs: 3, sm: 4 },
        }}
      >
        <Stack spacing={2.5}>
          <Typography
            variant="overline"
            sx={{ color: '#0f766e', fontWeight: 800, letterSpacing: 1.2 }}
          >
            Membership Status
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827' }}>
            Your access has been removed.
          </Typography>
          <Typography sx={{ color: '#374151', lineHeight: 1.7 }}>
            This account is marked as a past member, so it no longer has access to the Reboot
            Member&apos;s Hub.
          </Typography>
          <Typography sx={{ color: '#374151', lineHeight: 1.7 }}>
            If you think this is a mistake, please contact the Reboot team and we&apos;ll help you
            sort it out.
          </Typography>

          {error ? <Alert severity="error">{error}</Alert> : null}

          <Button
            variant="contained"
            onClick={handleSignOut}
            disabled={signingOut}
            sx={{ alignSelf: 'flex-start', minWidth: 160 }}
          >
            {signingOut ? <CircularProgress size={20} color="inherit" /> : 'Sign out'}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
