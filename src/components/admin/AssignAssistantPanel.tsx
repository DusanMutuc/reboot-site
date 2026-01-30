// components/admin/AssignAssistantPanel.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Autocomplete,
  TextField,
  Alert,
  Snackbar,
  IconButton,
  Stack,
} from '@mui/material';
import { LoadingButton } from '@mui/lab';
import CloseIcon from '@mui/icons-material/Close';

type Person = { id: string; name: string; email: string };

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json();
}

export default function AssignAssistantPanel() {
  const [users, setUsers] = useState<Person[]>([]);
  const [assistants, setAssistants] = useState<Person[]>([]);
  const [user, setUser] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const loadLists = async () => {
    const [u, a] = await Promise.all([
      getJSON<{ items: Person[] }>('/api/admin/list-users'),
      getJSON<{ items: Person[] }>('/api/admin/list-assistants'),
    ]);
    setUsers(u.items || []);
    setAssistants(a.items || []);
  };

  useEffect(() => {
    loadLists().catch(() => {
      setSnack({ open: true, message: 'Failed to load users', severity: 'error' });
    });
  }, []);

  const userOptions = useMemo(
    () => users.map((u) => ({ ...u, label: `${u.name} — ${u.email}` })),
    [users]
  );

  async function assign() {
    if (!user) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/assign-assistant-role', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      await loadLists();
      setSnack({ open: true, message: 'Assistant role assigned.', severity: 'success' });
      setUser(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error assigning assistant role';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function removeAssistant(userId: string) {
    setRemoving(userId);
    try {
      const res = await fetch(`/api/admin/assign-assistant-role?user_id=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      setAssistants((prev) => prev.filter((a) => a.id !== userId));
      setSnack({ open: true, message: 'Assistant role removed.', severity: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error removing assistant role';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        Assign Assistant Role
      </Typography>

      <Box sx={{ display: 'grid', gap: 2, maxWidth: 480 }}>
        <Autocomplete
          options={userOptions}
          value={user}
          onChange={(_, v) => setUser(v)}
          renderInput={(params) => <TextField {...params} label="Select user…" />}
        />
        <LoadingButton variant="contained" onClick={assign} loading={busy} disabled={!user}>
          Grant assistant access
        </LoadingButton>

        <Alert severity="info">
          Assistants can access only the assistant library experience. Use this to grant or remove assistant access.
        </Alert>
      </Box>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          Current assistants
        </Typography>
        {assistants.length === 0 ? (
          <Alert severity="info">No assistants assigned yet.</Alert>
        ) : (
          <Stack spacing={1}>
            {assistants.map((assistant) => (
              <Box
                key={assistant.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  bgcolor: 'background.paper',
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={600}>{assistant.name || assistant.email}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {assistant.email}
                  </Typography>
                </Box>
                <IconButton
                  aria-label={`Remove ${assistant.email}`}
                  onClick={() => removeAssistant(assistant.id)}
                  disabled={removing === assistant.id}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={3800}
        onClose={() => setSnack({ ...snack, open: false })}
        message={snack.message}
      />
    </Paper>
  );
}
