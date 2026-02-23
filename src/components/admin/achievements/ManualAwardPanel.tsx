// src/components/admin/achievements/ManualAwardPanel.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

type UserOption = { id: string; name: string; email: string };
type MinimalUser = { id: string; full_name: string };

type Achievement = {
  id: number;
  code: string;
  title: string;
  icon_url: string | null;
  is_active: boolean;
};

type UA = {
  id: number;
  user_id: string;
  achievement_id: number;
  achieved_at: string;
  awarded_via: 'auto' | 'manual' | 'import' | 'reconcile';
  achievements?: { id: number; code: string; title: string; icon_url: string | null } | null;
};

type ApiError = { error?: string };

function fmt(ts?: string) {
  return ts ? new Date(ts).toLocaleString() : '';
}

type ManualAwardPanelProps = {
  activeUserId?: string;
  onActiveUserChange?: (user: MinimalUser | null) => void;
};

export default function ManualAwardPanel({ activeUserId, onActiveUserChange }: ManualAwardPanelProps) {
  // Users
  const [userOptions, setUserOptions] = useState<MinimalUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<MinimalUser | null>(null);

  // Achievements
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [achLoading, setAchLoading] = useState(false);
  const [selectedAchievementId, setSelectedAchievementId] = useState<number | ''>('');

  // Award timestamp
  const [achievedAt, setAchievedAt] = useState<string>('');

  // Current awards for selected user
  const [rows, setRows] = useState<UA[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);

  // UI messages
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load users via your existing endpoint once
  useEffect(() => {
    let dead = false;
    (async () => {
      setUsersLoading(true);
      try {
        const res = await fetch('/api/admin/list-users');
        const body = (await res.json()) as { items?: UserOption[] } | ApiError;
        const items = Array.isArray((body as { items?: UserOption[] }).items)
          ? ((body as { items?: UserOption[] }).items as UserOption[])
          : [];
        if (!dead) {
          const opts: MinimalUser[] = items.map((u) => ({
            id: u.id,
            full_name: u.name || u.email || '(no name)',
          }));
          opts.sort((a, b) => a.full_name.localeCompare(b.full_name));
          setUserOptions(opts);
        }
      } catch (e) {
        if (!dead) setErr('Failed to load users.');
        console.error('list-users error:', e);
      } finally {
        if (!dead) setUsersLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);


  useEffect(() => {
    if (!activeUserId || userOptions.length === 0) return;
    const found = userOptions.find((u) => u.id === activeUserId) || null;
    if (found && found.id !== selectedUser?.id) {
      setSelectedUser(found);
    }
  }, [activeUserId, userOptions, selectedUser?.id]);

  // Load achievements
  useEffect(() => {
    let dead = false;
    (async () => {
      setAchLoading(true);
      try {
        const res = await fetch('/api/admin/achievements');
        const data = (await res.json()) as Achievement[] | ApiError;
        if (!dead && Array.isArray(data)) {
          const sorted = [...data].sort(
            (a, b) => Number(b.is_active) - Number(a.is_active) || a.title.localeCompare(b.title),
          );
          setAchievements(sorted);
        }
      } catch (e) {
        if (!dead) setErr('Failed to load achievements.');
        console.error('achievements error:', e);
      } finally {
        if (!dead) setAchLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  // Fetch current awards for selected user
  async function refreshAwards() {
    if (!selectedUser) {
      setRows([]);
      return;
    }
    setRowsLoading(true);
    try {
      const res = await fetch(`/api/admin/user-achievements?user_id=${selectedUser.id}`);
      const data = (await res.json()) as UA[] | ApiError;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr('Failed to load user awards.');
      console.error('user-achievements GET error:', e);
    } finally {
      setRowsLoading(false);
    }
  }

  useEffect(() => {
    void refreshAwards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser?.id]);

  const selectedAchievement = useMemo(
    () => achievements.find((a) => a.id === selectedAchievementId),
    [achievements, selectedAchievementId],
  );

  async function handleGiveAchievement() {
    setErr(null);
    setOk(null);

    if (!selectedUser || !selectedAchievementId) {
      setErr('Select user and achievement.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: selectedUser.id,
        achievement_id: Number(selectedAchievementId),
        achieved_at: achievedAt ? new Date(achievedAt).toISOString() : undefined,
        overwrite: false,
      };

      const res = await fetch('/api/admin/user-achievements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({} as ApiError))) as UA | ApiError;

      if (!res.ok) {
        setErr((body as ApiError).error ?? 'Failed to grant achievement.');
        return;
      }

      setOk('Achievement recorded.');
      setAchievedAt('');
      setSelectedAchievementId('');
      await refreshAwards();
    } catch (e) {
      setErr('Unexpected error while granting achievement.');
      console.error('user-achievements POST error:', e);
    } finally {
      setSaving(false);
    }
  }

  async function handleRevokeManual(id: number) {
    setErr(null);
    setOk(null);
    try {
      const res = await fetch(`/api/admin/user-achievements?id=${id}`, { method: 'DELETE' });
      const body = (await res.json().catch(() => ({} as ApiError))) as { success?: boolean } | ApiError;
      if (!res.ok) {
        setErr((body as ApiError).error ?? 'Failed to revoke achievement.');
        return;
      }
      setOk('Manual award revoked.');
      await refreshAwards();
    } catch (e) {
      setErr('Unexpected error while revoking achievement.');
      console.error('user-achievements DELETE error:', e);
    }
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Manual Awards
      </Typography>

      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        {err && <Alert severity="error">{err}</Alert>}
        {ok && <Alert severity="success">{ok}</Alert>}

        <Autocomplete
          options={userOptions}
          loading={usersLoading}
          value={selectedUser}
          onChange={(_, v) => {
            setSelectedUser(v);
            onActiveUserChange?.(v);
          }}
          getOptionLabel={(o) => (o ? o.full_name : '')}
          renderInput={(params) => (
            <TextField
              {...params}
              label="User"
              placeholder={usersLoading ? 'Loading users…' : 'Select user…'}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {usersLoading ? <CircularProgress size={16} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />

        <TextField
          select
          label="Achievement"
          value={selectedAchievementId}
          onChange={(e) => setSelectedAchievementId(Number(e.target.value))}
          helperText={
            selectedAchievement
              ? selectedAchievement.is_active
                ? 'Active'
                : 'Inactive (still grantable manually)'
              : 'Pick an achievement'
          }
        >
          {achLoading ? (
            <MenuItem value="" disabled>
              Loading…
            </MenuItem>
          ) : (
            achievements.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.title}
                <Chip size="small" sx={{ ml: 1 }} label={a.code} />
                {!a.is_active && <Chip size="small" sx={{ ml: 1 }} label="inactive" />}
              </MenuItem>
            ))
          )}
        </TextField>

        <TextField
          label="Achieved at (optional)"
          type="datetime-local"
          value={achievedAt}
          onChange={(e) => setAchievedAt(e.target.value)}
          helperText="Leave empty to use the current time"
          InputLabelProps={{ shrink: true }}
        />

        <Button
          variant="contained"
          onClick={handleGiveAchievement}
          disabled={!selectedUser || !selectedAchievementId || saving}
        >
          {saving ? 'Saving…' : 'Give Achievement'}
        </Button>
      </Stack>

      <Box sx={{ mt: 4 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Current awards {selectedUser ? `for ${selectedUser.full_name}` : ''}
        </Typography>
        <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Table size="small" aria-label="User achievements">
            <TableHead>
              <TableRow>
                <TableCell>Achievement</TableCell>
                <TableCell>Code</TableCell>
                <TableCell>Via</TableCell>
                <TableCell>Achieved at</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((ua) => (
                <TableRow key={ua.id} hover>
                  <TableCell>{ua.achievements?.title ?? ua.achievement_id}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {ua.achievements?.code ?? ''}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={ua.awarded_via}
                      color={ua.awarded_via === 'manual' ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>{fmt(ua.achieved_at)}</TableCell>
                  <TableCell align="right">
                    {ua.awarded_via === 'manual' ? (
                      <Tooltip title="Revoke manual award">
                        <IconButton size="small" color="error" onClick={() => handleRevokeManual(ua.id)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                      {rowsLoading ? 'Loading…' : 'No awards to show.'}
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}
