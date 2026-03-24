// src/components/admin/meetings/AdminMeetingsPanel.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';

import {
  getMeetingTypes,
  getMeetings,
  deleteMeeting,
  updateMeeting,
} from '@/lib/meetings';
import type { MeetingType, Meeting } from '@/types/meetings';
import { CreateMeetingDialog } from './CreateMeetingDialog';
import { MeetingAttendanceDialog } from './MeetingAttendanceDialog';

export default function AdminMeetingsPanel() {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<number | 'all'>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [attendanceMeetingId, setAttendanceMeetingId] = useState<number | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [meetingToEdit, setMeetingToEdit] = useState<Meeting | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadMeetingTypes = useCallback(async () => {
    try {
      const types = await getMeetingTypes();
      setMeetingTypes(types);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to load meeting types';
      setError(message);
    }
  }, []);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getMeetings({
        from: fromDate || undefined,
        to: toDate || undefined,
        meetingTypeId: selectedTypeId === 'all' ? undefined : selectedTypeId,
      });
      setMeetings(data);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to load meetings';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, selectedTypeId]);

  useEffect(() => {
    void loadMeetingTypes();
  }, [loadMeetingTypes]);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  const handleRefresh = () => {
    void loadMeetings();
  };

  const handleOpenAttendance = (meetingId: number) => {
    setAttendanceMeetingId(meetingId);
  };

  const handleCloseAttendance = () => {
    setAttendanceMeetingId(null);
  };

  const handleCreatedMeeting = () => {
    setCreateOpen(false);
    void loadMeetings();
  };

  // Delete flow
  const openDeleteDialog = (meeting: Meeting) => {
    setMeetingToDelete(meeting);
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (deletingId != null) return;
    setDeleteDialogOpen(false);
    setMeetingToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!meetingToDelete) return;

    setDeletingId(meetingToDelete.id);
    setError(null);

    try {
      await deleteMeeting(meetingToDelete.id);
      await loadMeetings();
      setDeleteDialogOpen(false);
      setMeetingToDelete(null);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to delete meeting';
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  // Edit flow
  const openEditDialog = (meeting: Meeting) => {
    setMeetingToEdit(meeting);
    setEditTitle(meeting.title ?? '');
    setEditDate(meeting.date ?? '');
    setEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    if (updatingId != null) return;
    setEditDialogOpen(false);
    setMeetingToEdit(null);
    setEditTitle('');
    setEditDate('');
  };

  const handleConfirmEdit = async () => {
    if (!meetingToEdit) return;
    if (!editDate) {
      setError('Please provide a date for the meeting.');
      return;
    }

    setUpdatingId(meetingToEdit.id);
    setError(null);

    try {
      await updateMeeting(meetingToEdit.id, {
        date: editDate,
        title: editTitle.trim() ? editTitle.trim() : null,
      });
      await loadMeetings();
      setEditDialogOpen(false);
      setMeetingToEdit(null);
      setEditTitle('');
      setEditDate('');
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to update meeting';
      setError(message);
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return date;
    return d.toLocaleDateString();
  };

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems="center"
        >
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="meeting-type-label">Meeting type</InputLabel>
            <Select
              labelId="meeting-type-label"
              label="Meeting type"
              value={selectedTypeId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedTypeId(val === 'all' ? 'all' : Number(val));
              }}
              size="small"
            >
              <MenuItem value="all">All types</MenuItem>
              {meetingTypes.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="From date"
            type="date"
            size="small"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            label="To date"
            type="date"
            size="small"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />

          <Stack direction="row" spacing={1} sx={{ ml: { md: 'auto' } }}>
            <Button variant="outlined" onClick={handleRefresh}>
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              Create meeting
            </Button>
          </Stack>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : meetings.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No meetings found for this filter.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Label</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {meetings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{formatDate(m.date)}</TableCell>

                  {/* Type */}
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <EventAvailableIcon fontSize="small" />
                      <Box>
                        <Typography variant="body2">
                          {m.meeting_type_name || m.meeting_type_code || 'Meeting'}
                        </Typography>
                        {m.meeting_type_code && (
                          <Typography variant="caption" color="text.secondary">
                            {m.meeting_type_code}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </TableCell>

                  {/* Label */}
                  <TableCell>
                    {m.title ? (
                      <Typography variant="body2">{m.title}</Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        (No label)
                      </Typography>
                    )}
                  </TableCell>

                  {/* Actions */}
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleOpenAttendance(m.id)}
                      >
                        Attendance
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<EditIcon fontSize="small" />}
                        onClick={() => openEditDialog(m)}
                        disabled={updatingId === m.id}
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon fontSize="small" />}
                        onClick={() => openDeleteDialog(m)}
                        disabled={deletingId === m.id}
                      >
                        Delete
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>

      <CreateMeetingDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        meetingTypes={meetingTypes}
        onCreated={handleCreatedMeeting}
      />

      <MeetingAttendanceDialog
        open={Boolean(attendanceMeetingId)}
        meetingId={attendanceMeetingId}
        onClose={handleCloseAttendance}
      />

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onClose={closeDeleteDialog}>
        <DialogTitle>Delete meeting</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body1">
            Are you sure you want to delete this meeting and all of its
            attendance records?
          </Typography>
          {meetingToDelete && (
            <Box mt={2}>
              <Typography variant="adminSectionTitle">
                {formatDate(meetingToDelete.date)} –{' '}
                {meetingToDelete.meeting_type_name ||
                  meetingToDelete.meeting_type_code ||
                  'Meeting'}
              </Typography>
              {meetingToDelete.title && (
                <Typography variant="body2" color="text.secondary">
                  {meetingToDelete.title}
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog} disabled={deletingId != null}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={deletingId != null}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onClose={closeEditDialog}>
        <DialogTitle>Edit meeting</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Label (optional)"
              fullWidth
              size="small"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <TextField
              label="Date"
              type="date"
              size="small"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditDialog} disabled={updatingId != null}>
            Cancel
          </Button>
          <Button onClick={handleConfirmEdit} variant="contained" disabled={updatingId != null}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
