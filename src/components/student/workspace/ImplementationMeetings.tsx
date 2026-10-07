'use client';

import { useEffect, useRef } from 'react';
import { Alert, Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { AddRounded, CheckRounded, CircleOutlined, EventNoteRounded, FiberManualRecordRounded, HistoryRounded, ScheduleRounded } from '@mui/icons-material';
import type { ImplementationMeeting, UpcomingBusinessReview } from '@/types/implementationWorkspace';

type Props = {
  meetings: ImplementationMeeting[];
  upcomingBusinessReview: UpcomingBusinessReview | null;
  selectedMeetingId: number | null;
  latestSessionId: string | null;
  disabled: boolean;
  canAdd: boolean;
  onSelect: (meetingId: number) => void;
  onAdd: () => void;
};

export function implementationMeetingStatus(meeting: ImplementationMeeting, latestSessionId: string | null) {
  if (meeting.cancelled) return 'Cancelled';
  if (meeting.session?.status === 'completed') return 'Completed';
  if (meeting.session) return meeting.session.id === latestSessionId ? 'In progress' : 'History';
  return meeting.isFuture ? 'Scheduled' : 'Not started';
}

function cardDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function cardTime(meeting: { startsAt: string | null; timezone: string }) {
  if (!meeting.startsAt) return '';
  try { return new Date(meeting.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: meeting.timezone }); }
  catch { return ''; }
}

export default function ImplementationMeetings({ meetings, upcomingBusinessReview, selectedMeetingId, latestSessionId, disabled, canAdd, onSelect, onAdd }: Props) {
  const selectedCard = useRef<HTMLButtonElement>(null);
  useEffect(() => { selectedCard.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [selectedMeetingId]);
  const sorted = [...meetings].sort((a, b) => a.date.localeCompare(b.date) || (a.startsAt ?? '').localeCompare(b.startsAt ?? '') || a.id - b.id);
  const unfinished = sorted.find(item => item.id !== selectedMeetingId && !item.cancelled && !item.isFuture
    && item.session?.id === latestSessionId && item.session?.status === 'open');
  const groups = [
    { label: 'Past', items: sorted.filter(item => !item.isToday && !item.isFuture), review: null },
    { label: 'Today', items: sorted.filter(item => item.isToday), review: upcomingBusinessReview?.isToday ? upcomingBusinessReview : null },
    { label: 'Upcoming', items: sorted.filter(item => item.isFuture), review: upcomingBusinessReview && !upcomingBusinessReview.isToday ? upcomingBusinessReview : null },
  ].filter(group => group.items.length || group.review);

  return <Box sx={{ mt: 3, p: 2.5, bgcolor: 'rgba(15, 118, 110, 0.035)', borderRadius: 3 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2.5 }}>
      <Box><Typography variant="h6" fontWeight={800}>Meetings</Typography><Typography variant="body2" color="text.secondary">{meetings.length} implementation {meetings.length === 1 ? 'meeting' : 'meetings'} in this cycle{upcomingBusinessReview ? ' · Next Business Review scheduled' : ''}</Typography></Box>
      <Button variant="outlined" startIcon={<AddRounded />} disabled={disabled || !canAdd} onClick={onAdd} sx={{ flexShrink: 0 }}>Add meeting</Button>
    </Stack>
    {groups.length ? <Stack direction="row" spacing={2} sx={{ overflowX: 'auto', pb: 1 }}>
      {groups.map((group, groupIndex) => <Box key={group.label} component="section" aria-label={`${group.label} meetings`} sx={{ flexShrink: 0, pl: groupIndex ? 2 : 0, borderLeft: groupIndex ? 1 : 0, borderColor: 'divider' }}>
        <Typography variant="overline" color={group.label === 'Today' ? 'primary.main' : 'text.secondary'} sx={{ letterSpacing: 1.8 }}>{group.label}</Typography>
        <Stack direction="row" spacing={1.25} sx={{ mt: 0.75 }}>
          {group.items.map(item => {
            const selected = item.id === selectedMeetingId;
            const status = implementationMeetingStatus(item, latestSessionId);
            const StatusIcon = status === 'Completed' ? CheckRounded : status === 'In progress' ? FiberManualRecordRounded : status === 'History' ? HistoryRounded : status === 'Scheduled' ? ScheduleRounded : CircleOutlined;
            return <ButtonBase key={item.id} ref={selected ? selectedCard : undefined} disabled={disabled} onClick={() => onSelect(item.id)} aria-pressed={selected}
              aria-label={`${cardDate(item.date)}, ${new Date(`${item.date}T12:00:00`).getFullYear()}, ${cardTime(item) ? `${cardTime(item)} ${item.timezone}, ` : ''}Implementation meeting, ${status}`}
              sx={{ minWidth: 150, minHeight: 92, p: 1.75, border: '2px solid', borderStyle: item.isFuture && !selected ? 'dashed' : 'solid', borderColor: selected ? 'primary.main' : item.cancelled ? 'error.light' : 'divider', borderRadius: 2,
                bgcolor: selected ? '#0f766e' : 'background.paper', color: selected ? 'primary.contrastText' : 'text.primary', textAlign: 'left', justifyContent: 'flex-start',
                '&:hover': { borderColor: 'primary.main', bgcolor: selected ? '#115e59' : 'action.hover' }, '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.light', outlineOffset: 2 } }}>
              <Box><Typography fontWeight={750}>{cardDate(item.date)}</Typography>{cardTime(item) && <Typography variant="caption">{cardTime(item)}</Typography>}<Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75, color: selected ? 'inherit' : status === 'In progress' ? 'warning.dark' : item.cancelled ? 'error.main' : 'text.secondary' }}><StatusIcon sx={{ fontSize: status === 'In progress' ? 11 : 16 }} /><Typography variant="body2">{status}</Typography></Stack></Box>
            </ButtonBase>;
          })}
          {group.review && <Box sx={{ minWidth: 172, p: 1.75, border: '2px dashed', borderColor: 'primary.light', borderRadius: 2, bgcolor: 'background.paper' }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: 'primary.main', mb: 0.5 }}><EventNoteRounded sx={{ fontSize: 16 }} /><Typography variant="caption" fontWeight={750}>Business Review</Typography></Stack>
            <Typography fontWeight={750}>{cardDate(group.review.date)}</Typography>
            <Typography variant="caption" color="text.secondary">{cardTime(group.review) ? `${cardTime(group.review)} · ${group.review.timezone}` : 'Scheduled · Next cycle'}</Typography>
          </Box>}
        </Stack>
      </Box>)}
    </Stack> : <Typography variant="body2" color="text.secondary">No meetings in this cycle yet.</Typography>}
    {unfinished && <Alert severity="warning" icon={<FiberManualRecordRounded sx={{ fontSize: 12, mt: 0.75 }} />} sx={{ mt: 2 }} action={<Button color="inherit" disabled={disabled} onClick={() => onSelect(unfinished.id)}>Return to meeting</Button>}>
      The meeting from {cardDate(unfinished.date)} is still in progress.
    </Alert>}
  </Box>;
}
