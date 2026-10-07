'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, MenuItem, Paper, Skeleton, Stack, TextField, Typography,
} from '@mui/material';
import { AddCommentOutlined, RefreshRounded } from '@mui/icons-material';
import { COACHING_NOTE_MAX_LENGTH, type CoachingHistoryNote, type CoachingNotesResponse } from '@/types/coachingNotes';

type Props = {
  selectedStudentId: string;
  studentName?: string | null;
  onNavigationGuardChange?: (guard: ((run: () => void) => void) | null) => void;
};
const PAGE_SIZE = 20;
function writtenDate(value: string | null | undefined) {
  if (!value) return 'Written date not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Written date not recorded' : date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}
function contextDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function sourceLabel(note: CoachingHistoryNote) {
  if (note.source === 'implementation') return 'Implementation meeting';
  if (note.source === 'coaching') return 'Coaching note';
  if (note.contextKind === 'm2') return 'M2 coaching notes';
  if (note.contextKind === 'legacy') return 'Coaching notes';
  return 'Business review';
}
async function readResponse(response: Response): Promise<CoachingNotesResponse> {
  if (response.redirected || response.status === 401) throw new Error('Your session expired. Sign in again; your draft is still here.');
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.notes)) throw new Error(body?.error || 'Could not load coaching notes. Please try again.');
  return body as CoachingNotesResponse;
}

export default function CoachingNotesTab({ selectedStudentId, studentName, onNavigationGuardChange }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState<CoachingHistoryNote[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [discardAction, setDiscardAction] = useState<{ run: () => void } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const busy = useRef(false);
  const dirty = useRef(false);
  const pendingRequest = useRef<{ body: string; requestId: string } | null>(null);
  dirty.current = draft.length > 0;

  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const current = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/coaching-notes?${new URLSearchParams({ userId: selectedStudentId })}`, { cache: 'no-store', signal: request.signal });
      const body = await readResponse(response);
      if (request.signal.aborted || current !== sequence.current || !mounted.current) return;
      setNotes(body.notes); setLoaded(true);
    } catch (caught) {
      if (!request.signal.aborted && current === sequence.current && mounted.current) setError(caught instanceof Error ? caught.message : 'Could not load coaching notes.');
    } finally {
      if (!request.signal.aborted && current === sequence.current && mounted.current) setLoading(false);
    }
  }, [selectedStudentId]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; controller.current?.abort(); sequence.current += 1; };
  }, [load]);

  const leave = useCallback((run: () => void) => {
    if (busy.current) { setError('Please wait for your note to finish saving.'); return; }
    if (dirty.current) setDiscardAction({ run }); else run();
  }, []);
  useEffect(() => {
    onNavigationGuardChange?.(leave);
    return () => onNavigationGuardChange?.(null);
  }, [leave, onNavigationGuardChange]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current && !busy.current) return;
      event.preventDefault(); event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      if ((!dirty.current && !busy.current) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
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
    const pageUrl = window.location.href;
    const pageState = window.history.state;
    const popstate = (event: PopStateEvent) => {
      if (!dirty.current && !busy.current) return;
      event.stopImmediatePropagation();
      window.history.pushState(pageState, '', pageUrl);
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

  const save = async () => {
    const body = draft.trim();
    if (busy.current || !body || body.length > COACHING_NOTE_MAX_LENGTH) return;
    busy.current = true; setSaving(true); setError(null); setSaved(false);
    controller.current?.abort(); sequence.current += 1; setLoading(false);
    if (pendingRequest.current?.body !== body) pendingRequest.current = { body, requestId: crypto.randomUUID() };
    try {
      const response = await fetch('/api/coaching-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedStudentId, ...pendingRequest.current }),
      });
      const result = await readResponse(response);
      if (!mounted.current) return;
      setNotes(result.notes); setDraft(''); dirty.current = false; pendingRequest.current = null;
      setSaved(true); setOrder('newest'); setVisibleCount(PAGE_SIZE);
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : 'Could not save your note. Your draft has been kept.');
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const orderedNotes = useMemo(() => [...notes].sort((a, b) => {
    if (!a.writtenAt || !b.writtenAt) return a.writtenAt ? -1 : b.writtenAt ? 1 : a.id.localeCompare(b.id);
    const difference = new Date(a.writtenAt).getTime() - new Date(b.writtenAt).getTime() || a.id.localeCompare(b.id);
    return order === 'newest' ? -difference : difference;
  }), [notes, order]);

  return <Stack spacing={3}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
      <Box><Typography variant="h5" fontWeight={750}>Coaching notes</Typography><Typography color="text.secondary" sx={{ mt: 0.5 }}>Business review and implementation meeting notes{studentName ? ` for ${studentName}` : ''}, all in one place.</Typography></Box>
      <Button startIcon={<RefreshRounded />} disabled={loading || saving} onClick={() => void load()}>Refresh</Button>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {saved && <Alert severity="success" onClose={() => setSaved(false)}>Your coaching note was added.</Alert>}
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}><Stack spacing={1.5}>
      <Typography variant="subtitle1" fontWeight={700}>Add a coaching note</Typography>
      <TextField label="New note" placeholder="Record an update, observation, or follow-up for this member…" multiline minRows={3} maxRows={12} value={draft} disabled={saving}
        onChange={(event) => { setDraft(event.target.value); setSaved(false); }} slotProps={{ htmlInput: { maxLength: COACHING_NOTE_MAX_LENGTH } }} fullWidth />
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Typography variant="caption" color="text.secondary">Saved with your name and the date written. No meeting required.</Typography>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <AddCommentOutlined />} disabled={!loaded || saving || !draft.trim()} onClick={() => void save()} sx={{ flexShrink: 0 }}>{saving ? 'Saving…' : 'Add note'}</Button>
      </Stack>
    </Stack></Paper>
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
      <Typography variant="h6" fontWeight={700}>History{loaded ? ` · ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : ''}</Typography>
      <TextField select label="Order" size="small" value={order} onChange={(event) => { setOrder(event.target.value as 'newest' | 'oldest'); setVisibleCount(PAGE_SIZE); }} sx={{ minWidth: 165 }}>
        <MenuItem value="newest">Newest first</MenuItem><MenuItem value="oldest">Oldest first</MenuItem>
      </TextField>
    </Stack>
    {loading && !loaded ? <Stack spacing={2}>{[0, 1, 2].map(i => <Skeleton key={i} variant="rounded" height={130} />)}</Stack>
      : loaded && notes.length === 0 ? <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 3 }}>
        <Typography fontWeight={700}>No coaching notes yet</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Add the first note above. Notes saved in business reviews and implementation meetings will appear here too.</Typography>
      </Paper> : <Stack spacing={2}>
        {orderedNotes.slice(0, visibleCount).map(note => <Paper component="article" key={note.id} variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
            <Box><Typography fontWeight={700}>{note.authorName || 'Author not recorded'}</Typography>
              <Typography variant="body2" color="text.secondary" component="div">{note.writtenAt ? <time dateTime={note.writtenAt}>{writtenDate(note.writtenAt)}</time> : 'Written date not recorded'}</Typography>
              {note.updatedAt && note.updatedAt !== note.writtenAt && <Typography variant="caption" color="text.secondary">Edited {writtenDate(note.updatedAt)}{note.updatedByName ? ` by ${note.updatedByName}` : ''}</Typography>}
            </Box>
            <Stack alignItems="flex-end" spacing={0.5}><Chip size="small" label={sourceLabel(note)} variant="outlined" color={note.source === 'implementation' ? 'primary' : 'default'} />
              {note.contextDate && <Typography variant="caption" color="text.secondary">{note.source === 'implementation' ? 'Meeting' : note.contextKind === 'm2' ? 'M2' : 'Review'}: {contextDate(note.contextDate)}</Typography>}
            </Stack>
          </Stack>
          {note.body && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.8 }}>{note.body}</Typography>}
          {note.commitments && <Box sx={{ mt: note.body ? 2 : 0, pl: 2, borderLeft: 3, borderColor: 'grey.200' }}><Typography variant="subtitle2" fontWeight={700}>Next actions</Typography><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.8 }}>{note.commitments}</Typography></Box>}
        </Paper>)}
        {orderedNotes.length > visibleCount && <Button variant="outlined" onClick={() => setVisibleCount(value => value + PAGE_SIZE)}>Show more notes ({orderedNotes.length - visibleCount} remaining)</Button>}
      </Stack>}
    <Dialog open={!!discardAction} onClose={() => setDiscardAction(null)} maxWidth="xs" fullWidth>
      <DialogTitle>Discard your unsaved note?</DialogTitle><DialogContent><DialogContentText>Your new coaching note has not been saved. Add it before leaving, or discard the draft to continue.</DialogContentText></DialogContent>
      <DialogActions><Button onClick={() => setDiscardAction(null)}>Keep writing</Button><Button color="error" variant="contained" onClick={() => {
        const action = discardAction; setDiscardAction(null); setDraft(''); dirty.current = false; action?.run();
      }}>Discard note</Button></DialogActions>
    </Dialog>
  </Stack>;
}
