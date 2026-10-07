'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { OpenInNewRounded, RefreshRounded } from '@mui/icons-material';
import type { BookingCoach } from '@/types/implementationWorkspace';
import { getCoachBookingEmbedUrl } from '@/lib/coachBookingEmbed';
import { isCoachBookingConfirmation } from '@/lib/coachBookingConfirmation';

type Props = {
  coach: BookingCoach | null;
  meetingType: 'implementation' | 'business_review';
  memberName?: string | null;
  memberEmail?: string | null;
  onBooked: () => void;
};

function BookingFrame({ url, title, onBooked }: { url: string; title: string; onBooked: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (isCoachBookingConfirmation(event, iframeRef.current?.contentWindow, url)) onBooked();
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [url, onBooked]);
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setSlow(true), 20000);
    return () => window.clearTimeout(timer);
  }, [loading]);
  return <Box sx={{ position: 'relative', minHeight: 600, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
    {loading && !slow && <Stack direction="row" spacing={1} alignItems="center" role="status" sx={{ position: 'absolute', top: 20, left: 20, pointerEvents: 'none' }}><CircularProgress size={18} /><Typography variant="body2" color="text.secondary">Loading calendar…</Typography></Stack>}
    {loading && slow && <Alert severity="info" sx={{ m: 2 }}>The calendar is taking longer to load. You can reload it or open it separately to continue booking.</Alert>}
    <Box component="iframe" ref={iframeRef} src={url} title={title} referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={() => setLoading(false)}
      sx={{ display: 'block', width: '100%', height: 600, border: 0 }} />
  </Box>;
}

export default function CoachBookingCalendar({ coach, meetingType, memberName, memberEmail, onBooked }: Props) {
  const [reload, setReload] = useState(0);
  const role = meetingType === 'business_review' ? 'main coach' : 'implementation coach';
  const label = meetingType === 'business_review' ? 'Business Review' : 'Implementation';
  const embedUrl = getCoachBookingEmbedUrl(coach?.url, memberName, memberEmail);
  if (!coach) return <Alert severity="info">This member has no assigned {role}. Assign one to make their booking calendar available.</Alert>;
  if (!coach.url) return <Alert severity="info">{coach.name} is the member’s {role}, but has no {label.toLowerCase()} booking link saved. An admin can add it in Coach Profiles.</Alert>;

  return <Stack spacing={1.5}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
      <Box><Typography variant="subtitle2" fontWeight={750}>{label} with {coach.name}</Typography><Typography variant="body2" color="text.secondary">Booking for {memberName || 'this member'}. Confirm the member’s details before booking.</Typography></Box>
      <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
        {embedUrl && <Button size="small" startIcon={<RefreshRounded />} onClick={() => setReload(current => current + 1)}>Reload calendar</Button>}
        <Button component="a" href={embedUrl ?? coach.url} target="_blank" rel="noopener noreferrer" size="small" startIcon={<OpenInNewRounded />}>Open calendar separately</Button>
      </Stack>
    </Stack>
    {embedUrl ? <BookingFrame key={`${meetingType}:${coach.coachId}:${embedUrl}:${reload}`} url={embedUrl} title={`${label} booking with ${coach.name}`} onBooked={onBooked} />
      : <Alert severity="info">This booking provider opens in a separate tab. Use the link above to book with {coach.name}.</Alert>}
    {embedUrl && <Typography variant="caption" color="text.secondary">Bookings completed in this form are recorded automatically. Bookings made in a separate tab cannot be confirmed here automatically.</Typography>}
  </Stack>;
}
