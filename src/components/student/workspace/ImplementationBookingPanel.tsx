'use client';

import { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { EventAvailableRounded } from '@mui/icons-material';
import type { ImplementationMeeting, ImplementationWorkspaceResponse } from '@/types/implementationWorkspace';
import { getImplementationNextMeeting } from '@/lib/implementationNextMeeting';
import CoachBookingCalendar from './CoachBookingCalendar';
import useBookingConfirmation from './useBookingConfirmation';
import type { BookingConfirmationTarget } from '@/lib/implementationBookingConfirmation';

type BookingType = 'implementation' | 'business_review';

type Props = {
  userId: string;
  noteId: number;
  meeting: ImplementationMeeting;
  recommendation: ReturnType<typeof getImplementationNextMeeting>;
  bookingCoaches: ImplementationWorkspaceResponse['bookingCoaches'];
  memberName?: string | null;
  memberEmail?: string | null;
  disabled: boolean;
  onConfirmBooking: (target: BookingConfirmationTarget) => Promise<'saved' | 'waiting_for_session' | 'busy'>;
};

function appointmentDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function appointmentTime(meeting: { startsAt: string | null; timezone: string }) {
  if (!meeting.startsAt) return '';
  try { return ` · ${new Date(meeting.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: meeting.timezone })} ${meeting.timezone}`; }
  catch { return ''; }
}

export default function ImplementationBookingPanel({ userId, noteId, meeting, recommendation, bookingCoaches, memberName, memberEmail, disabled, onConfirmBooking }: Props) {
  const [bookingOverride, setBookingOverride] = useState<BookingType | null>(null);
  const recommendedType = recommendation?.type ?? 'implementation';
  const bookingType = bookingOverride ?? recommendedType;
  const coach = bookingType === 'business_review' ? bookingCoaches?.businessReview ?? null : bookingCoaches?.implementation ?? null;
  const confirmation = useBookingConfirmation({
    target: { userId, noteId, meetingId: meeting.id, sessionId: meeting.session?.id ?? null },
    booked: meeting.session?.nextMeetingBooked ?? false, cancelled: meeting.cancelled,
    disabled, onSave: onConfirmBooking,
  });
  const scheduled = recommendation?.scheduledMeeting;
  const appointmentName = recommendation?.type === 'business_review' ? 'Business Review' : 'implementation meeting';
  return <Paper component="section" aria-labelledby="next-meeting-booking-title" variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={3}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <EventAvailableRounded sx={{ color: '#0f766e', mt: 0.25 }} />
        <Box><Typography id="next-meeting-booking-title" variant="h6" fontWeight={800}>Book for next meeting</Typography>
          <Typography variant="body2" sx={{ mt: 0.75 }}>{meeting.cancelled ? 'Booking status for this cancelled meeting.' : `Recommended next: ${recommendation?.label ?? appointmentName}.`}</Typography>
          {scheduled ? <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{recommendation?.label} on the calendar: {appointmentDate(scheduled.date)}{appointmentTime(scheduled)}. Confirm the booking with the member.</Typography>
            : !meeting.cancelled && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{recommendation?.type === 'business_review' ? 'This cycle is ready for its next Business Review.' : 'Continue working through this cycle’s priorities together.'}</Typography>}
        </Box>
      </Stack>
    </Stack>
    {!meeting.cancelled && <Stack spacing={2} sx={{ mt: 2.5 }}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <ToggleButtonGroup exclusive disabled={disabled} value={bookingType} onChange={(_, value: BookingType | null) => { if (value) setBookingOverride(value); }} aria-label="Meeting type to book" size="small">
          <ToggleButton value="implementation">Implementation</ToggleButton>
          <ToggleButton value="business_review">Business Review</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary">Recommended: {recommendedType === 'business_review' ? 'Business Review' : 'Implementation'}. You can book either meeting type.</Typography>
        {bookingOverride !== null && <Button size="small" disabled={disabled} onClick={() => setBookingOverride(null)}>Use recommendation</Button>}
      </Stack>
    </Stack>}
    {!meeting.cancelled && <Box sx={{ mt: 2 }}><CoachBookingCalendar key={bookingType}
      coach={coach} meetingType={bookingType} memberName={memberName} memberEmail={memberEmail} onBooked={confirmation.confirm} /></Box>}
    {confirmation.error && <Alert severity="warning" sx={{ mt: 1.5 }} action={<Button color="inherit" disabled={disabled || confirmation.saving} onClick={confirmation.retry}>Retry saving</Button>}>{confirmation.error}</Alert>}
    {confirmation.cancelledConfirmation ? <Alert severity="info" sx={{ mt: 1.5 }}>GHL confirmed the booking. This cancelled implementation meeting cannot be updated.</Alert>
      : confirmation.waitingForSession && <Alert severity="info" sx={{ mt: 1.5 }}>GHL confirmed the booking. Its confirmation will be saved when you start this implementation meeting.</Alert>}
  </Paper>;
}
