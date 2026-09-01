'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { LoadingButton } from '@mui/lab';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

type SystemOption = { id: number; title: string; slug: string | null };
type CycleSystem = { node_id: number; position: number };
type Meeting = {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string | null;
  join_url: string | null;
};
type Member = {
  user_id: string;
  name: string;
  enrolled_at: string;
  ended_at: string | null;
  outcome: string | null;
};
type Cycle = {
  id: number;
  name: string;
  starts_on: string;
  ends_on: string;
  timezone: string;
  status: 'draft' | 'active' | 'completed';
  active_system_node_id: number | null;
  systems: CycleSystem[];
  meetings: Meeting[];
  members: Member[];
};
type Person = { id: string; name: string };
type Payload = { cycles: Cycle[]; systemOptions: SystemOption[]; availableUsers: Person[] };
type Draft = {
  name: string;
  starts_on: string;
  timezone: string;
  status: Cycle['status'];
  systems: SystemOption[];
  active_system_node_id: number | '';
};

const EMPTY_PAYLOAD: Payload = { cycles: [], systemOptions: [], availableUsers: [] };

async function requestJson(method: string, bodyOrUrl: Record<string, unknown> | string) {
  const response = await fetch(
    typeof bodyOrUrl === 'string' ? bodyOrUrl : '/api/admin/ninety-day',
    typeof bodyOrUrl === 'string'
      ? { method }
      : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyOrUrl) },
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || response.statusText);
  return payload;
}

export default function NinetyDayAdmin() {
  const [payload, setPayload] = useState<Payload>(EMPTY_PAYLOAD);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createStart, setCreateStart] = useState('');
  const [createZone, setCreateZone] = useState('America/Edmonton');
  const [creating, setCreating] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('Weekly group call');
  const [meetingStart, setMeetingStart] = useState('');
  const [meetingEnd, setMeetingEnd] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [enrollUser, setEnrollUser] = useState<Person | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [snack, setSnack] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  const load = useCallback(async (preferredId?: number) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/ninety-day');
      const next = await response.json();
      if (!response.ok) throw new Error(next?.error || response.statusText);
      const parsed = next as Payload;
      setPayload(parsed);
      setSelectedId((current) => {
        const candidate = preferredId || current;
        if (candidate && parsed.cycles.some((cycle) => cycle.id === candidate)) return candidate;
        return parsed.cycles.find((cycle) => cycle.status === 'active')?.id ?? parsed.cycles[0]?.id ?? '';
      });
    } catch (error: unknown) {
      setSnack({
        open: true,
        message: error instanceof Error ? error.message : 'Failed to load 90-day cycles',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(
    () => payload.cycles.find((cycle) => cycle.id === selectedId) ?? null,
    [payload.cycles, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    const options = new Map(payload.systemOptions.map((option) => [option.id, option]));
    setDraft({
      name: selected.name,
      starts_on: selected.starts_on,
      timezone: selected.timezone,
      status: selected.status,
      systems: [...selected.systems]
        .sort((a, b) => a.position - b.position)
        .flatMap((system) => options.get(system.node_id) ?? []),
      active_system_node_id: selected.active_system_node_id ?? '',
    });
  }, [payload.systemOptions, selected]);

  function showError(error: unknown, fallback: string) {
    setSnack({
      open: true,
      message: error instanceof Error ? error.message : fallback,
      severity: 'error',
    });
  }

  async function createCycle() {
    setCreating(true);
    try {
      const result = await requestJson('POST', {
        action: 'create-cycle',
        name: createName,
        starts_on: createStart,
        timezone: createZone,
      });
      setCreateOpen(false);
      setCreateName('');
      setCreateStart('');
      await load(Number(result.cycle_id));
      setSnack({ open: true, message: 'Draft cycle created.', severity: 'success' });
    } catch (error) {
      showError(error, 'Failed to create cycle');
    } finally {
      setCreating(false);
    }
  }

  async function saveCycle() {
    if (!selected || !draft) return;
    setSaving(true);
    try {
      await requestJson('PATCH', {
        action: 'configure-cycle',
        cycle_id: selected.id,
        name: draft.name,
        starts_on: draft.starts_on,
        timezone: draft.timezone,
        status: draft.status,
        system_node_ids: draft.systems.map((system) => system.id),
        active_system_node_id: draft.active_system_node_id || null,
      });
      await load(selected.id);
      setSnack({ open: true, message: 'Cycle settings saved.', severity: 'success' });
    } catch (error) {
      showError(error, 'Failed to save cycle');
    } finally {
      setSaving(false);
    }
  }

  async function addMeeting() {
    if (!selected) return;
    setMeetingBusy(true);
    try {
      await requestJson('POST', {
        action: 'create-meeting',
        cycle_id: selected.id,
        title: meetingTitle,
        starts_at: meetingStart ? new Date(meetingStart).toISOString() : '',
        ends_at: meetingEnd ? new Date(meetingEnd).toISOString() : null,
        join_url: meetingUrl,
      });
      setMeetingStart('');
      setMeetingEnd('');
      setMeetingUrl('');
      await load(selected.id);
      setSnack({ open: true, message: 'Group meeting added.', severity: 'success' });
    } catch (error) {
      showError(error, 'Failed to add meeting');
    } finally {
      setMeetingBusy(false);
    }
  }

  async function deleteMeeting(meetingId: number) {
    try {
      await requestJson(
        'DELETE',
        `/api/admin/ninety-day?resource=meeting&id=${encodeURIComponent(String(meetingId))}`,
      );
      await load(selected?.id);
      setSnack({ open: true, message: 'Meeting removed.', severity: 'success' });
    } catch (error) {
      showError(error, 'Failed to remove meeting');
    }
  }

  async function enrollExisting() {
    if (!selected || !enrollUser) return;
    setEnrolling(true);
    try {
      await requestJson('POST', {
        action: 'enroll-user',
        cycle_id: selected.id,
        user_id: enrollUser.id,
      });
      setEnrollUser(null);
      await load(selected.id);
      setSnack({ open: true, message: 'User added to the cycle.', severity: 'success' });
    } catch (error) {
      showError(error, 'Failed to enroll user');
    } finally {
      setEnrolling(false);
    }
  }

  async function promote(member: Member) {
    if (!window.confirm(`Promote ${member.name} to a full Reboot member?`)) return;
    setPromotingId(member.user_id);
    try {
      const response = await fetch(`/api/admin/users/${member.user_id}/promote`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || response.statusText);
      await load(selected?.id);
      setSnack({ open: true, message: `${member.name} is now a full member.`, severity: 'success' });
    } catch (error) {
      showError(error, 'Failed to promote member');
    } finally {
      setPromotingId(null);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>90-Day Programme</Typography>
          <Typography variant="body2" color="text.secondary">
            Each cycle controls its eight systems, current group focus, meetings, and members.
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          label="Cycle"
          value={selectedId}
          onChange={(event) => setSelectedId(Number(event.target.value))}
          sx={{ minWidth: 260 }}
          disabled={loading || payload.cycles.length === 0}
        >
          {payload.cycles.map((cycle) => (
            <MenuItem key={cycle.id} value={cycle.id}>{cycle.name} · {cycle.status}</MenuItem>
          ))}
        </TextField>
        <Button variant="outlined" onClick={() => setCreateOpen(true)}>New cycle</Button>
      </Stack>

      {!selected || !draft ? (
        <Alert severity="info">Create a draft cycle to configure the programme.</Alert>
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack spacing={2.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="adminSectionTitle">Cycle setup</Typography>
                <Chip size="small" label={draft.status} color={draft.status === 'active' ? 'success' : 'default'} />
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, gap: 2 }}>
                <TextField label="Cycle name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <TextField type="date" label="Starts" value={draft.starts_on} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField select label="Status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Cycle['status'] })}>
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                </TextField>
              </Box>
              <TextField label="Timezone" value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} helperText="IANA timezone, for example America/Edmonton" />
              <Alert severity="info" variant="outlined">
                Set Your Compass is fixed for every cycle. Choose exactly eight systems before activating it.
              </Alert>
              <Autocomplete
                multiple
                options={payload.systemOptions}
                value={draft.systems}
                getOptionLabel={(option) => option.title}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                getOptionDisabled={(option) => draft.systems.length >= 8 && !draft.systems.some((item) => item.id === option.id)}
                onChange={(_event, systems) => {
                  const limited = systems.slice(0, 8);
                  const activeStillSelected = limited.some((item) => item.id === draft.active_system_node_id);
                  setDraft({
                    ...draft,
                    systems: limited,
                    active_system_node_id: activeStillSelected ? draft.active_system_node_id : '',
                  });
                }}
                renderInput={(params) => <TextField {...params} label={`Systems (${draft.systems.length}/8)`} />}
              />
              <TextField
                select
                label="Current active system"
                value={draft.active_system_node_id}
                onChange={(e) => setDraft({ ...draft, active_system_node_id: Number(e.target.value) })}
                disabled={draft.systems.length === 0}
              >
                {draft.systems.map((system) => <MenuItem key={system.id} value={system.id}>{system.title}</MenuItem>)}
              </TextField>
              <LoadingButton variant="contained" onClick={saveCycle} loading={saving} sx={{ alignSelf: 'flex-start' }}>
                Save cycle
              </LoadingButton>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="adminSectionTitle">Group meetings</Typography>
                <Typography variant="body2" color="text.secondary">The next scheduled meeting appears for everyone in this cycle.</Typography>
              </Box>
              {selected.meetings.length === 0 ? <Alert severity="info">No meetings scheduled.</Alert> : (
                <Stack divider={<Divider flexItem />}>
                  {selected.meetings.map((meeting) => (
                    <Stack key={meeting.id} direction="row" spacing={2} alignItems="center" sx={{ py: 1.25 }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={600}>{meeting.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(meeting.starts_at).toLocaleString()} {meeting.join_url ? '· Link ready' : '· No join link'}
                        </Typography>
                      </Box>
                      <IconButton aria-label="Delete meeting" onClick={() => void deleteMeeting(meeting.id)}><DeleteOutlineIcon /></IconButton>
                    </Stack>
                  ))}
                </Stack>
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.5fr 1fr 1fr' }, gap: 2 }}>
                <TextField label="Meeting title" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} />
                <TextField type="datetime-local" label="Starts" value={meetingStart} onChange={(e) => setMeetingStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField type="datetime-local" label="Ends (optional)" value={meetingEnd} onChange={(e) => setMeetingEnd(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              </Box>
              <TextField label="Join URL (optional)" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://…" />
              <LoadingButton variant="outlined" onClick={addMeeting} loading={meetingBusy} disabled={!meetingStart} sx={{ alignSelf: 'flex-start' }}>
                Add meeting
              </LoadingButton>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack spacing={2.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
                <Box>
                  <Typography variant="adminSectionTitle">Cycle users</Typography>
                  <Typography variant="body2" color="text.secondary">Onboard, enroll, and promote members from this cycle.</Typography>
                </Box>
                <Button component={Link} href="/admin/add-user" variant="contained">Onboard new user</Button>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Autocomplete
                  options={payload.availableUsers}
                  value={enrollUser}
                  onChange={(_event, value) => setEnrollUser(value)}
                  getOptionLabel={(option) => option.name}
                  sx={{ flex: 1 }}
                  renderInput={(params) => <TextField {...params} label="Existing unassigned 90-day user" />}
                />
                <LoadingButton variant="outlined" onClick={enrollExisting} loading={enrolling} disabled={!enrollUser}>Add to cycle</LoadingButton>
              </Stack>
              {selected.members.length === 0 ? <Alert severity="info">No users enrolled yet.</Alert> : (
                <Stack divider={<Divider flexItem />}>
                  {selected.members.map((member) => (
                    <Stack
                      key={`${member.user_id}-${member.enrolled_at}`}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1.5}
                      alignItems={{ sm: 'center' }}
                      sx={{ py: 1.25 }}
                    >
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={600}>{member.name}</Typography>
                        <Typography variant="caption" color="text.secondary">Enrolled {new Date(member.enrolled_at).toLocaleDateString()}</Typography>
                      </Box>
                      <Chip size="small" label={member.ended_at ? member.outcome ?? 'ended' : 'active'} color={member.ended_at ? 'default' : 'success'} />
                      {!member.ended_at ? (
                        <LoadingButton
                          size="small"
                          variant="outlined"
                          loading={promotingId === member.user_id}
                          onClick={() => void promote(member)}
                        >
                          Promote to full member
                        </LoadingButton>
                      ) : null}
                    </Stack>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>
        </>
      )}

      <Dialog open={createOpen} onClose={() => !creating && setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create 90-day cycle</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
          <TextField label="Cycle name" value={createName} onChange={(e) => setCreateName(e.target.value)} autoFocus />
          <TextField type="date" label="Start date" value={createStart} onChange={(e) => setCreateStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="Timezone" value={createZone} onChange={(e) => setCreateZone(e.target.value)} />
          <Typography variant="caption" color="text.secondary">The end date is always the 90th day.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
          <LoadingButton variant="contained" onClick={createCycle} loading={creating} disabled={!createName || !createStart}>Create draft</LoadingButton>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={3800} onClose={() => setSnack((current) => ({ ...current, open: false }))}>
        <Alert severity={snack.severity} variant="filled">{snack.message}</Alert>
      </Snackbar>
    </Stack>
  );
}
