'use client';

import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  type MeetingDateInputs,
  type MeetingSlotKey,
  type MeetingSlotsState,
} from './types';

type MeetingSlotsPanelProps = {
  attendanceSavingKey: MeetingSlotKey | null;
  m2Exists: boolean;
  meetingSlots: MeetingSlotsState;
  meetingSlotsLoading: boolean;
  newMeetingDates: MeetingDateInputs;
  noteSelected: boolean;
  slotSavingKey: MeetingSlotKey | null;
  onChangeExistingDate: (slotKey: MeetingSlotKey, value: string) => void;
  onChangeNewDate: (slotKey: MeetingSlotKey, value: string) => void;
  onCreateImplementationMeeting: (slotKey: MeetingSlotKey) => void;
  onCreateM2Meeting: () => void;
  onToggleAttendance: (slotKey: MeetingSlotKey) => void;
};

export default function MeetingSlotsPanel({
  attendanceSavingKey,
  m2Exists,
  meetingSlots,
  meetingSlotsLoading,
  newMeetingDates,
  noteSelected,
  slotSavingKey,
  onChangeExistingDate,
  onChangeNewDate,
  onCreateImplementationMeeting,
  onCreateM2Meeting,
  onToggleAttendance,
}: MeetingSlotsPanelProps) {
  const renderStatusChip = (
    slotKey: MeetingSlotKey,
    hasMeeting: boolean,
    attended: boolean,
  ) => {
    if (hasMeeting && attended) {
      return (
        <Chip
          size="small"
          label="Attended"
          sx={{
            bgcolor: 'success.50',
            color: 'success.dark',
            fontWeight: 700,
            borderRadius: 999,
          }}
        />
      );
    }

    if (hasMeeting) {
      return (
        <Chip
          size="small"
          label="Scheduled"
          sx={{
            bgcolor: 'success.50',
            color: 'success.dark',
            fontWeight: 600,
            borderRadius: 999,
          }}
        />
      );
    }

    if (!noteSelected || (!m2Exists && slotKey !== 'm2')) {
      return (
        <Chip
          size="small"
          label="Locked"
          sx={{
            bgcolor: 'grey.100',
            color: 'text.disabled',
            fontWeight: 600,
            borderRadius: 999,
          }}
        />
      );
    }

    return (
      <Chip
        size="small"
        label="Not scheduled"
        sx={{
          bgcolor: 'warning.50',
          color: 'warning.dark',
          fontWeight: 600,
          borderRadius: 999,
        }}
      />
    );
  };

  const renderSlot = (slotKey: MeetingSlotKey, label: string) => {
    const slot = meetingSlots[slotKey];
    const hasMeeting = Boolean(slot);
    const attended = Boolean(slot?.attended);
    const isM2 = slotKey === 'm2';
    const busy =
      meetingSlotsLoading || slotSavingKey === slotKey || attendanceSavingKey === slotKey;
    const dateValue = hasMeeting ? slot?.date ?? '' : newMeetingDates[slotKey];
    const locked = !noteSelected || (!m2Exists && !isM2 && !hasMeeting);
    const disableInputs = busy || locked;
    const helperText = !noteSelected
      ? 'Create or select a note first.'
      : !isM2 && !m2Exists && !hasMeeting
        ? 'Create M2 first before scheduling implementations.'
        : hasMeeting
          ? 'Meeting created for this student.'
          : 'Pick a date to create this meeting.';

    return (
      <Box
        key={slotKey}
        sx={{
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'grey.200',
          p: 2,
          bgcolor: locked ? 'grey.50' : 'background.paper',
          opacity: locked ? 0.8 : 1,
        }}
      >
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {label}
            </Typography>
            {renderStatusChip(slotKey, hasMeeting, attended)}
          </Stack>

          <TextField
            type="date"
            size="small"
            fullWidth
            value={dateValue}
            onChange={(event) => {
              if (hasMeeting) {
                onChangeExistingDate(slotKey, event.target.value);
                return;
              }

              onChangeNewDate(slotKey, event.target.value);
            }}
            InputLabelProps={{ shrink: true }}
            disabled={disableInputs}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 1.5,
                bgcolor: 'background.paper',
              },
            }}
          />

          {hasMeeting ? (
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">
                {helperText}
              </Typography>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Checkbox
                  size="small"
                  checked={slot?.attended ?? false}
                  onChange={() => onToggleAttendance(slotKey)}
                  disabled={busy}
                />
                <Typography variant="body2">Attended</Typography>
              </Stack>
            </Stack>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary">
                {helperText}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={() => {
                  if (isM2) {
                    onCreateM2Meeting();
                    return;
                  }

                  onCreateImplementationMeeting(slotKey);
                }}
                disabled={disableInputs || !newMeetingDates[slotKey]}
                sx={{
                  textTransform: 'none',
                  borderRadius: 1.5,
                  px: 2.5,
                  py: 1,
                  fontWeight: 600,
                }}
              >
                Create
              </Button>
            </>
          )}
        </Stack>
      </Box>
    );
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography
          variant="overline"
          sx={{
            fontWeight: 700,
            letterSpacing: 1,
            color: 'text.secondary',
          }}
        >
          Meetings
        </Typography>
      </Box>

      {meetingSlotsLoading ? (
        <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={20} />
        </Box>
      ) : (
        <Stack spacing={2}>
          {renderSlot('m2', 'M2 meeting')}

          <Stack direction="row" spacing={1} alignItems="center">
            <Divider sx={{ flex: 1 }} />
            <Typography
              variant="overline"
              sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary' }}
            >
              Implementations
            </Typography>
            <Divider sx={{ flex: 1 }} />
          </Stack>

          {renderSlot('impl1', 'Impl 1')}
          {renderSlot('impl2', 'Impl 2')}
          {renderSlot('impl3', 'Impl 3')}
        </Stack>
      )}
    </Stack>
  );
}
