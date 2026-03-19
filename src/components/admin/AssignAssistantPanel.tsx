// components/admin/AssignAssistantPanel.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Autocomplete,
  TextField,
  Alert,
  Snackbar,
  IconButton,
  Stack,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { LoadingButton } from '@mui/lab';
import CloseIcon from '@mui/icons-material/Close';

type Person = { id: string; name: string; email: string };
type Assignment = {
  user: { id: string; name: string };
  assistant: { id: string; name: string };
  assigned_at?: string | null;
  is_active?: boolean;
};

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json();
}

export default function AssignAssistantPanel() {
  const [users, setUsers] = useState<Person[]>([]);
  const [assistants, setAssistants] = useState<Person[]>([]);
  const [user, setUser] = useState<Person | null>(null);
  const [assignmentUser, setAssignmentUser] = useState<Person | null>(null);
  const [assignmentAssistant, setAssignmentAssistant] = useState<Person | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const loadLists = async () => {
    const [u, a, asg] = await Promise.all([
      getJSON<{ items: Person[] }>('/api/admin/list-users'),
      getJSON<{ items: Person[] }>('/api/admin/list-assistants'),
      getJSON<{ items: Assignment[] }>('/api/admin/assistant-assignments'),
    ]);
    setUsers(u.items || []);
    setAssistants(a.items || []);
    const normalized = (asg.items || []).map((item) => ({
      ...item,
      is_active: item.is_active !== false,
    }));
    setAssignments(normalized);
  };

  useEffect(() => {
    loadLists().catch(() => {
      setSnack({ open: true, message: 'Failed to load users', severity: 'error' });
    });
  }, []);

  const userOptions = useMemo(
    () => users.map((u) => ({ ...u, label: `${u.name} — ${u.email}` })),
    [users]
  );
  const assistantOptions = useMemo(
    () => assistants.map((a) => ({ ...a, label: `${a.name} — ${a.email}` })),
    [assistants]
  );

  async function assign() {
    if (!user) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/assign-assistant-role', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      await loadLists();
      setSnack({ open: true, message: 'Assistant role assigned.', severity: 'success' });
      setUser(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error assigning assistant role';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function assignAssistantToUser() {
    if (!assignmentUser || !assignmentAssistant) return;
    setAssigning(true);
    try {
      const res = await fetch('/api/admin/assistant-assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user_id: assignmentUser.id,
          assistant_id: assignmentAssistant.id,
          replace: replaceExisting,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      await loadLists();
      setSnack({ open: true, message: 'Assistant assigned to user.', severity: 'success' });
      setAssignmentUser(null);
      setAssignmentAssistant(null);
      setReplaceExisting(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error assigning assistant';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setAssigning(false);
    }
  }

  async function removeAssistant(userId: string) {
    setRemoving(userId);
    try {
      const res = await fetch(`/api/admin/assign-assistant-role?user_id=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      setAssistants((prev) => prev.filter((a) => a.id !== userId));
      setSnack({ open: true, message: 'Assistant role removed.', severity: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error removing assistant role';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setRemoving(null);
    }
  }

  async function removeAssignment(userId: string, assistantId: string) {
    setRemoving(`${userId}:${assistantId}`);
    try {
      const res = await fetch(
        `/api/admin/assistant-assignments?user_id=${encodeURIComponent(userId)}&assistant_id=${encodeURIComponent(assistantId)}`,
        { method: 'DELETE' }
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      setAssignments((prev) =>
        prev.map((a) =>
          a.user.id === userId && a.assistant.id === assistantId ? { ...a, is_active: false } : a
        )
      );
      setSnack({ open: true, message: 'Assignment ended.', severity: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error removing assignment';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      <Box sx={{ display: 'grid', gap: 2, maxWidth: 480, mb: 4 }}>
        <Autocomplete
          options={userOptions}
          value={user}
          onChange={(_, v) => setUser(v)}
          renderInput={(params) => <TextField {...params} label="Select user…" />}
        />
        <LoadingButton variant="contained" onClick={assign} loading={busy} disabled={!user}>
          Grant assistant access
        </LoadingButton>

        <Alert severity="info" variant="outlined">
          Assistants can access only the assistant library experience. Use this to grant or remove assistant access.
        </Alert>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          Assign Assistant to User
        </Typography>
        <Box sx={{ display: 'grid', gap: 2, maxWidth: 520 }}>
          <Autocomplete
            options={userOptions}
            value={assignmentUser}
            onChange={(_, v) => setAssignmentUser(v)}
            renderInput={(params) => <TextField {...params} label="Select user…" />}
          />
          <Autocomplete
            options={assistantOptions}
            value={assignmentAssistant}
            onChange={(_, v) => setAssignmentAssistant(v)}
            renderInput={(params) => <TextField {...params} label="Select assistant…" />}
          />
          <Alert severity="info" variant="outlined">
            Assign an assistant to a user so they can see who supports them on their dashboard.
          </Alert>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <LoadingButton
              variant="contained"
              onClick={assignAssistantToUser}
              loading={assigning}
              disabled={!assignmentUser || !assignmentAssistant}
            >
              Assign assistant
            </LoadingButton>
            <FormControlLabel
              control={
                <Switch
                  checked={replaceExisting}
                  onChange={(event) => setReplaceExisting(event.target.checked)}
                />
              }
              label="Replace existing assignment"
            />
          </Box>
        </Box>
      </Box>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          Current assistants
        </Typography>
        {assistants.length === 0 ? (
          <Alert severity="info">No assistants assigned yet.</Alert>
        ) : (
          <Stack spacing={1}>
            {assistants.map((assistant) => (
              <Box
                key={assistant.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  bgcolor: 'background.paper',
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={600}>{assistant.name || assistant.email}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {assistant.email}
                  </Typography>
                </Box>
                <IconButton
                  aria-label={`Remove ${assistant.email}`}
                  onClick={() => removeAssistant(assistant.id)}
                  disabled={removing === assistant.id}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          User assignments
        </Typography>
        {assignments.length === 0 ? (
          <Alert severity="info">No assistant assignments yet.</Alert>
        ) : (
          <Stack spacing={1}>
            {assignments.map((assignment) => (
              <Box
                key={`${assignment.user.id}:${assignment.assistant.id}`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  bgcolor: 'background.paper',
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={600}>
                    {assignment.user.name} → {assignment.assistant.name}
                  </Typography>
                  {assignment.assigned_at ? (
                    <Typography variant="body2" color="text.secondary">
                      Assigned {new Date(assignment.assigned_at).toLocaleDateString()}
                    </Typography>
                  ) : null}
                  {!assignment.is_active ? (
                    <Typography variant="caption" color="text.secondary">
                      Inactive
                    </Typography>
                  ) : null}
                </Box>
                <IconButton
                  aria-label={`Remove assignment for ${assignment.user.name}`}
                  onClick={() => removeAssignment(assignment.user.id, assignment.assistant.id)}
                  disabled={
                    removing === `${assignment.user.id}:${assignment.assistant.id}` ||
                    assignment.is_active === false
                  }
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={3800}
        onClose={() => setSnack({ ...snack, open: false })}
        message={snack.message}
      />
    </>
  );
}
