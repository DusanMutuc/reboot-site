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
  const [assistant, setAssistant] = useState<AssistantInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/user/assistant');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load assistant');
        if (!cancelled) setAssistant(data.assistant || null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load assistant';
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
    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2, mt: 3 }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
        Your Assistant
      </Typography>

      {loading ? (
        <Stack spacing={1}>
          <Skeleton variant="text" width="45%" />
          <Skeleton variant="text" width="35%" />
        </Stack>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : assistant ? (
        <Box>
          <Typography fontWeight={600}>{assistant.name}</Typography>
          {assistant.email ? (
            <Typography color="text.secondary">{assistant.email}</Typography>
          ) : null}
          {assistant.assigned_at ? (
            <Typography variant="caption" color="text.secondary">
              Assigned {new Date(assistant.assigned_at).toLocaleDateString()}
            </Typography>
          ) : null}
        </Box>
      ) : (
        <Alert severity="info">No assistant assigned yet.</Alert>
      )}
    </Paper>
  );
}
