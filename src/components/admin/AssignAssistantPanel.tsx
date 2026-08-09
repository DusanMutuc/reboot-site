// components/admin/AssignAssistantPanel.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { LoadingButton } from '@mui/lab';
import AddIcon from '@mui/icons-material/Add';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import SearchIcon from '@mui/icons-material/Search';

type Person = { id: string; name: string; email: string };
type Assignment = {
  user: { id: string; name: string };
  assistant: { id: string; name: string };
  assigned_at?: string | null;
  is_active?: boolean;
};

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function mutateJSON(url: string, init: RequestInit): Promise<void> {
  const res = await fetch(url, init);
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
}

export default function AssignAssistantPanel() {
  const [users, setUsers] = useState<Person[]>([]);
  const [assistants, setAssistants] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessUser, setAccessUser] = useState<Person | null>(null);
  const [revokeAssistant, setRevokeAssistant] = useState<Person | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [assignmentAssistant, setAssignmentAssistant] = useState<Person | null>(null);
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [snack, setSnack] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  const loadLists = useCallback(async () => {
    const [userData, assistantData, assignmentData] = await Promise.all([
      getJSON<{ items: Person[] }>('/api/admin/list-users'),
      getJSON<{ items: Person[] }>('/api/admin/list-assistants'),
      getJSON<{ items: Assignment[] }>('/api/admin/assistant-assignments'),
    ]);

    setUsers(userData.items || []);
    setAssistants(assistantData.items || []);
    setAssignments(
      (assignmentData.items || []).map((item) => ({
        ...item,
        is_active: item.is_active !== false,
      })),
    );
  }, []);

  useEffect(() => {
    void loadLists()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to load assistants';
        setSnack({ open: true, message, severity: 'error' });
      })
      .finally(() => setLoading(false));
  }, [loadLists]);

  const userOptions = useMemo(
    () => users.map((user) => ({ ...user, label: `${user.name} — ${user.email}` })),
    [users],
  );
  const assistantOptions = useMemo(
    () => assistants.map((assistant) => ({ ...assistant, label: `${assistant.name} — ${assistant.email}` })),
    [assistants],
  );
  const assistantIds = useMemo(
    () => new Set(assistants.map((assistant) => assistant.id)),
    [assistants],
  );
  const assistantById = useMemo(
    () => new Map(assistants.map((assistant) => [assistant.id, assistant])),
    [assistants],
  );
  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.is_active !== false),
    [assignments],
  );
  const assignmentsByUser = useMemo(() => {
    const grouped = new Map<string, Assignment[]>();

    for (const assignment of activeAssignments) {
      const current = grouped.get(assignment.user.id) || [];
      current.push(assignment);
      grouped.set(assignment.user.id, current);
    }

    return grouped;
  }, [activeAssignments]);
  const accessUserOptions = useMemo(
    () => userOptions.filter((user) => !assistantIds.has(user.id)),
    [assistantIds, userOptions],
  );
  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...users]
      .filter((user) => {
        if (!query) return true;

        const assignedAssistants = (assignmentsByUser.get(user.id) || []).map((assignment) => {
          const assistant = assistantById.get(assignment.assistant.id);
          return `${assistant?.name || assignment.assistant.name} ${assistant?.email || ''}`;
        });

        return [user.name, user.email, ...assignedAssistants]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  }, [assistantById, assignmentsByUser, search, users]);

  async function grantAssistantAccess() {
    if (!accessUser) return;
    setGranting(true);

    try {
      await mutateJSON('/api/admin/assign-assistant-role', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: accessUser.id }),
      });
      await loadLists();
      setAccessUser(null);
      setSnack({ open: true, message: 'Assistant access granted.', severity: 'success' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error granting assistant access';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setGranting(false);
    }
  }

  async function removeAssistantAccess() {
    if (!revokeAssistant) return;
    setRevoking(true);

    try {
      const assistantAssignments = activeAssignments.filter(
        (assignment) => assignment.assistant.id === revokeAssistant.id,
      );

      for (const assignment of assistantAssignments) {
        await mutateJSON(
          `/api/admin/assistant-assignments?user_id=${encodeURIComponent(assignment.user.id)}&assistant_id=${encodeURIComponent(revokeAssistant.id)}`,
          { method: 'DELETE' },
        );
      }

      await mutateJSON(
        `/api/admin/assign-assistant-role?user_id=${encodeURIComponent(revokeAssistant.id)}`,
        { method: 'DELETE' },
      );
      await loadLists();
      setRevokeAssistant(null);
      setSnack({ open: true, message: 'Assistant access removed.', severity: 'success' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error removing assistant access';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setRevoking(false);
    }
  }

  async function assignAssistantToUser(userId: string) {
    if (!assignmentAssistant) return;
    setAssigningUserId(userId);

    try {
      await mutateJSON('/api/admin/assistant-assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          assistant_id: assignmentAssistant.id,
          replace: false,
        }),
      });
      await loadLists();
      setEditingUserId(null);
      setAssignmentAssistant(null);
      setSnack({ open: true, message: 'Assistant assigned.', severity: 'success' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error assigning assistant';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setAssigningUserId(null);
    }
  }

  async function removeAssignment(userId: string, assistantId: string) {
    const assignmentKey = `${userId}:${assistantId}`;
    setRemoving(assignmentKey);

    try {
      await mutateJSON(
        `/api/admin/assistant-assignments?user_id=${encodeURIComponent(userId)}&assistant_id=${encodeURIComponent(assistantId)}`,
        { method: 'DELETE' },
      );
      setAssignments((current) =>
        current.map((assignment) =>
          assignment.user.id === userId && assignment.assistant.id === assistantId
            ? { ...assignment, is_active: false }
            : assignment,
        ),
      );
      setSnack({ open: true, message: 'Assistant removed from member.', severity: 'success' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error removing assignment';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setRemoving(null);
    }
  }

  function toggleAssignmentEditor(userId: string) {
    setEditingUserId((current) => (current === userId ? null : userId));
    setAssignmentAssistant(null);
  }

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="adminSectionTitle">Member assistant coverage</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            View current members and manage the assistants supporting each of them.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<ManageAccountsIcon />}
          onClick={() => setAccessOpen((open) => !open)}
        >
          {accessOpen ? 'Close access controls' : 'Manage assistant access'}
        </Button>
      </Box>

      <Collapse in={accessOpen} unmountOnExit>
        <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'grey.50' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr auto 1fr' },
              gap: 2.5,
              alignItems: 'stretch',
            }}
          >
            <Box sx={{ display: 'grid', gap: 1.5, alignContent: 'start' }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>Grant assistant access</Typography>
                <Typography variant="body2" color="text.secondary">
                  Give a current member access to the assistant experience.
                </Typography>
              </Box>
              <Autocomplete
                options={accessUserOptions}
                value={accessUser}
                onChange={(_, value) => setAccessUser(value)}
                renderInput={(params) => <TextField {...params} label="Select member" size="small" />}
                noOptionsText="No eligible members"
              />
              <LoadingButton
                variant="contained"
                onClick={grantAssistantAccess}
                loading={granting}
                disabled={!accessUser}
                sx={{ justifySelf: 'start' }}
              >
                Grant access
              </LoadingButton>
            </Box>

            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />

            <Box sx={{ display: 'grid', gap: 1.5, alignContent: 'start' }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>Remove assistant access</Typography>
                <Typography variant="body2" color="text.secondary">
                  This also ends the assistant&apos;s active member assignments.
                </Typography>
              </Box>
              <Autocomplete
                options={assistantOptions}
                value={revokeAssistant}
                onChange={(_, value) => setRevokeAssistant(value)}
                renderInput={(params) => <TextField {...params} label="Select assistant" size="small" />}
                noOptionsText="No assistants"
              />
              <LoadingButton
                variant="outlined"
                color="error"
                onClick={removeAssistantAccess}
                loading={revoking}
                disabled={!revokeAssistant}
                sx={{ justifySelf: 'start' }}
              >
                Remove access
              </LoadingButton>
            </Box>
          </Box>
        </Paper>
      </Collapse>

      <TextField
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        label="Search members or assistants"
        placeholder="Search by name or email"
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          },
        }}
      />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="adminSectionTitle">Current members</Typography>
        <Typography variant="body2" color="text.secondary">
          {visibleUsers.length} of {users.length}
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : users.length === 0 ? (
        <Alert severity="info">No current members found.</Alert>
      ) : visibleUsers.length === 0 ? (
        <Alert severity="info">No members or assistants match your search.</Alert>
      ) : (
        <Stack spacing={1.5}>
          {visibleUsers.map((user) => {
            const userAssignments = assignmentsByUser.get(user.id) || [];
            const assignedAssistantIds = new Set(
              userAssignments.map((assignment) => assignment.assistant.id),
            );
            const availableAssistants = assistantOptions.filter(
              (assistant) => assistant.id !== user.id && !assignedAssistantIds.has(assistant.id),
            );
            const isEditing = editingUserId === user.id;

            return (
              <Paper key={user.id} variant="outlined" sx={{ p: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: 'space-between',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 1.5,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body1" fontWeight={600} noWrap>
                      {user.name || user.email}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {user.email}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => toggleAssignmentEditor(user.id)}
                    disabled={assistantOptions.length === 0}
                  >
                    {isEditing ? 'Close' : 'Add assistant'}
                  </Button>
                </Box>

                <Box sx={{ mt: 1.5 }}>
                  {userAssignments.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No assistant assigned
                    </Typography>
                  ) : (
                    <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
                      {userAssignments.map((assignment) => {
                        const assistant = assistantById.get(assignment.assistant.id);
                        const assistantName = assistant?.name || assignment.assistant.name || assistant?.email;
                        const assignmentKey = `${user.id}:${assignment.assistant.id}`;
                        const assignedDate = assignment.assigned_at
                          ? new Date(assignment.assigned_at).toLocaleDateString()
                          : null;
                        const tooltip = [assistant?.email, assignedDate ? `Assigned ${assignedDate}` : null]
                          .filter(Boolean)
                          .join(' · ');

                        return (
                          <Tooltip key={assignmentKey} title={tooltip}>
                            <Chip
                              label={assistantName || 'Assistant'}
                              variant="outlined"
                              onDelete={() => removeAssignment(user.id, assignment.assistant.id)}
                              disabled={removing === assignmentKey}
                            />
                          </Tooltip>
                        );
                      })}
                    </Stack>
                  )}
                </Box>

                <Collapse in={isEditing} unmountOnExit>
                  <Box
                    sx={{
                      mt: 2,
                      p: 2,
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto auto' },
                      gap: 1,
                      alignItems: 'center',
                      bgcolor: 'grey.50',
                      borderRadius: 1.5,
                    }}
                  >
                    <Autocomplete
                      options={availableAssistants}
                      value={assignmentAssistant}
                      onChange={(_, value) => setAssignmentAssistant(value)}
                      renderInput={(params) => (
                        <TextField {...params} label={`Assistant for ${user.name || user.email}`} size="small" />
                      )}
                      noOptionsText="All assistants are already assigned"
                    />
                    <LoadingButton
                      variant="contained"
                      onClick={() => assignAssistantToUser(user.id)}
                      loading={assigningUserId === user.id}
                      disabled={!assignmentAssistant}
                    >
                      Assign
                    </LoadingButton>
                    <Button onClick={() => toggleAssignmentEditor(user.id)}>Cancel</Button>
                  </Box>
                </Collapse>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={3800}
        onClose={() => setSnack((current) => ({ ...current, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack.severity}
          variant="filled"
          onClose={() => setSnack((current) => ({ ...current, open: false }))}
          sx={{ width: '100%' }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
