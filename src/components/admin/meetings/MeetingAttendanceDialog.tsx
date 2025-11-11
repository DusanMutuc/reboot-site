// src/components/admin/meetings/MeetingAttendanceDialog.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
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

export function MeetingAttendanceDialog({ open, meetingId, onClose }: Props) {
  const [rows, setRows] = useState<MeetingAttendanceWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [allUsers, setAllUsers] = useState<SimpleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [adding, setAdding] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [userToRemove, setUserToRemove] = useState<MeetingAttendanceWithProfile | null>(
    null
  );

  useEffect(() => {
    if (!open || !meetingId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMeetingAttendance(meetingId);
        setRows(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to load attendance');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [open, meetingId]);

  useEffect(() => {
    if (!open) return;

    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const res = await fetch('/api/admin/list-users');
        if (!res.ok) {
          throw new Error('Failed to load users for attendance');
        }
        const json: any = await res.json();
        const items: any[] = Array.isArray(json.items) ? json.items : [];
        const mapped: SimpleUser[] = items.map((u) => ({
          id: String(u.id),
          name: String(u.name ?? ''),
          email: String(u.email ?? ''),
        }));
        setAllUsers(mapped);
      } catch (err: any) {
        console.error(err);
        setError((prev) => prev ?? err.message ?? 'Failed to load users');
      } finally {
        setLoadingUsers(false);
      }
    };

    void loadUsers();
  }, [open]);

  const availableUsers = useMemo(() => {
    const existingIds = new Set(rows.map((r) => r.user_id));
    return allUsers.filter((u) => !existingIds.has(u.id));
  }, [allUsers, rows]);

  const handleToggle = async (userId: string, currentValue: boolean) => {
    if (!meetingId) return;

    const newValue = !currentValue;
    setSavingId(userId);

    setRows((prev) =>
      prev.map((r) =>
        r.user_id === userId ? { ...r, attended: newValue } : r
      )
    );

    try {
      await upsertMeetingAttendance({
        meetingId,
        userId,
        attended: newValue,
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update attendance');

      setRows((prev) =>
        prev.map((r) =>
          r.user_id === userId ? { ...r, attended: currentValue } : r
        )
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

      const user = allUsers.find((u) => u.id === selectedUserId);
      const nameParts = (user?.name ?? '').split(' ');
      const firstName = nameParts[0] ?? '';
      const lastName = nameParts.slice(1).join(' ') || '';

      setRows((prev) => [
        ...prev,
        {
          meeting_id: meetingId,
          user_id: selectedUserId,
          attended: false,
          profiles: {
            first_name: firstName || null,
            last_name: lastName || null,
          },
        } as MeetingAttendanceWithProfile,
      ]);

      setSelectedUserId('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to add attendee');
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
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to remove attendee');
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
    const profileName = `${profile.first_name ?? ''} ${
      profile.last_name ?? ''
    }`.trim();

    if (profileName) return profileName;

    const user = allUsers.find((u) => u.id === row.user_id);
    if (user?.name) return user.name;
    if (user?.email) return user.email;

    return row.user_id;
  };

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
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
            <FormControl sx={{ minWidth: 220 }} size="small">
              <InputLabel id="add-attendee-label">User</InputLabel>
              <Select
                labelId="add-attendee-label"
                label="User"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(String(e.target.value))}
                disabled={loadingUsers}
              >
                {availableUsers.map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.name || u.email || u.id}
                  </MenuItem>
                ))}
                {availableUsers.length === 0 && (
                  <MenuItem disabled>No more users to add</MenuItem>
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
          <Typography color="text.secondary">
            No attendees for this meeting yet.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell align="center">Attended</TableCell>
                <TableCell align="center">Remove</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.user_id}>
                  <TableCell>{getDisplayName(row)}</TableCell>
                  <TableCell align="center">
                    <Checkbox
                      checked={row.attended}
                      onChange={() => handleToggle(row.user_id, row.attended)}
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
        <Button
          onClick={handleClose}
          disabled={Boolean(savingId || adding || removingId)}
        >
          Close
        </Button>
      </DialogActions>

      <Dialog open={removeDialogOpen} onClose={closeRemoveDialog}>
        <DialogTitle>Remove attendee</DialogTitle>
        <DialogContent dividers>
          <Typography>
            Remove this user from the meeting&apos;s expected attendees?
          </Typography>
          {userToRemove && (
            <Box mt={2}>
              <Typography variant="subtitle2">
                {getDisplayName(userToRemove)}
              </Typography>
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
