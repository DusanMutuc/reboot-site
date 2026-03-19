'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Alert,
  Snackbar,
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Stack,
  Skeleton,
} from '@mui/material';
import { LoadingButton } from '@mui/lab';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';

type Person = { id: string; name: string; email: string };

type UserPayload = {
  id: string;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  looker_link: string;
  ghl_user_id: string;
};

type SnackbarState = {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info';
};

type RowFromApi = {
  id: string;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  looker_link: string;
  ghl_user_id: string | null;
};

type UsersResponse = {
  items: RowFromApi[];
  total: number;
};

async function fetchIndex(query: string, page = 1, limit = 200): Promise<UsersResponse> {
  const u = new URL('/api/admin/users', window.location.origin);
  if (query) u.searchParams.set('query', query);
  u.searchParams.set('page', String(page));
  u.searchParams.set('limit', String(limit));
  const r = await fetch(u.toString());
  if (!r.ok) {
    let msg = r.statusText;
    try {
      msg = (await r.json())?.error || msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

export default function UserProfilesAdmin() {
  const [users, setUsers] = useState<Person[]>([]);
  const [rows, setRows] = useState<Record<string, UserPayload>>({});
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [hasFetched, setHasFetched] = useState(false); // gate empty-state until first response

  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [snack, setSnack] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'info',
  });

  const [query, setQuery] = useState('');
  const [serverQuery, setServerQuery] = useState(''); // debounced search value
  const debounceRef = useRef<number | null>(null);

  // Debounce the search input before hitting the API
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setServerQuery(query.trim());
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Load a single, fast index of users (no N+1)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingUsers(true);
        const { items } = await fetchIndex(serverQuery || '', 1, 200);
        if (!alive) return;

        const nextRows: Record<string, UserPayload> = {};
        items.forEach((it) => {
          nextRows[it.id] = {
            id: it.id,
            email: (it.email || '').toLowerCase(),
            phone: it.phone ?? '',
            first_name: it.first_name ?? '',
            last_name: it.last_name ?? '',
            looker_link: it.looker_link ?? '',
            ghl_user_id: it.ghl_user_id ?? '',
          };
        });

        setUsers(
          items.map((it) => ({
            id: it.id,
            name: [it.first_name, it.last_name].filter(Boolean).join(' '),
            email: it.email || '',
          }))
        );
        setRows(nextRows);
      } catch {
        setSnack({ open: true, message: 'Failed to load users', severity: 'error' });
      } finally {
        if (alive) {
          setLoadingUsers(false);
          setHasFetched(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [serverQuery]);

  // Server already filters by query; keep this alias to minimize code changes below
  const filtered = useMemo(() => users, [users]);

  const handleCellChange = useCallback(
    <K extends keyof UserPayload>(id: string, key: K, value: UserPayload[K]) => {
      setRows((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], [key]: value } } : prev));
    },
    []
  );

  const handleSaveRow = useCallback(
    async (id: string) => {
      const row = rows[id];
      if (!row) return;
      setSavingIds((s) => ({ ...s, [id]: true }));
      try {
        const payload = {
          first_name: row.first_name.trim(),
          last_name: row.last_name.trim(),
          looker_link: row.looker_link.trim(),
          phone:
            row.phone && row.phone.toString().trim().length > 0
              ? row.phone.toString().trim()
              : null,
          ghl_user_id:
            row.ghl_user_id && row.ghl_user_id.trim().length > 0
              ? row.ghl_user_id.trim()
              : null,
        };

        const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || res.statusText);

        setRows((prev) => ({
          ...prev,
          [id]: {
            id: data.id,
            email: (data.email || '').toLowerCase(),
            phone: data.phone ?? '',
            first_name: data.first_name ?? '',
            last_name: data.last_name ?? '',
            looker_link: data.looker_link ?? '',
            ghl_user_id: data.ghl_user_id ?? '',
          },
        }));

        setSnack({ open: true, message: 'Saved.', severity: 'success' });
      } catch {
        setSnack({ open: true, message: 'Failed to save user.', severity: 'error' });
      } finally {
        setSavingIds((s) => ({ ...s, [id]: false }));
      }
    },
    [rows]
  );

  const confirmDelete = (id: string) => setDeletingId(id);

  const handleDelete = useCallback(async () => {
    if (!deletingId) return;
    const id = deletingId;
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || res.statusText);

      // Remove from local state
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setRows((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });

      setSnack({ open: true, message: 'User deleted.', severity: 'success' });
    } catch {
      setSnack({ open: true, message: 'Failed to delete user.', severity: 'error' });
    } finally {
      setDeletingId(null);
    }
  }, [deletingId]);

  const renderInitialSkeleton = () => (
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ minWidth: 180 }}>Email</TableCell>
            <TableCell sx={{ minWidth: 140 }}>First name</TableCell>
            <TableCell sx={{ minWidth: 140 }}>Last name</TableCell>
            <TableCell sx={{ minWidth: 140 }}>Phone</TableCell>
            <TableCell sx={{ minWidth: 220 }}>Looker link</TableCell>
            <TableCell sx={{ minWidth: 160 }}>GHL user ID</TableCell>
            <TableCell align="right" sx={{ minWidth: 160 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 7 }).map((__, j) => (
                <TableCell key={j}>
                  <Skeleton height={32} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );

  return (
    <>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box display="flex" alignItems="center" gap={2}>
          <TextField
            size="small"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loadingUsers && hasFetched && (
            <Typography variant="body2" color="text.secondary">Searching…</Typography>
          )}
        </Box>
      </Stack>

      {!hasFetched && loadingUsers ? (
        renderInitialSkeleton()
      ) : filtered.length === 0 ? (
        <Alert severity="info">
          {serverQuery ? 'No matches for your search.' : 'No users found.'}
        </Alert>
      ) : (
        <Box sx={{ width: '100%', overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 180 }}>Email</TableCell>
                <TableCell sx={{ minWidth: 140 }}>First name</TableCell>
                <TableCell sx={{ minWidth: 140 }}>Last name</TableCell>
                <TableCell sx={{ minWidth: 140 }}>Phone</TableCell>
                <TableCell sx={{ minWidth: 220 }}>Looker link</TableCell>
                <TableCell sx={{ minWidth: 160 }}>GHL user ID</TableCell>
                <TableCell align="right" sx={{ minWidth: 160 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((u) => {
                const r = rows[u.id];
                const saving = !!savingIds[u.id];
                return (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <TextField value={r?.email ?? ''} size="small" InputProps={{ readOnly: true }} />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={r?.first_name ?? ''}
                        size="small"
                        onChange={(e) => handleCellChange(u.id, 'first_name', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={r?.last_name ?? ''}
                        size="small"
                        onChange={(e) => handleCellChange(u.id, 'last_name', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={r?.phone ?? ''}
                        size="small"
                        onChange={(e) => handleCellChange(u.id, 'phone', e.target.value)}
                        placeholder="Optional"
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={r?.looker_link ?? ''}
                        size="small"
                        onChange={(e) => handleCellChange(u.id, 'looker_link', e.target.value)}
                        placeholder="https://…"
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={r?.ghl_user_id ?? ''}
                        size="small"
                        onChange={(e) => handleCellChange(u.id, 'ghl_user_id', e.target.value)}
                        placeholder="Optional"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <IconButton
                          aria-label="Delete user"
                          onClick={() => confirmDelete(u.id)}
                          sx={{ color: 'error.main' }}
                        >
                          <DeleteForeverIcon />
                        </IconButton>
                        <LoadingButton
                          variant="contained"
                          size="small"
                          onClick={() => handleSaveRow(u.id)}
                          loading={saving}
                          disabled={!r}
                        >
                          Save
                        </LoadingButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Optional thin loading bar area under table for background fetches */}
          {loadingUsers && hasFetched && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
              <CircularProgress size={18} />
            </Box>
          )}
        </Box>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        message={snack.message}
      />

      <Dialog open={!!deletingId} onClose={() => setDeletingId(null)}>
        <DialogTitle>Delete user?</DialogTitle>
        <DialogContent>
          This action cannot be undone. Are you sure you want to delete this user?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
