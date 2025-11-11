// src/components/admin/meetings/CreateMeetingDialog.tsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Checkbox,
  FormControlLabel,
  Alert,
  CircularProgress,
} from '@mui/material';

import { createMeetingWithAttendees } from '@/lib/meetings';
import type { MeetingType } from '@/types/meetings';

type Props = {
  open: boolean;
  onClose: () => void;
  meetingTypes: MeetingType[];
  onCreated?: () => void;
};

export function CreateMeetingDialog({ open, onClose, meetingTypes, onCreated }: Props) {
  const [meetingTypeId, setMeetingTypeId] = useState<number | ''>('');
  const [date, setDate] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [autoPopulate, setAutoPopulate] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (submitting) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!meetingTypeId || !date) {
      setError('Meeting type and date are required');
      return;
    }

    const type = meetingTypes.find((t) => t.id === meetingTypeId);
    if (!type) {
      setError('Selected meeting type not found');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let attendeeIds: string[] | null = null;

      if (autoPopulate) {
        const res = await fetch('/api/admin/list-users');
        if (!res.ok) {
          throw new Error('Failed to fetch users for auto-populate');
        }

        const json: any = await res.json();
        const items: any[] = Array.isArray(json.items) ? json.items : [];

        attendeeIds = items
          .map((u) => u.id as string | undefined)
          .filter((v): v is string => Boolean(v));

        if (!attendeeIds.length) {
          throw new Error('No user IDs found from /api/admin/list-users');
        }
      }

      await createMeetingWithAttendees({
        meetingTypeCode: type.code,
        date, // YYYY-MM-DD, matches _date date in the RPC
        attendeeIds,
        title: title || null,
      });

      if (onCreated) onCreated();

      // reset form
      setMeetingTypeId('');
      setDate('');
      setTitle('');
      setAutoPopulate(false);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create meeting');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Create meeting</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <FormControl fullWidth>
            <InputLabel id="create-meeting-type-label">Meeting type</InputLabel>
            <Select
              labelId="create-meeting-type-label"
              label="Meeting type"
              value={meetingTypeId}
              onChange={(e) => setMeetingTypeId(Number(e.target.value))}
              size="small"
            >
              {meetingTypes.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Date"
            type="date"
            size="small"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          <TextField
            label="Title (optional)"
            size="small"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={autoPopulate}
                onChange={(e) => setAutoPopulate(e.target.checked)}
              />
            }
            label="Auto-populate with all active members"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting}
        >
          {submitting ? <CircularProgress size={20} /> : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
