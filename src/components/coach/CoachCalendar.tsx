'use client';

import { useEffect, useState } from 'react';
import { Box, Alert } from '@mui/material';
import Loading from '@/components/loading';
import ErrorMessage from '@/components/errorMessage';
import { supabase } from '@/lib/supabaseClient';

export default function CoachCalendar() {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
          .from('coach_profiles')
          .select('m2_booking_url')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;
        setUrl((data?.m2_booking_url || '').trim() || null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load calendar URL';
        setErr(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Loading />;
  if (err)     return <ErrorMessage message={err} />;

  if (!url) {
    return <Alert severity="info">No calendar URL configured for your coach profile.</Alert>;
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 1400, mx: 'auto' }}>
      <Box sx={{ position: 'relative', paddingTop: '56.25%' }}>
        <iframe
          src={url}
          title="Coach Calendar"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow="camera *; microphone *; clipboard-write *; encrypted-media *"
        />
      </Box>
    </Box>
  );
}
