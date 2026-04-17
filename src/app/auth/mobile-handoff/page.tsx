'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { sanitizeMobileHandoffTarget } from '@/lib/mobileHandoff';
import { supabase } from '@/lib/supabaseClient';

function parseHashParams(): URLSearchParams | null {
  if (typeof window === 'undefined') return null;
  if (!window.location.hash?.startsWith('#')) return null;
  return new URLSearchParams(window.location.hash.substring(1));
}

function redirectToTarget(target: string) {
  if (typeof window === 'undefined') return;
  window.location.replace(target);
}

export default function MobileHandoffPage() {
  const searchParams = useSearchParams();
  const hasStartedRef = useRef(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const target = useMemo(
    () => sanitizeMobileHandoffTarget(searchParams.get('next')),
    [searchParams],
  );

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;

    let cancelled = false;

    const run = async () => {
      try {
        const hashParams = parseHashParams();
        const errorDescription =
          searchParams.get('error_description') ?? hashParams?.get('error_description');

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        const code = searchParams.get('code') ?? hashParams?.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            throw new Error(error.message);
          }

          redirectToTarget(target);
          return;
        }

        const accessToken = searchParams.get('access_token') ?? hashParams?.get('access_token');
        const refreshToken = searchParams.get('refresh_token') ?? hashParams?.get('refresh_token');

        if (!accessToken || !refreshToken) {
          throw new Error('The handoff link is missing the required auth details.');
        }

        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          throw new Error(error.message);
        }

        redirectToTarget(target);
      } catch (error: unknown) {
        if (cancelled) return;
        setAuthError(error instanceof Error ? error.message : 'Unable to complete the handoff.');
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [searchParams, target]);

  return (
    <Box
      sx={{
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        justifyContent: 'center',
        minHeight: '100vh',
        p: 2,
      }}
    >
      <Paper elevation={6} sx={{ maxWidth: 460, p: 4, width: '100%' }}>
        <Stack alignItems="center" spacing={2.5}>
          {authError ? (
            <>
              <Typography align="center" variant="h5">
                We couldn&apos;t open the members hub.
              </Typography>
              <Typography align="center" color="error">
                {authError}
              </Typography>
              <Typography align="center" color="text.secondary" variant="body2">
                Please go back to the app and try again. If the issue continues, the normal login
                page will still work.
              </Typography>
            </>
          ) : (
            <>
              <CircularProgress />
              <Typography align="center" variant="h5">
                Signing you in...
              </Typography>
              <Typography align="center" color="text.secondary" variant="body2">
                We&apos;re securely handing off your app session to the members hub.
              </Typography>
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
