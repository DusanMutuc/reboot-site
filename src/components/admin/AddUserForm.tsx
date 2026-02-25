// components/admin/AddUserForm.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  TextField,
  MenuItem,
  Paper,
  Typography,
  Alert,
  Snackbar,
  Checkbox,
  FormControlLabel,
  Autocomplete,
  Divider,
} from '@mui/material';
import { LoadingButton } from '@mui/lab';

type Form = { email: string; first_name: string; last_name: string; role: 'user' | 'coach' | 'admin' | 'assistant' };
type Person = { id: string; name: string; email: string };

const defaultForm = (): Form => ({ email: '', first_name: '', last_name: '', role: 'user' });

export default function AddUserForm() {
  const [forms, setForms] = useState<Form[]>([defaultForm()]);
  const [isPartnership, setIsPartnership] = useState(false);
  const [onboardeeCount, setOnboardeeCount] = useState(2);
  const [coaches, setCoaches] = useState<Person[]>([]);
  const [primaryCoach, setPrimaryCoach] = useState<Person | null>(null);
  const [implementationCoach, setImplementationCoach] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>(
    { open: false, message: '', severity: 'success' }
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/list-coaches');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || res.statusText);
        setCoaches(Array.isArray(data?.items) ? data.items : []);
      } catch {
        setCoaches([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isPartnership) {
      setForms((prev) => (prev.length === 1 ? prev : [prev[0] || defaultForm()]));
      return;
    }

    setForms((prev) => {
      const next = [...prev];
      if (next.length < onboardeeCount) {
        while (next.length < onboardeeCount) next.push(defaultForm());
      } else if (next.length > onboardeeCount) {
        next.length = onboardeeCount;
      }
      return next;
    });
  }, [isPartnership, onboardeeCount]);

  const coachOptions = useMemo(
    () => coaches.map((c) => ({ ...c, label: `${c.name} — ${c.email}` })),
    [coaches]
  );

  const emailErrors = forms.map((form) => form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email));

  function updateForm(index: number, patch: Partial<Form>) {
    setForms((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  async function assignCoach(userId: string, coachId: string, relationship_type: 'primary' | 'implementation') {
    const res = await fetch('/api/admin/assign-coach', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: userId, coach_id: coachId, replace: true, relationship_type }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || res.statusText);
  }

  async function createPartnership(userIds: string[], onboardeeForms: Form[]) {
    const memberLabels = onboardeeForms
      .map((member) => `${member.first_name} ${member.last_name}`.trim() || member.email)
      .slice(0, 2)
      .join(' & ');

    const name = memberLabels ? `${memberLabels} Partnership` : 'New Partnership';

    const res = await fetch('/api/admin/partnerships', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        user_ids: userIds,
        // Match defaults from the User Partnerships admin panel
        shared_kpis: true,
        shared_attendance: false,
        shared_notes: false,
        is_active: true,
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || res.statusText);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (emailErrors.some(Boolean)) {
      setSnack({ open: true, message: 'Please enter valid email addresses.', severity: 'error' });
      return;
    }

    if (forms.some((form) => !form.email || !form.role)) {
      setSnack({ open: true, message: 'Email and role are required for each onboardee.', severity: 'error' });
      return;
    }

    setBusy(true);
    try {
      const createdEmails: string[] = [];
      const createdUserIds: string[] = [];

      for (const form of forms) {
        const createRes = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(form),
        });

        const created = await createRes.json();
        if (!createRes.ok) throw new Error(created.error || createRes.statusText);

        const userId = created?.user_id as string | undefined;
        if (!userId) throw new Error(`User created for ${form.email} but no user_id was returned.`);
        createdUserIds.push(userId);

        if (primaryCoach?.id) {
          await assignCoach(userId, primaryCoach.id, 'primary');
        }
        if (implementationCoach?.id) {
          await assignCoach(userId, implementationCoach.id, 'implementation');
        }

        createdEmails.push(form.email);
      }

      if (isPartnership && createdUserIds.length >= 2) {
        await createPartnership(createdUserIds, forms);
      }

      setSnack({
        open: true,
        message: createdEmails.length === 1
          ? `Onboarded ${createdEmails[0]}`
          : `Onboarded ${createdEmails.length} users`,
        severity: 'success',
      });
      setForms(isPartnership ? Array.from({ length: onboardeeCount }, defaultForm) : [defaultForm()]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, maxWidth: 760 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Onboard User</Typography>

      <Box component="form" onSubmit={onSubmit} noValidate sx={{ display: 'grid', gap: 2 }}>
        <FormControlLabel
          control={<Checkbox checked={isPartnership} onChange={(e) => setIsPartnership(e.target.checked)} />}
          label="Onboarding a partnership/team?"
        />

        {isPartnership && (
          <TextField
            label="Number of onboardees"
            type="number"
            value={onboardeeCount}
            onChange={(e) => {
              const next = Number(e.target.value);
              setOnboardeeCount(Number.isFinite(next) ? Math.max(2, next) : 2);
            }}
            slotProps={{ htmlInput: { min: 2, step: 1 } }}
            sx={{ maxWidth: 240 }}
          />
        )}

        {forms.map((form, index) => (
          <Box key={index} sx={{ display: 'grid', gap: 2 }}>
            {forms.length > 1 && (
              <>
                <Divider sx={{ mt: index === 0 ? 0 : 1 }} />
                <Typography variant="subtitle1" fontWeight={600}>Person {index + 1}</Typography>
              </>
            )}

            <TextField
              label="Email"
              value={form.email}
              onChange={e => updateForm(index, { email: e.target.value })}
              required
              error={!!emailErrors[index]}
              helperText={emailErrors[index] ? 'Invalid email format' : ' '}
            />
            <TextField
              label="First name"
              value={form.first_name}
              onChange={e => updateForm(index, { first_name: e.target.value })}
            />
            <TextField
              label="Last name"
              value={form.last_name}
              onChange={e => updateForm(index, { last_name: e.target.value })}
            />
            <TextField
              label="Role"
              select
              value={form.role}
              onChange={e => updateForm(index, { role: e.target.value as Form['role'] })}
            >
              <MenuItem value="user">user</MenuItem>
              <MenuItem value="coach">coach</MenuItem>
              <MenuItem value="admin">admin</MenuItem>
              <MenuItem value="assistant">assistant</MenuItem>
            </TextField>
          </Box>
        ))}

        <Autocomplete
          options={coachOptions}
          value={primaryCoach}
          onChange={(_, v) => setPrimaryCoach(v)}
          renderInput={(params) => <TextField {...params} label="Primary coach (optional)" />}
        />

        <Autocomplete
          options={coachOptions}
          value={implementationCoach}
          onChange={(_, v) => setImplementationCoach(v)}
          renderInput={(params) => <TextField {...params} label="Implementation coach (optional)" />}
        />

        <LoadingButton type="submit" variant="contained" loading={busy}>
          {forms.length > 1 ? 'Onboard Users' : 'Onboard User'}
        </LoadingButton>

        <Alert severity="info" sx={{ mt: 1 }}>
          Optionally assign a primary coach and/or implementation coach during onboarding.
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
