'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Snackbar,
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
import { LoadingButton } from '@mui/lab';
import GroupIcon from '@mui/icons-material/Group';
import EditIcon from '@mui/icons-material/Edit';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import AddIcon from '@mui/icons-material/Add';

type Person = { id: string; name: string; email: string };

type PartnershipMember = {
  user_id: string;
  full_name: string;
  email: string;
};

type Partnership = {
  id: string;
  name: string | null;
  shared_kpis: boolean;
  shared_attendance: boolean;
  shared_notes: boolean;
  is_active: boolean;
  created_at: string;
  members: PartnershipMember[];
};

type PartnershipsResponse = {
  items: Partnership[];
};

type UsersResponse = {
  items: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  }[];
  total: number;
};

type SnackbarState = {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info' | 'warning';
};

type EditForm = {
  id: string | null;
  name: string;
  shared_kpis: boolean;
  shared_attendance: boolean;
  shared_notes: boolean;
  is_active: boolean;
  memberUserIds: string[];
};

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error';
}

async function fetchPartnerships(): Promise<Partnership[]> {
  const res = await fetch('/api/admin/partnerships');
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json())?.error || msg;
    } catch {}
    throw new Error(msg);
  }
  const data: PartnershipsResponse = await res.json();
  return data.items ?? [];
}

async function searchUsersForPartnership(query: string): Promise<Person[]> {
  const u = new URL('/api/admin/users', window.location.origin);
  if (query) u.searchParams.set('query', query);
  u.searchParams.set('page', '1');
  u.searchParams.set('limit', '20');
  const r = await fetch(u.toString());
  if (!r.ok) {
    let msg = r.statusText;
    try {
      msg = (await r.json())?.error || msg;
    } catch {}
    throw new Error(msg);
  }
  const data: UsersResponse = await r.json();
  return (data.items ?? []).map((it) => ({
    id: it.id,
    email: (it.email || '').toLowerCase(),
    name: [it.first_name, it.last_name].filter(Boolean).join(' ') || it.email || it.id,
  }));
}

async function savePartnership(form: EditForm): Promise<Partnership> {
  const payload = {
    name: form.name.trim() || null,
    shared_kpis: form.shared_kpis,
    shared_attendance: form.shared_attendance,
    shared_notes: form.shared_notes,
    is_active: form.is_active,
    user_ids: form.memberUserIds,
  };

  const isNew = !form.id;
  const url = isNew
    ? '/api/admin/partnerships'
    : `/api/admin/partnerships/${encodeURIComponent(form.id as string)}`;

  const res = await fetch(url, {
    method: isNew ? 'POST' : 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || res.statusText);
  }
  return data as Partnership;
}

async function deletePartnership(id: string): Promise<void> {
  const res = await fetch(`/api/admin/partnerships/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json())?.error || msg;
    } catch {}
    throw new Error(msg);
  }
}

export default function PartnershipsAdmin() {
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const [snack, setSnack] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'info',
  });

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // For user search inside dialog
  const [userQuery, setUserQuery] = useState('');
  const [serverUserQuery, setServerUserQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<Person[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const userDebounceRef = useRef<number | null>(null);

  const [form, setForm] = useState<EditForm | null>(null);

  // Map of user_id -> Person (for members display)
  const [userLookup, setUserLookup] = useState<Record<string, Person>>({});

  // Debounce user search
  useEffect(() => {
    if (userDebounceRef.current) window.clearTimeout(userDebounceRef.current);
    userDebounceRef.current = window.setTimeout(() => {
      setServerUserQuery(userQuery.trim());
    }, 300);
    return () => {
      if (userDebounceRef.current) window.clearTimeout(userDebounceRef.current);
    };
  }, [userQuery]);

  useEffect(() => {
    let alive = true;
    if (!serverUserQuery) {
      setUserSearchResults([]);
      return;
    }
    (async () => {
      try {
        setUserSearchLoading(true);
        const results = await searchUsersForPartnership(serverUserQuery);
        if (!alive) return;
        setUserSearchResults(results);
        setUserLookup((prev) => {
          const next = { ...prev };
          results.forEach((p) => {
            next[p.id] = p;
          });
          return next;
        });
      } catch (err: unknown) {
        console.error(err);
        setSnack({
          open: true,
          message: 'Failed to search users.',
          severity: 'error',
        });
      } finally {
        if (alive) setUserSearchLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [serverUserQuery]);

  // Initial partnerships load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const items = await fetchPartnerships();
        if (!alive) return;
        setPartnerships(items);

        // seed userLookup with members
        const map: Record<string, Person> = {};
        items.forEach((p) => {
          (p.members ?? []).forEach((m) => {
            if (!m.user_id) return;
            map[m.user_id] = {
              id: m.user_id,
              email: (m.email || '').toLowerCase(),
              name: m.full_name || m.email || m.user_id,
            };
          });
        });
        setUserLookup(map);
      } catch (err: unknown) {
        console.error(err);
        setSnack({
          open: true,
          message: 'Failed to load partnerships.',
          severity: 'error',
        });
      } finally {
        if (alive) {
          setLoading(false);
          setHasFetched(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const openNewDialog = () => {
    setForm({
      id: null,
      name: '',
      shared_kpis: true,
      shared_attendance: false,
      shared_notes: false,
      is_active: true,
      memberUserIds: [],
    });
    setUserQuery('');
    setUserSearchResults([]);
    setEditOpen(true);
  };

  const openEditDialog = (p: Partnership) => {
    setForm({
      id: p.id,
      name: p.name ?? '',
      shared_kpis: p.shared_kpis,
      shared_attendance: p.shared_attendance,
      shared_notes: p.shared_notes,
      is_active: p.is_active,
      memberUserIds: (p.members ?? []).map((m) => m.user_id),
    });
    setUserQuery('');
    setUserSearchResults([]);
    setEditOpen(true);

    // make sure members live in lookup
    setUserLookup((prev) => {
      const next = { ...prev };
      (p.members ?? []).forEach((m) => {
        next[m.user_id] = {
          id: m.user_id,
          email: (m.email || '').toLowerCase(),
          name: m.full_name || m.email || m.user_id,
        };
      });
      return next;
    });
  };

  const closeDialog = () => {
    if (saving) return;
    setEditOpen(false);
    setForm(null);
    setUserQuery('');
    setUserSearchResults([]);
  };

  const handleFormChange = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    if (!form) return;
    setForm({ ...form, [key]: value });
  };

  const addMember = (person: Person) => {
    if (!form) return;
    if (form.memberUserIds.includes(person.id)) return;
    setForm({
      ...form,
      memberUserIds: [...form.memberUserIds, person.id],
    });
    setUserLookup((prev) => ({
      ...prev,
      [person.id]: person,
    }));
  };

  const removeMember = (userId: string) => {
    if (!form) return;
    setForm({
      ...form,
      memberUserIds: form.memberUserIds.filter((id) => id !== userId),
    });
  };

  const selectedMembers: Person[] = useMemo(() => {
    if (!form) return [];
    return form.memberUserIds.map((id) => userLookup[id]).filter(Boolean);
  }, [form, userLookup]);

  const handleSave = useCallback(async () => {
    if (!form) return;

    // Guardrails: need ≥2 members
    if (form.memberUserIds.length < 2) {
      setSnack({
        open: true,
        message: 'Add at least two members to create a partnership.',
        severity: 'warning',
      });
      return;
    }

    // Optional gentle nudge: active but no domain selected
    const hasAnyDomain =
      form.shared_kpis || form.shared_attendance || form.shared_notes;
    if (form.is_active && !hasAnyDomain) {
      setSnack({
        open: true,
        message:
          'This partnership is active but no domains are shared. It will not grant any access until you enable a domain.',
        severity: 'info',
      });
    }

    try {
      setSaving(true);
      const saved = await savePartnership(form);

      setPartnerships((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id);
        if (idx === -1) {
          return [saved, ...prev];
        }
        const next = [...prev];
        next[idx] = saved;
        return next;
      });

      // seed lookup from response members
      setUserLookup((prev) => {
        const next = { ...prev };
        (saved.members ?? []).forEach((m) => {
          next[m.user_id] = {
            id: m.user_id,
            email: (m.email || '').toLowerCase(),
            name: m.full_name || m.email || m.user_id,
          };
        });
        return next;
      });

      setSnack({
        open: true,
        message: form.id ? 'Partnership updated.' : 'Partnership created.',
        severity: 'success',
      });
      setEditOpen(false);
      setForm(null);
    } catch (err: unknown) {
      console.error(err);
      setSnack({
        open: true,
        message: getErrorMessage(err) || 'Failed to save partnership.',
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [form]);

  const confirmDelete = (id: string) => setDeletingId(id);

  const handleDelete = useCallback(async () => {
    if (!deletingId) return;
    const id = deletingId;
    try {
      await deletePartnership(id);
      setPartnerships((prev) => prev.filter((p) => p.id !== id));
      setSnack({
        open: true,
        message: 'Partnership deleted.',
        severity: 'success',
      });
    } catch (err: unknown) {
      console.error(err);
      setSnack({
        open: true,
        message: getErrorMessage(err) || 'Failed to delete partnership.',
        severity: 'error',
      });
    } finally {
      setDeletingId(null);
    }
  }, [deletingId]);

  const renderDomainChips = (p: Partnership) => (
    <Stack direction="row" spacing={1}>
      <Chip
        size="small"
        label="KPIs"
        color={p.shared_kpis ? 'primary' : 'default'}
        variant={p.shared_kpis ? 'filled' : 'outlined'}
      />
      <Chip
        size="small"
        label="Attendance"
        color={p.shared_attendance ? 'primary' : 'default'}
        variant={p.shared_attendance ? 'filled' : 'outlined'}
      />
      <Chip
        size="small"
        label="Notes"
        color={p.shared_notes ? 'primary' : 'default'}
        variant={p.shared_notes ? 'filled' : 'outlined'}
      />
    </Stack>
  );

  const renderMembersPreview = (p: Partnership) => {
    const members = p.members ?? [];
    if (members.length === 0) return <Typography variant="body2" color="text.secondary">No members</Typography>;
    const names = members.map((m) => m.full_name || m.email || m.user_id);
    const preview = names.slice(0, 3).join(', ');
    const extra = names.length > 3 ? ` +${names.length - 3} more` : '';
    return (
      <Tooltip title={names.join(', ')}>
        <Typography variant="body2">{preview}{extra}</Typography>
      </Tooltip>
    );
  };

  const activeNoDomain =
    !!form &&
    form.is_active &&
    !form.shared_kpis &&
    !form.shared_attendance &&
    !form.shared_notes;

  return (
    <Paper
      elevation={0}
      sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <GroupIcon fontSize="small" />
          <Typography variant="h6" fontWeight={600}>
            Partnerships
          </Typography>
        </Stack>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={openNewDialog}
        >
          New partnership
        </Button>
      </Stack>

      {!hasFetched && loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : partnerships.length === 0 ? (
        <Alert severity="info">
          No partnerships yet. Click &quot;New partnership&quot; to create one.
        </Alert>
      ) : (
        <Box sx={{ width: '100%', overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 180 }}>Name</TableCell>
                <TableCell sx={{ minWidth: 220 }}>Shared domains</TableCell>
                <TableCell sx={{ minWidth: 220 }}>Members</TableCell>
                <TableCell sx={{ minWidth: 120 }}>Status</TableCell>
                <TableCell align="right" sx={{ minWidth: 160 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {partnerships.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {p.name || '(no name)'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.id}
                    </Typography>
                  </TableCell>
                  <TableCell>{renderDomainChips(p)}</TableCell>
                  <TableCell>{renderMembersPreview(p)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={p.is_active ? 'Active' : 'Inactive'}
                      color={p.is_active ? 'success' : 'default'}
                      variant={p.is_active ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <IconButton
                        aria-label="Edit partnership"
                        onClick={() => openEditDialog(p)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        aria-label="Delete partnership"
                        sx={{ color: 'error.main' }}
                        onClick={() => confirmDelete(p.id)}
                      >
                        <DeleteForeverIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {loading && hasFetched && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
              <CircularProgress size={18} />
            </Box>
          )}
        </Box>
      )}

      {/* Edit / Create dialog */}
      <Dialog open={editOpen} onClose={closeDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {form?.id ? 'Edit partnership' : 'New partnership'}
        </DialogTitle>
        <DialogContent dividers>
          {form && (
            <Stack spacing={3} sx={{ mt: 1 }}>
              <TextField
                label="Name"
                fullWidth
                value={form.name}
                onChange={(e) => handleFormChange('name', e.target.value)}
                placeholder="Optional label, e.g. Accountability buddies"
              />

              <Stack direction="row" spacing={3}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.shared_kpis}
                      onChange={(e) =>
                        handleFormChange('shared_kpis', e.target.checked)
                      }
                    />
                  }
                  label="Share KPIs"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.shared_attendance}
                      onChange={(e) =>
                        handleFormChange('shared_attendance', e.target.checked)
                      }
                    />
                  }
                  label="Share attendance"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.shared_notes}
                      onChange={(e) =>
                        handleFormChange('shared_notes', e.target.checked)
                      }
                    />
                  }
                  label="Share coaching notes"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.is_active}
                      onChange={(e) =>
                        handleFormChange('is_active', e.target.checked)
                      }
                    />
                  }
                  label="Active"
                />
              </Stack>

              {activeNoDomain && (
                <Alert severity="warning" variant="outlined">
                  This partnership is active but doesn’t share any domains yet.
                  It will not grant access until at least one domain is enabled.
                </Alert>
              )}

              <Stack spacing={1}>
                <Typography variant="subtitle2">Members</Typography>
                <Typography variant="body2" color="text.secondary">
                  Add users to this partnership. If domains overlap with another
                  active partnership for a user, the backend trigger will reject
                  it and you&apos;ll see an error.
                </Typography>

                {/* Selected members */}
                {selectedMembers.length === 0 ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontStyle: 'italic', mt: 1 }}
                  >
                    No members yet.
                  </Typography>
                ) : (
                  <Stack
                    spacing={1}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      p: 1,
                      maxHeight: 200,
                      overflowY: 'auto',
                    }}
                  >
                    {selectedMembers.map((m) => (
                      <Stack
                        key={m.id}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={500}>
                            {m.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {m.email}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => removeMember(m.id)}
                        >
                          Remove
                        </Button>
                      </Stack>
                    ))}
                  </Stack>
                )}

                {/* Search + results */}
                <Box sx={{ mt: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Search users to add"
                    placeholder="Search by name or email…"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                  />
                  {userSearchLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 1 }}>
                      <CircularProgress size={18} />
                    </Box>
                  )}
                  {userSearchResults.length > 0 && (
                    <Box
                      sx={{
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        mt: 1,
                        maxHeight: 240,
                        overflowY: 'auto',
                      }}
                    >
                      {userSearchResults.map((u) => {
                        const already = form.memberUserIds.includes(u.id);
                        return (
                          <Stack
                            key={u.id}
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ px: 1.5, py: 0.75 }}
                          >
                            <Box>
                              <Typography variant="body2" fontWeight={500}>
                                {u.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {u.email}
                              </Typography>
                            </Box>
                            <Button
                              size="small"
                              startIcon={<AddIcon fontSize="small" />}
                              disabled={already}
                              onClick={() => addMember(u)}
                            >
                              {already ? 'Added' : 'Add'}
                            </Button>
                          </Stack>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={saving}>
            Cancel
          </Button>
          <LoadingButton
            variant="contained"
            onClick={handleSave}
            loading={saving}
            disabled={!form}
          >
            Save
          </LoadingButton>
        </DialogActions>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deletingId} onClose={() => setDeletingId(null)}>
        <DialogTitle>Delete partnership?</DialogTitle>
        <DialogContent>
          This action cannot be undone. Are you sure you want to delete this
          partnership?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        message={snack.message}
      />
    </Paper>
  );
}
