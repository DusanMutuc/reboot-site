'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, CircularProgress, Collapse, InputAdornment, Skeleton, Stack, TextField, Typography } from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { brand } from '@/lib/homeTheme';
import { bookingFollowUpQueue, followUpReason } from '@/lib/coachHomeView';
import type { BookingFollowUpMember, BookingFollowUpResponse, BookingMeetingSummary } from '@/types/bookingFollowUp';

type Props = {
  businessReviewOnly?: boolean;
  report: BookingFollowUpResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onRetry: () => void;
};

const textButtonSx = { minHeight: 38, minWidth: 0, px: 0.5, py: 0.5, fontSize: 12, color: brand.turquoiseDeep };

function date(meeting: BookingMeetingSummary) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(meeting.start));
}

function recency(meeting: BookingMeetingSummary | null) {
  if (!meeting) return 'No meetings yet';
  if (meeting.daysAgo === 0) return 'Today';
  if (meeting.daysAgo === 1) return '1 day ago';
  return meeting.daysAgo == null ? date(meeting) : `${meeting.daysAgo} days ago`;
}

function workspaceHref(userId: string, member: BookingFollowUpMember, history = false, businessReviewOnly = false) {
  const tab = history ? 'coaching-notes' : businessReviewOnly ? 'audit' : member.isNewMember ? 'overview' : member.needsImplementation ? 'notes' : member.needsM2 ? 'audit' : 'overview';
  return `/coach/students-overview?${new URLSearchParams({ userId, courseId: '2', tab })}`;
}

function LastMeeting({ label, meeting, children }: { label: string; meeting: BookingMeetingSummary | null; children?: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 12, color: brand.inkSoft, mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{recency(meeting)}</Typography>
      {meeting ? <Typography sx={{ fontSize: 12, color: brand.inkSoft, mt: 0.5 }}>{date(meeting)}<br />{meeting.coachName}</Typography> : null}
      {children}
    </Box>
  );
}

function MemberFollowUp({ member, businessReviewOnly = false }: { member: BookingFollowUpMember; businessReviewOnly?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const detailId = `booking-details-${member.userId}`;
  const people = member.people.length ? member.people : [{ userId: member.userId, name: member.name, email: member.email }];
  const secondary = businessReviewOnly ? `Last Business Review · ${recency(member.lastM2)}` : member.isNewMember ? 'No coaching history yet' : member.needsImplementation && !member.needsM2
    ? `Last implementation · ${recency(member.lastImplementation)}`
    : `Last Business Review · ${recency(member.lastM2)}`;

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopyMessage('Email copied.');
    } catch {
      setCopyMessage('The email could not be copied. Select the address to copy it.');
    }
  };

  return (
    <Box component="article" sx={{ borderBottom: `1px solid ${brand.border}` }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', md: 'minmax(170px, 1fr) minmax(0, 1.65fr) auto' }, gap: { xs: 1, md: 3 }, alignItems: 'center', py: 2.5 }}>
        <Button onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls={detailId}
          sx={{ textAlign: 'left', justifyContent: 'flex-start', p: 0, minWidth: 0, minHeight: 38, color: brand.ink, gap: 1, '&:hover': { bgcolor: 'transparent', color: brand.turquoiseDeep } }}>
          <ExpandMoreRoundedIcon sx={{ fontSize: 19, flexShrink: 0, color: brand.inkSoft, transform: expanded ? 'rotate(180deg)' : 'none' }} />
          <Box component="span" sx={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{member.name}{member.isNewMember ? <Box component="span" sx={{ display: 'block', color: brand.turquoiseDeep, fontSize: 12, fontWeight: 400 }}>New member</Box> : null}</Box>
        </Button>
        <Box sx={{ gridColumn: { xs: 1, md: 'auto' }, gridRow: { xs: 2, md: 'auto' }, pl: { xs: 3.25, md: 0 }, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{followUpReason(member, businessReviewOnly)}</Typography>
          <Typography sx={{ fontSize: 12, color: brand.inkSoft, mt: 0.5 }}>{secondary}</Typography>
        </Box>
        <Stack alignItems="flex-end" sx={{ gridColumn: { xs: 2, md: 'auto' }, gridRow: { xs: '1 / span 2', md: 'auto' }, maxWidth: { xs: 125, md: 180 } }}>
          {people.map((person) => <Button key={person.userId} component={Link} href={workspaceHref(person.userId, member, false, businessReviewOnly)} aria-label={`Open ${person.name}'s coaching space`} endIcon={<ArrowForwardRoundedIcon />} sx={{ ...textButtonSx, textAlign: 'right' }}>{people.length > 1 ? `Open ${person.name}` : 'Open space'}</Button>)}
        </Stack>
      </Box>
      <Collapse in={expanded}>
        <Box id={detailId} sx={{ bgcolor: brand.card, borderRadius: '10px', p: { xs: 2, sm: 2.5 }, ml: { xs: 0, md: 3.25 }, mb: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2.5, mb: 2 }}>
            <LastMeeting label="Last implementation" meeting={member.lastImplementation}>
              <Typography sx={{ fontSize: 12, color: brand.inkSoft, mt: 0.5 }}>{member.implementationCycleComplete ? 'Implementation cycle complete · Business Review is next' : `${member.implementationsSinceLastM2} implementation${member.implementationsSinceLastM2 === 1 ? '' : 's'} in the current cycle`}</Typography>
            </LastMeeting>
            <LastMeeting label="Last Business Review" meeting={member.lastM2} />
            <Box><Typography sx={{ fontSize: 12, color: brand.inkSoft, mb: 0.5 }}>Upcoming</Typography>
              {member.upcomingImplementation ? <Box sx={{ mb: 1 }}><Typography sx={{ fontSize: 14, fontWeight: 600 }}>Implementation</Typography><Typography sx={{ fontSize: 12, color: brand.inkSoft }}>{date(member.upcomingImplementation)}<br />{member.upcomingImplementation.coachName}</Typography></Box> : null}
              {member.upcomingM2 ? <Box><Typography sx={{ fontSize: 14, fontWeight: 600 }}>Business Review</Typography><Typography sx={{ fontSize: 12, color: brand.inkSoft }}>{date(member.upcomingM2)}<br />{member.upcomingM2.coachName}</Typography></Box> : null}
              {!member.upcomingImplementation && !member.upcomingM2 ? <Typography sx={{ fontSize: 14, fontWeight: 600 }}>No upcoming meetings</Typography> : null}
            </Box>
          </Box>
          <Stack spacing={1} sx={{ borderTop: `1px solid ${brand.border}`, pt: 1.5 }}>
            {people.map((person) => <Box key={person.userId} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography sx={{ color: brand.inkSoft, fontSize: 12, overflowWrap: 'anywhere' }}>{people.length > 1 ? `${person.name} · ` : ''}{person.email ?? 'No email available'}</Typography>
              <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
                {person.email ? <Button onClick={() => void copyEmail(person.email!)} sx={textButtonSx}>Copy email</Button> : null}
                <Button component={Link} href={workspaceHref(person.userId, member, true)} endIcon={<ArrowForwardRoundedIcon />} sx={textButtonSx}>Coaching history</Button>
              </Stack>
            </Box>)}
            {copyMessage ? <Typography role="status" sx={{ fontSize: 12, color: brand.inkSoft }}>{copyMessage}</Typography> : null}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

export default function CoachBookingFollowUp({ report, loading, refreshing, error, onRefresh, onRetry, businessReviewOnly = false }: Props) {
  const [query, setQuery] = useState('');
  const queue = useMemo(() => report ? bookingFollowUpQueue(report, businessReviewOnly) : [], [report, businessReviewOnly]);
  const warnings = useMemo(() => report?.groups.flatMap((group) => {
    if (!group.dataComplete || group.dataWarning) return [`${group.coachName}: ${group.dataWarning ?? 'Booking information could not be checked.'}`];
    return group.members.filter((member) => !member.dataComplete).map((member) => `${member.name}: ${member.dataWarning ?? 'Booking information could not be checked.'}`);
  }) ?? [], [report]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const members = queue.filter((member) => member.name.toLocaleLowerCase().includes(normalizedQuery) || member.people.some((person) => person.name.toLocaleLowerCase().includes(normalizedQuery) || person.email?.toLocaleLowerCase().includes(normalizedQuery)));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2.5 }}>
        <Box sx={{ flex: 1, minWidth: 140 }}><Typography component="h2" sx={{ fontFamily: 'Poppins, Arial, sans-serif', fontSize: 18, fontWeight: 600 }}>{loading || error ? 'Booking follow-up' : `${queue.length} booking follow-up${queue.length === 1 ? '' : 's'}`}</Typography><Typography sx={{ color: brand.inkSoft, fontSize: 12, mt: 0.5 }}>Expand a member for the full context.</Typography></Box>
        <TextField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a member" size="small" slotProps={{ htmlInput: { 'aria-label': 'Search booking follow-up members' }, input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 19, color: brand.inkSoft }} /></InputAdornment> } }} sx={{ width: { xs: '100%', sm: 220 }, order: { xs: 3, sm: 0 }, '& input': { fontSize: 14, py: 1.25 } }} />
        <Button variant="outlined" disabled={loading || refreshing} onClick={onRefresh} startIcon={refreshing ? <CircularProgress size={15} color="inherit" /> : <RefreshRoundedIcon />} sx={{ ...textButtonSx, px: 1.5, borderColor: brand.border }}>Refresh</Button>
      </Box>
      {loading ? <Stack spacing={1.5} aria-label="Loading booking follow-up">{[0, 1, 2].map((key) => <Skeleton key={key} variant="rounded" height={76} />)}</Stack> : error ? <Alert severity="error" action={<Button color="inherit" size="small" onClick={onRetry}>Try again</Button>}>{error}</Alert> : !report || !report.groups.length ? <Alert severity="info">No active coach roster assignments were found.</Alert> : <>
        {warnings.length ? <Alert severity="warning" sx={{ mb: 2 }}>Some booking information could not be checked. These members are excluded from follow-up until their bookings can be confirmed.{[...new Set(warnings)].map((warning) => <Typography key={warning} sx={{ fontSize: 12, mt: 0.75 }}>{warning}</Typography>)}</Alert> : null}
        {businessReviewOnly && <Typography sx={{ color: brand.inkSoft, fontSize: 12, mb: 1.5 }}>Your roster members without their next Business Review booked.</Typography>}
        {members.length ? <Box sx={{ borderTop: `1px solid ${brand.border}` }}>{members.map((member) => <MemberFollowUp key={member.userId} member={member} businessReviewOnly={businessReviewOnly} />)}</Box> : <Typography sx={{ color: brand.inkSoft, fontSize: 14, py: 3 }}>{normalizedQuery ? 'No members matched your search.' : warnings.length ? 'No confirmed booking follow-ups were found in the available data.' : 'All checked members have their bookings covered.'}</Typography>}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mt: 2 }}><Typography sx={{ color: brand.inkSoft, fontSize: 12 }}>Last checked {new Date(report.generatedAt).toLocaleString()} · Paused members are excluded</Typography><Typography sx={{ color: brand.inkSoft, fontSize: 12 }} role="status">{normalizedQuery ? `${members.length} of ${queue.length}` : queue.length} follow-up{queue.length === 1 ? '' : 's'}</Typography></Box>
      </>}
    </Box>
  );
}
