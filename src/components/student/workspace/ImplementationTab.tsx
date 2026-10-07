'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox,
  Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, FormControl, FormControlLabel, InputLabel,
  LinearProgress, Link, MenuItem, Paper, Select, Skeleton, Stack, TextField, Typography,
} from '@mui/material';
import {
  AddRounded, CheckCircleRounded, CheckRounded, ExpandMoreRounded, FlagRounded,
  HistoryRounded, OpenInNewRounded, PlayArrowRounded,
} from '@mui/icons-material';
import CoachResourceSuggestionPanel from '@/components/coach/coaching-notes/CoachResourceSuggestionPanel';
import UserWinsPanel from '@/components/coach/UserWinsPanel';
import ImplementationMeetings, { implementationMeetingStatus } from './ImplementationMeetings';
import ImplementationBookingPanel from './ImplementationBookingPanel';
import { implementationLocalDate } from '@/lib/implementationMeetingSelection';
import { getImplementationNextMeeting } from '@/lib/implementationNextMeeting';
import { saveImplementationBookingConfirmation, type BookingConfirmationTarget } from '@/lib/implementationBookingConfirmation';
import type {
  ImplementationAction, ImplementationMeeting, ImplementationOperation, ImplementationWorkspaceResponse,
} from '@/types/implementationWorkspace';

type NavigationGuard = (run: () => void) => void;
type Props = {
  selectedStudentId: string;
  studentName?: string | null;
  studentEmail?: string | null;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
};
type NotesDraft = { notes: string; commitments: string };
const EMPTY_NOTES: NotesDraft = { notes: '', commitments: '' };

class WorkspaceError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function readResponse(response: Response): Promise<ImplementationWorkspaceResponse> {
  if (response.redirected || response.status === 401) throw new WorkspaceError('Your session expired. Sign in again; your unsaved notes are still here.', 401);
  if (response.status === 503) throw new WorkspaceError('The new implementation workspace is not ready in this environment yet. Apply the database update, then reload.', 503);
  let body;
  try { body = await response.json(); }
  catch { throw new WorkspaceError('The server could not confirm the request. Please try again.', response.status); }
  if (!response.ok) throw new WorkspaceError(typeof body?.error === 'string' ? body.error : 'Unable to update the meeting.', response.status);
  return body as ImplementationWorkspaceResponse;
}
function shortDate(date: string) {
  const value = new Date(`${date.slice(0, 10)}T12:00:00`);
  return Number.isNaN(value.getTime()) ? date : value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function previousDate(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}
function meetingTime(meeting: ImplementationMeeting) {
  if (!meeting.startsAt) return '';
  try { return new Date(meeting.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: meeting.timezone }); }
  catch { return ''; }
}
function meetingPosition(meeting: ImplementationMeeting) {
  return meeting.cancelled ? 'Cancelled' : meeting.isToday ? 'Today' : meeting.isFuture ? 'Upcoming' : 'Past meeting';
}
function meetingNotes(meeting: ImplementationMeeting | null | undefined): NotesDraft {
  return { notes: meeting?.session?.notes ?? '', commitments: meeting?.session?.commitments ?? '' };
}
function notesEqual(left: NotesDraft, right: NotesDraft) { return left.notes === right.notes && left.commitments === right.commitments; }
function orderedActions(actions: ImplementationAction[]) {
  return [...actions].sort((left, right) => (left.priorityPosition ?? 999) - (right.priorityPosition ?? 999) || left.actionStepId - right.actionStepId);
}

export default function ImplementationTab({ selectedStudentId, studentName, studentEmail, onNavigationGuardChange }: Props) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<ImplementationWorkspaceResponse | null>(null);
  const [meetingId, setMeetingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<NotesDraft>(EMPTY_NOTES);
  const [baseline, setBaseline] = useState<NotesDraft>(EMPTY_NOTES);
  const [expandedActions, setExpandedActions] = useState<number[]>([]);
  const [previousNotesOpen, setPreviousNotesOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ImplementationOperation | 'create_meeting' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [latestNotes, setLatestNotes] = useState<NotesDraft | null>(null);
  const [discardAction, setDiscardAction] = useState<{ run: () => void } | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [completeAction, setCompleteAction] = useState<ImplementationAction | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [meetingDate, setMeetingDate] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const createRequest = useRef<{ noteId: number; date: string; requestId: string } | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const workspaceRef = useRef<ImplementationWorkspaceResponse | null>(null);
  const meetingIdRef = useRef<number | null>(null);
  const draftRef = useRef(draft);
  const baselineRef = useRef(baseline);
  const busyRef = useRef(false);
  const protection = useRef(false);
  const userRef = useRef(selectedStudentId);
  draftRef.current = draft; baselineRef.current = baseline; userRef.current = selectedStudentId;
  const notesDirty = !notesEqual(draft, baseline);
  protection.current = notesDirty || !!busy;

  const meeting = workspace?.meetings.find((item) => item.id === meetingId) ?? null;
  const session = meeting?.session ?? null;
  const cycle = workspace?.cycles.find((item) => item.noteId === workspace.selectedNoteId) ?? null;
  const isLatest = !!session && session.id === workspace?.latestSessionId;
  const editable = !!meeting && !meeting.cancelled && isLatest && session?.status === 'open';
  const disabled = !!busy || loading || conflict;
  const createDateInvalid = !!cycle && !!meetingDate && (meetingDate < cycle.cycleDate
    || (!!workspace?.cycleEndDate && meetingDate >= workspace.cycleEndDate));
  const actions = useMemo(() => orderedActions(session?.actions ?? workspace?.actions ?? []), [session?.actions, workspace?.actions]);
  const resources = useMemo(() => new Map(workspace?.resources.map((item) => [item.id, item]) ?? []), [workspace?.resources]);
  const previousMeeting = useMemo(() => {
    if (!workspace || !meeting) return null;
    const ordered = [...workspace.meetings].sort((left, right) => left.date.localeCompare(right.date)
      || (left.startsAt ?? '').localeCompare(right.startsAt ?? '') || left.id - right.id);
    return ordered.slice(0, ordered.findIndex((item) => item.id === meeting.id)).reverse().find((item) => item.session && !item.cancelled) ?? null;
  }, [workspace, meeting]);
  const completedToday = actions.flatMap((action) => action.steps.filter((step) => action.progress[step.id]?.completed && action.progress[step.id]?.meetingId === meeting?.id)
    .map((step) => ({ title: step.title, key: `${action.actionStepId}:${step.id}` })));
  const nextMeeting = getImplementationNextMeeting({ selectedMeeting: meeting, meetings: workspace?.meetings ?? [],
    upcomingBusinessReview: workspace?.upcomingBusinessReview ?? null, cycleStartDate: cycle?.cycleDate, cycleEndDate: workspace?.cycleEndDate });

  const hydrate = useCallback((next: ImplementationWorkspaceResponse, selectedId: number | null, replaceDraft: boolean) => {
    const nextMeeting = next.meetings.find((item) => item.id === selectedId) ?? null;
    const nextNotes = meetingNotes(nextMeeting);
    const hasLocalNotes = !notesEqual(draftRef.current, baselineRef.current);
    workspaceRef.current = next; meetingIdRef.current = selectedId;
    setWorkspace(next); setMeetingId(selectedId);
    if (replaceDraft || !hasLocalNotes) {
      setDraft(nextNotes); draftRef.current = nextNotes; setLatestNotes(null);
    } else if (!notesEqual(nextNotes, baselineRef.current)) setLatestNotes(nextNotes);
    setBaseline(nextNotes); baselineRef.current = nextNotes;
    if (replaceDraft) {
      setPreviousNotesOpen(false);
      const nextActions = orderedActions(nextMeeting?.session?.actions ?? next.actions);
      const first = nextActions.find((action) => action.status !== 'complete') ?? nextActions[0];
      setExpandedActions(first ? [first.actionStepId] : []);
    }
  }, []);

  const load = useCallback(async (noteId?: number | null, chooseSuggested = false, showLoading = false) => {
    if (busyRef.current) return;
    requestController.current?.abort();
    const controller = new AbortController(); requestController.current = controller;
    const sequence = ++requestSequence.current;
    const userId = userRef.current;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ userId });
      if (noteId !== undefined && noteId !== null) query.set('noteId', String(noteId));
      const response = await fetch(`/api/implementation-workspace?${query}`, { cache: 'no-store', signal: controller.signal });
      const next = await readResponse(response);
      if (controller.signal.aborted || sequence !== requestSequence.current || userId !== userRef.current) return;
      const selectedId = chooseSuggested || meetingIdRef.current === null ? next.suggestedMeetingId ?? next.meetings.find((item) => !item.cancelled)?.id ?? null : meetingIdRef.current;
      hydrate(next, selectedId, chooseSuggested); setConflict(false);
    } catch (caught) {
      if (!controller.signal.aborted && sequence === requestSequence.current) setError(caught instanceof Error ? caught.message : 'Unable to load implementation meetings.');
    } finally { if (sequence === requestSequence.current && !controller.signal.aborted) setLoading(false); }
  }, [hydrate]);

  useEffect(() => {
    setWorkspace(null); workspaceRef.current = null; meetingIdRef.current = null;
    setMeetingId(null); setDraft(EMPTY_NOTES); draftRef.current = EMPTY_NOTES;
    setBaseline(EMPTY_NOTES); baselineRef.current = EMPTY_NOTES;
    setMessage(null); setConflict(false); setLatestNotes(null);
    setCreateOpen(false); setCreateError(null); createRequest.current = null;
    void load(undefined, true, true);
    return () => { requestController.current?.abort(); requestSequence.current += 1; };
  }, [selectedStudentId, load]);

  const leave = useCallback<NavigationGuard>((run) => {
    if (busyRef.current) { setError('Please wait for the current update to finish.'); return; }
    if (protection.current) setDiscardAction({ run }); else run();
  }, []);
  useEffect(() => {
    onNavigationGuardChange?.(leave);
    return () => onNavigationGuardChange?.(null);
  }, [leave, onNavigationGuardChange]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!protection.current) return;
      event.preventDefault(); event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      if (!protection.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      event.preventDefault(); event.stopPropagation();
      leave(() => {
        if (destination.origin === window.location.origin) router.push(`${destination.pathname}${destination.search}${destination.hash}`);
        else window.location.assign(destination.href);
      });
    };
    const pageUrl = window.location.href; const pageState = window.history.state;
    const popstate = (event: PopStateEvent) => {
      if (!protection.current) return;
      event.stopImmediatePropagation(); window.history.pushState(pageState, '', pageUrl);
      leave(() => window.history.back());
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', click, true);
    window.addEventListener('popstate', popstate, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', click, true);
      window.removeEventListener('popstate', popstate, true);
    };
  }, [leave, router]);

  const mutate = async (operation: ImplementationOperation, payload: Record<string, unknown> = {}) => {
    const current = workspaceRef.current;
    const currentMeeting = current?.meetings.find((item) => item.id === meetingIdRef.current);
    if (!current || !currentMeeting || current.selectedNoteId === null || busyRef.current) return false;
    busyRef.current = true; protection.current = true;
    requestController.current?.abort();
    const sequence = ++requestSequence.current; const userId = userRef.current;
    setBusy(operation); setError(null); setMessage(null);
    try {
      const response = await fetch('/api/implementation-workspace', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, noteId: current.selectedNoteId, meetingId: currentMeeting.id, operation, expectedRevision: currentMeeting.session?.revision ?? 0, payload }),
      });
      const next = await readResponse(response);
      if (sequence !== requestSequence.current || userId !== userRef.current) return false;
      const savedMeeting = next.meetings.find((item) => item.id === currentMeeting.id);
      // A progress save must not move the coach to another meeting or replace typed notes.
      if (operation === 'save_notes') {
        const savedNotes = meetingNotes(savedMeeting);
        draftRef.current = savedNotes; baselineRef.current = savedNotes;
        setDraft(savedNotes); setBaseline(savedNotes); setLatestNotes(null);
      }
      hydrate(next, currentMeeting.id, false);
      if (operation === 'start') {
        const first = orderedActions(savedMeeting?.session?.actions ?? next.actions).find((action) => action.status !== 'complete');
        if (first) setExpandedActions([first.actionStepId]);
      }
      if (operation === 'toggle_step' && payload.completed === true && !currentMeeting.attended && savedMeeting?.attended) setMessage('Step completed. Attendance marked automatically.');
      else if (operation === 'save_notes') setMessage('Meeting notes saved.');
      else if (operation === 'complete_meeting') setMessage('Meeting completed. Your notes and progress are saved.');
      setConflict(false); return true;
    } catch (caught) {
      if (caught instanceof WorkspaceError && caught.status === 409) setConflict(true);
      else setError(caught instanceof Error ? caught.message : 'The update could not be confirmed. Your notes have been kept.');
      return false;
    } finally { busyRef.current = false; setBusy(null); }
  };
  const confirmBooking = useCallback(async (target: BookingConfirmationTarget): Promise<'saved' | 'waiting_for_session' | 'busy'> => {
    if (busyRef.current) return 'busy';
    if (target.userId !== userRef.current) throw new Error('This booking belongs to another member.');
    busyRef.current = true; protection.current = true;
    requestController.current?.abort();
    const sequence = ++requestSequence.current;
    setBusy('set_next_meeting_booked');
    try {
      // This only records GHL's confirmed result. It never creates a booking.
      // The target belongs to the frame that emitted the completion event,
      // even if another meeting is selected before its save finishes.
      const result = await saveImplementationBookingConfirmation(target);
      if (sequence === requestSequence.current && target.userId === userRef.current
        && workspaceRef.current?.selectedNoteId === target.noteId) {
        hydrate(result.workspace, meetingIdRef.current, false);
        setConflict(false);
      }
      return result.status;
    } finally {
      if (sequence === requestSequence.current && target.userId === userRef.current) {
        busyRef.current = false; setBusy(null);
      }
    }
  }, [hydrate]);
  const switchMeeting = (nextId: number) => {
    if (nextId === meetingIdRef.current) return;
    leave(() => {
      if (!workspaceRef.current) return;
      hydrate(workspaceRef.current, nextId, true); setError(null); setMessage(null); setConflict(false);
    });
  };
  const finishMeeting = async () => {
    setFinishOpen(false);
    if (!notesEqual(draftRef.current, baselineRef.current) && !await mutate('save_notes', draftRef.current)) return;
    await mutate('complete_meeting');
  };
  const openCreateMeeting = () => leave(() => {
    if (!cycle || cycle.cancelled) return;
    const today = implementationLocalDate('America/Edmonton');
    setMeetingDate(today >= cycle.cycleDate && (!workspace?.cycleEndDate || today < workspace.cycleEndDate) ? today : cycle.cycleDate);
    setCreateError(null); createRequest.current = null; setCreateOpen(true);
  });
  const createMeeting = async () => {
    const current = workspaceRef.current;
    if (busyRef.current || !current?.selectedNoteId || !meetingDate) return;
    const currentCycle = current.cycles.find(item => item.noteId === current.selectedNoteId);
    if (!currentCycle || currentCycle.cancelled || meetingDate < currentCycle.cycleDate
      || (current.cycleEndDate && meetingDate >= current.cycleEndDate)) {
      setCreateError('Choose a date within this coaching cycle.'); return;
    }
    busyRef.current = true; protection.current = true;
    requestController.current?.abort();
    const sequence = ++requestSequence.current; const userId = userRef.current;
    if (createRequest.current?.noteId !== current.selectedNoteId || createRequest.current?.date !== meetingDate) {
      createRequest.current = { noteId: current.selectedNoteId, date: meetingDate, requestId: crypto.randomUUID() };
    }
    setBusy('create_meeting'); setCreateError(null); setMessage(null);
    try {
      const response = await fetch('/api/implementation-workspace/meetings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, noteId: current.selectedNoteId, meetingDate, requestId: createRequest.current.requestId }),
      });
      const next = await readResponse(response) as ImplementationWorkspaceResponse & { meetingId: number; created: boolean };
      if (sequence !== requestSequence.current || userId !== userRef.current) return;
      if (!Number.isSafeInteger(next.meetingId) || !next.meetings.some(item => item.id === next.meetingId)) {
        throw new Error('The meeting could not be loaded. Please retry to reopen it.');
      }
      hydrate(next, next.meetingId, true); setConflict(false); setError(null); setCreateOpen(false);
      setMessage(next.created ? 'Implementation meeting added. Start it when you are ready.' : 'The existing meeting on this date has been selected.');
      createRequest.current = null;
    } catch (caught) {
      if (sequence === requestSequence.current && userId === userRef.current) {
        setCreateError(caught instanceof Error ? caught.message : 'Could not add the meeting. Please try again.');
      }
    } finally {
      if (sequence === requestSequence.current && userId === userRef.current) { busyRef.current = false; setBusy(null); }
    }
  };

  if (loading && !workspace) return <Stack spacing={2} sx={{ maxWidth: 1180, mx: 'auto' }}><Skeleton variant="rounded" height={160} /><Skeleton variant="rounded" height={540} /></Stack>;
  if (!workspace) return <Alert severity="error" action={<Button color="inherit" onClick={() => void load(undefined, true, true)}>Retry</Button>}>{error ?? 'Unable to load implementation meetings.'}</Alert>;

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 1180, mx: 'auto' }}>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, bgcolor: 'grey.50' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={3}>
          <Box><Typography variant="overline" color="text.secondary">{cycle?.id === workspace.activeCycleId ? 'Current coaching cycle' : 'Coaching history'}</Typography><Typography variant="h4" fontWeight={850}>Implementation</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{studentName || 'Work through the priorities together'}</Typography></Box>
          <FormControl size="small" sx={{ minWidth: 270 }} disabled={!!busy || loading}><InputLabel id="implementation-cycle-label">Coaching cycle</InputLabel><Select labelId="implementation-cycle-label" label="Coaching cycle" value={cycle?.noteId ?? ''} onChange={(event) => leave(() => { void load(Number(event.target.value), true, true); })}>{workspace.cycles.filter((item) => !item.cancelled && !item.isFuture).map((item) => <MenuItem key={item.id} value={item.noteId}>{item.kind === 'business_audit' ? 'Business Review' : 'M2'} · {shortDate(item.cycleDate)}{item.id === workspace.activeCycleId ? ' · Active' : ''}</MenuItem>)}</Select></FormControl>
        </Stack>
        {(cycle || workspace.upcomingBusinessReview) && <ImplementationMeetings meetings={workspace.meetings} upcomingBusinessReview={workspace.upcomingBusinessReview} selectedMeetingId={meetingId}
          latestSessionId={workspace.latestSessionId} disabled={!!busy || loading} canAdd={!!cycle && !cycle.cancelled} onSelect={switchMeeting} onAdd={openCreateMeeting} />}
        {meeting && <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mt: 3 }}>
          <Box><Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.8 }}>Implementation meeting for</Typography>
            <Stack direction="row" alignItems="center" spacing={1.5}><Typography variant="h5" fontWeight={800}>{new Date(`${meeting.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</Typography>
              <Chip size="small" color={meeting.cancelled ? 'error' : meeting.isToday ? 'primary' : 'default'} label={`${meetingPosition(meeting)} · ${implementationMeetingStatus(meeting, workspace.latestSessionId)}`} /></Stack>
            <Typography variant="caption" color="text.secondary">{meeting.title || 'Implementation meeting'}{meetingTime(meeting) ? ` · ${meetingTime(meeting)}` : ''} · {meeting.timezone}</Typography>
          </Box>
          <FormControlLabel sx={{ mr: 0, flexShrink: 0 }} control={<Checkbox size="small" checked={meeting.attended} disabled={disabled || !session || meeting.cancelled} onChange={(_, attended) => void mutate('set_attendance', { attended })} />} label={<Typography variant="body2">Attended</Typography>} />
        </Stack>}
      </Paper>
      {loading && <LinearProgress aria-label="Loading coaching cycle" />}
      {error && <Alert severity="error" onClose={() => setError(null)} action={<Button color="inherit" disabled={!!busy || loading} onClick={() => void load(workspace.selectedNoteId, false, true)}>Refresh meeting</Button>}>{error}</Alert>}
      {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}
      {conflict && <Alert severity="warning" action={<Button color="inherit" onClick={() => void load(workspace.selectedNoteId, false, true)}>Refresh meeting</Button>}>This meeting changed while you were working. Refresh its progress before continuing. Your unsaved notes will be kept.</Alert>}
      {!cycle && <Alert severity="info">{workspace.nextAuditDate ? `The next implementation cycle begins with the Business Review on ${shortDate(workspace.nextAuditDate)}.` : 'No active M2 or Business Review coaching cycle was found.'}</Alert>}
      {cycle && !meeting && <Alert severity="info" action={<Button color="inherit" disabled={!!busy || loading || cycle.cancelled} onClick={openCreateMeeting}>Add meeting</Button>}>No implementation meeting is scheduled in this cycle yet. Add a meeting if your appointment has not appeared.</Alert>}

      {cycle && meeting && <>
        {!session ? <Alert severity="info" action={<Button color="inherit" variant="outlined" startIcon={<PlayArrowRounded />} disabled={disabled || meeting.cancelled} onClick={() => { if (!meeting.isToday) setStartOpen(true); else void mutate('start'); }}>Start meeting</Button>}>{meeting.cancelled ? 'This meeting was cancelled. Select another meeting to record implementation work.' : `You are previewing ${meeting.isToday ? "today's meeting" : `the meeting on ${shortDate(meeting.date)}`}. Start it when you are ready to record work and notes.`}</Alert>
          : !editable ? <Alert severity="info" icon={<HistoryRounded />} action={isLatest && session.status === 'completed' && !meeting.cancelled ? <Button color="inherit" disabled={disabled} onClick={() => void mutate('reopen_meeting')}>Reopen meeting</Button> : undefined}>{meeting.cancelled ? 'This meeting was cancelled. Its notes and progress are read-only.' : <>Progress is preserved as it stood for this meeting. You can still update its notes.{!isLatest ? ' Select the latest meeting to continue implementation.' : ''}</>}</Alert> : null}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.65fr) minmax(310px, 1fr)', gap: 2.5, alignItems: 'start' }}>
          <Stack spacing={2}>
            <Box><Typography variant="h6" fontWeight={800}>Work through the priorities</Typography><Typography variant="body2" color="text.secondary">Check a step once the member has done it.</Typography></Box>
            {!actions.length && <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}><Typography fontWeight={700}>No action steps in this cycle yet</Typography><Typography color="text.secondary" variant="body2" sx={{ mt: 0.75 }}>Choose priorities in the Business Review to add them to this cycle.</Typography></Paper>}
            {actions.map((action) => {
              const count = action.steps.filter((step) => action.progress[step.id]?.completed).length;
              const actionComplete = action.status === 'complete';
              return <Accordion key={action.actionStepId} expanded={expandedActions.includes(action.actionStepId)} onChange={(_, expanded) => setExpandedActions((current) => expanded ? [...current, action.actionStepId] : current.filter((id) => id !== action.actionStepId))} disableGutters elevation={0} sx={{ border: 1, borderColor: actionComplete ? 'success.light' : 'divider', borderRadius: '12px !important', '&:before': { display: 'none' }, overflow: 'hidden' }}>
                <AccordionSummary expandIcon={<ExpandMoreRounded />} sx={{ py: 1, bgcolor: actionComplete ? 'success.50' : 'background.paper' }}>
                  <Box sx={{ width: '100%', minWidth: 0, pr: 1 }}><Stack direction="row" spacing={1} alignItems="center">{actionComplete ? <CheckCircleRounded color="success" fontSize="small" /> : action.priorityPosition !== null ? <FlagRounded color="primary" fontSize="small" /> : null}<Typography variant="subtitle1" fontWeight={800}>{action.priorityPosition !== null ? `${action.priorityPosition}. ` : ''}{action.label}</Typography></Stack><Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.75 }}><Typography variant="caption" color={actionComplete ? 'success.main' : 'text.secondary'}>{actionComplete ? 'Implemented' : action.status === 'in_progress' ? 'In progress' : 'Not started'}</Typography>{action.steps.length > 0 && <Typography variant="caption" color="text.secondary">· {count} of {action.steps.length} steps completed</Typography>}</Stack>{action.steps.length > 0 && <LinearProgress variant="determinate" value={count / action.steps.length * 100} color={count === action.steps.length ? 'success' : 'primary'} aria-label={`${action.label} step completion`} sx={{ mt: 1, height: 4, borderRadius: 2 }} />}</Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                  {action.libraryItemHref && <Box sx={{ px: 2.25, py: 1.5, borderTop: 1, borderColor: 'divider' }}><Link href={action.libraryItemHref} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>Open training{action.libraryItemTitle ? `: ${action.libraryItemTitle}` : ''}<OpenInNewRounded sx={{ fontSize: 14 }} /></Link></Box>}
                  {action.steps.map((step, index) => {
                    const progress = action.progress[step.id]; const complete = !!progress?.completed;
                    const completionMeeting = workspace.meetings.find((item) => item.id === progress?.meetingId);
                    const completionLabel = progress?.meetingId === meeting.id ? 'Completed this meeting' : progress?.meetingId === previousMeeting?.id ? 'Completed last meeting' : completionMeeting ? `Completed ${shortDate(completionMeeting.date)}` : 'Completed earlier';
                    return <Box key={step.id} sx={{ borderTop: 1, borderColor: 'divider', px: 2.25, py: 2 }}>
                      <Stack direction="row" alignItems="flex-start" spacing={1}>
                        <Checkbox checked={complete} disabled={!editable || disabled} onChange={(_, completed) => void mutate('toggle_step', { actionStepId: action.actionStepId, stepId: step.id, completed })} slotProps={{ input: { 'aria-label': `Mark ${step.title} ${complete ? 'incomplete' : 'complete'}` } }} sx={{ p: 0.5, mt: -0.2 }} />
                        <Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="subtitle2" fontWeight={750}>{index + 1}. {step.title}</Typography>{complete && <Typography variant="caption" color="success.main">{completionLabel}</Typography>}<Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.65 }}>{step.description}</Typography>
                          {step.resources.length > 0 && <Stack spacing={0.75} sx={{ mt: 1.25 }}>{step.resources.map((reference, sourceIndex) => <Link key={`${reference.resourceId}:${sourceIndex}`} href={`/r/${reference.resourceId}${reference.pageStart ? `#page=${reference.pageStart}` : ''}`} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 0.5, width: 'fit-content' }}>{resources.get(reference.resourceId)?.title ?? 'Open resource'}{reference.pageStart ? reference.pageEnd && reference.pageEnd !== reference.pageStart ? ` · pp. ${reference.pageStart}–${reference.pageEnd}` : ` · p. ${reference.pageStart}` : ''}<OpenInNewRounded sx={{ fontSize: 13 }} /></Link>)}</Stack>}
                        </Box>
                      </Stack>
                    </Box>;
                  })}
                  <Box sx={{ p: 2, borderTop: action.steps.length ? 1 : 0, borderColor: 'divider', bgcolor: 'grey.50' }}>
                    {action.steps.length > 0 && count === action.steps.length && !actionComplete && <Typography variant="body2" sx={{ mb: 1.25 }}>All steps are complete. Confirm when this system is fully implemented.</Typography>}
                    <Button size="small" variant={actionComplete ? 'text' : 'outlined'} startIcon={actionComplete ? undefined : <CheckRounded />} disabled={!editable || disabled} onClick={() => { if (actionComplete) void mutate('set_action_status', { actionStepId: action.actionStepId, status: 'in_progress' }); else setCompleteAction(action); }}>{actionComplete ? 'Mark as in progress' : 'Mark system implemented'}</Button>
                  </Box>
                </AccordionDetails>
              </Accordion>;
            })}
          </Stack>

          <Stack spacing={2.5} sx={{ minWidth: 0 }}>
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
            <Stack spacing={2}>
              <Box><Typography variant="h6" fontWeight={800}>Meeting notes</Typography><Typography variant="body2" color="text.secondary">{shortDate(meeting.date)}{meetingTime(meeting) ? ` · ${meetingTime(meeting)}` : ''}</Typography></Box>
              {previousMeeting?.session && <Box sx={{ p: 1.75, bgcolor: 'grey.50', borderRadius: 2 }}><Typography variant="subtitle2" fontWeight={750}>Where we left off</Typography><Typography variant="caption" color="text.secondary">{shortDate(previousMeeting.date)}</Typography>{previousMeeting.session.commitments ? <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{previousMeeting.session.commitments}</Typography> : <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No next actions were recorded.</Typography>}{previousMeeting.session.notes && <><Button size="small" color="inherit" onClick={() => setPreviousNotesOpen((current) => !current)} sx={{ ml: -1, mt: 0.5 }}>{previousNotesOpen ? 'Hide previous notes' : 'Read previous notes'}</Button><Collapse in={previousNotesOpen}><Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{previousMeeting.session.notes}</Typography></Collapse></>}</Box>}
              {latestNotes && <Alert severity="warning"><Typography variant="body2">The saved meeting notes changed. Your draft is preserved below.</Typography><Box sx={{ mt: 1, p: 1, bgcolor: 'background.paper', maxHeight: 200, overflow: 'auto' }}><Typography variant="caption" fontWeight={700}>Latest saved notes</Typography><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{latestNotes.notes || '(No notes)'}</Typography><Typography variant="caption" fontWeight={700} sx={{ display: 'block', mt: 1 }}>Latest next actions</Typography><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{latestNotes.commitments || '(No next actions)'}</Typography></Box><Stack spacing={0.5} sx={{ mt: 1 }}><Button size="small" color="inherit" onClick={() => setLatestNotes(null)}>Keep my draft for the next save</Button><Button size="small" color="inherit" onClick={() => setDiscardAction({ run: () => { setDraft(latestNotes); draftRef.current = latestNotes; setLatestNotes(null); } })}>Use the saved notes</Button></Stack></Alert>}
              {meeting.cancelled && notesDirty && <Alert severity="warning" action={<Button color="inherit" onClick={() => setDiscardAction({ run: () => setLatestNotes(null) })}>Discard draft</Button>}>This meeting was cancelled. Your unsaved notes are still available to select and copy below, but cannot be saved to this meeting.</Alert>}
              <TextField label="Discussion, decisions, and blockers" multiline minRows={8} maxRows={22} value={draft.notes} disabled={!session || !!busy || loading} onChange={(event) => { setDraft((current) => ({ ...current, notes: event.target.value })); setMessage(null); }} placeholder="Write naturally as you work through the meeting." slotProps={{ input: { readOnly: meeting.cancelled }, htmlInput: { maxLength: 30000 } }} />
              <TextField label="Next actions / where to resume" multiline minRows={3} maxRows={10} value={draft.commitments} disabled={!session || !!busy || loading} onChange={(event) => { setDraft((current) => ({ ...current, commitments: event.target.value })); setMessage(null); }} placeholder="What happens before the next call, and where should you pick up?" slotProps={{ input: { readOnly: meeting.cancelled }, htmlInput: { maxLength: 10000 } }} />
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}><Typography variant="caption" role="status" color={notesDirty ? 'warning.main' : 'text.secondary'}>{notesDirty ? 'Unsaved notes' : session ? 'Notes saved' : 'Start the meeting to add notes'}</Typography><Button variant="contained" disabled={!session || meeting.cancelled || disabled || !notesDirty || !!latestNotes} onClick={() => void mutate('save_notes', draft)} startIcon={busy === 'save_notes' ? <CircularProgress size={14} color="inherit" /> : undefined}>Save notes</Button></Stack>
              {completedToday.length > 0 && <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}><Typography variant="subtitle2" fontWeight={750}>Completed this meeting</Typography><Stack spacing={0.75} sx={{ mt: 1 }}>{completedToday.map((item) => <Stack key={item.key} direction="row" spacing={0.75} alignItems="flex-start"><CheckRounded fontSize="small" color="success" /><Typography variant="body2">{item.title}</Typography></Stack>)}</Stack></Box>}
              {editable && <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}><Button fullWidth variant="outlined" disabled={disabled || !!latestNotes} onClick={() => setFinishOpen(true)}>Finish meeting</Button><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>You can finish even when implementation work remains.</Typography></Box>}
            </Stack>
          </Paper>
          <CoachResourceSuggestionPanel key={`${selectedStudentId}:${cycle.noteId}`} userId={selectedStudentId} coachingNoteId={cycle.noteId} compact />
          </Stack>
        </Box>
      </>}

      {cycle && !meeting && <CoachResourceSuggestionPanel key={`${selectedStudentId}:${cycle.noteId}`} userId={selectedStudentId} coachingNoteId={cycle.noteId} />}

      <Accordion elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: '12px !important', '&:before': { display: 'none' } }} slotProps={{ transition: { unmountOnExit: true } }}><AccordionSummary expandIcon={<ExpandMoreRounded />}><Typography fontWeight={700}>Member wins</Typography></AccordionSummary><AccordionDetails><UserWinsPanel userId={selectedStudentId} /></AccordionDetails></Accordion>

      {meeting && workspace.selectedNoteId && <ImplementationBookingPanel key={`${workspace.selectedNoteId}:${meeting.id}`} userId={selectedStudentId} noteId={workspace.selectedNoteId} meeting={meeting} recommendation={nextMeeting}
        bookingCoaches={workspace.bookingCoaches} memberName={studentName} memberEmail={studentEmail}
        disabled={!!busy || loading} onConfirmBooking={confirmBooking} />}

      <Dialog open={createOpen} onClose={() => { if (!busyRef.current) setCreateOpen(false); }} maxWidth="xs" fullWidth>
        <DialogTitle>Add implementation meeting</DialogTitle>
        <DialogContent><Stack spacing={2.5} sx={{ pt: 0.5 }}>
          <DialogContentText>Add a meeting when an appointment hasn&apos;t appeared. It will be available immediately in this coaching cycle.</DialogContentText>
          {cycle && <Typography variant="body2" color="text.secondary">{cycle.kind === 'business_audit' ? 'Business Review' : 'M2'} cycle: {shortDate(cycle.cycleDate)}{workspace.cycleEndDate ? ` – ${shortDate(previousDate(workspace.cycleEndDate))}` : ' onward'}</Typography>}
          {createError && <Alert severity="error">{createError}</Alert>}
          <TextField autoFocus label="Meeting date" type="date" value={meetingDate} disabled={!!busy} error={createDateInvalid}
            onChange={(event) => { setMeetingDate(event.target.value); setCreateError(null); }}
            helperText={createDateInvalid ? 'Choose a date within the selected coaching cycle.' : 'Dates use America/Edmonton time.'}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: cycle?.cycleDate, max: workspace.cycleEndDate ? previousDate(workspace.cycleEndDate) : undefined } }} fullWidth />
        </Stack></DialogContent>
        <DialogActions><Button disabled={!!busy} onClick={() => setCreateOpen(false)}>Cancel</Button><Button variant="contained" disabled={!!busy || !meetingDate || createDateInvalid}
          startIcon={busy === 'create_meeting' ? <CircularProgress size={16} color="inherit" /> : <AddRounded />} onClick={() => void createMeeting()}>{busy === 'create_meeting' ? 'Adding…' : 'Add meeting'}</Button></DialogActions>
      </Dialog>
      <Dialog open={!!discardAction} onClose={() => setDiscardAction(null)} maxWidth="xs" fullWidth><DialogTitle>Discard unsaved notes?</DialogTitle><DialogContent><DialogContentText>Your meeting notes have not been saved. Discard them to continue.</DialogContentText></DialogContent><DialogActions><Button onClick={() => setDiscardAction(null)}>Keep editing</Button><Button variant="contained" color="error" onClick={() => { const action = discardAction; setDiscardAction(null); setDraft(baselineRef.current); draftRef.current = baselineRef.current; protection.current = false; action?.run(); }}>Discard changes</Button></DialogActions></Dialog>
      <Dialog open={startOpen} onClose={() => setStartOpen(false)} maxWidth="xs" fullWidth><DialogTitle>Start this meeting?</DialogTitle><DialogContent><DialogContentText>This meeting is dated {meeting ? shortDate(meeting.date) : ''}{meeting?.isFuture ? ' and is upcoming' : ' and is in the past'}. Work you record will belong to this meeting.</DialogContentText></DialogContent><DialogActions><Button onClick={() => setStartOpen(false)}>Cancel</Button><Button variant="contained" onClick={() => { setStartOpen(false); void mutate('start'); }}>Start meeting</Button></DialogActions></Dialog>
      <Dialog open={finishOpen} onClose={() => setFinishOpen(false)} maxWidth="xs" fullWidth><DialogTitle>Finish this meeting?</DialogTitle><DialogContent><DialogContentText>Your notes will be saved and this meeting&apos;s progress will be preserved. Unfinished steps carry forward to the next meeting.</DialogContentText></DialogContent><DialogActions><Button onClick={() => setFinishOpen(false)}>Keep working</Button><Button variant="contained" onClick={() => void finishMeeting()}>Save and finish</Button></DialogActions></Dialog>
      <Dialog open={!!completeAction} onClose={() => setCompleteAction(null)} maxWidth="xs" fullWidth><DialogTitle>Mark this system implemented?</DialogTitle><DialogContent><DialogContentText>Confirm that {completeAction?.label} is implemented. This completes its action step and updates any linked scorecard priority.</DialogContentText></DialogContent><DialogActions><Button onClick={() => setCompleteAction(null)}>Cancel</Button><Button variant="contained" onClick={() => { const action = completeAction; setCompleteAction(null); if (action) void mutate('set_action_status', { actionStepId: action.actionStepId, status: 'complete' }); }}>Confirm implementation</Button></DialogActions></Dialog>
    </Stack>
  );
}
