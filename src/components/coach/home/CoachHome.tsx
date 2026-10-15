'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Container,
  IconButton, Skeleton, Stack, ToggleButton, Tooltip, Typography,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import VideocamRounded from '@mui/icons-material/VideocamRounded';
import CoachShell, { COACH_MAX_WIDTH } from '@/components/coach/CoachShell';
import { brand } from '@/lib/homeTheme';
import { bookingFollowUpQueue, followUpReason, isUpcomingCoachMeeting, weeklyPriorities } from '@/lib/coachHomeView';
import type { CoachHomeMeeting, CoachHomeResponse, CoachHomeSource } from '@/types/coachHome';
import type { BookingFollowUpResponse } from '@/types/bookingFollowUp';

const textButton = { color: brand.turquoiseDeep, fontSize: 12, fontWeight: 500, minWidth: 0, textTransform: 'none' as const };
const heading = { fontSize: 16, fontWeight: 600, lineHeight: 1.35 };
const secondary = { fontSize: 12, color: brand.inkSoft };
const container = { maxWidth: COACH_MAX_WIDTH, px: { xs: 2.5, md: 4 } };

function SourceNotice({ source }: { source: CoachHomeSource }) {
  if (source.status === 'ready') return null;
  return <Alert severity="warning" sx={{ my: 1.5, fontSize: 12 }}>{source.message || 'Some information could not be loaded. Try refreshing.'}</Alert>;
}

function timeLabel(iso: string, timezone: string, format = 'h:mm a') {
  return DateTime.fromISO(iso).setZone(timezone).toFormat(format);
}

function MeetingRow({ meeting, timezone, now }: { meeting: CoachHomeMeeting; timezone: string; now: number }) {
  const [expanded, setExpanded] = useState(false);
  const past = !isUpcomingCoachMeeting(meeting, now);
  const kind = meeting.kind === 'implementation' ? 'Implementation' : 'Business Review';
  const name = meeting.member?.name ?? meeting.title;
  const subtitle = meeting.kind === 'business_review'
    ? meeting.prepSubmitted === null ? 'Member prep unavailable' : meeting.prepSubmitted ? 'Member prep submitted' : 'Awaiting member prep'
    : meeting.prioritiesState === 'unavailable' ? 'Current priorities unavailable' : meeting.priorities.length ? meeting.priorities.map(p => p.label).join(' · ') : 'No current priorities';
  return <Box sx={{ borderBottom: `1px solid ${brand.border}`, opacity: past ? 0.75 : 1 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
      <Box component="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
        aria-label={`${expanded ? 'Hide' : 'Show'} preparation for ${name}`}
        sx={{ display: 'grid', gridTemplateColumns: '76px minmax(0,1fr) 18px', gap: 1.5, alignItems: 'center', flex: 1, minWidth: { xs: '100%', sm: 0 }, color: brand.ink, background: 'none', border: 0, p: 0, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', '&:hover .meeting-name': { color: brand.turquoiseDeep } }}>
        <Box sx={{ fontVariantNumeric: 'tabular-nums' }}><Typography sx={secondary}>{timeLabel(meeting.start, timezone, 'ccc')}</Typography><Typography sx={{ fontSize: 13 }}>{meeting.dateOnly ? 'Time not set' : timeLabel(meeting.start, timezone)}</Typography></Box>
        <Box sx={{ minWidth: 0 }}><Typography className="meeting-name" sx={{ fontSize: 14, fontWeight: 500, transition: 'color .15s' }}>{name}</Typography><Typography sx={{ ...secondary, overflowWrap: 'anywhere', mt: 0.25 }}>{kind}{past ? ' · Earlier' : ''}</Typography><Typography sx={{ ...secondary, mt: 0.5 }}>{subtitle}</Typography></Box>
        <ExpandMoreRounded sx={{ fontSize: 18, color: brand.inkMuted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </Box>
      <Button component={Link} href={meeting.workspaceHref} aria-label={`Open coaching space for ${name}`} endIcon={<ArrowForwardRounded sx={{ fontSize: '14px !important' }} />}
        sx={{ ...textButton, flexShrink: 0, ml: { xs: '88px', sm: 0 } }}>{meeting.member ? 'Open space' : 'Find member'}</Button>
    </Box>
    <Collapse in={expanded} unmountOnExit><Box sx={{ ml: { xs: 0, sm: '88px' }, mb: 2, p: 2, bgcolor: brand.card, borderRadius: 2 }}>
      <Typography sx={{ ...secondary, fontWeight: 600, color: brand.ink, mb: 1 }}>Current Business Review priorities</Typography>
      {meeting.prioritiesState === 'unavailable' ? <Typography sx={secondary}>Priorities could not be loaded. Open the coaching space for the member’s full context.</Typography>
        : meeting.priorities.length ? <Stack spacing={0.75}>{meeting.priorities.map(p => p.guideHref
          ? <Button key={p.id} component={Link} href={p.guideHref} sx={{ ...textButton, justifyContent: 'flex-start', p: 0 }}>{p.label}<OpenInNewRounded sx={{ ml: 0.75, fontSize: 13 }} /></Button>
          : <Typography key={p.id} sx={secondary}>{p.label}</Typography>)}</Stack>
        : <Typography sx={secondary}>There are no priority systems in the current cycle.</Typography>}
      {!meeting.member && <Typography sx={{ ...secondary, mt: 1 }}>This calendar appointment could not be matched to an accessible member.</Typography>}
      <Stack direction="row" useFlexGap flexWrap="wrap" spacing={2} sx={{ mt: 1.5 }}>
        {(meeting.people?.length ?? 0) > 1 && meeting.people!.map((person) => <Button key={person.id} component={Link} href={person.workspaceHref} sx={textButton}>Open {person.name}</Button>)}
        {meeting.member && <Button component={Link} href={`/coach/students-overview?${new URLSearchParams({ userId: meeting.member.id, tab: 'coaching-notes' })}`} sx={textButton}>Coaching history</Button>}
        {meeting.joinUrl && <Button component="a" href={meeting.joinUrl} target="_blank" rel="noopener noreferrer" startIcon={<VideocamRounded />} sx={textButton}>Join call</Button>}
      </Stack>
    </Box></Collapse>
  </Box>;
}

function FollowUpQueue({ refresh }: { refresh: number }) {
  const [report, setReport] = useState<BookingFollowUpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setReport(null);
    void (async () => {
      try {
        const response = await fetch('/api/coach/booking-follow-up', { cache: 'no-store', signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Booking follow-up could not be loaded.');
        if (!controller.signal.aborted) setReport(payload);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Booking follow-up could not be loaded.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [refresh, attempt]);
  const queue = useMemo(() => report ? bookingFollowUpQueue(report) : [], [report]);
  const incomplete = report?.groups.some(group => !group.dataComplete || group.members.some(member => !member.dataComplete));
  return <Box component="section" aria-label="Booking follow-up" sx={{ display: 'flex', flexDirection: 'column', flex: 1, p: 2.25, border: `1px solid ${brand.border}`, borderRadius: 2.5, bgcolor: brand.card }}>
    <Stack direction="row" alignItems="center" spacing={1}><Typography component="h2" sx={heading}>Booking follow-up</Typography>{report && <Typography sx={secondary}>· {queue.length}{incomplete ? '+' : ''}</Typography>}</Stack>
    <Typography sx={{ ...secondary, mt: 0.5 }}>Members needing a booking</Typography>
    {loading && <Stack spacing={1} sx={{ mt: 1.5 }}><Skeleton /><Skeleton /><Skeleton /></Stack>}
    {error && <Alert severity="warning" sx={{ mt: 1.5, fontSize: 12 }} action={<Button color="inherit" size="small" onClick={() => setAttempt(a => a + 1)}>Retry</Button>}>{error}</Alert>}
    {incomplete && <Typography sx={{ ...secondary, mt: 1.5 }}>Some calendar checks are unavailable. The full list shows which members still need checking.</Typography>}
    {!loading && report && !queue.length && <Typography sx={{ ...secondary, my: 2 }}>{incomplete ? 'No confirmed follow-ups to show yet.' : 'Everyone is booked. Paused members are excluded.'}</Typography>}
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {queue.slice(0, 6).map(member => <Box key={member.userId} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, py: 1.25, borderBottom: `1px solid ${brand.border}` }}>
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1.5}>{member.people.map(person => <Button key={person.userId} component={Link} href={`/coach/students-overview?${new URLSearchParams({ userId: person.userId, tab: member.isNewMember ? 'overview' : member.needsImplementation ? 'notes' : 'audit' })}`}
          sx={{ ...textButton, justifyContent: 'flex-start', color: brand.ink, p: 0, textAlign: 'left' }}>{person.name}<ArrowForwardRounded sx={{ fontSize: 13, ml: 0.75 }} /></Button>)}</Stack>
        <Typography sx={{ ...secondary, mt: 0.5 }}>{followUpReason(member)}</Typography>
      </Box>)}
    </Box>
    <Button component={Link} href="/coach/members?view=follow-up" endIcon={<ArrowForwardRounded />} sx={{ ...textButton, alignSelf: 'flex-start', mt: 1.5, p: 0 }}>Open full follow-up list</Button>
  </Box>;
}

export default function CoachHome({ fullSchedule = false }: { fullSchedule?: boolean }) {
  const [timezone, setTimezone] = useState<string | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<CoachHomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [day, setDay] = useState<string | null>(null);
  const [system, setSystem] = useState<number | null>(null);
  const [showEarlier, setShowEarlier] = useState(fullSchedule);
  const [showAllMeetings, setShowAllMeetings] = useState(fullSchedule);
  const [showAllGroups, setShowAllGroups] = useState(fullSchedule);
  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!timezone) return;
    const controller = new AbortController();
    setLoading(true); setError(null); setData(null);
    void (async () => {
      try {
        const query = new URLSearchParams({ tz: timezone }); if (week) query.set('week', week);
        const response = await fetch(`/api/coach/home?${query}`, { cache: 'no-store', signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Your coaching schedule could not be loaded.');
        if (!controller.signal.aborted) setData(payload);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Your coaching schedule could not be loaded.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [week, timezone, refresh]);

  const zone = data?.timezone ?? timezone ?? 'UTC';
  const thisWeek = DateTime.fromMillis(now).setZone(zone).startOf('week').toISODate()!;
  const weekStart = data?.weekStart ?? week ?? thisWeek;
  const weekDate = DateTime.fromISO(weekStart, { zone });
  const currentWeek = weekStart === thisWeek;
  const selectedWeekPast = weekStart < thisWeek;
  const hasImplementation = data?.coach.responsibilities.includes('implementation') ?? false;
  const hasPrimary = data?.coach.responsibilities.includes('primary') ?? false;
  const showFollowUp = hasImplementation && !fullSchedule;
  const hasSidebar = showFollowUp || hasPrimary;
  const roleLabel = hasImplementation && hasPrimary ? 'Coach' : hasImplementation ? 'Implementation coach' : hasPrimary ? 'Momentum coach' : 'Coach';
  const upcoming = useMemo(() => (data?.meetings ?? []).filter(m => isUpcomingCoachMeeting(m, now)), [data, now]);
  const agenda = data ? (showEarlier || selectedWeekPast ? data.meetings : upcoming) : [];
  const preparationMeetings = selectedWeekPast ? data?.meetings ?? [] : upcoming;
  const priorities = weeklyPriorities(preparationMeetings);
  const filtered = agenda.filter(m => (!day || timeLabel(m.start, zone, 'yyyy-MM-dd') === day) && (system === null || m.priorities.some(p => p.id === system)));
  const visibleMeetings = showAllMeetings || day || system !== null ? filtered : filtered.slice(0, 6);
  const next = upcoming[0];
  const scheduleUnavailable = data?.sources.schedule.status === 'unavailable';
  const groups = (data?.groupSessions ?? []).filter(g => Date.parse(g.end ?? g.start) >= now);
  const visibleGroups = showAllGroups ? groups : groups.slice(0, 3);
  const reviewMeetings = preparationMeetings.filter(m => m.kind === 'business_review');
  const prepCounts = { submitted: reviewMeetings.filter(m => m.prepSubmitted === true).length, awaiting: reviewMeetings.filter(m => m.prepSubmitted === false).length, unknown: reviewMeetings.filter(m => m.prepSubmitted === null).length };

  function changeWeek(offset: number) {
    setWeek(weekDate.plus({ weeks: offset }).toISODate()); setDay(null); setSystem(null); setShowAllMeetings(fullSchedule); setShowAllGroups(fullSchedule);
  }

  return <CoachShell coachName={data?.coach.name} roleLabel={roleLabel}>
    <Box component="section" aria-label="Next meeting" sx={{ bgcolor: brand.turquoiseTint, borderBottom: `1px solid ${brand.border}` }}>
      <Container maxWidth={false} sx={container}><Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" spacing={2} sx={{ py: 2.5 }}>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: brand.inkSoft }}>{loading ? 'Your next 1on1' : next ? `${!next.dateOnly && Date.parse(next.start) <= now ? 'In progress' : 'Next 1on1'} · ${timeLabel(next.start, zone, next.dateOnly ? 'ccc d LLL' : 'ccc d LLL, h:mm a')}${next.dateOnly ? ' · Time not set' : ''}` : 'Your coaching week'}</Typography>
          <Typography component="h1" sx={{ fontFamily: '"League Spartan", Arial, sans-serif', fontWeight: 700, fontSize: { xs: 23, md: 27 }, mt: 0.5, lineHeight: 1.2 }}>{loading ? 'Loading your schedule…' : error || scheduleUnavailable ? 'Your schedule is unavailable' : next ? `${next.member?.name ?? next.title} · ${next.kind === 'implementation' ? 'Implementation' : 'Business Review'}` : selectedWeekPast ? 'Review this week’s meetings' : 'No upcoming 1on1s this week'}</Typography>
          {next && <Typography sx={{ ...secondary, mt: 0.75 }}>{next.kind === 'implementation' ? next.prioritiesState === 'unavailable' ? 'Current priorities unavailable' : next.priorities.length ? `Current priorities: ${next.priorities.map(p => p.label).join(' · ')}` : 'No current priority systems' : next.prepSubmitted === null ? 'Open the member workspace to review preparation' : next.prepSubmitted ? 'Member preparation submitted' : 'Awaiting member preparation'}</Typography>}
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ flexShrink: 0 }}>
          {next?.joinUrl && <Button component="a" href={next.joinUrl} target="_blank" rel="noopener noreferrer" startIcon={<VideocamRounded />} sx={{ ...textButton, bgcolor: brand.card, px: 2 }}>Join call</Button>}
          <Button component={Link} href={next?.workspaceHref ?? '/coach/students-overview'} variant="contained" disableElevation endIcon={<ArrowForwardRounded />} sx={{ textTransform: 'none', bgcolor: brand.turquoiseDeep, color: '#fff', fontSize: 13, py: 1.15, px: 2, '&:hover': { bgcolor: brand.turquoiseDark } }}>Open coaching space</Button>
        </Stack>
      </Stack></Container>
    </Box>

    <Container component="main" maxWidth={false} sx={{ ...container, py: { xs: 3, md: 3.5 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
        <Box><Typography component="h2" sx={{ fontFamily: '"League Spartan", Arial, sans-serif', fontSize: 29, fontWeight: 700, lineHeight: 1.2 }}>{fullSchedule ? 'Your schedule' : 'Your week'}</Typography><Typography sx={{ ...secondary, mt: 0.5 }}>{weekDate.toFormat('d LLL')}–{weekDate.plus({ days: 6 }).toFormat('d LLL yyyy')} · {zone.replaceAll('_', ' ')}</Typography><Typography sx={{ ...secondary, mt: 0.5 }}>Bookings update after the daily calendar sync.</Typography></Box>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Tooltip title="Previous week"><IconButton aria-label="Previous week" onClick={() => changeWeek(-1)} disabled={loading}><ChevronLeftRounded /></IconButton></Tooltip>
          <Button onClick={() => { setWeek(thisWeek); setDay(null); setSystem(null); }} disabled={loading || currentWeek} sx={textButton}>This week</Button>
          <Tooltip title="Next week"><IconButton aria-label="Next week" onClick={() => changeWeek(1)} disabled={loading}><ChevronRightRounded /></IconButton></Tooltip>
          <Tooltip title="Refresh schedule"><IconButton aria-label="Refresh schedule" onClick={() => setRefresh(v => v + 1)} disabled={loading}>{loading ? <CircularProgress size={18} /> : <RefreshRounded sx={{ fontSize: 19 }} />}</IconButton></Tooltip>
        </Stack>
      </Stack>
      {error && <Alert severity="error" action={<Button color="inherit" onClick={() => setRefresh(v => v + 1)}>Retry</Button>}>{error}</Alert>}
      {loading && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.8fr 1fr' }, gap: 4 }}><Box>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height={70} />)}</Box><Skeleton variant="rounded" height={250} /></Box>}
      {data && <>
        <SourceNotice source={data.sources.schedule} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: hasSidebar ? 'minmax(0,1.8fr) minmax(280px,1fr)' : 'minmax(0,1fr)' }, gap: { xs: 3, md: 4 } }}>
          <Box component="section" aria-label="One-on-one meetings" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Stack direction="row" alignItems="baseline" spacing={1} flexWrap="wrap"><Typography component="h2" sx={heading}>{selectedWeekPast || showEarlier ? 'This week’s 1on1s' : 'Upcoming 1on1s'}</Typography><Typography sx={secondary}>· {agenda.length}{data.sources.schedule.status !== 'ready' ? ' shown' : ' this week'}</Typography></Stack>
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ my: 1.5 }}>
              {[null, ...Array.from({ length: 7 }, (_, i) => weekDate.plus({ days: i }).toISODate()!)].map(date => <ToggleButton key={date ?? 'all'} value={date ?? 'all'} selected={day === date} onClick={() => setDay(date)} size="small" sx={{ textTransform: 'none', borderRadius: '6px !important', px: 1.2, py: 0.6, fontSize: 12, color: brand.inkSoft, borderColor: brand.border, '&.Mui-selected': { bgcolor: brand.ink, color: '#fff', '&:hover': { bgcolor: brand.slateSoft } } }}>{date ? DateTime.fromISO(date).toFormat('ccc') : 'All'}</ToggleButton>)}
            </Stack>
            {system !== null && <Chip label={`${priorities.find(p => p.id === system)?.label ?? 'System filter'}`} onDelete={() => setSystem(null)} size="small" sx={{ mb: 1.5, bgcolor: brand.turquoiseTint, color: brand.turquoiseDeep, maxWidth: '100%' }} />}
            <Box sx={{ borderTop: `1px solid ${brand.border}` }}>
              {visibleMeetings.map(meeting => <MeetingRow key={meeting.id} meeting={meeting} timezone={zone} now={now} />)}
              {!filtered.length && <Box sx={{ py: 4 }}><Typography sx={{ fontSize: 14 }}>{data.sources.schedule.status === 'unavailable' ? 'Your appointments are temporarily unavailable.' : day || system !== null ? 'No meetings match this selection.' : selectedWeekPast ? 'No 1on1s recorded for this week.' : 'No more 1on1s scheduled for this week.'}</Typography>{(day || system !== null) && <Button onClick={() => { setDay(null); setSystem(null); }} sx={{ ...textButton, mt: 1 }}>Clear filters</Button>}</Box>}
            </Box>
            <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="space-between" spacing={1} sx={{ mt: 'auto', pt: 1.25 }}>
              {!showAllMeetings && !day && system === null && filtered.length > 6 && <Button onClick={() => setShowAllMeetings(true)} sx={textButton}>Show all {filtered.length} meetings</Button>}
              {currentWeek && data.meetings.length > upcoming.length && <Button onClick={() => setShowEarlier(v => !v)} sx={textButton}>{showEarlier ? 'Hide earlier meetings' : `Show ${data.meetings.length - upcoming.length} earlier meetings`}</Button>}
              {!fullSchedule && <Button component={Link} href="/coach/schedule" endIcon={<ArrowForwardRounded />} sx={textButton}>Full schedule</Button>}
            </Stack>
          </Box>
          {hasSidebar && <Stack component="aside" spacing={3}>
            {showFollowUp && <FollowUpQueue refresh={refresh} />}
            {hasPrimary && <Box component="section" aria-label="Business Review preparation"><Typography component="h2" sx={heading}>Business Review prep</Typography><Typography sx={{ ...secondary, mt: 0.5 }}>For this week’s {reviewMeetings.length} {reviewMeetings.length === 1 ? 'review' : 'reviews'}</Typography>{[['Prep submitted', prepCounts.submitted], ['Awaiting member prep', prepCounts.awaiting], ...(prepCounts.unknown ? [['Prep unavailable', prepCounts.unknown]] : [])].map(([label, count]) => <Stack key={label} direction="row" justifyContent="space-between" sx={{ py: 1.3, borderBottom: `1px solid ${brand.border}` }}><Typography sx={{ fontSize: 13 }}>{label}</Typography><Typography sx={secondary}>{count}</Typography></Stack>)}</Box>}
          </Stack>}
        </Box>
        {(hasImplementation || priorities.length > 0) && <Box component="section" aria-label="Systems to prepare" sx={{ mt: 3.5, pt: 2.5, borderTop: `1px solid ${brand.border}` }}>
          <Typography component="h2" sx={heading}>Systems to prepare</Typography><Typography sx={{ ...secondary, mt: 0.5, mb: 1 }}>Current priorities across {selectedWeekPast ? 'this week’s' : 'upcoming'} members</Typography>
          <SourceNotice source={data.sources.priorities} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2,minmax(0,1fr))', md: 'repeat(3,minmax(0,1fr))' }, columnGap: 3 }}>
            {priorities.map(priority => <Box key={priority.id} sx={{ borderBottom: `1px solid ${brand.border}`, py: 1.15 }}>
              <Box component="button" aria-pressed={system === priority.id} onClick={() => { setSystem(v => v === priority.id ? null : priority.id); setDay(null); }} sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, width: '100%', textAlign: 'left', fontFamily: 'inherit', border: 0, p: 0, background: 'none', color: system === priority.id ? brand.turquoiseDeep : brand.ink, cursor: 'pointer' }}><Typography component="span" sx={{ fontSize: 13, fontWeight: system === priority.id ? 600 : 400 }}>{priority.label}</Typography><Typography component="span" sx={{ ...secondary, whiteSpace: 'nowrap' }}>{priority.memberIds.length} {priority.memberIds.length === 1 ? 'member' : 'members'}</Typography></Box>
              {priority.guideHref && <Button component={Link} href={priority.guideHref} endIcon={<OpenInNewRounded sx={{ fontSize: '12px !important' }} />} sx={{ ...textButton, fontSize: 11, mt: 0.5, p: 0 }}>Open guide</Button>}
            </Box>)}
          </Box>
          {!priorities.length && <Typography sx={{ ...secondary, py: 2 }}>{preparationMeetings.length ? 'No current priority systems are available for these meetings.' : 'Priority systems will appear when members have meetings in this week.'}</Typography>}
        </Box>}
        <Box component="section" aria-label="All group sessions" sx={{ mt: 3.5, pt: 2.5, borderTop: `1px solid ${brand.border}` }}>
          <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="baseline" useFlexGap flexWrap="wrap"><Typography component="h2" sx={heading}>All group sessions <Typography component="span" sx={secondary}>· Next 30 days</Typography></Typography><Button component="a" href={data.groupCalendarUrl} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRounded sx={{ fontSize: '13px !important' }} />} sx={textButton}>Programme calendar</Button></Stack>
          <SourceNotice source={data.sources.groups} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))', md: 'repeat(3,minmax(0,1fr))' }, gap: 2.5, mt: 1.5 }}>
            {visibleGroups.map(group => <Box key={group.id} sx={{ minWidth: 0 }}><Typography sx={{ ...secondary, fontVariantNumeric: 'tabular-nums' }}>{timeLabel(group.start, zone, 'ccc d LLL · h:mm a')}{group.end ? ` – ${timeLabel(group.end, zone)}` : ''}</Typography><Typography sx={{ fontSize: 14, fontWeight: 500, my: 0.5 }}>{group.title}</Typography><Typography sx={secondary}>{group.audience}</Typography>{(group.detailsUrl || group.joinUrl) && <Button component="a" href={group.detailsUrl || group.joinUrl!} target="_blank" rel="noopener noreferrer" sx={{ ...textButton, p: 0, mt: 0.75 }} endIcon={<OpenInNewRounded sx={{ fontSize: '12px !important' }} />}>Session details</Button>}</Box>)}
          </Box>
          {!groups.length && data.sources.groups.status === 'ready' && <Typography sx={{ ...secondary, py: 2 }}>No group sessions listed for the next 30 days.</Typography>}
          {!showAllGroups && groups.length > 3 && <Button onClick={() => setShowAllGroups(true)} sx={{ ...textButton, mt: 2 }}>Show all {groups.length} group sessions</Button>}
        </Box>
      </>}
      {fullSchedule && <Button component={Link} href="/coach" startIcon={<ArrowBackRounded />} sx={{ ...textButton, mt: 3 }}>Back to coach home</Button>}
    </Container>
  </CoachShell>;
}
