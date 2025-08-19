// components/admin/AssignCoachPanel.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Autocomplete, TextField,
  Alert, Snackbar
} from '@mui/material';
import { LoadingButton } from '@mui/lab';

type Person = { id: string; name: string; email: string };
async function getJSON<T>(url: string): Promise<T> { const r = await fetch(url); return r.json(); }

export default function AssignCoachPanel() {
  const [users, setUsers] = useState<Person[]>([]);
  const [coaches, setCoaches] = useState<Person[]>([]);
  const [user, setUser] = useState<Person | null>(null);
  const [coach, setCoach] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success'
  });

  useEffect(() => {
    (async () => {
      const u = await getJSON<{ items: Person[] }>('/api/admin/list-users');
      const c = await getJSON<{ items: Person[] }>('/api/admin/list-coaches');
      setUsers(u.items || []);
      setCoaches(c.items || []);
    })();
  }, []);

  const userOptions = useMemo(
    () => users.map(u => ({ ...u, label: `${u.name} — ${u.email}` })),
    [users]
  );
  const coachOptions = useMemo(
    () => coaches.map(c => ({ ...c, label: `${c.name} — ${c.email}` })),
    [coaches]
  );

  async function assign() {
    if (!user || !coach) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/assign-coach', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ user_id: user.id, coach_id: coach.id, replace: true })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      setSnack({ open: true, message: 'Coach assigned.', severity: 'success' });
    } catch (err: any) {
      setSnack({ open: true, message: err.message || 'Error', severity: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        Assign / Replace Coach
      </Typography>

      <Box sx={{ display: 'grid', gap: 2, maxWidth: 760 }}>
        <Autocomplete
          options={userOptions}
          value={user}
          onChange={(_, v) => setUser(v)}
          renderInput={(params) => <TextField {...params} label="Select user…" />}
        />
        <Autocomplete
          options={coachOptions}
          value={coach}
          onChange={(_, v) => setCoach(v)}
          renderInput={(params) => <TextField {...params} label="Select coach…" />}
        />

        <LoadingButton
          variant="contained"
          onClick={assign}
          loading={busy}
          disabled={!user || !coach}
        >
          Assign / Replace
        </LoadingButton>

        <Alert severity="info">
          Replaces the user’s current active coach (if any).
        </Alert>
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack({ ...snack, open: false })}
        message={snack.message}
      />
    </Paper>
  );
}
