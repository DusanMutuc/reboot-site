'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import type {
  ActionStepStatus,
  CoachingNoteActionStep,
  CoachingNoteComment,
} from '@/types/coaching';
import LibraryItemPickerDialog, { type LibraryItemLite } from './LibraryItemPickerDialog';
import {
  createMeetingWithAttendees,
  getMeetingSyncSources,
  getUserMeetings,
  upsertMeetingAttendance,
} from '@/lib/meetings';
import ActionStepsPanel from './coaching-notes/ActionStepsPanel';
import CommentsPanel from './coaching-notes/CommentsPanel';
import MeetingSlotsPanel from './coaching-notes/MeetingSlotsPanel';
import NoteSelector from './coaching-notes/NoteSelector';
import TrainingAssignmentPanel from './coaching-notes/TrainingAssignmentPanel';
import {
  makeEmptyMeetingDateInputs,
  makeEmptyMeetingSlots,
  type CoachingNoteWithM2,
  type ContentNodeInfo,
  type MeetingSlotKey,
  type MeetingSlotsState,
} from './coaching-notes/types';
import { formatDistanceFromNow, formatShortDate } from './coaching-notes/utils';

type Props = {
  userId: string | null;
  fixedNoteId?: number | null;
  businessAuditReviewDate?: string | null;
  businessAuditNextReviewDate?: string | null;
  cycleEndDate?: string | null;
  contentMode?: 'full' | 'notes-only';
  priorityActionStepPositions?: Record<number, number>;
  onActionStepsChanged?: (steps: CoachingNoteActionStep[]) => void;
  onPriorityActionStepDeleted?: (actionStepId: number) => void;
};

type ProfileNameRow = {
  first_name: string | null;
  last_name: string | null;
};

type ContentNodeLite = {
  id: number;
  title: string | null;
  slug: string | null;
  node_type: string | null;
};

type UserMeetingRow = {
  meeting_id: number;
  meeting_date: string;
  meeting_type_code: string;
  attended: boolean | null;
};

type CreatedMeeting = {
  id: number;
};

type CommentAuthorProfile = {
  first_name: string | null;
  last_name: string | null;
};

type CoachingNoteCommentRow = {
  id: number;
  coaching_note_id: number;
  author_id: string | null;
  body: string;
  created_at: string;
  author: CommentAuthorProfile | CommentAuthorProfile[] | null;
};

function normalizeCommentAuthor(
  author: CoachingNoteCommentRow['author'],
): CommentAuthorProfile | null {
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

export default function CoachingNotesPanel({
  userId,
  fixedNoteId = null,
  businessAuditReviewDate = null,
  businessAuditNextReviewDate = null,
  cycleEndDate = null,
  contentMode = 'full',
  priorityActionStepPositions = {},
  onActionStepsChanged,
  onPriorityActionStepDeleted,
}: Props) {
  const isNarrow = useMediaQuery('(max-width:900px)');
  const businessAuditMode = fixedNoteId != null && businessAuditReviewDate != null;
  const [notes, setNotes] = useState<CoachingNoteWithM2[]>([]);
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

  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
  const [libraryItems, setLibraryItems] = useState<Record<number, ContentNodeInfo>>({});

  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [editingStepLabel, setEditingStepLabel] = useState('');

  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');

  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [confirmDeleteNoteOpen, setConfirmDeleteNoteOpen] = useState(false);
  const [pendingDeleteStepId, setPendingDeleteStepId] = useState<number | null>(null);
  const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState<number | null>(null);

  const [meetingSlots, setMeetingSlots] = useState<MeetingSlotsState>(makeEmptyMeetingSlots);
  const [newMeetingDates, setNewMeetingDates] = useState(makeEmptyMeetingDateInputs);
  const [meetingSlotsLoading, setMeetingSlotsLoading] = useState(false);
  const [slotSavingKey, setSlotSavingKey] = useState<MeetingSlotKey | null>(null);
  const [attendanceSavingKey, setAttendanceSavingKey] = useState<MeetingSlotKey | null>(null);
  const [meetingSlotsVersion, setMeetingSlotsVersion] = useState(0);

  const [userDisplayName, setUserDisplayName] = useState('');

  useEffect(() => {
    onActionStepsChanged?.(steps);
  }, [onActionStepsChanged, steps]);

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
    setNewMeetingDates(makeEmptyMeetingDateInputs());
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

      let notesQuery = supabase
        .from('coaching_notes')
        .select('*, m2_meeting:meetings(date)')
        .eq('user_id', userId);

      if (fixedNoteId != null) {
        notesQuery = notesQuery.eq('id', fixedNoteId);
      }

      const { data, error: err } = await notesQuery.order('created_at', {
        ascending: false,
      });

      if (cancelled) return;

      if (err) {
        setError(err.message);
        setNotesLoading(false);
        return;
      }

      const rows = (data ?? []) as CoachingNoteWithM2[];
      const sorted = [...rows].sort((a, b) => {
        const aDateStr = a.m2_meeting?.date || a.created_at;
        const bDateStr = b.m2_meeting?.date || b.created_at;
        const aTime = new Date(aDateStr).getTime();
        const bTime = new Date(bDateStr).getTime();
        const aSafe = Number.isNaN(aTime) ? 0 : aTime;
        const bSafe = Number.isNaN(bTime) ? 0 : bTime;
        return bSafe - aSafe;
      });

      setNotes(sorted);
      if (sorted.length > 0) {
        setSelectedNoteId(sorted[0].id);
      }
      setNotesLoading(false);
    };

    void loadNotes();

    return () => {
      cancelled = true;
    };
  }, [fixedNoteId, userId]);

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
    setNewMeetingDates(makeEmptyMeetingDateInputs());

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
          rows
            .map((step) => step.library_item_id)
            .filter((id): id is number => typeof id === 'number'),
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

      const map: Record<number, ContentNodeInfo> = {};
      (nodes ?? []).forEach((nodeRow) => {
        const node = nodeRow as ContentNodeLite;
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

      if (cancelled) return;

      if (err) {
        setError((prev) => prev ?? err.message);
      } else if (data) {
        setComments((data as CoachingNoteCommentRow[]).map(mapCommentRow));
      }

      setCommentsLoading(false);
    };

    void loadStepsAndTitles();
    void loadComments();

    return () => {
      cancelled = true;
    };
  }, [selectedNoteId]);

  useEffect(() => {
    const note = notes.find((entry) => entry.id === selectedNoteId);
    if (!note || !userId) {
      setMeetingSlots(makeEmptyMeetingSlots());
      setNewMeetingDates(makeEmptyMeetingDateInputs());
      return;
    }

    const m2MeetingId = note.m2_meeting_id ?? null;
    if (!m2MeetingId && !businessAuditMode) {
      setMeetingSlots(makeEmptyMeetingSlots());
      setNewMeetingDates(makeEmptyMeetingDateInputs());
      return;
    }

    let cancelled = false;

    const loadSlots = async () => {
      setMeetingSlotsLoading(true);

      try {
        const userMeetings = await getUserMeetings({ userId });
        if (cancelled) return;

        const all = (userMeetings ?? []) as UserMeetingRow[];
        const syncSources = await getMeetingSyncSources(
          all.map((meeting) => meeting.meeting_id),
        );
        if (cancelled) return;

        if (businessAuditMode) {
          const implCandidates = all
            .filter(
              (meeting) =>
                meeting.meeting_type_code === 'IMPLEMENTATION_MEETING' &&
                meeting.meeting_date >= businessAuditReviewDate &&
                (!businessAuditNextReviewDate ||
                  meeting.meeting_date < businessAuditNextReviewDate),
            )
            .sort((a, b) =>
              a.meeting_date === b.meeting_date
                ? a.meeting_id - b.meeting_id
                : a.meeting_date.localeCompare(b.meeting_date),
            );
          const nextSlots = makeEmptyMeetingSlots();
          const implKeys: MeetingSlotKey[] = ['impl1', 'impl2', 'impl3'];

          implKeys.forEach((key, index) => {
            const record = implCandidates[index];
            if (!record) return;

            nextSlots[key] = {
              meetingId: record.meeting_id,
              date: record.meeting_date,
              attended: Boolean(record.attended ?? false),
              source: syncSources.get(record.meeting_id) ?? 'manual',
            };
          });

          setMeetingSlots(nextSlots);
          return;
        }

        const m2Record = all.find((meeting) => meeting.meeting_id === m2MeetingId);

        if (!m2Record) {
          setMeetingSlots(makeEmptyMeetingSlots());
          return;
        }

        const m2Date = m2Record.meeting_date;
        const otherM2s = all
          .filter(
            (meeting) =>
              meeting.meeting_type_code === 'M2_MEETING' && meeting.meeting_date > m2Date,
          )
          .sort((a, b) =>
            a.meeting_date === b.meeting_date
              ? a.meeting_id - b.meeting_id
              : a.meeting_date.localeCompare(b.meeting_date),
          );
        const nextM2Date = otherM2s[0]?.meeting_date;
        const nextCycleDate = [nextM2Date, cycleEndDate]
          .filter((date): date is string => Boolean(date))
          .sort((left, right) => left.localeCompare(right))[0];

        const implCandidates = all
          .filter((meeting) => {
            if (meeting.meeting_type_code !== 'IMPLEMENTATION_MEETING') return false;
            if (meeting.meeting_date < m2Date) return false;
            if (nextCycleDate && meeting.meeting_date >= nextCycleDate) return false;
            return true;
          })
          .sort((a, b) =>
            a.meeting_date === b.meeting_date
              ? a.meeting_id - b.meeting_id
              : a.meeting_date.localeCompare(b.meeting_date),
          );

        const nextSlots = makeEmptyMeetingSlots();
        nextSlots.m2 = {
          meetingId: m2MeetingId!,
          date: m2Date,
          attended: Boolean(m2Record.attended ?? false),
          source: syncSources.get(m2MeetingId!) ?? 'manual',
        };

        const implKeys: MeetingSlotKey[] = ['impl1', 'impl2', 'impl3'];
        implKeys.forEach((key, index) => {
          const record = implCandidates[index];
          if (!record) return;

          nextSlots[key] = {
            meetingId: record.meeting_id,
            date: record.meeting_date,
            attended: Boolean(record.attended ?? false),
            source: syncSources.get(record.meeting_id) ?? 'manual',
          };
        });

        setMeetingSlots(nextSlots);
      } catch (err: unknown) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'Failed to load meetings';
        setError((prev) => prev ?? message);
      } finally {
        if (!cancelled) {
          setMeetingSlotsLoading(false);
        }
      }
    };

    void loadSlots();

    return () => {
      cancelled = true;
    };
  }, [
    businessAuditMode,
    businessAuditNextReviewDate,
    businessAuditReviewDate,
    cycleEndDate,
    meetingSlotsVersion,
    notes,
    selectedNoteId,
    userId,
  ]);

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
      const newNote = data as CoachingNoteWithM2;
      setNotes((prev) => [newNote, ...prev]);
      setSelectedNoteId(newNote.id);
    }

    setNotesLoading(false);
  };

  const handleDeleteNote = async () => {
    if (!selectedNoteId) return;

    setError(null);
    setNotesLoading(true);

    const { error: err } = await supabase
      .from('coaching_notes')
      .delete()
      .eq('id', selectedNoteId);

    if (err) {
      setError(err.message);
      setNotesLoading(false);
      return;
    }

    setNotes((prev) => {
      const remaining = prev.filter((note) => note.id !== selectedNoteId);
      setSelectedNoteId(remaining[0]?.id ?? null);
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

    setSteps((prev) => prev.map((step) => (step.id === stepId ? { ...step, status } : step)));
  };

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
      prev.map((step) =>
        step.id === editingStepId ? { ...step, label: editingStepLabel.trim() } : step,
      ),
    );
    setSavingStep(false);
    cancelEditStep();
  };

  const handleRequestDeleteStep = (stepId: number) => {
    setPendingDeleteStepId(stepId);
  };

  const handleDeleteStep = async () => {
    if (!pendingDeleteStepId) return;

    const deletedStepId = pendingDeleteStepId;
    setError(null);

    const { error: err } = await supabase
      .from('coaching_note_action_steps')
      .delete()
      .eq('id', deletedStepId);

    if (err) {
      setError(err.message);
      return;
    }

    setSteps((prev) => prev.filter((step) => step.id !== deletedStepId));
    if (editingStepId === deletedStepId) {
      cancelEditStep();
    }
    if (priorityActionStepPositions[deletedStepId]) {
      onPriorityActionStepDeleted?.(deletedStepId);
    }
    setPendingDeleteStepId(null);
  };

  const handleCancelDeleteStep = () => {
    setPendingDeleteStepId(null);
  };

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
      prev.map((comment) =>
        comment.id === editingCommentId
          ? { ...comment, body: editingCommentBody.trim() }
          : comment,
      ),
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

    setComments((prev) => prev.filter((comment) => comment.id !== pendingDeleteCommentId));
    if (editingCommentId === pendingDeleteCommentId) {
      cancelEditComment();
    }
    setPendingDeleteCommentId(null);
  };

  const handleCancelDeleteComment = () => {
    setPendingDeleteCommentId(null);
  };

  const handleCreateM2Meeting = async () => {
    const note = notes.find((entry) => entry.id === selectedNoteId);
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
        prev.map((entry) =>
          entry.id === note.id ? { ...entry, m2_meeting_id: meetingId } : entry,
        ),
      );
      setNewMeetingDates((prev) => ({ ...prev, m2: '' }));
      setMeetingSlotsVersion((prev) => prev + 1);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to create M2 meeting';
      setError(message);
    } finally {
      setSlotSavingKey(null);
    }
  };

  const handleChangeSlotDate = async (slotKey: MeetingSlotKey, newDate: string) => {
    const slot = meetingSlots[slotKey];
    if (!slot) return;

    if (slot.source === 'ghl') {
      setError('This meeting is managed in GHL. Reschedule it there and the date will sync automatically.');
      return;
    }

    const prevDate = slot.date;
    setSlotSavingKey(slotKey);
    setError(null);

    setMeetingSlots((prev) => ({
      ...prev,
      [slotKey]: slot ? { ...slot, date: newDate } : slot,
    }));

    try {
      const { error: updateErr } = await supabase
        .from('meetings')
        .update({ date: newDate })
        .eq('id', slot.meetingId);

      if (updateErr) throw updateErr;
      setMeetingSlotsVersion((prev) => prev + 1);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to update meeting date';
      setError(message);
      setMeetingSlots((prev) => ({
        ...prev,
        [slotKey]: slot ? { ...slot, date: prevDate } : slot,
      }));
    } finally {
      setSlotSavingKey(null);
    }
  };

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
      const message = err instanceof Error ? err.message : 'Failed to update attendance';
      setError(message);
      setMeetingSlots((prev) => ({
        ...prev,
        [slotKey]: slot ? { ...slot, attended: !newValue } : slot,
      }));
    } finally {
      setAttendanceSavingKey(null);
    }
  };

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  const lastNote = useMemo(() => (notes.length > 0 ? notes[0] : null), [notes]);

  const stepToDelete = useMemo(
    () =>
      pendingDeleteStepId != null
        ? steps.find((step) => step.id === pendingDeleteStepId) ?? null
        : null,
    [pendingDeleteStepId, steps],
  );

  const commentToDelete = useMemo(
    () =>
      pendingDeleteCommentId != null
        ? comments.find((comment) => comment.id === pendingDeleteCommentId) ?? null
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
          Select a student above to view coaching notes.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Dialog open={confirmCreateOpen} onClose={handleCancelCreateNote} maxWidth="xs" fullWidth>
        <DialogTitle>Start new coaching notes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {lastNote ? (
              <>
                Previous coaching notes were created on{' '}
                <strong>{formatShortDate(lastNote.created_at)}</strong> (
                {formatDistanceFromNow(lastNote.created_at)}).
                <br />
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

      <Dialog
        open={confirmDeleteNoteOpen}
        onClose={() => setConfirmDeleteNoteOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete coaching note?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will delete this coaching note and all its action steps and notes. This cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteNoteOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteNote} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pendingDeleteStepId != null} onClose={handleCancelDeleteStep} maxWidth="xs" fullWidth>
        <DialogTitle>Delete action step?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {stepToDelete ? (
              <>
                This will remove the action step &quot;<strong>{stepToDelete.label}</strong>&quot;.
                This cannot be undone.
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

      <Dialog
        open={pendingDeleteCommentId != null}
        onClose={handleCancelDeleteComment}
        maxWidth="xs"
        fullWidth
      >
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
                    ? `${commentToDelete.body.slice(0, 117)}...`
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

      {contentMode === 'notes-only' ? (
        notesLoading && !selectedNote ? (
          <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : selectedNote ? (
          <CommentsPanel
            comments={comments}
            commentsLoading={commentsLoading}
            editingCommentBody={editingCommentBody}
            editingCommentId={editingCommentId}
            newCommentBody={newCommentBody}
            savingComment={savingComment}
            onAddComment={() => {
              void handleAddComment();
            }}
            onCancelEditComment={cancelEditComment}
            onChangeEditingCommentBody={setEditingCommentBody}
            onChangeNewCommentBody={setNewCommentBody}
            onRequestDeleteComment={handleRequestDeleteComment}
            onSaveEditComment={() => {
              void saveEditComment();
            }}
            onStartEditComment={startEditComment}
          />
        ) : (
          <Paper
            elevation={0}
            sx={{
              p: 3,
              border: '1px solid',
              borderColor: 'grey.200',
              borderRadius: 2,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              The coaching note connected to this Business Review could not be loaded.
            </Typography>
          </Paper>
        )
      ) : (
        <>
          <LibraryItemPickerDialog
            open={libraryDialogOpen}
            onClose={() => setLibraryDialogOpen(false)}
            onSelect={handleAddStepFromLibrary}
          />

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="flex-start">
            <Paper
              elevation={0}
              sx={{
                flexBasis: isNarrow ? '100%' : 320,
                flexShrink: 0,
                width: '100%',
                border: '1px solid',
                borderColor: 'grey.200',
                borderRadius: 3,
                p: 2.5,
                bgcolor: 'background.paper',
              }}
            >
              <MeetingSlotsPanel
                attendanceSavingKey={attendanceSavingKey}
                businessAuditMode={businessAuditMode}
                m2Exists={Boolean(selectedNote?.m2_meeting_id)}
                meetingSlots={meetingSlots}
                meetingSlotsLoading={meetingSlotsLoading}
                newMeetingDates={newMeetingDates}
                noteSelected={Boolean(selectedNote)}
                slotSavingKey={slotSavingKey}
                onChangeExistingDate={(slotKey, value) => {
                  void handleChangeSlotDate(slotKey, value);
                }}
                onChangeNewDate={(slotKey, value) => {
                  setNewMeetingDates((prev) => ({
                    ...prev,
                    [slotKey]: value,
                  }));
                }}
                onCreateM2Meeting={() => {
                  void handleCreateM2Meeting();
                }}
                onToggleAttendance={(slotKey) => {
                  void handleToggleSlotAttendance(slotKey);
                }}
              />
            </Paper>

            <Box sx={{ flexGrow: 1, width: '100%', minWidth: 0 }}>
              {fixedNoteId == null ? (
                <NoteSelector
                  notes={notes}
                  notesLoading={notesLoading}
                  selectedNoteId={selectedNoteId}
                  selectedNote={selectedNote}
                  onCreateNote={handleRequestCreateNote}
                  onDeleteNote={handleRequestDeleteNote}
                  onSelectNote={setSelectedNoteId}
                />
              ) : null}

          {notesLoading && !selectedNote ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          ) : null}

          {selectedNote ? (
            <Stack direction="column" spacing={3} sx={{ mt: 1 }}>
              <CommentsPanel
                comments={comments}
                commentsLoading={commentsLoading}
                editingCommentBody={editingCommentBody}
                editingCommentId={editingCommentId}
                newCommentBody={newCommentBody}
                savingComment={savingComment}
                onAddComment={() => {
                  void handleAddComment();
                }}
                onCancelEditComment={cancelEditComment}
                onChangeEditingCommentBody={setEditingCommentBody}
                onChangeNewCommentBody={setNewCommentBody}
                onRequestDeleteComment={handleRequestDeleteComment}
                onSaveEditComment={() => {
                  void saveEditComment();
                }}
                onStartEditComment={startEditComment}
              />

              <TrainingAssignmentPanel
                userId={userId}
                coachingNoteId={selectedNote.id}
              />

              <ActionStepsPanel
                editingStepId={editingStepId}
                editingStepLabel={editingStepLabel}
                libraryItems={libraryItems}
                newStepLabel={newStepLabel}
                priorityActionStepPositions={priorityActionStepPositions}
                savingStep={savingStep}
                steps={steps}
                stepsLoading={stepsLoading}
                onAddStep={handleAddStep}
                onCancelEditStep={cancelEditStep}
                onChangeEditingStepLabel={setEditingStepLabel}
                onChangeNewStepLabel={setNewStepLabel}
                onChangeStepStatus={(stepId, status) => {
                  void handleChangeStepStatus(stepId, status);
                }}
                onOpenLibraryDialog={() => setLibraryDialogOpen(true)}
                onRequestDeleteStep={handleRequestDeleteStep}
                onSaveEditStep={() => {
                  void saveEditStep();
                }}
                onStartEditStep={startEditStep}
              />
            </Stack>
          ) : (
            <Paper
              elevation={0}
              sx={{
                p: 3,
                border: '1px solid',
                borderColor: 'grey.200',
                borderRadius: 2,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {fixedNoteId != null
                  ? 'The selected coaching cycle record could not be loaded.'
                  : 'Create a coaching note to start capturing notes, action steps, and meetings.'}
              </Typography>
            </Paper>
          )}
            </Box>
          </Stack>
        </>
      )}
    </Box>
  );
}
