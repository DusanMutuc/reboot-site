'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '@/lib/supabaseClient';

type PrivateNote = {
  id: number;
  user_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
};

type AuthorProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export default function PrivateNotesPanel({ userId }: { userId: string }) {
  const [notes, setNotes] = useState<PrivateNote[]>([]);
  const [authorsById, setAuthorsById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.rpc('get_coaching_private_notes_for_user', {
        _user_id: userId,
      });
      if (error) throw error;

      const noteRows = (data ?? []) as PrivateNote[];
      setNotes(noteRows);

      const authorIds = Array.from(new Set(noteRows.map((n) => n.author_id).filter(Boolean))) as string[];
      if (!authorIds.length) {
        setAuthorsById({});
        return;
      }

      const { data: authorRows, error: authorError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', authorIds);
      if (authorError) throw authorError;

      const mapped = ((authorRows ?? []) as AuthorProfile[]).reduce<Record<string, string>>((acc, author) => {
        const fullName = `${author.first_name ?? ''} ${author.last_name ?? ''}`.trim();
        acc[author.id] = fullName || 'Unknown author';
        return acc;
      }, {});
      setAuthorsById(mapped);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load private notes.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setNewNote('');
    setNotes([]);
    setAuthorsById({});
    setError(null);
  }, [userId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const sortedNotes = useMemo(
    () => notes.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [notes]
  );

  async function handleAddNote() {
    const body = newNote.trim();
    if (!body) return;

    try {
      setSubmitting(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error: insertError } = await supabase.from('coaching_private_notes').insert({
        user_id: userId,
        author_id: user?.id ?? null,
        body,
      });
      if (insertError) throw insertError;

      setNewNote('');
      await loadNotes();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save note.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack spacing={1.5} sx={{ height: '100%' }}>
      <TextField
        placeholder="Write a private note about this student…"
        multiline
        minRows={3}
        value={newNote}
        onChange={(e) => setNewNote(e.target.value)}
        disabled={submitting}
        fullWidth
      />
      <Button variant="contained" onClick={handleAddNote} disabled={submitting || !newNote.trim()}>
        {submitting ? 'Saving...' : 'Add note'}
      </Button>

      {error && <Typography variant="body2" color="error">{error}</Typography>}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
        {loading ? (
          <Box sx={{ py: 2, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : sortedNotes.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No private notes yet.</Typography>
        ) : (
          <Stack spacing={1}>
            {sortedNotes.map((note) => (
              <Box
                key={note.id}
                sx={{ p: 1.25, borderRadius: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}
              >
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.98rem' }}>{note.body}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontSize: '0.82rem' }}>
                  {new Date(note.created_at).toLocaleString()} • {note.author_id ? (authorsById[note.author_id] ?? 'Unknown author') : 'Unknown author'}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.95rem" }}>
        🔒 These notes are only visible to coaches/admins, never to members.
      </Typography>
    </Stack>
  );
}
