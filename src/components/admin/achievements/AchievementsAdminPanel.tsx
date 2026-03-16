// src/components/admin/achievements/AchievementsAdminPanel.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import NextImage from 'next/image';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import AchievementForm from './AchievementsForm';
import type { AchievementRow } from '@/types/achievements';
import { supabase } from '@/lib/supabaseClient';

const BUCKET = 'achievements';

function toPublicUrl(keyOrUrl?: string | null): string | null {
  if (!keyOrUrl) return null;
  const v = keyOrUrl.trim();

  if (/^https?:\/\//i.test(v)) return v;

  let p = v.replace(/^\/+/, '');
  if (p.startsWith(`${BUCKET}/`)) p = p.slice(BUCKET.length + 1);
  return supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl ?? null;
}

export default function AchievementsAdminPanel() {
  const [items, setItems] = useState<AchievementRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AchievementRow | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<AchievementRow | null>(null);

  const filtered = useMemo(() => items, [items]);

  const load = useCallback(async (query?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/achievements${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? (data as AchievementRow[]) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load(q.trim() || undefined);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [load, q]);

  function onCreate() {
    setEditing(null);
    setOpen(true);
  }

  function onEdit(row: AchievementRow) {
    setEditing(row);
    setOpen(true);
  }

  async function onDelete(row: AchievementRow) {
    setConfirmingDelete(null);
    const res = await fetch(`/api/admin/achievements?id=${row.id}`, { method: 'DELETE' });
    if (res.ok) load(q);
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Achievements</Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            placeholder="Search by title/code"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: q ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear achievement search" onClick={() => setQ('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
            New
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small" aria-label="Achievements list">
          <TableHead>
            <TableRow>
              <TableCell width={72}>Icon</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Updated</TableCell>
              <TableCell align="right" width={120}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((row) => {
              const iconSrc = toPublicUrl(row.icon_url);

              return (
                <TableRow
                  key={row.id}
                  hover
                  sx={{
                    '& .MuiTableCell-root': {
                      py: 1.5, // taller rows
                    },
                  }}
                >
                  <TableCell>
                    <Box
                      sx={{
                        position: 'relative',
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        bgcolor: 'grey.100',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      {iconSrc ? (
                        <NextImage
                          src={iconSrc}
                          alt={row.title || 'Achievement icon'}
                          fill
                          sizes="48px"
                          style={{ objectFit: 'contain' }}
                        />
                      ) : null}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="body1" fontWeight={600}>
                        {row.title}
                      </Typography>
                      {row.description ? (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          noWrap
                          title={row.description}
                        >
                          {row.description}
                        </Typography>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {row.code}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {row.is_active ? (
                      <Chip size="small" color="success" label="Active" />
                    ) : (
                      <Chip size="small" label="Inactive" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(row.updated_at || row.created_at).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => onEdit(row)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setConfirmingDelete(row)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
                    {loading ? 'Loading…' : 'No achievements found.'}
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Achievement' : 'Create Achievement'}</DialogTitle>
        <DialogContent>
          <AchievementForm
            initial={editing ?? undefined}
            onSaved={() => {
              setOpen(false);
              load(q);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmingDelete} onClose={() => setConfirmingDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete achievement?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">
              This will permanently remove <strong>{confirmingDelete?.title}</strong>. Mappings will be cascade-deleted.
            </Typography>
            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button onClick={() => setConfirmingDelete(null)}>Cancel</Button>
              <Button
                color="error"
                variant="contained"
                onClick={() => confirmingDelete && onDelete(confirmingDelete)}
              >
                Delete
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
