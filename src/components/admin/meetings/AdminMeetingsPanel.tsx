// src/components/admin/meetings/AdminMeetingsPanel.tsx
'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Autocomplete,
  Box,
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
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
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

type SimpleUser = {
  id: string;
  name: string;
  email: string;
};

type ApiListResponse<T> = {
  items: T[];
};

type MemberAttendanceFilter = 'attended' | 'not_attended' | 'all';

function isApiListResponse<T>(value: unknown): value is ApiListResponse<T> {
  return typeof value === 'object' && value !== null && Array.isArray((value as ApiListResponse<T>).items);
}

function toSimpleUser(value: unknown): SimpleUser | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  const id = obj.id;
  const name = obj.name;
  const email = obj.email;

  if (typeof id !== 'string' && typeof id !== 'number') {
    return null;
  }

  return {
    id: String(id),
    name: typeof name === 'string' ? name : '',
    email: typeof email === 'string' ? email : '',
  };
}

function getSimpleUserLabel(user: SimpleUser): string {
  return user.name || user.email || user.id;
}

export default function AdminMeetingsPanel() {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [members, setMembers] = useState<SimpleUser[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<number | 'all'>('all');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedMemberAttended, setSelectedMemberAttended] =
    useState<MemberAttendanceFilter | null>(null);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [attendanceMeeting, setAttendanceMeeting] = useState<Meeting | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [meetingToEdit, setMeetingToEdit] = useState<Meeting | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const attendanceToggleRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [attendanceToggleWidth, setAttendanceToggleWidth] = useState<number | null>(null);

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

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);

    try {
      const response = await fetch('/api/admin/list-users');
      if (!response.ok) {
        throw new Error('Failed to load members');
      }

      const payload: unknown = await response.json();
      const items = isApiListResponse<unknown>(payload) ? payload.items : [];
      const mappedMembers = items
        .map(toSimpleUser)
        .filter((member): member is SimpleUser => member !== null);

      setMembers(mappedMembers);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to load members';
      setError((previous) => previous ?? message);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  const sortedMembers = useMemo(() => {
    const getFirstName = (member: SimpleUser) => {
      const name = (member.name || '').trim();
      if (!name) return '';
      return name.split(/\s+/)[0]?.toLowerCase() ?? '';
    };

    return [...members].sort((a, b) => {
      const firstNameA = getFirstName(a);
      const firstNameB = getFirstName(b);

      if (firstNameA && firstNameB && firstNameA !== firstNameB) {
        return firstNameA.localeCompare(firstNameB);
      }

      return (a.email || '').localeCompare(b.email || '');
    });
  }, [members]);

  const selectedMember = useMemo(
    () => sortedMembers.find((member) => member.id === selectedMemberId) ?? null,
    [sortedMembers, selectedMemberId]
  );

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getMeetings({
        from: fromDate || undefined,
        to: toDate || undefined,
        meetingTypeId: selectedTypeId === 'all' ? undefined : selectedTypeId,
        memberUserId: selectedMemberId || undefined,
        memberAttended:
          selectedMemberId && selectedMemberAttended
            ? selectedMemberAttended === 'all'
              ? 'all'
              : selectedMemberAttended === 'attended'
            : undefined,
      });
      setMeetings(data);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to load meetings';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, selectedTypeId, selectedMemberId, selectedMemberAttended]);

  useEffect(() => {
    void loadMeetingTypes();
  }, [loadMeetingTypes]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  useEffect(() => {
    const measureToggleWidth = () => {
      const widest = attendanceToggleRefs.current.reduce((maxWidth, button) => {
        if (!button) return maxWidth;
        return Math.max(maxWidth, button.offsetWidth);
      }, 0);

      setAttendanceToggleWidth((currentWidth) =>
        widest > 0 && currentWidth !== widest ? widest : currentWidth
      );
    };

    const frameId = window.requestAnimationFrame(measureToggleWidth);
    window.addEventListener('resize', measureToggleWidth);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', measureToggleWidth);
    };
  }, []);

  const handleRefresh = () => {
    void loadMeetings();
    void loadMembers();
  };

  const handleOpenAttendance = (meeting: Meeting) => {
    setAttendanceMeeting(meeting);
  };

  const handleCloseAttendance = () => {
    setAttendanceMeeting(null);
    void loadMeetings();
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

  const showMemberAttendanceColumn =
    Boolean(selectedMemberId) && selectedMemberAttended === 'all';

  const renderAttendedStatus = (meeting: Meeting) => {
    const attended = meeting.member_attended;

    if (attended === null || attended === undefined) {
      return (
        <Typography variant="body2" color="text.secondary">
          -
        </Typography>
      );
    }

    return attended ? (
      <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center">
        <CheckCircleIcon color="success" fontSize="small" />
        <Typography variant="body2" color="success.main">
          Yes
        </Typography>
      </Stack>
    ) : (
      <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center">
        <CancelIcon color="error" fontSize="small" />
        <Typography variant="body2" color="error.main">
          No
        </Typography>
      </Stack>
    );
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

          <Autocomplete
            size="small"
            options={sortedMembers}
            value={selectedMember}
            onChange={(_event, value) => {
              const nextMemberId = value?.id ?? null;
              setSelectedMemberId(nextMemberId);
              setSelectedMemberAttended((previous) => {
                if (!nextMemberId) return null;
                return previous ?? 'attended';
              });
            }}
            getOptionLabel={(option) => getSimpleUserLabel(option)}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            loading={loadingMembers}
            noOptionsText={loadingMembers ? 'Loading members...' : 'No members found'}
            sx={{ minWidth: { xs: '100%', md: 280 } }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Member"
                placeholder="Search member"
              />
            )}
          />

          <Stack spacing={0.75}>
            
            <ToggleButtonGroup
              size="small"
              exclusive
              value={
                selectedMemberAttended === null ? null : selectedMemberAttended
              }
              onChange={(_event, value: MemberAttendanceFilter | null) => {
                if (!selectedMemberId || value === null) return;
                setSelectedMemberAttended(value);
              }}
              disabled={!selectedMemberId}
            >
              <ToggleButton
                value="attended"
                ref={(element) => {
                  attendanceToggleRefs.current[0] = element;
                }}
                sx={{
                  fontSize: (theme) => theme.typography.caption.fontSize,
                  minWidth: 90,
                  px: 0.5,
                  whiteSpace: 'nowrap',
                  width: attendanceToggleWidth ? `${attendanceToggleWidth}px` : undefined,
                }}
              >
                Attended
              </ToggleButton>
              <ToggleButton
                value="not_attended"
                ref={(element) => {
                  attendanceToggleRefs.current[1] = element;
                }}
                sx={{
                  fontSize: (theme) => theme.typography.caption.fontSize,
                  minWidth: 90,
                  px: 0.5,
                  whiteSpace: 'nowrap',
                  width: attendanceToggleWidth ? `${attendanceToggleWidth}px` : undefined,
                }}
              >
                Not attended
              </ToggleButton>
              <ToggleButton
                value="all"
                ref={(element) => {
                  attendanceToggleRefs.current[2] = element;
                }}
                sx={{
                  fontSize: (theme) => theme.typography.caption.fontSize,
                  minWidth: 90,
                  px: 0.5,
                  whiteSpace: 'nowrap',
                  width: attendanceToggleWidth ? `${attendanceToggleWidth}px` : undefined,
                }}
              >
                All
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

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
                {showMemberAttendanceColumn ? (
                  <TableCell align="center">Attended</TableCell>
                ) : null}
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

                  {showMemberAttendanceColumn ? (
                    <TableCell align="center">{renderAttendedStatus(m)}</TableCell>
                  ) : null}

                  {/* Actions */}
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleOpenAttendance(m)}
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
        open={Boolean(attendanceMeeting)}
        meetingId={attendanceMeeting?.id ?? null}
        meetingDate={attendanceMeeting?.date ?? null}
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
