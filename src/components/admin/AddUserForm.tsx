// components/admin/AddUserForm.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import FormActions from '@/components/FormActions';
import {
  Box,
  TextField,
  MenuItem,
  Typography,
  Alert,
  Snackbar,
  Checkbox,
  FormControlLabel,
  Autocomplete,
  Divider,
} from '@mui/material';
import { LoadingButton } from '@mui/lab';

type Form = {
  email: string;
  first_name: string;
  last_name: string;
  role: 'user' | 'ninety-day-user' | 'coach' | 'admin' | 'assistant';
};
type Person = { id: string; name: string; email: string };
type NinetyDayCycle = {
  id: number;
  name: string;
  status: 'draft' | 'active' | 'completed';
  starts_on: string;
};

type PartnershipConfig = {
  name: string;
  shared_kpis: boolean;
  shared_attendance: boolean;
  shared_notes: boolean;
};

const defaultForm = (): Form => ({ email: '', first_name: '', last_name: '', role: 'user' });

export default function AddUserForm() {
  const [forms, setForms] = useState<Form[]>([defaultForm()]);
  const [isPartnership, setIsPartnership] = useState(false);
  const [onboardeeCount, setOnboardeeCount] = useState(2);
  const [partnershipConfig, setPartnershipConfig] = useState<PartnershipConfig>({
    name: '',
    shared_kpis: true,
    shared_attendance: false,
    shared_notes: false,
  });
  const [coaches, setCoaches] = useState<Person[]>([]);
  const [users, setUsers] = useState<Person[]>([]);
  const [primaryCoach, setPrimaryCoach] = useState<Person | null>(null);
  const [implementationCoach, setImplementationCoach] = useState<Person | null>(null);
  const [assistantTo, setAssistantTo] = useState<Person | null>(null);
  const [ninetyDayCycles, setNinetyDayCycles] = useState<NinetyDayCycle[]>([]);
  const [ninetyDayCycleId, setNinetyDayCycleId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>(
    { open: false, message: '', severity: 'success' }
  );

  useEffect(() => {
    async function loadPeople(url: string, setPeople: (people: Person[]) => void) {
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || res.statusText);
        setPeople(Array.isArray(data?.items) ? data.items : []);
      } catch {
        setPeople([]);
      }
    }

    void loadPeople('/api/admin/list-coaches', setCoaches);
    void loadPeople('/api/admin/list-users', setUsers);

    void (async () => {
      try {
        const response = await fetch('/api/admin/ninety-day');
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || response.statusText);
        const cycles = ((data?.cycles ?? []) as NinetyDayCycle[])
          .filter((cycle) => cycle.status !== 'completed');
        setNinetyDayCycles(cycles);
        const preferred = cycles.find((cycle) => cycle.status === 'active') ?? cycles[0];
        setNinetyDayCycleId(preferred?.id ?? '');
      } catch {
        setNinetyDayCycles([]);
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
  const userOptions = useMemo(
    () => users.map((user) => ({ ...user, label: `${user.name} — ${user.email}` })),
    [users]
  );

  const hasAssistantOnboardee = forms.some((form) => form.role === 'assistant');
  const hasNinetyDayOnboardee = forms.some((form) => form.role === 'ninety-day-user');
  const hasNonAssistantOnboardee = forms.some((form) => form.role !== 'assistant');

  const emailErrors = forms.map((form) => form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email));

  function updateForm(index: number, patch: Partial<Form>) {
    setForms((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function updatePartnershipConfig(patch: Partial<PartnershipConfig>) {
    setPartnershipConfig((prev) => ({ ...prev, ...patch }));
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

  async function assignAssistantToUser(userId: string, assistantId: string) {
    const res = await fetch('/api/admin/assistant-assignments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: userId, assistant_id: assistantId, replace: false }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || res.statusText);
  }

  async function createPartnership(userIds: string[], onboardeeForms: Form[], config: PartnershipConfig) {
    const memberLabels = onboardeeForms
      .map((member) => `${member.first_name} ${member.last_name}`.trim() || member.email)
      .slice(0, 2)
      .join(' & ');

    const fallbackName = memberLabels ? `${memberLabels} Partnership` : 'New Partnership';

    const res = await fetch('/api/admin/partnerships', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: config.name.trim() || fallbackName,
        user_ids: userIds,
        shared_kpis: config.shared_kpis,
        shared_attendance: config.shared_attendance,
        shared_notes: config.shared_notes,
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

    if (hasNinetyDayOnboardee && !ninetyDayCycleId) {
      setSnack({ open: true, message: 'Select a 90-day cycle for these users.', severity: 'error' });
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
          body: JSON.stringify({
            ...form,
            ninety_day_cycle_id: form.role === 'ninety-day-user' ? ninetyDayCycleId : undefined,
          }),
        });

        const created = await createRes.json();
        if (!createRes.ok) throw new Error(created.error || createRes.statusText);

        const userId = created?.user_id as string | undefined;
        if (!userId) throw new Error(`User created for ${form.email} but no user_id was returned.`);
        createdUserIds.push(userId);

        if (form.role === 'assistant') {
          if (assistantTo?.id) {
            await assignAssistantToUser(assistantTo.id, userId);
          }
        } else {
          if (primaryCoach?.id) {
            await assignCoach(userId, primaryCoach.id, 'primary');
          }
          if (implementationCoach?.id) {
            await assignCoach(userId, implementationCoach.id, 'implementation');
          }
        }

        createdEmails.push(form.email);
      }

      if (isPartnership && createdUserIds.length >= 2) {
        await createPartnership(createdUserIds, forms, partnershipConfig);
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
    <Box sx={{ maxWidth: 760 }}>
      <Box component="form" onSubmit={onSubmit} noValidate sx={{ display: 'grid', gap: 2 }}>
        <FormControlLabel
          control={<Checkbox checked={isPartnership} onChange={(e) => setIsPartnership(e.target.checked)} />}
          label="Onboarding a partnership/team?"
        />

        {isPartnership && (
          <>
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

            <Divider />
            <Typography variant="adminSectionTitle">Partnership details</Typography>
            <TextField
              label="Partnership name"
              value={partnershipConfig.name}
              onChange={(e) => updatePartnershipConfig({ name: e.target.value })}
              helperText="Optional. If left blank, a name will be generated from onboardees."
            />
            <FormControlLabel
              control={(
                <Checkbox
                  checked={partnershipConfig.shared_kpis}
                  onChange={(e) => updatePartnershipConfig({ shared_kpis: e.target.checked })}
                />
              )}
              label="Share KPI data"
            />
            <FormControlLabel
              control={(
                <Checkbox
                  checked={partnershipConfig.shared_attendance}
                  onChange={(e) => updatePartnershipConfig({ shared_attendance: e.target.checked })}
                />
              )}
              label="Share attendance"
            />
            <FormControlLabel
              control={(
                <Checkbox
                  checked={partnershipConfig.shared_notes}
                  onChange={(e) => updatePartnershipConfig({ shared_notes: e.target.checked })}
                />
              )}
              label="Share coaching notes"
            />
          </>
        )}

        {forms.map((form, index) => (
          <Box key={index} sx={{ display: 'grid', gap: 2 }}>
            {forms.length > 1 && (
              <>
                <Divider sx={{ mt: index === 0 ? 0 : 1 }} />
                <Typography variant="adminSectionTitle">Person {index + 1}</Typography>
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
              <MenuItem value="ninety-day-user">90-day user</MenuItem>
              <MenuItem value="coach">coach</MenuItem>
              <MenuItem value="admin">admin</MenuItem>
              <MenuItem value="assistant">assistant</MenuItem>
            </TextField>
          </Box>
        ))}

        {hasNinetyDayOnboardee ? (
          <TextField
            select
            label="90-day cycle"
            value={ninetyDayCycleId}
            onChange={(event) => setNinetyDayCycleId(Number(event.target.value))}
            required
            helperText={ninetyDayCycles.length > 0
              ? 'Every 90-day user in this onboarding batch joins this cycle.'
              : 'Create a draft cycle in the 90-Day admin tab first.'}
          >
            {ninetyDayCycles.map((cycle) => (
              <MenuItem key={cycle.id} value={cycle.id}>
                {cycle.name} · {cycle.status} · starts {cycle.starts_on}
              </MenuItem>
            ))}
          </TextField>
        ) : null}

        {hasNonAssistantOnboardee && (
          <>
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

            <Alert severity="info" variant="outlined">
              Optionally assign a primary coach and/or implementation coach during onboarding.
            </Alert>
          </>
        )}

        {hasAssistantOnboardee && (
          <>
            <Autocomplete
              options={userOptions}
              value={assistantTo}
              onChange={(_, value) => setAssistantTo(value)}
              renderInput={(params) => <TextField {...params} label="Assistant to (optional)" />}
            />

            <Alert severity="info" variant="outlined">
              Select the user this assistant supports. Any existing assistant assignments for that user will be kept.
            </Alert>
          </>
        )}

        <FormActions>
          <LoadingButton type="submit" variant="contained" loading={busy}>
            {forms.length > 1 ? 'Onboard Users' : 'Onboard User'}
          </LoadingButton>
        </FormActions>
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={3800}
        onClose={() => setSnack({ ...snack, open: false })}
        message={snack.message}
      />
    </Box>
  );
}
