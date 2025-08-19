// components/admin/AddUserForm.tsx
'use client';
import { useState } from 'react';
import {
  Box, TextField, MenuItem, Paper, Typography,
  Alert, Snackbar
} from '@mui/material';
import { LoadingButton } from '@mui/lab';

type Form = { email: string; first_name: string; last_name: string; role: 'user' | 'coach' | 'admin' };

export default function AddUserForm() {
  const [form, setForm] = useState<Form>({ email: '', first_name: '', last_name: '', role: 'user' });
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>(
    { open: false, message: '', severity: 'success' }
  );

  const emailError = form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (emailError) {
      setSnack({ open: true, message: 'Please enter a valid email.', severity: 'error' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      setSnack({ open: true, message: `Created ${form.email}`, severity: 'success' });
      setForm({ email: '', first_name: '', last_name: '', role: 'user' });
    } catch (err: any) {
      setSnack({ open: true, message: err.message || 'Error', severity: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, maxWidth: 520 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Add User</Typography>

      <Box component="form" onSubmit={onSubmit} noValidate sx={{ display: 'grid', gap: 2 }}>
        <TextField
          label="Email"
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
          required
          error={!!emailError}
          helperText={emailError ? 'Invalid email format' : ' '}
        />
        <TextField
          label="First name"
          value={form.first_name}
          onChange={e => setForm({ ...form, first_name: e.target.value })}
        />
        <TextField
          label="Last name"
          value={form.last_name}
          onChange={e => setForm({ ...form, last_name: e.target.value })}
        />
        <TextField
          label="Role"
          select
          value={form.role}
          onChange={e => setForm({ ...form, role: e.target.value as Form['role'] })}
        >
          <MenuItem value="user">user</MenuItem>
          <MenuItem value="coach">coach</MenuItem>
          <MenuItem value="admin">admin</MenuItem>
        </TextField>

        <LoadingButton type="submit" variant="contained" loading={busy}>
          Create
        </LoadingButton>

        <Alert severity="info" sx={{ mt: 1 }}>
          The new user will appear under coach rosters after assignment.
        </Alert>
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
