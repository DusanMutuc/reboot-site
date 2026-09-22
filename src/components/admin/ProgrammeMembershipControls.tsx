'use client';

import { useState } from 'react';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';

export type ProgrammeMember = {
  user_id: string;
  name: string;
  has_full_membership: boolean;
  default_home: 'member' | 'ninety-day';
  ended_at: string | null;
};

export async function updateProgrammeMember(body: Record<string, unknown>) {
  const response = await fetch('/api/admin/ninety-day', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to update programme membership');
}

export default function ProgrammeMembershipControls({ member, cycle, onChanged }: {
  member: ProgrammeMember;
  cycle: { id: number; status: string };
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(action: string, extra: Record<string, unknown> = {}) {
    if (action === 'end-enrollment' && !window.confirm(`End ${member.name}'s enrollment in this cycle? Their membership access and history will be retained.`)) return;
    setBusy(true);
    setError(null);
    try {
      await updateProgrammeMember({ action, user_id: member.user_id, cycle_id: cycle.id, ...extra });
      await onChanged();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to update membership');
    } finally {
      setBusy(false);
    }
  }

  if (member.ended_at) return null;
  return (
    <Stack spacing={1} sx={{ minWidth: { sm: 220 } }}>
      <Typography variant="caption" color="text.secondary">
        {member.has_full_membership ? 'Full membership + 90-day programme' : '90-day programme membership'}
      </Typography>
      {member.has_full_membership ? (
        <TextField select size="small" label="Default home" value={member.default_home} disabled={busy}
          onChange={(event) => void update('set-default-home', { default_home: event.target.value })}>
          <MenuItem value="member">Member dashboard</MenuItem>
          <MenuItem value="ninety-day" disabled={cycle.status !== 'active'}>90-day programme</MenuItem>
        </TextField>
      ) : (
        <Button variant="outlined" size="small" disabled={busy} onClick={() => void update('grant-full-membership')}>
          Add full membership
        </Button>
      )}
      <Button color="inherit" size="small" disabled={busy} onClick={() => void update('end-enrollment')}>
        End programme enrollment
      </Button>
      {error ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  );
}
