// src/components/coach/UserWinsPanel.tsx
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
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material';
import {
  EmojiEventsOutlined as TrophyIcon,
  EditOutlined as EditIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import type { Win } from '@/types/coaching';

type Props = {
  userId: string | null;
};

/**
 * Your UI + RPCs clearly assume wins have these fields.
 * If your Win type already includes them, this intersection is harmless.
 */
type WinRow = Win & {
  id: string;
  added_by?: string | null;
};

type ProfileMini = {
  id: string;
  first_name: string | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function UserWinsPanel({ userId }: Props) {
  const [wins, setWins] = useState<WinRow[]>([]);
  const [winsLoading, setWinsLoading] = useState(false);

  const [newWinBody, setNewWinBody] = useState('');
  const [savingWin, setSavingWin] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [firstNameByProfileId, setFirstNameByProfileId] = useState<Record<string, string>>({});

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editWinId, setEditWinId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteWinId, setDeleteWinId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const winsById = useMemo(() => {
    const m = new Map<string, WinRow>();
    for (const w of wins) m.set(w.id, w);
    return m;
  }, [wins]);

  // Load wins when user changes
  useEffect(() => {
    setWins([]);
    setFirstNameByProfileId({});
    setError(null);

    if (!userId) return;

    let cancelled = false;

    const loadWins = async () => {
      setWinsLoading(true);

      const { data, error } = await supabase
        .from('wins')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setWins([]);
        setWinsLoading(false);
        return;
      }

      const loadedWins = (data ?? []) as unknown as WinRow[];
      setWins(loadedWins);
      setWinsLoading(false);

      // Fetch first_name for added_by
      const addedByIds = Array.from(
        new Set(
          loadedWins
            .map((w) => w.added_by ?? null)
            .filter((x): x is string => typeof x === 'string' && x.length > 0)
        )
      );

      if (addedByIds.length === 0) return;

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name')
        .in('id', addedByIds);

      if (cancelled) return;

      if (profilesError) {
        console.warn('Failed to load win author names:', profilesError.message);
        return;
      }

      const rows = (profilesData ?? []) as unknown as ProfileMini[];

      const map: Record<string, string> = {};
      for (const p of rows) {
        if (p?.id) map[p.id] = p.first_name ?? '';
      }
      setFirstNameByProfileId(map);
    };

    void loadWins();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleAddWin = async () => {
    if (!userId || !newWinBody.trim()) return;
    setError(null);
    setSavingWin(true);

    const { data, error } = await supabase.rpc('add_win', {
      _user_id: userId,
      _body: newWinBody.trim(),
    });

    if (error) {
      setError(error.message);
      setSavingWin(false);
      return;
    }

    if (data) {
      const newWin = data as unknown as WinRow;
      setWins((prev) => [newWin, ...prev]);
      setNewWinBody('');

      // best-effort hydrate added_by name for newly created row
      const addedBy = newWin.added_by ?? undefined;
      if (addedBy && !firstNameByProfileId[addedBy]) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, first_name')
          .eq('id', addedBy)
          .maybeSingle();

        const p = (prof ?? null) as unknown as ProfileMini | null;

        if (p?.id) {
          setFirstNameByProfileId((prev) => ({
            ...prev,
            [p.id]: p.first_name ?? '',
          }));
        }
      }
    }

    setSavingWin(false);
  };

  const openEdit = (w: WinRow) => {
    setError(null);
    setEditWinId(w.id);
    setEditBody(w.body ?? '');
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditWinId(null);
    setEditBody('');
    setSavingEdit(false);
  };

  const handleSaveEdit = async () => {
    if (!editWinId) return;

    const trimmed = editBody.trim();
    if (!trimmed) return;

    setError(null);
    setSavingEdit(true);

    const { data, error } = await supabase.rpc('update_win', {
      _win_id: editWinId,
      _body: trimmed,
    });

    if (error) {
      setError(error.message);
      setSavingEdit(false);
      return;
    }

    if (data) {
      const updated = data as unknown as WinRow;
      setWins((prev) => prev.map((w) => (w.id === editWinId ? updated : w)));
    }

    setSavingEdit(false);
    closeEdit();
  };

  const openDelete = (w: WinRow) => {
    setError(null);
    setDeleteWinId(w.id);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeleteWinId(null);
    setDeleting(false);
  };

  const handleConfirmDelete = async () => {
    if (!deleteWinId) return;

    setError(null);
    setDeleting(true);

    const { data, error } = await supabase.rpc('delete_win', {
      _win_id: deleteWinId,
    });

    if (error) {
      setError(error.message);
      setDeleting(false);
      return;
    }

    const deleted = (data ?? null) as unknown as WinRow | null;
    const deletedId = deleted?.id ?? deleteWinId;

    setWins((prev) => prev.filter((w) => w.id !== deletedId));
    setDeleting(false);
    closeDelete();
  };

  if (!userId) {
    return (
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
        <Typography variant="body2" color="text.secondary">
          Select a student to view their wins.
        </Typography>
      </Paper>
    );
  }

  return (
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
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

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
          <TrophyIcon sx={{ fontSize: 20 }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>
          Wins
        </Typography>
      </Stack>

      {winsLoading ? (
        <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={20} />
        </Box>
      ) : wins.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No wins logged yet. Celebrate their progress here.
        </Typography>
      ) : (
        <Box sx={{ maxHeight: 260, overflowY: 'auto', mb: 2, pr: 1 }}>
          <Stack spacing={1.5}>
            {wins.map((w) => {
              const id = w.id;
              const addedBy = w.added_by ?? null;
              const addedByName = addedBy ? firstNameByProfileId[addedBy] : '';

              const footer = addedByName?.trim()
                ? `${formatDateTime(w.created_at)} · Added by ${addedByName}`
                : `${formatDateTime(w.created_at)}${addedBy ? ' · Added by (unknown)' : ''}`;

              return (
                <Paper
                  key={id}
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
                    '&:hover': { boxShadow: 1, transform: 'translateX(4px)' },
                  }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body1"
                        sx={{
                          mb: 0.75,
                          lineHeight: 1.6,
                          fontSize: 15,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {w.body}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                        {footer}
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={0.25} sx={{ pt: 0.25 }}>
                      <Tooltip title="Edit win" placement="top">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => openEdit(w)}
                            sx={{ borderRadius: 1.25, '&:hover': { bgcolor: 'grey.100' } }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>

                      <Tooltip title="Delete win" placement="top">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => openDelete(w)}
                            sx={{ borderRadius: 1.25, '&:hover': { bgcolor: 'grey.100' } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </Box>
      )}

      <Stack spacing={1.5}>
        <TextField
          placeholder="Add win"
          multiline
          minRows={2}
          value={newWinBody}
          onChange={(e) => setNewWinBody(e.target.value)}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 1.5,
              bgcolor: 'grey.50',
              '&:hover fieldset': { borderColor: 'primary.main' },
              '&.Mui-focused': { bgcolor: 'white' },
            },
          }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            size="medium"
            onClick={handleAddWin}
            disabled={savingWin || !newWinBody.trim()}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              px: 3,
              fontWeight: 600,
              borderWidth: 2,
              '&:hover': { borderWidth: 2 },
            }}
          >
            Add win
          </Button>
        </Box>
      </Stack>

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={savingEdit ? undefined : closeEdit} fullWidth maxWidth="sm">
        <DialogTitle>Edit win</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            placeholder="Win text"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeEdit} disabled={savingEdit} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveEdit}
            disabled={savingEdit || !editBody.trim()}
            variant="contained"
            sx={{ textTransform: 'none' }}
          >
            {savingEdit ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onClose={deleting ? undefined : closeDelete} fullWidth maxWidth="xs">
        <DialogTitle>Delete win?</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            This will permanently remove the win.
          </Typography>

          {deleteWinId && winsById.get(deleteWinId) && (
            <Paper
              elevation={0}
              sx={{
                mt: 2,
                p: 1.5,
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'grey.200',
                bgcolor: 'grey.50',
              }}
            >
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {winsById.get(deleteWinId)?.body}
              </Typography>
            </Paper>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDelete} disabled={deleting} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            disabled={deleting}
            variant="contained"
            color="error"
            sx={{ textTransform: 'none' }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
