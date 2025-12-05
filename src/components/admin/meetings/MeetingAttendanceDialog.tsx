// src/components/admin/meetings/MeetingAttendanceDialog.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Checkbox,
  CircularProgress,
  Alert,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

import {
  getMeetingAttendance,
  upsertMeetingAttendance,
  removeMeetingAttendance,
} from '@/lib/meetings';
import type { MeetingAttendanceWithProfile } from '@/types/meetings';

type Props = {
  open: boolean;
  meetingId: number | null;
  onClose: () => void;
};

type SimpleUser = {
  id: string;
  name: string;
  email: string;
};

type Source = 'members' | 'coaches';

/** API helpers */
type ApiListResponse<T> = { items: T[] };

function isApiListResponse<T>(v: unknown): v is ApiListResponse<T> {
  return typeof v === 'object' && v !== null && Array.isArray((v as ApiListResponse<T>).items);
}

function toSimpleUser(u: unknown): SimpleUser | null {
  if (typeof u !== 'object' || u === null) return null;
  const obj = u as Record<string, unknown>;
  const id = obj.id;
  const name = obj.name;
  const email = obj.email;
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  return {
    id: String(id),
    name: typeof name === 'string' ? name : '',
    email: typeof email === 'string' ? email : '',
  };
}

export function MeetingAttendanceDialog({ open, meetingId, onClose }: Props) {
  const [rows, setRows] = useState<MeetingAttendanceWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Members (users) list
  const [allUsers, setAllUsers] = useState<SimpleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Coaches list
  const [allCoaches, setAllCoaches] = useState<SimpleUser[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState(false);

  // Which list we are adding from right now
  const [source, setSource] = useState<Source>('members');

  // Selected id from the active (source) list
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [adding, setAdding] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [userToRemove, setUserToRemove] =
    useState<MeetingAttendanceWithProfile | null>(null);

  useEffect(() => {
    if (!open || !meetingId) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMeetingAttendance(meetingId);
        setRows(data);
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load attendance');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [open, meetingId]);

  // Load Members (users)
  useEffect(() => {
    if (!open) return;
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const res = await fetch('/api/admin/list-users');
        if (!res.ok) throw new Error('Failed to load users for attendance');
        const json: unknown = await res.json();
        const items = isApiListResponse<unknown>(json) ? json.items : [];
        const mapped: SimpleUser[] = items
          .map(toSimpleUser)
          .filter((v): v is SimpleUser => v !== null);
        setAllUsers(mapped);
      } catch (err: unknown) {
        console.error(err);
        setError((prev) => prev ?? (err instanceof Error ? err.message : 'Failed to load users'));
      } finally {
        setLoadingUsers(false);
      }
    };
    void loadUsers();
  }, [open]);

  // Load Coaches
  useEffect(() => {
    if (!open) return;
    const loadCoaches = async () => {
      setLoadingCoaches(true);
      try {
        const res = await fetch('/api/admin/list-coaches');
        if (!res.ok) throw new Error('Failed to load coaches for attendance');
        const json: unknown = await res.json();
        const items = isApiListResponse<unknown>(json) ? json.items : [];
        const mapped: SimpleUser[] = items
          .map(toSimpleUser)
          .filter((v): v is SimpleUser => v !== null);
        setAllCoaches(mapped);
      } catch (err: unknown) {
        console.error(err);
        setError((prev) => prev ?? (err instanceof Error ? err.message : 'Failed to load coaches'));
      } finally {
        setLoadingCoaches(false);
      }
    };
    void loadCoaches();
  }, [open]);

  // Fast lookup across both lists
  const lookup = useMemo(() => {
    const map = new Map<string, SimpleUser>();
    for (const u of allUsers) map.set(u.id, u);
    for (const c of allCoaches) map.set(c.id, c);
    return map;
  }, [allUsers, allCoaches]);


  const sortedMembers = useMemo(() => {
    const getFirstName = (u: SimpleUser) => {
      const name = (u.name || '').trim();
      if (!name) return '';
      return name.split(/\s+/)[0]?.toLowerCase() ?? '';
    };

    return [...allUsers].sort((a, b) => {
      const fa = getFirstName(a);
      const fb = getFirstName(b);
      if (fa && fb && fa !== fb) return fa.localeCompare(fb);
      // fallback to email if first names are missing/identical
      return (a.email || '').localeCompare(b.email || '');
    });
  }, [allUsers]);

  const sortedCoaches = useMemo(() => {
    const getFirstName = (u: SimpleUser) => {
      const name = (u.name || '').trim();
      if (!name) return '';
      return name.split(/\s+/)[0]?.toLowerCase() ?? '';
    };

    return [...allCoaches].sort((a, b) => {
      const fa = getFirstName(a);
      const fb = getFirstName(b);
      if (fa && fb && fa !== fb) return fa.localeCompare(fb);
      return (a.email || '').localeCompare(b.email || '');
    });
  }, [allCoaches]);

  // Which pool are we currently choosing from?
  const activePool: SimpleUser[] = source === 'members' ? sortedMembers : sortedCoaches;


  // Don't suggest anyone already on the attendance list
  const availableOptions = useMemo(() => {
    const existing = new Set(rows.map((r) => r.user_id));
    return activePool.filter((p) => !existing.has(p.id));
  }, [activePool, rows]);

  const handleToggle = async (userId: string, currentValue: boolean) => {
    if (!meetingId) return;
    const newValue = !currentValue;
    setSavingId(userId);

    // optimistic
    setRows((prev) =>
      prev.map((r) => (r.user_id === userId ? { ...r, attended: newValue } : r)),
    );

    try {
      await upsertMeetingAttendance({ meetingId, userId, attended: newValue });
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to update attendance');
      // revert
      setRows((prev) =>
        prev.map((r) => (r.user_id === userId ? { ...r, attended: currentValue } : r)),
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleAddAttendee = async () => {
    if (!meetingId || !selectedUserId) return;
    setAdding(true);
    setError(null);
    try {
      await upsertMeetingAttendance({
        meetingId,
        userId: selectedUserId,
        attended: false,
      });

      const user = lookup.get(selectedUserId);
      const nameParts = (user?.name ?? '').trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] ?? '';
      const lastName = nameParts.slice(1).join(' ') || '';

      setRows((prev) => [
        ...prev,
        {
          meeting_id: meetingId,
          user_id: selectedUserId,
          attended: false,
          profiles: { first_name: firstName || null, last_name: lastName || null },
        } as MeetingAttendanceWithProfile,
      ]);

      setSelectedUserId('');
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to add attendee');
    } finally {
      setAdding(false);
    }
  };

  const openRemoveDialog = (row: MeetingAttendanceWithProfile) => {
    setUserToRemove(row);
    setRemoveDialogOpen(true);
  };

  const closeRemoveDialog = () => {
    if (removingId) return;
    setRemoveDialogOpen(false);
    setUserToRemove(null);
  };

  const handleConfirmRemove = async () => {
    if (!meetingId || !userToRemove) return;
    const userId = userToRemove.user_id;
    setRemovingId(userId);
    setError(null);
    try {
      await removeMeetingAttendance(meetingId, userId);
      setRows((prev) => prev.filter((r) => r.user_id !== userId));
      setRemoveDialogOpen(false);
      setUserToRemove(null);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to remove attendee');
    } finally {
      setRemovingId(null);
    }
  };

  const handleClose = () => {
    if (savingId || adding || removingId) return;
    setError(null);
    onClose();
  };

  const getDisplayName = (row: MeetingAttendanceWithProfile) => {
    const profile = row.profiles || {};
    const profileName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
    if (profileName) return profileName;
    const u = lookup.get(row.user_id);
    if (u?.name) return u.name;
    if (u?.email) return u.email;
    return row.user_id;
  };

  const sortedRows = useMemo(() => {
    const collator = new Intl.Collator('en', { sensitivity: 'base' });

    return [...rows].sort((a, b) => {
      const nameA = getDisplayName(a);
      const nameB = getDisplayName(b);
      return collator.compare(nameA, nameB);
    });
  }, [rows, lookup]);



  const anyLoading = loadingUsers || loadingCoaches;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>Meeting attendance</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Add attendee
          </Typography>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <ToggleButtonGroup
              exclusive
              value={source}
              onChange={(_e, v: Source | null) => {
                if (v) {
                  setSource(v);
                  setSelectedUserId(''); // reset selection when switching source
                }
              }}
              size="small"
            >
              <ToggleButton value="members">Members</ToggleButton>
              <ToggleButton value="coaches">Coaches</ToggleButton>
            </ToggleButtonGroup>

            <FormControl sx={{ minWidth: 260 }} size="small">
              <InputLabel id="add-attendee-label">
                {source === 'members' ? 'Member' : 'Coach'}
              </InputLabel>
              <Select
                labelId="add-attendee-label"
                label={source === 'members' ? 'Member' : 'Coach'}
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(String(e.target.value))}
                disabled={anyLoading}
              >
                {availableOptions.map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.name || u.email || u.id}
                  </MenuItem>
                ))}
                {availableOptions.length === 0 && (
                  <MenuItem disabled>No more {source} to add</MenuItem>
                )}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              onClick={handleAddAttendee}
              disabled={!selectedUserId || adding}
            >
              {adding ? <CircularProgress size={20} /> : 'Add'}
            </Button>
          </Stack>
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary">No attendees for this meeting yet.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Attendee</TableCell>
                <TableCell align="center">Attended</TableCell>
                <TableCell align="center">Remove</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedRows.map((row) => (

                <TableRow key={row.user_id}>
                  <TableCell>{getDisplayName(row)}</TableCell>
                  <TableCell align="center">
                    <Checkbox
                      checked={!!row.attended}
                      onChange={() => handleToggle(row.user_id, !!row.attended)}
                      disabled={savingId === row.user_id}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => openRemoveDialog(row)}
                      disabled={removingId === row.user_id}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={Boolean(savingId || adding || removingId)}>
          Close
        </Button>
      </DialogActions>

      <Dialog open={removeDialogOpen} onClose={closeRemoveDialog}>
        <DialogTitle>Remove attendee</DialogTitle>
        <DialogContent dividers>
          <Typography>Remove this user from the meeting&apos;s expected attendees?</Typography>
          {userToRemove && (
            <Box mt={2}>
              <Typography variant="subtitle2">{getDisplayName(userToRemove)}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRemoveDialog} disabled={removingId != null}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmRemove}
            color="error"
            variant="contained"
            disabled={removingId != null}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
