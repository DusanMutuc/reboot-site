'use client';

import {
  ChangeEvent,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { LoadingButton } from '@mui/lab';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import MailOutlineIcon from '@mui/icons-material/MailOutline';

type UserPayload = {
  id: string;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  looker_link: string;
  ghl_user_id: string;
  is_legend: boolean;
  is_past_member: boolean;
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
  is_legend: boolean;
  is_past_member: boolean;
};

type UsersResponse = {
  items: RowFromApi[];
  total: number;
};

type HandleCellChange = <K extends keyof UserPayload>(
  id: string,
  key: K,
  value: UserPayload[K]
) => void;

type UserProfileTableRowProps = {
  userId: string;
  row: UserPayload | undefined;
  saving: boolean;
  resetting: boolean;
  onCellChange: HandleCellChange;
  onConfirmDelete: (id: string) => void;
  onConfirmPasswordReset: (id: string) => void;
  onSave: (id: string) => void;
};

const DEFAULT_ROWS_PER_PAGE = 50;
const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200];
const SEARCH_DEBOUNCE_MS = 250;

async function fetchIndex(
  query: string,
  page: number,
  limit: number,
  signal?: AbortSignal
): Promise<UsersResponse> {
  const url = new URL('/api/admin/users', window.location.origin);
  if (query) url.searchParams.set('query', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    let message = response.statusText;
    try {
      message = (await response.json())?.error || message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

function toUserPayload(row: RowFromApi): UserPayload {
  return {
    id: row.id,
    email: (row.email || '').toLowerCase(),
    phone: row.phone ?? '',
    first_name: row.first_name ?? '',
    last_name: row.last_name ?? '',
    looker_link: row.looker_link ?? '',
    ghl_user_id: row.ghl_user_id ?? '',
    is_legend: !!row.is_legend,
    is_past_member: !!row.is_past_member,
  };
}

const UserProfileTableRow = memo(function UserProfileTableRow({
  userId,
  row,
  saving,
  resetting,
  onCellChange,
  onConfirmDelete,
  onConfirmPasswordReset,
  onSave,
}: UserProfileTableRowProps) {
  return (
    <TableRow hover>
      <TableCell>
        <TextField value={row?.email ?? ''} size="small" InputProps={{ readOnly: true }} />
      </TableCell>
      <TableCell>
        <TextField
          value={row?.first_name ?? ''}
          size="small"
          onChange={(event) => onCellChange(userId, 'first_name', event.target.value)}
        />
      </TableCell>
      <TableCell>
        <TextField
          value={row?.last_name ?? ''}
          size="small"
          onChange={(event) => onCellChange(userId, 'last_name', event.target.value)}
        />
      </TableCell>
      <TableCell>
        <TextField
          value={row?.phone ?? ''}
          size="small"
          onChange={(event) => onCellChange(userId, 'phone', event.target.value)}
          placeholder="Optional"
        />
      </TableCell>
      <TableCell>
        <TextField
          value={row?.looker_link ?? ''}
          size="small"
          onChange={(event) => onCellChange(userId, 'looker_link', event.target.value)}
          placeholder="https://..."
        />
      </TableCell>
      <TableCell>
        <TextField
          value={row?.ghl_user_id ?? ''}
          size="small"
          onChange={(event) => onCellChange(userId, 'ghl_user_id', event.target.value)}
          placeholder="Optional"
        />
      </TableCell>
      <TableCell align="center">
        <Checkbox
          checked={!!row?.is_legend}
          onChange={(event) => onCellChange(userId, 'is_legend', event.target.checked)}
        />
      </TableCell>
      <TableCell align="center">
        <Checkbox
          checked={!!row?.is_past_member}
          onChange={(event) => onCellChange(userId, 'is_past_member', event.target.checked)}
        />
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <IconButton
            aria-label="Delete user"
            onClick={() => onConfirmDelete(userId)}
            sx={{ color: 'error.main' }}
          >
            <DeleteForeverIcon />
          </IconButton>
          <Tooltip title="Send password recovery mail">
            <span>
              <IconButton
                aria-label="Send password recovery mail"
                onClick={() => onConfirmPasswordReset(userId)}
                color="primary"
                disabled={!row?.email || resetting}
              >
                {resetting ? <CircularProgress size={20} /> : <MailOutlineIcon />}
              </IconButton>
            </span>
          </Tooltip>
          <LoadingButton
            variant="contained"
            size="small"
            onClick={() => onSave(userId)}
            loading={saving}
            disabled={!row}
          >
            Save
          </LoadingButton>
        </Stack>
      </TableCell>
    </TableRow>
  );
});

export default function UserProfilesAdmin() {
  const [userIds, setUserIds] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, UserPayload>>({});
  const [totalUsers, setTotalUsers] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [resettingIds, setResettingIds] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resetConfirmId, setResetConfirmId] = useState<string | null>(null);
  const [snack, setSnack] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'info',
  });

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [serverQuery, setServerQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setServerQuery(deferredQuery.trim());
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [deferredQuery]);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoadingUsers(true);
        const { items, total } = await fetchIndex(
          serverQuery,
          page + 1,
          rowsPerPage,
          controller.signal
        );
        if (controller.signal.aborted) return;

        if (items.length === 0 && total > 0 && page > 0) {
          const lastAvailablePage = Math.max(0, Math.ceil(total / rowsPerPage) - 1);
          setPage(lastAvailablePage);
          return;
        }

        const nextRows: Record<string, UserPayload> = {};
        for (const item of items) {
          nextRows[item.id] = toUserPayload(item);
        }

        setUserIds(items.map((item) => item.id));
        setRows(nextRows);
        setTotalUsers(total);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name === 'AbortError') return;
        setSnack({ open: true, message: 'Failed to load users', severity: 'error' });
      } finally {
        if (!controller.signal.aborted) {
          setLoadingUsers(false);
          setHasFetched(true);
        }
      }
    })();

    return () => controller.abort();
  }, [page, refreshKey, rowsPerPage, serverQuery]);

  const handleCellChange = useCallback<HandleCellChange>((id, key, value) => {
    setRows((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], [key]: value } } : prev));
  }, []);

  const handleSaveRow = useCallback(
    async (id: string) => {
      const row = rows[id];
      if (!row) return;

      setSavingIds((prev) => ({ ...prev, [id]: true }));
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
          is_legend: !!row.is_legend,
          is_past_member: !!row.is_past_member,
        };

        const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || response.statusText);

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
            is_legend: !!data.is_legend,
            is_past_member: !!data.is_past_member,
          },
        }));

        setSnack({ open: true, message: 'Saved.', severity: 'success' });
      } catch {
        setSnack({ open: true, message: 'Failed to save user.', severity: 'error' });
      } finally {
        setSavingIds((prev) => ({ ...prev, [id]: false }));
      }
    },
    [rows]
  );

  const handleSendPasswordReset = useCallback(async () => {
    if (!resetConfirmId) return;
    const id = resetConfirmId;
    const row = rows[id];

    if (!row?.email?.trim()) {
      setSnack({ open: true, message: 'User has no email on file.', severity: 'error' });
      setResetConfirmId(null);
      return;
    }

    setResettingIds((prev) => ({ ...prev, [id]: true }));
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, {
        method: 'POST',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || response.statusText);

      setSnack({
        open: true,
        message: `Password recovery email sent to ${row.email}.`,
        severity: 'success',
      });
      setResetConfirmId(null);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to send password recovery email.';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setResettingIds((prev) => ({ ...prev, [id]: false }));
    }
  }, [resetConfirmId, rows]);

  const handleDelete = useCallback(async () => {
    if (!deletingId) return;
    const id = deletingId;

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || response.statusText);

      setSnack({ open: true, message: 'User deleted.', severity: 'success' });
      setRefreshKey((prev) => prev + 1);
    } catch {
      setSnack({ open: true, message: 'Failed to delete user.', severity: 'error' });
    } finally {
      setDeletingId(null);
    }
  }, [deletingId]);

  const handleQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  }, []);

  const handlePageChange = useCallback((_event: unknown, nextPage: number) => {
    setPage(nextPage);
  }, []);

  const handleRowsPerPageChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

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
              <TableCell align="center" sx={{ minWidth: 110 }}>
                Legend
              </TableCell>
              <TableCell align="center" sx={{ minWidth: 130 }}>
                Past member
              </TableCell>
              <TableCell align="right" sx={{ minWidth: 220 }}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: 8 }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: 9 }).map((__, cellIndex) => (
                  <TableCell key={cellIndex}>
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
            placeholder="Search by name or email..."
            value={query}
            onChange={handleQueryChange}
          />
          {loadingUsers && hasFetched && (
            <Typography variant="body2" color="text.secondary">
              Searching...
            </Typography>
          )}
        </Box>
        {hasFetched && totalUsers > 0 && (
          <Typography variant="body2" color="text.secondary">
            {totalUsers} users
          </Typography>
        )}
      </Stack>

      {!hasFetched && loadingUsers ? (
        renderInitialSkeleton()
      ) : userIds.length === 0 ? (
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
                <TableCell align="center" sx={{ minWidth: 110 }}>
                  Legend
                </TableCell>
                <TableCell align="center" sx={{ minWidth: 130 }}>
                  Past member
                </TableCell>
                <TableCell align="right" sx={{ minWidth: 220 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {userIds.map((userId) => (
                <UserProfileTableRow
                  key={userId}
                  userId={userId}
                  row={rows[userId]}
                  saving={!!savingIds[userId]}
                  resetting={!!resettingIds[userId]}
                  onCellChange={handleCellChange}
                  onConfirmDelete={setDeletingId}
                  onConfirmPasswordReset={setResetConfirmId}
                  onSave={handleSaveRow}
                />
              ))}
            </TableBody>
          </Table>

          <TablePagination
            component="div"
            count={totalUsers}
            page={page}
            onPageChange={handlePageChange}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleRowsPerPageChange}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          />

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
      >
        <Alert
          onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
          severity={snack.severity}
          sx={{ width: '100%' }}
        >
          {snack.message}
        </Alert>
      </Snackbar>

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

      <Dialog
        open={!!resetConfirmId}
        onClose={() => {
          if (!resetConfirmId || resettingIds[resetConfirmId]) return;
          setResetConfirmId(null);
        }}
      >
        <DialogTitle>Send password recovery email?</DialogTitle>
        <DialogContent>
          {resetConfirmId && rows[resetConfirmId]?.email
            ? `Send a password recovery email to ${rows[resetConfirmId].email}?`
            : 'Send a password recovery email to this user?'}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setResetConfirmId(null)}
            disabled={!!(resetConfirmId && resettingIds[resetConfirmId])}
          >
            Cancel
          </Button>
          <LoadingButton
            variant="contained"
            onClick={handleSendPasswordReset}
            loading={!!(resetConfirmId && resettingIds[resetConfirmId])}
          >
            Send email
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
}
