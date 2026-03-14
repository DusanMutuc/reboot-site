// src/components/user/dashboard/AssistantInfo.tsx
'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, Paper, Alert, Skeleton, Stack } from '@mui/material';

type AssistantInfo = {
  id: string;
  name: string;
  email?: string;
  assigned_at?: string | null;
};

export default function AssistantInfoPanel() {
  const [loading, setLoading] = useState(true);
  const [assistants, setAssistants] = useState<AssistantInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/user/assistant');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load assistants');
        if (!cancelled) setAssistants(data.assistants || []);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load assistants';
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto', mt: 3 }}>
      <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Typography
          variant="h5"
          fontWeight={700}
          sx={{ mb: 1, fontSize: { xs: '1.4rem', md: '1.75rem' } }}
        >
          Your Assistants
        </Typography>

        {loading ? (
          <Stack spacing={1}>
            <Skeleton variant="text" width="45%" />
            <Skeleton variant="text" width="35%" />
          </Stack>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : assistants.length > 0 ? (
          <Stack spacing={2}>
            {assistants.map((assistant) => (
              <Box key={`${assistant.id}:${assistant.assigned_at ?? 'none'}`}>
                <Typography fontWeight={600} sx={{ fontSize: { xs: '1.05rem', md: '1.15rem' } }}>
                  {assistant.name}
                </Typography>
                {assistant.email ? (
                  <Typography color="text.secondary" sx={{ fontSize: { xs: '1rem', md: '1.05rem' } }}>
                    {assistant.email}
                  </Typography>
                ) : null}
                {assistant.assigned_at ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Assigned {new Date(assistant.assigned_at).toLocaleDateString()}
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Stack>
        ) : (
          <Alert severity="info">No assistants assigned yet.</Alert>
        )}
      </Paper>
    </Box>
  );
}
