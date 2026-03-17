'use client';

import { Box, Button, Checkbox, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { EventAvailable as EventAvailableIcon } from '@mui/icons-material';
import SectionCard from './SectionCard';
import {
  MEETING_SLOTS,
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
  slotSavingKey,
  onChangeExistingDate,
  onChangeNewDate,
  onCreateImplementationMeeting,
  onCreateM2Meeting,
  onToggleAttendance,
}: MeetingSlotsPanelProps) {
  return (
    <SectionCard icon={<EventAvailableIcon sx={{ fontSize: 20 }} />} title="Meetings">
      {meetingSlotsLoading ? (
        <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={20} />
        </Box>
      ) : (
        <Stack spacing={2}>
          {MEETING_SLOTS.map((config) => {
            const slotKey = config.key;
            const slot = meetingSlots[slotKey];
            const hasMeeting = Boolean(slot);
            const isM2 = slotKey === 'm2';
            const busy =
              meetingSlotsLoading || slotSavingKey === slotKey || attendanceSavingKey === slotKey;
            const dateValue = hasMeeting ? slot?.date ?? '' : newMeetingDates[slotKey];
            const disableInputs = busy || (!isM2 && !m2Exists && !hasMeeting);

            return (
              <Box
                key={slotKey}
                sx={{
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'grey.200',
                  p: 2,
                  bgcolor: 'grey.50',
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
                      {config.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {hasMeeting
                        ? 'Meeting created for this student.'
                        : isM2
                          ? 'No M2 meeting linked yet.'
                          : m2Exists
                            ? 'No implementation meeting in this slot yet.'
                            : 'Create M2 first before scheduling implementations.'}
                    </Typography>
                  </Box>

                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    sx={{ minWidth: { sm: 260 } }}
                  >
                    <TextField
                      label="Date"
                      type="date"
                      size="small"
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
                        minWidth: 160,
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 1.5,
                          bgcolor: 'white',
                        },
                      }}
                    />

                    {hasMeeting ? (
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: { sm: 1 } }}>
                        <Checkbox
                          size="small"
                          checked={slot?.attended ?? false}
                          onChange={() => onToggleAttendance(slotKey)}
                          disabled={busy}
                        />
                        <Typography variant="body2">Attended</Typography>
                      </Stack>
                    ) : (
                      <Button
                        variant="outlined"
                        size="small"
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
                          fontWeight: 600,
                        }}
                      >
                        Create
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </SectionCard>
  );
}
