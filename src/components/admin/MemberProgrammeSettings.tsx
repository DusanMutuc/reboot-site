'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import ProgrammeMembershipControls, { type ProgrammeMember, updateProgrammeMember } from './ProgrammeMembershipControls';

type Cycle = { id: number; name: string; status: string; members: ProgrammeMember[] };
type Payload = { cycles: Cycle[]; availableUsers: Array<{ id: string; has_full_membership: boolean }> };

export default function MemberProgrammeSettings({ userId, onChanged }: {
  userId: string;
  onChanged: (hasFullMembership: boolean) => void;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [cycleId, setCycleId] = useState<number | ''>('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/ninety-day', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load programme settings');
    setPayload(result);
    return result as Payload;
  }, []);

  useEffect(() => {
    void load().catch((error) => setError(error.message));
  }, [load]);

  const enrollment = payload?.cycles.flatMap((cycle) => cycle.members
    .filter((member) => member.user_id === userId && !member.ended_at)
    .map((member) => ({ cycle, member })))[0];
  const candidate = payload?.availableUsers.find((user) => user.id === userId);
  const selectedCycle = payload?.cycles.find((cycle) => cycle.id === cycleId);

  async function changed() {
    const next = await load();
    const member = next.cycles.flatMap((cycle) => cycle.members).find((member) => member.user_id === userId);
    const available = next.availableUsers.find((user) => user.id === userId);
    onChanged(member?.has_full_membership ?? available?.has_full_membership ?? false);
  }

  async function enroll() {
    if (!cycleId) return;
    setBusy(true);
    setError(null);
    try {
      await updateProgrammeMember({ action: 'enroll-user', user_id: userId, cycle_id: cycleId,
        make_default: Boolean(candidate?.has_full_membership && selectedCycle?.status === 'active' && makeDefault) });
      await changed();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to enroll member');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="adminSectionTitle">90-day programme</Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {!payload && !error ? <Typography color="text.secondary">Loading programme settings…</Typography> : null}
      {enrollment ? (
        <>
          <Typography variant="body2">{enrollment.cycle.name} · {enrollment.cycle.status}</Typography>
          <ProgrammeMembershipControls member={enrollment.member} cycle={enrollment.cycle} onChanged={changed} />
        </>
      ) : candidate ? (
        <>
          <Typography variant="body2" color="text.secondary">Enroll this member in a cycle while keeping their existing membership.</Typography>
          <TextField select label="Cycle" value={cycleId} disabled={busy} onChange={(event) => { setCycleId(Number(event.target.value)); setMakeDefault(false); }}>
            {payload?.cycles.filter((cycle) => cycle.status !== 'completed').map((cycle) => (
              <MenuItem key={cycle.id} value={cycle.id}>{cycle.name} · {cycle.status}</MenuItem>
            ))}
          </TextField>
          {candidate.has_full_membership && selectedCycle?.status === 'active' ? (
            <FormControlLabel control={<Checkbox checked={makeDefault} disabled={busy} onChange={(event) => setMakeDefault(event.target.checked)} />}
              label="Make the 90-day programme their default home" />
          ) : null}
          <Button variant="outlined" disabled={busy || !cycleId} onClick={() => void enroll()}>Enroll in programme</Button>
        </>
      ) : payload ? <Typography variant="body2" color="text.secondary">Restore membership access before enrolling this member.</Typography> : null}
    </Stack>
  );
}
