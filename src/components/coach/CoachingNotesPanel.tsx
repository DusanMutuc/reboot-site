// src/components/coach/CoachingNotesPanel.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Checkbox,
} from '@mui/material';
import {
  CheckCircleOutline as CheckCircleIcon,
  NoteOutlined as NoteIcon,
  Add as AddIcon,
  EditOutlined as EditIcon,
  DeleteOutline as DeleteIcon,
  EventAvailable as EventAvailableIcon,
} from '@mui/icons-material';
import type {
  CoachingNote,
  CoachingNoteActionStep,
  CoachingNoteComment,
  ActionStepStatus,
} from '@/types/coaching';
import LibraryItemPickerDialog, { LibraryItemLite } from './LibraryItemPickerDialog';
import { createMeetingWithAttendees, upsertMeetingAttendance, getUserMeetings } from '@/lib/meetings';
import { getContentNodeHref } from '@/lib/contentNodeLinks';

type Props = {
  userId: string | null;
};

/** ---- Local helper types to avoid `any` ---- */
type ProfileNameRow = { first_name: string | null; last_name: string | null };

type ContentNodeLite = { id: number; title: string | null; slug: string | null; node_type: string | null };

type UserMeetingRow = {
  meeting_id: number;
  meeting_date: string; // ISO YYYY-MM-DD
  meeting_type_code: string; // 'M2_MEETING' | 'IMPLEMENTATION_MEETING' | others
  attended: boolean | null;
};

type CreatedMeeting = { id: number };

type CoachingNoteWithM2 = CoachingNote & {
  m2_meeting_id?: number | null;
  // populated via Supabase join on meetings
  m2_meeting?: { date: string } | null;
};


type CommentAuthorProfile = { first_name: string | null; last_name: string | null };

type CoachingNoteCommentRow = {
  id: number;
  coaching_note_id: number;
  author_id: string | null;
  body: string;
  created_at: string;
  author: CommentAuthorProfile | CommentAuthorProfile[] | null;
};

function normalizeCommentAuthor(author: CoachingNoteCommentRow['author']): CommentAuthorProfile | null {
  if (!author) return null;
  if (Array.isArray(author)) return author[0] ?? null;
  return author;
}

function mapCommentRow(row: CoachingNoteCommentRow): CoachingNoteComment {
  return {
    id: row.id,
    coaching_note_id: row.coaching_note_id,
    author_id: row.author_id,
    body: row.body,
    created_at: row.created_at,
    author: normalizeCommentAuthor(row.author),
  };
}

function formatShortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatAuthorName(comment: CoachingNoteComment) {
  const first = comment.author?.first_name?.trim() ?? '';
  const last = comment.author?.last_name?.trim() ?? '';
  const fullName = `${first} ${last}`.trim();
  return fullName || 'Unknown author';
}

function formatDistanceFromNow(iso: string) {
  const now = new Date();
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  let diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) diffMs = 0;

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const months = Math.floor(days / 30);
  const remDays = days % 30;

  const parts: string[] = [];
  if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);
  if (remDays > 0 || parts.length === 0) {
    parts.push(`${remDays} day${remDays === 1 ? '' : 's'}`);
  }
  return `${parts.join(', ')} ago`;
}

type MeetingSlotKey = 'm2' | 'impl1' | 'impl2' | 'impl3';

type MeetingSlotConfig = {
  key: MeetingSlotKey;
  label: string;
};

const MEETING_SLOTS: MeetingSlotConfig[] = [
  { key: 'm2', label: 'M2' },
  { key: 'impl1', label: 'Implementation 1' },
  { key: 'impl2', label: 'Implementation 2' },
  { key: 'impl3', label: 'Implementation 3' },
];

type MeetingSlotState = {
  meetingId: number;
  date: string; // YYYY-MM-DD
  attended: boolean;
};

function makeEmptyMeetingSlots(): Record<MeetingSlotKey, MeetingSlotState | null> {
  return {
    m2: null,
    impl1: null,
    impl2: null,
    impl3: null,
  };
}

export default function CoachingNotesPanel({ userId }: Props) {
  const [notes, setNotes] = useState<CoachingNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);

  const [notesLoading, setNotesLoading] = useState(false);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const [steps, setSteps] = useState<CoachingNoteActionStep[]>([]);
  const [comments, setComments] = useState<CoachingNoteComment[]>([]);

  const [newStepLabel, setNewStepLabel] = useState('');
  const [newCommentBody, setNewCommentBody] = useState('');

  const [savingStep, setSavingStep] = useState(false);
  const [savingComment, setSavingComment] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Library picker dialog
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);

  // Map linked content node id -> { title, slug, node_type }
  const [libraryItems, setLibraryItems] = useState<
    Record<number, { title: string | null; slug: string | null; node_type: string | null }>
  >({});

  // Editing state: action steps
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [editingStepLabel, setEditingStepLabel] = useState('');

  // Editing state: notes/comments
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');

  // Confirm dialogs
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [confirmDeleteNoteOpen, setConfirmDeleteNoteOpen] = useState(false);
  const [pendingDeleteStepId, setPendingDeleteStepId] = useState<number | null>(null);
  const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState<number | null>(null);

  // Meeting slots (M2 + Implementation 1–3)
  const [meetingSlots, setMeetingSlots] =
    useState<Record<MeetingSlotKey, MeetingSlotState | null>>(makeEmptyMeetingSlots);

  const [newMeetingDates, setNewMeetingDates] = useState<Record<MeetingSlotKey, string>>({
    m2: '',
    impl1: '',
    impl2: '',
    impl3: '',
  });

  const [meetingSlotsLoading, setMeetingSlotsLoading] = useState(false);
  const [slotSavingKey, setSlotSavingKey] = useState<MeetingSlotKey | null>(null);
  const [attendanceSavingKey, setAttendanceSavingKey] = useState<MeetingSlotKey | null>(null);
  const [meetingSlotsVersion, setMeetingSlotsVersion] = useState(0);

  // User display name for meeting labels
  const [userDisplayName, setUserDisplayName] = useState<string>('');

  // Reset when user changes
  useEffect(() => {
    setNotes([]);
    setSelectedNoteId(null);
    setSteps([]);
    setComments([]);
    setError(null);
    setLibraryItems({});
    setEditingStepId(null);
    setEditingStepLabel('');
    setEditingCommentId(null);
    setEditingCommentBody('');
    setConfirmCreateOpen(false);
    setConfirmDeleteNoteOpen(false);
    setPendingDeleteStepId(null);
    setPendingDeleteCommentId(null);

    setMeetingSlots(makeEmptyMeetingSlots());
    setNewMeetingDates({ m2: '', impl1: '', impl2: '', impl3: '' });
    setMeetingSlotsVersion(0);
    setUserDisplayName('');

    if (!userId) return;

    const loadUserName = async () => {
      const { data, error: nameErr } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', userId)
        .maybeSingle();

      if (nameErr) {
        console.error('Failed to load user name', nameErr);
        return;
      }

      if (data) {
        const row = data as ProfileNameRow;
        const first = row.first_name ?? '';
        const last = row.last_name ?? '';
        const full = `${first} ${last}`.trim();
        setUserDisplayName(full || '');
      }
    };

    void loadUserName();

    let cancelled = false;

    const loadNotes = async () => {
      setNotesLoading(true);
      const { data, error: err } = await supabase
        .from('coaching_notes')
        .select('*, m2_meeting:meetings(date)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }); // keep as a reasonable fallback
    
      if (!cancelled) {
        if (err) {
          setError(err.message);
        } else if (data) {
          const rows = data as CoachingNoteWithM2[];
    
          // Sort by "effective" date: M2 meeting date if present, else note.created_at
          const sorted = [...rows].sort((a, b) => {
            const aDateStr = a.m2_meeting?.date || a.created_at;
            const bDateStr = b.m2_meeting?.date || b.created_at;
    
            const aTime = new Date(aDateStr).getTime();
            const bTime = new Date(bDateStr).getTime();
    
            // if parsing fails, treat as 0
            const aSafe = Number.isNaN(aTime) ? 0 : aTime;
            const bSafe = Number.isNaN(bTime) ? 0 : bTime;
    
            // newest first
            return bSafe - aSafe;
          });
    
          setNotes(sorted);
          if (sorted.length > 0) {
            setSelectedNoteId(sorted[0].id);
          }
        }
        setNotesLoading(false);
      }
    };
    
    

    void loadNotes();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Load steps + comments when note changes
  useEffect(() => {
    setSteps([]);
    setComments([]);
    setError(null);
    setLibraryItems({});
    setEditingStepId(null);
    setEditingStepLabel('');
    setEditingCommentId(null);
    setEditingCommentBody('');
    setPendingDeleteStepId(null);
    setPendingDeleteCommentId(null);

    setMeetingSlots(makeEmptyMeetingSlots());
    setNewMeetingDates({ m2: '', impl1: '', impl2: '', impl3: '' });

    if (!selectedNoteId) return;

    let cancelled = false;

    const loadStepsAndTitles = async () => {
      setStepsLoading(true);
      const { data, error: err } = await supabase
        .from('coaching_note_action_steps')
        .select('*')
        .eq('coaching_note_id', selectedNoteId)
        .order('created_at', { ascending: true });

      if (cancelled) return;

      if (err) {
        setError(err.message);
        setStepsLoading(false);
        return;
      }

      const rows = (data ?? []) as CoachingNoteActionStep[];
      setSteps(rows);
      setStepsLoading(false);

      const ids = Array.from(
        new Set(
          rows.map((s) => s.library_item_id).filter((id): id is number => typeof id === 'number'),
        ),
      );

      if (ids.length === 0) return;

      const { data: nodes, error: nodesErr } = await supabase
        .from('content_nodes')
        .select('id, title, slug, node_type')
        .in('id', ids);

      if (cancelled) return;

      if (nodesErr) {
        setError((prev) => prev ?? nodesErr.message);
        return;
      }

      const map: Record<number, { title: string | null; slug: string | null; node_type: string | null }> = {};
      (nodes ?? []).forEach((n) => {
        const node = n as ContentNodeLite;
        map[node.id] = {
          title: node.title ?? null,
          slug: node.slug ?? null,
          node_type: node.node_type ?? null,
        };
      });
      setLibraryItems(map);
    };

    const loadComments = async () => {
      setCommentsLoading(true);
      const { data, error: err } = await supabase
        .from('coaching_note_comments')
        .select(
          'id, coaching_note_id, author_id, body, created_at, author:profiles!coaching_note_comments_author_id_fkey(first_name, last_name)',
        )
        .eq('coaching_note_id', selectedNoteId)
        .order('created_at', { ascending: false });

      if (!cancelled) {
        if (err) {
          setError((prev) => prev ?? err.message);
        } else if (data) {
          setComments((data as CoachingNoteCommentRow[]).map(mapCommentRow));
        }
        setCommentsLoading(false);
      }
    };

    void loadStepsAndTitles();
    void loadComments();

    return () => {
      cancelled = true;
    };
  }, [selectedNoteId]);

  // Load meetings for this coaching note
  // M2 from coaching_notes.m2_meeting_id
  // Implementation 1–3: first 3 IMPLEMENTATION_MEETINGs between this M2 and next M2
  useEffect(() => {
    const note = notes.find((n) => n.id === selectedNoteId) as CoachingNoteWithM2 | undefined;
    if (!note || !userId) {
      setMeetingSlots(makeEmptyMeetingSlots());
      setNewMeetingDates({ m2: '', impl1: '', impl2: '', impl3: '' });
      return;
    }

    const m2MeetingId = note.m2_meeting_id ?? null;
    if (!m2MeetingId) {
      setMeetingSlots(makeEmptyMeetingSlots());
      setNewMeetingDates({ m2: '', impl1: '', impl2: '', impl3: '' });
      return;
    }

    let cancelled = false;

    const loadSlots = async () => {
      setMeetingSlotsLoading(true);
      try {
        const userMeetings = await getUserMeetings({ userId });
        if (cancelled) return;

        const all = (userMeetings ?? []) as UserMeetingRow[];

        const m2Record = all.find((m) => m.meeting_id === m2MeetingId);
        if (!m2Record) {
          setMeetingSlots(makeEmptyMeetingSlots());
          return;
        }

        const m2Date = m2Record.meeting_date;

        const otherM2s = all
          .filter((m) => m.meeting_type_code === 'M2_MEETING' && m.meeting_date > m2Date)
          .sort((a, b) =>
            a.meeting_date === b.meeting_date
              ? a.meeting_id - b.meeting_id
              : a.meeting_date.localeCompare(b.meeting_date),
          );
        const nextM2 = otherM2s[0];
        const nextM2Date = nextM2?.meeting_date;

        const implCandidates = all
          .filter((m) => {
            if (m.meeting_type_code !== 'IMPLEMENTATION_MEETING') return false;
            if (m.meeting_date < m2Date) return false;
            if (nextM2Date && m.meeting_date >= nextM2Date) return false;
            return true;
          })
          .sort((a, b) =>
            a.meeting_date === b.meeting_date
              ? a.meeting_id - b.meeting_id
              : a.meeting_date.localeCompare(b.meeting_date),
          );

        const nextSlots = makeEmptyMeetingSlots();

        nextSlots.m2 = {
          meetingId: m2MeetingId,
          date: m2Date,
          attended: Boolean(m2Record.attended ?? false),
        };

        const implKeys: MeetingSlotKey[] = ['impl1', 'impl2', 'impl3'];
        implKeys.forEach((key, idx) => {
          const rec = implCandidates[idx];
          if (rec) {
            nextSlots[key] = {
              meetingId: rec.meeting_id,
              date: rec.meeting_date,
              attended: Boolean(rec.attended ?? false),
            };
          }
        });

        setMeetingSlots(nextSlots);
      } catch (err: unknown) {
        console.error(err);
        const msg = err instanceof Error ? err.message : 'Failed to load meetings';
        setError((prev) => prev ?? msg);
      } finally {
        if (!cancelled) setMeetingSlotsLoading(false);
      }
    };

    void loadSlots();

    return () => {
      cancelled = true;
    };
  }, [notes, selectedNoteId, userId, meetingSlotsVersion]);

  const handleCreateNote = async () => {
    if (!userId) return;
    setError(null);
    setNotesLoading(true);

    const { data, error: err } = await supabase.rpc('create_coaching_note', {
      _user_id: userId,
    });

    if (err) {
      setError(err.message);
      setNotesLoading(false);
      return;
    }

    if (data) {
      const newNote = data as CoachingNote;
      setNotes((prev) => [newNote, ...prev]);
      setSelectedNoteId(newNote.id);
    }
    setNotesLoading(false);
  };

  const handleDeleteNote = async () => {
    if (!selectedNoteId) return;

    setError(null);
    setNotesLoading(true);

    const { error: err } = await supabase.from('coaching_notes').delete().eq('id', selectedNoteId);

    if (err) {
      setError(err.message);
      setNotesLoading(false);
      return;
    }

    setNotes((prev) => {
      const remaining = prev.filter((n) => n.id !== selectedNoteId);
      const nextSelected = remaining[0]?.id ?? null;
      setSelectedNoteId(nextSelected);
      return remaining;
    });

    setSteps([]);
    setComments([]);
    setNotesLoading(false);
    setConfirmDeleteNoteOpen(false);
  };

  const handleRequestDeleteNote = () => {
    if (!selectedNoteId) return;
    setConfirmDeleteNoteOpen(true);
  };

  // Manual action step (no library link)
  const handleAddStep = async () => {
    if (!selectedNoteId || !newStepLabel.trim()) return;
    setError(null);
    setSavingStep(true);

    const { data, error: err } = await supabase.rpc('add_coaching_note_action_step', {
      _coaching_note_id: selectedNoteId,
      _label: newStepLabel.trim(),
      _library_item_id: null,
    });

    if (err) {
      setError(err.message);
      setSavingStep(false);
      return;
    }

    if (data) {
      const newStep = data as CoachingNoteActionStep;
      setSteps((prev) => [...prev, newStep]);
      setNewStepLabel('');
    }
    setSavingStep(false);
  };

  // Add step from Library
  const handleAddStepFromLibrary = async (item: LibraryItemLite) => {
    if (!selectedNoteId) return;
    setError(null);
    setSavingStep(true);

    const { data, error: err } = await supabase.rpc('add_coaching_note_action_step', {
      _coaching_note_id: selectedNoteId,
      _label: (item.title ?? '').trim() || 'Untitled step',
      _library_item_id: item.id,
    });

    if (err) {
      setError(err.message);
      setSavingStep(false);
      return;
    }

    if (data) {
      const newStep = data as CoachingNoteActionStep;
      setSteps((prev) => [...prev, newStep]);
      setLibraryItems((prev) => ({
        ...prev,
        [item.id]: {
          title: item.title ?? null,
          slug: item.slug ?? null,
          node_type: item.node_type ?? null,
        },
      }));
    }
    setSavingStep(false);
  };

  const handleChangeStepStatus = async (stepId: number, status: ActionStepStatus) => {
    setError(null);
    const { error: err } = await supabase
      .from('coaching_note_action_steps')
      .update({ status })
      .eq('id', stepId);

    if (err) {
      setError(err.message);
      return;
    }

    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, status } : s)));
  };

  // Edit / delete action step
  const startEditStep = (step: CoachingNoteActionStep) => {
    setEditingStepId(step.id);
    setEditingStepLabel(step.label);
  };

  const cancelEditStep = () => {
    setEditingStepId(null);
    setEditingStepLabel('');
  };

  const saveEditStep = async () => {
    if (!editingStepId || !editingStepLabel.trim()) return;
    setError(null);
    setSavingStep(true);

    const { error: err } = await supabase
      .from('coaching_note_action_steps')
      .update({ label: editingStepLabel.trim() })
      .eq('id', editingStepId);

    if (err) {
      setError(err.message);
      setSavingStep(false);
      return;
    }

    setSteps((prev) =>
      prev.map((s) => (s.id === editingStepId ? { ...s, label: editingStepLabel.trim() } : s)),
    );
    setSavingStep(false);
    cancelEditStep();
  };

  const handleRequestDeleteStep = (stepId: number) => {
    setPendingDeleteStepId(stepId);
  };

  const handleDeleteStep = async () => {
    if (!pendingDeleteStepId) return;

    setError(null);
    const { error: err } = await supabase
      .from('coaching_note_action_steps')
      .delete()
      .eq('id', pendingDeleteStepId);

    if (err) {
      setError(err.message);
      return;
    }

    setSteps((prev) => prev.filter((s) => s.id !== pendingDeleteStepId));
    if (editingStepId === pendingDeleteStepId) {
      cancelEditStep();
    }
    setPendingDeleteStepId(null);
  };

  const handleCancelDeleteStep = () => {
    setPendingDeleteStepId(null);
  };

  // Notes/comments
  const handleAddComment = async () => {
    if (!selectedNoteId || !newCommentBody.trim()) return;
    setError(null);
    setSavingComment(true);

    const { data, error: err } = await supabase.rpc('add_coaching_note_comment', {
      _coaching_note_id: selectedNoteId,
      _body: newCommentBody.trim(),
    });

    if (err) {
      setError(err.message);
      setSavingComment(false);
      return;
    }

    if (data) {
      const newComment = data as CoachingNoteComment;
      const { data: hydratedComment } = await supabase
        .from('coaching_note_comments')
        .select(
          'id, coaching_note_id, author_id, body, created_at, author:profiles!coaching_note_comments_author_id_fkey(first_name, last_name)',
        )
        .eq('id', newComment.id)
        .maybeSingle();

      const nextComment = (hydratedComment as CoachingNoteCommentRow | null)
        ? mapCommentRow(hydratedComment as CoachingNoteCommentRow)
        : newComment;
      setComments((prev) => [nextComment, ...prev]);
      setNewCommentBody('');
    }

    setSavingComment(false);
  };

  const startEditComment = (comment: CoachingNoteComment) => {
    setEditingCommentId(comment.id);
    setEditingCommentBody(comment.body);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentBody('');
  };

  const saveEditComment = async () => {
    if (!editingCommentId || !editingCommentBody.trim()) return;
    setError(null);
    setSavingComment(true);

    const { error: err } = await supabase
      .from('coaching_note_comments')
      .update({ body: editingCommentBody.trim() })
      .eq('id', editingCommentId);

    if (err) {
      setError(err.message);
      setSavingComment(false);
      return;
    }

    setComments((prev) =>
      prev.map((c) => (c.id === editingCommentId ? { ...c, body: editingCommentBody.trim() } : c)),
    );
    setSavingComment(false);
    cancelEditComment();
  };

  const handleRequestDeleteComment = (commentId: number) => {
    setPendingDeleteCommentId(commentId);
  };

  const handleDeleteComment = async () => {
    if (!pendingDeleteCommentId) return;

    setError(null);
    const { error: err } = await supabase
      .from('coaching_note_comments')
      .delete()
      .eq('id', pendingDeleteCommentId);

    if (err) {
      setError(err.message);
      return;
    }

    setComments((prev) => prev.filter((c) => c.id !== pendingDeleteCommentId));
    if (editingCommentId === pendingDeleteCommentId) {
      cancelEditComment();
    }
    setPendingDeleteCommentId(null);
  };

  const handleCancelDeleteComment = () => {
    setPendingDeleteCommentId(null);
  };

  // Create the M2 meeting and attach m2_meeting_id to coaching_notes
  const handleCreateM2Meeting = async () => {
    const note = notes.find((n) => n.id === selectedNoteId) as CoachingNoteWithM2 | undefined;
    if (!note || !userId) return;

    const date = newMeetingDates.m2;
    if (!date) {
      setError('Please pick a date for M2.');
      return;
    }

    setSlotSavingKey('m2');
    setError(null);

    try {
      const created = (await createMeetingWithAttendees({
        meetingTypeCode: 'M2_MEETING',
        date,
        attendeeIds: [userId],
        title: userDisplayName ? `${userDisplayName} M2 meeting` : 'M2 meeting',
      })) as CreatedMeeting;

      const meetingId = created.id;

      const { error: updateErr } = await supabase
        .from('coaching_notes')
        .update({ m2_meeting_id: meetingId })
        .eq('id', note.id);

      if (updateErr) throw updateErr;

      setNotes((prev) =>
        prev.map((n) => (n.id === note.id ? ({ ...n, m2_meeting_id: meetingId } as CoachingNoteWithM2) : n)),
      );

      setNewMeetingDates((prev) => ({ ...prev, m2: '' }));
      setMeetingSlotsVersion((v) => v + 1);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to create M2 meeting';
      setError(msg);
    } finally {
      setSlotSavingKey(null);
    }
  };

  // Create an Implementation meeting (1/2/3) for this M2 cycle
  const handleCreateImplementationMeeting = async (slotKey: MeetingSlotKey) => {
    if (slotKey === 'm2') return;
    const note = notes.find((n) => n.id === selectedNoteId) as CoachingNoteWithM2 | undefined;
    if (!note || !userId) return;

    const m2MeetingId = note.m2_meeting_id ?? null;
    if (!m2MeetingId) {
      setError('Create the M2 meeting first.');
      return;
    }

    const date = newMeetingDates[slotKey];
    if (!date) {
      setError('Please pick a date for this implementation meeting.');
      return;
    }

    setSlotSavingKey(slotKey);
    setError(null);

    try {
      await createMeetingWithAttendees({
        meetingTypeCode: 'IMPLEMENTATION_MEETING',
        date,
        attendeeIds: [userId],
        title: userDisplayName ? `${userDisplayName} implementation meeting` : 'implementation meeting',
      });

      setNewMeetingDates((prev) => ({ ...prev, [slotKey]: '' }));
      setMeetingSlotsVersion((v) => v + 1);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to create implementation meeting';
      setError(msg);
    } finally {
      setSlotSavingKey(null);
    }
  };

  // Change date of an existing meeting (M2 or Impl)
  const handleChangeSlotDate = async (slotKey: MeetingSlotKey, newDate: string) => {
    const slot = meetingSlots[slotKey];
    if (!slot) return;

    const prevDate = slot.date;
    setSlotSavingKey(slotKey);
    setError(null);

    setMeetingSlots((prev) => ({
      ...prev,
      [slotKey]: slot ? { ...slot, date: newDate } : slot,
    }));

    try {
      const { error: updateErr } = await supabase.from('meetings').update({ date: newDate }).eq('id', slot.meetingId);
      if (updateErr) throw updateErr;
      setMeetingSlotsVersion((v) => v + 1);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to update meeting date';
      setError(msg);
      setMeetingSlots((prev) => ({
        ...prev,
        [slotKey]: slot ? { ...slot, date: prevDate } : slot,
      }));
    } finally {
      setSlotSavingKey(null);
    }
  };

  // Toggle attended for a slot
  const handleToggleSlotAttendance = async (slotKey: MeetingSlotKey) => {
    const slot = meetingSlots[slotKey];
    if (!slot || !userId) return;

    const newValue = !slot.attended;
    setAttendanceSavingKey(slotKey);
    setError(null);

    setMeetingSlots((prev) => ({
      ...prev,
      [slotKey]: slot ? { ...slot, attended: newValue } : slot,
    }));

    try {
      await upsertMeetingAttendance({
        meetingId: slot.meetingId,
        userId,
        attended: newValue,
      });
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to update attendance';
      setError(msg);

      setMeetingSlots((prev) => ({
        ...prev,
        [slotKey]: slot ? { ...slot, attended: !newValue } : slot,
      }));
    } finally {
      setAttendanceSavingKey(null);
    }
  };

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  const lastNote = useMemo(() => (notes.length > 0 ? notes[0] : null), [notes]);

  const stepToDelete = useMemo(
    () => (pendingDeleteStepId != null ? steps.find((s) => s.id === pendingDeleteStepId) ?? null : null),
    [steps, pendingDeleteStepId],
  );

  const commentToDelete = useMemo(
    () =>
      pendingDeleteCommentId != null
        ? comments.find((c) => c.id === pendingDeleteCommentId) ?? null
        : null,
    [comments, pendingDeleteCommentId],
  );

  const handleRequestCreateNote = () => {
    if (!userId) return;
    if (!lastNote) {
      void handleCreateNote();
      return;
    }
    setConfirmCreateOpen(true);
  };

  const handleConfirmCreateNote = () => {
    setConfirmCreateOpen(false);
    void handleCreateNote();
  };

  const handleCancelCreateNote = () => {
    setConfirmCreateOpen(false);
  };

  if (!userId) {
    return (
      <Box
        sx={{
          p: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Select a student on the left to view coaching notes.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2.5 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Confirm create new coaching note */}
      <Dialog open={confirmCreateOpen} onClose={handleCancelCreateNote} maxWidth="xs" fullWidth>
        <DialogTitle>Start new coaching notes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {lastNote ? (
              <>
                Previous coaching notes were created on <strong>{formatShortDate(lastNote.created_at)}</strong>{' '}
                ({formatDistanceFromNow(lastNote.created_at)}).<br />
                <br />
                Create a new coaching note for this student?
              </>
            ) : (
              'Create a new coaching note for this student?'
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelCreateNote}>Cancel</Button>
          <Button onClick={handleConfirmCreateNote} variant="contained" autoFocus>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm delete note */}
      <Dialog
        open={confirmDeleteNoteOpen}
        onClose={() => setConfirmDeleteNoteOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete coaching note?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will delete this coaching note and all its action steps and notes. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteNoteOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteNote} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm delete action step */}
      <Dialog open={pendingDeleteStepId != null} onClose={handleCancelDeleteStep} maxWidth="xs" fullWidth>
        <DialogTitle>Delete action step?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {stepToDelete ? (
              <>
                This will remove the action step &quot;<strong>{stepToDelete.label}</strong>&quot;. This cannot be undone.
              </>
            ) : (
              'This will remove this action step. This cannot be undone.'
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDeleteStep}>Cancel</Button>
          <Button onClick={handleDeleteStep} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm delete note comment */}
      <Dialog open={pendingDeleteCommentId != null} onClose={handleCancelDeleteComment} maxWidth="xs" fullWidth>
        <DialogTitle>Delete note?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {commentToDelete ? (
              <>
                This will delete this note:
                <br />
                <br />
                <em>
                  {commentToDelete.body.length > 120
                    ? commentToDelete.body.slice(0, 117) + '...'
                    : commentToDelete.body}
                </em>
                <br />
                <br />
                This cannot be undone.
              </>
            ) : (
              'This will delete this note. This cannot be undone.'
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDeleteComment}>Cancel</Button>
          <Button onClick={handleDeleteComment} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Library picker dialog */}
      <LibraryItemPickerDialog
        open={libraryDialogOpen}
        onClose={() => setLibraryDialogOpen(false)}
        onSelect={handleAddStepFromLibrary}
      />

      {/* Top: coaching notes selector + create/delete buttons */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              textTransform: 'uppercase',
              fontSize: 13,
              letterSpacing: 1,
              color: 'text.secondary',
              mb: 1.5,
            }}
          >
            Coaching Notes
          </Typography>

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {notes.map((note, idx) => {
  const isSelected = note.id === selectedNoteId;
  const withM2 = note as CoachingNoteWithM2;

  // Prefer the M2 meeting date; fall back to note.created_at if no M2 linked yet
  const labelDate = withM2.m2_meeting?.date || note.created_at;
  const label = `Note ${idx + 1} • ${formatShortDate(labelDate)}`;

  return (
    <Button
      key={note.id}
      size="small"
      variant={isSelected ? 'contained' : 'outlined'}
      color={isSelected ? 'primary' : 'inherit'}
      onClick={() => setSelectedNoteId(note.id)}
      sx={{
        textTransform: 'none',
        borderRadius: 2,
        py: 0.75,
        px: 2,
        fontSize: 13,
        fontWeight: isSelected ? 600 : 500,
        bgcolor: isSelected ? 'primary.main' : 'transparent',
        borderColor: isSelected ? 'primary.main' : 'grey.300',
        transition: 'all 0.2s',
        '&:hover': {
          bgcolor: isSelected ? 'primary.dark' : 'grey.50',
          transform: 'translateY(-1px)',
          boxShadow: isSelected ? 2 : 1,
        },
      }}
    >
      {label}
    </Button>
  );
})}

            {!notesLoading && notes.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No coaching notes yet.
              </Typography>
            )}
          </Stack>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
  variant="contained"
  size="large"
  onClick={handleRequestCreateNote}
  disabled={notesLoading}
  startIcon={<AddIcon />}
  sx={{
    textTransform: 'none',
    borderRadius: 2,
    px: 3.5,
    py: 1.4,
    fontWeight: 700,
    fontSize: 16,
    color: '#3a2a00',
    background: 'linear-gradient(135deg, #facc15 0%, #eab308 100%)',
    boxShadow: '0 4px 12px rgba(234, 179, 8, 0.35)',
    '&:hover': {
      background: 'linear-gradient(135deg, #fde047 0%, #facc15 100%)',
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 20px rgba(234, 179, 8, 0.45)',
    },
    '&:active': {
      transform: 'translateY(0)',
      boxShadow: '0 4px 12px rgba(234, 179, 8, 0.35)',
    },
    transition: 'all 0.2s ease',
  }}
>
  {notes.length ? 'New note' : 'Create first note'}
</Button>


          {selectedNote && (
            <Button
              variant="text"
              size="small"
              color="error"
              onClick={handleRequestDeleteNote}
              startIcon={<DeleteIcon />}
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                alignSelf: 'center',
              }}
            >
              Delete note
            </Button>
          )}
        </Stack>
      </Stack>

      <Divider sx={{ mb: 3 }} />

      {notesLoading && !selectedNote && (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {selectedNote ? (
        <Stack direction="column" spacing={3} sx={{ mt: 1 }}>
          {/* Action steps card */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              border: '1px solid',
              borderColor: 'grey.200',
              borderRadius: 2,
              bgcolor: 'background.paper',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1.5,
                  background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                }}
              >
                <CheckCircleIcon sx={{ fontSize: 20 }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>
                Action steps
              </Typography>
            </Stack>

            {stepsLoading ? (
              <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={20} />
              </Box>
            ) : steps.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No action steps yet. Add one from the Library or manually.
              </Typography>
            ) : (
              <Stack spacing={1.5} sx={{ mb: 3 }}>
                {steps.map((step) => {
                  const linked =
                    step.library_item_id != null ? libraryItems[step.library_item_id] : undefined;

                  const href =
                    step.library_item_id != null && linked
                      ? getContentNodeHref({
                          id: step.library_item_id,
                          slug: linked.slug,
                          node_type: linked.node_type,
                        })
                      : null;

                  const isEditing = editingStepId === step.id;

                  return (
                    <Paper
                      key={step.id}
                      elevation={0}
                      sx={{
                        p: 2,
                        bgcolor: 'grey.50',
                        border: '1px solid',
                        borderColor: 'grey.200',
                        borderRadius: 1.5,
                        transition: 'all 0.2s',
                        '&:hover': {
                          borderColor: 'grey.300',
                          boxShadow: 1,
                        },
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={1.5}
                        alignItems="flex-start"
                        justifyContent="space-between"
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          {isEditing ? (
                            <Stack spacing={1}>
                              <TextField
                                size="small"
                                fullWidth
                                value={editingStepLabel}
                                onChange={(e) => setEditingStepLabel(e.target.value)}
                                autoFocus
                              />
                              <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={saveEditStep}
                                  disabled={savingStep || !editingStepLabel.trim()}
                                  sx={{
                                    textTransform: 'none',
                                    borderRadius: 1.5,
                                    px: 2,
                                  }}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={cancelEditStep}
                                  sx={{
                                    textTransform: 'none',
                                    borderRadius: 1.5,
                                  }}
                                >
                                  Cancel
                                </Button>
                              </Stack>
                            </Stack>
                          ) : (
                            <>
                              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                                {step.label}
                              </Typography>

                              {linked && (
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                  sx={{ mt: 0.5, flexWrap: 'wrap' }}
                                >
                                  <Typography variant="caption" color="text.secondary">
                                    Linked: {linked.title || `Library item #${step.library_item_id}`}
                                  </Typography>

                                  {href && (
                                    <Button
                                      size="small"
                                      variant="text"
                                      component={Link}
                                      href={href}
                                      sx={{
                                        textTransform: 'none',
                                        fontSize: 11,
                                        px: 0.5,
                                        minWidth: 'auto',
                                      }}
                                    >
                                      Open
                                    </Button>
                                  )}
                                </Stack>
                              )}
                            </>
                          )}
                        </Box>

                        <Box sx={{ minWidth: 160 }}>
                          <Stack spacing={1} alignItems="flex-end">
                            <Select
                              size="small"
                              fullWidth
                              value={step.status}
                              onChange={(e) =>
                                handleChangeStepStatus(step.id, e.target.value as ActionStepStatus)
                              }
                              sx={{
                                borderRadius: 1.5,
                                bgcolor: 'white',
                                '& .MuiOutlinedInput-notchedOutline': {
                                  borderColor: 'grey.300',
                                },
                                '&:hover .MuiOutlinedInput-notchedOutline': {
                                  borderColor: 'primary.main',
                                },
                              }}
                            >
                              <MenuItem value="not_started">Not started</MenuItem>
                              <MenuItem value="in_progress">In progress</MenuItem>
                              <MenuItem value="complete">Complete</MenuItem>
                            </Select>

                            {!isEditing && (
                              <Stack direction="row" spacing={1}>
                                <Button
                                  size="small"
                                  variant="text"
                                  startIcon={<EditIcon sx={{ fontSize: 16 }} />}
                                  onClick={() => startEditStep(step)}
                                  sx={{
                                    textTransform: 'none',
                                    fontSize: 12,
                                    minWidth: 0,
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="small"
                                  variant="text"
                                  color="error"
                                  startIcon={<DeleteIcon sx={{ fontSize: 16 }} />}
                                  onClick={() => handleRequestDeleteStep(step.id)}
                                  sx={{
                                    textTransform: 'none',
                                    fontSize: 12,
                                    minWidth: 0,
                                  }}
                                >
                                  Delete
                                </Button>
                              </Stack>
                            )}
                          </Stack>
                        </Box>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}

            {/* Add new step */}
            <Stack spacing={2}>
              <Button
                variant="outlined"
                size="medium"
                fullWidth
                onClick={() => setLibraryDialogOpen(true)}
                sx={{
                  textTransform: 'none',
                  borderRadius: 1.5,
                  borderStyle: 'dashed',
                  borderWidth: 2,
                  py: 1.25,
                  minHeight: 36,
                  fontWeight: 600,
                  fontSize: 13,
                  color: 'primary.main',
                  borderColor: 'grey.300',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'primary.50',
                    borderStyle: 'dashed',
                    borderWidth: 2,
                  },
                }}
              >
                + Add action step from Library/Courses
              </Button>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="New manual action step"
                  value={newStepLabel}
                  onChange={(e) => setNewStepLabel(e.target.value)}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 1.5,
                      bgcolor: 'grey.50',
                      '&:hover fieldset': {
                        borderColor: 'primary.main',
                      },
                      '&.Mui-focused': {
                        bgcolor: 'white',
                      },
                    },
                  }}
                />
                <Button
                  variant="outlined"
                  size="medium"
                  onClick={handleAddStep}
                  disabled={savingStep || !newStepLabel.trim()}
                  sx={{
                    textTransform: 'none',
                    borderRadius: 1.5,
                    px: 3,
                    fontWeight: 600,
                    borderWidth: 2,
                    '&:hover': {
                      borderWidth: 2,
                    },
                  }}
                >
                  Add step
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {/* Notes card */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              border: '1px solid',
              borderColor: 'grey.200',
              borderRadius: 2,
              bgcolor: 'background.paper',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1.5,
                  background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                }}
              >
                <NoteIcon sx={{ fontSize: 20 }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>
                Notes
              </Typography>
            </Stack>

            {commentsLoading ? (
              <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={20} />
              </Box>
            ) : comments.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No notes yet. Use this area to capture key context from your sessions.
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 260, overflowY: 'auto', mb: 2, pr: 1 }}>
                <Stack spacing={1.5}>
                  {comments.map((c) => {
                    const isEditing = editingCommentId === c.id;
                    return (
                      <Paper
                        key={c.id}
                        elevation={0}
                        sx={{
                          p: 2,
                          borderRadius: 1.5,
                          border: '1px solid',
                          borderColor: 'grey.200',
                          borderLeft: '4px solid',
                          borderLeftColor: 'primary.main',
                          bgcolor: 'grey.50',
                          transition: 'all 0.2s',
                          '&:hover': {
                            boxShadow: 1,
                            transform: 'translateX(4px)',
                          },
                        }}
                      >
                        {isEditing ? (
                          <Stack spacing={1}>
                            <TextField
                              multiline
                              minRows={2}
                              fullWidth
                              value={editingCommentBody}
                              onChange={(e) => setEditingCommentBody(e.target.value)}
                              autoFocus
                            />
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <Button
                                size="small"
                                variant="contained"
                                onClick={saveEditComment}
                                disabled={savingComment || !editingCommentBody.trim()}
                                sx={{
                                  textTransform: 'none',
                                  borderRadius: 1.5,
                                  px: 2,
                                }}
                              >
                                Save
                              </Button>
                              <Button
                                size="small"
                                variant="text"
                                onClick={cancelEditComment}
                                sx={{
                                  textTransform: 'none',
                                  borderRadius: 1.5,
                                }}
                              >
                                Cancel
                              </Button>
                            </Stack>
                          </Stack>
                        ) : (
                          <Stack spacing={0.75}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography
  variant="body2"
  sx={{
    mb: 0.25,
    lineHeight: 1.6,
    whiteSpace: 'pre-line', // <- this is the key
  }}
>
  {c.body}
</Typography>

                              </Box>

                              <Stack direction="row" spacing={0.5}>
                                <IconButton size="small" onClick={() => startEditComment(c)} sx={{ p: 0.5 }}>
                                  <EditIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleRequestDeleteComment(c.id)}
                                  sx={{ p: 0.5 }}
                                >
                                  <DeleteIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Stack>
                            </Stack>

                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                              {formatDateTime(c.created_at)} • {formatAuthorName(c)}
                            </Typography>
                          </Stack>
                        )}
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>
            )}

            <Stack spacing={1.5}>
              <TextField
                placeholder="Add note"
                multiline
                minRows={2}
                value={newCommentBody}
                onChange={(e) => setNewCommentBody(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    bgcolor: 'grey.50',
                    '&:hover fieldset': {
                      borderColor: 'primary.main',
                    },
                    '&.Mui-focused': {
                      bgcolor: 'white',
                    },
                  },
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  size="medium"
                  onClick={handleAddComment}
                  disabled={savingComment || !newCommentBody.trim()}
                  sx={{
                    textTransform: 'none',
                    borderRadius: 1.5,
                    px: 3,
                    fontWeight: 600,
                    borderWidth: 2,
                    '&:hover': {
                      borderWidth: 2,
                    },
                  }}
                >
                  Add note
                </Button>
              </Box>
            </Stack>
          </Paper>

          {/* Meetings (M2 / Implementation) */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              border: '1px solid',
              borderColor: 'grey.200',
              borderRadius: 2,
              bgcolor: 'background.paper',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1.5,
                  background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                }}
              >
                <EventAvailableIcon sx={{ fontSize: 20 }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>
                Meetings
              </Typography>
            </Stack>

            {meetingSlotsLoading ? (
              <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={20} />
              </Box>
            ) : (
              <Stack spacing={2}>
                {MEETING_SLOTS.map((cfg) => {
                  const slotKey = cfg.key;
                  const slot = meetingSlots[slotKey];
                  const hasMeeting = Boolean(slot);
                  const isM2 = slotKey === 'm2';

                  const busy =
                    meetingSlotsLoading || slotSavingKey === slotKey || attendanceSavingKey === slotKey;

                  const m2Exists = Boolean((selectedNote as CoachingNoteWithM2 | null)?.m2_meeting_id);

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
                            {cfg.label}
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
                            onChange={(e) => {
                              const v = e.target.value;
                              if (hasMeeting) {
                                void handleChangeSlotDate(slotKey, v);
                              } else {
                                setNewMeetingDates((prev) => ({
                                  ...prev,
                                  [slotKey]: v,
                                }));
                              }
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
                                onChange={() => void handleToggleSlotAttendance(slotKey)}
                                disabled={busy}
                              />
                              <Typography variant="body2">Attended</Typography>
                            </Stack>
                          ) : (
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() =>
                                isM2 ? void handleCreateM2Meeting() : void handleCreateImplementationMeeting(slotKey)
                              }
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
          </Paper>
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Create a coaching note to add action steps, notes, and meetings.
        </Typography>
      )}
    </Box>
  );
}
