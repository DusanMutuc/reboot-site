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

type ApiListResponse<T> = { items: T[] };
type UnknownUser = Record<string, unknown>;

function isApiListResponse<T>(v: unknown): v is ApiListResponse<T> {
  return typeof v === 'object' && v !== null && Array.isArray((v as ApiListResponse<T>).items);
}

function toIdString(u: unknown): string | null {
  if (typeof u !== 'object' || u === null) return null;
  const id = (u as UnknownUser).id;
  if (typeof id === 'string') return id;
  if (typeof id === 'number') return String(id);
  return null;
}

export function CreateMeetingDialog({ open, onClose, meetingTypes, onCreated }: Props) {
  // Store the selection as string | null to avoid number vs string comparisons
  const [meetingTypeId, setMeetingTypeId] = useState<string | null>(null);
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
    if (meetingTypeId == null || !date) {
      setError('Meeting type and date are required');
      return;
    }

    // Find the meeting type by string match
    const type = meetingTypes.find((t) => String(t.id) === meetingTypeId);
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

        const json: unknown = await res.json();
        const items = isApiListResponse<unknown>(json) ? json.items : [];

        const ids = items
          .map(toIdString)
          .filter((v): v is string => typeof v === 'string' && v.length > 0);

        if (ids.length === 0) {
          throw new Error('No user IDs found from /api/admin/list-users');
        }

        attendeeIds = ids;
      }

      await createMeetingWithAttendees({
        meetingTypeCode: type.code,
        date, // YYYY-MM-DD
        attendeeIds,
        title: title || null,
      });

      onCreated?.();

      // reset form
      setMeetingTypeId(null);
      setDate('');
      setTitle('');
      setAutoPopulate(false);
      setError(null);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to create meeting';
      setError(message);
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
              value={meetingTypeId ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setMeetingTypeId(val === '' || val == null ? null : String(val));
              }}
              size="small"
            >
              <MenuItem value="">Select a type…</MenuItem>
              {meetingTypes.map((t) => (
                <MenuItem key={String(t.id)} value={String(t.id)}>
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
        <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
          {submitting ? <CircularProgress size={20} /> : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
