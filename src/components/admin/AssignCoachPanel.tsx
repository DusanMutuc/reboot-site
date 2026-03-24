// components/admin/AssignCoachPanel.tsx
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Autocomplete, TextField,
  Alert, Snackbar, Checkbox, FormControlLabel,
  IconButton, CircularProgress, Switch
} from '@mui/material';
import { LoadingButton } from '@mui/lab';
import CloseIcon from '@mui/icons-material/Close';

type Person = { id: string; name: string; email: string };
type RelationshipType = 'primary' | 'implementation';

type CoachResponse = Partial<Person> & {
  id: string;
  relationship_type?: RelationshipType;
};

type AssignedCoach = Person & {
  relationship_type: RelationshipType;
};

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  return r.json();
}

export default function AssignCoachPanel() {
  const [users, setUsers] = useState<Person[]>([]);
  const [coaches, setCoaches] = useState<Person[]>([]);
  const [user, setUser] = useState<Person | null>(null);
  const [coach, setCoach] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(false);
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('primary');
  const [currentCoaches, setCurrentCoaches] = useState<AssignedCoach[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState(false);
  const [removingCoachIds, setRemovingCoachIds] = useState<string[]>([]);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success'
  });

  useEffect(() => {
    (async () => {
      const u = await getJSON<{ items: Person[] }>('/api/admin/list-users');
      const c = await getJSON<{ items: Person[] }>('/api/admin/list-coaches');
      setUsers(u.items || []);
      setCoaches(c.items || []);
    })();
  }, []);

  const userOptions = useMemo(
    () => users.map(u => ({ ...u, label: `${u.name} — ${u.email}` })),
    [users]
  );
  const coachOptions = useMemo(
    () => coaches.map(c => ({ ...c, label: `${c.name} — ${c.email}` })),
    [coaches]
  );

  const loadCurrentCoaches = useCallback(async (userId: string, opts?: { silent?: boolean }) => {
    setLoadingCoaches(true);
    try {
      const res = await fetch(`/api/admin/assign-coach?user_id=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);
      const items: CoachResponse[] = Array.isArray(data?.items) ? data.items : [];
      setCurrentCoaches(
        items.map((item) => ({
          id: item.id,
          name: item.name ?? '',
          email: item.email ?? '',
          relationship_type: item.relationship_type === 'implementation' ? 'implementation' : 'primary',
        }))
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load current coaches';
      if (!opts?.silent) {
        setSnack({ open: true, message, severity: 'error' });
      }
      throw err;
    } finally {
      setLoadingCoaches(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setCurrentCoaches([]);
      return;
    }
    // When changing user, default relationship type back to primary to avoid surprises
    setRelationshipType('primary');
    loadCurrentCoaches(user.id).catch(() => {});
  }, [user?.id, loadCurrentCoaches]);

  async function assign() {
    if (!user || !coach) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/assign-coach', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          coach_id: coach.id,
          replace,
          relationship_type: relationshipType, // 👈 send primary/implementation to API
        })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      await loadCurrentCoaches(user.id, { silent: true }).catch(() => {});
      setSnack({
        open: true,
        message: replace ? 'Coach replaced.' : 'Coach assigned.',
        severity: 'success'
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function removeCoach(coachId: string) {
    if (!user) return;
    setRemovingCoachIds((prev) => prev.includes(coachId) ? prev : [...prev, coachId]);
    try {
      const res = await fetch(
        `/api/admin/assign-coach?user_id=${encodeURIComponent(user.id)}&coach_id=${encodeURIComponent(coachId)}`,
        { method: 'DELETE' }
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      setCurrentCoaches((prev) => prev.filter((c) => c.id !== coachId));
      setSnack({ open: true, message: 'Coach removed.', severity: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error removing coach';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setRemovingCoachIds((prev) => prev.filter((id) => id !== coachId));
    }
  }

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4, alignItems: 'stretch' }}>
        <Box sx={{ display: 'grid', gap: 2, width: { xs: '100%', md: 360 } }}>
          <Autocomplete
            options={userOptions}
            value={user}
            onChange={(_, v) => setUser(v)}
            renderInput={(params) => <TextField {...params} label="Select user…" />}
          />
          <Autocomplete
            options={coachOptions}
            value={coach}
            onChange={(_, v) => setCoach(v)}
            renderInput={(params) => <TextField {...params} label="Select coach…" />}
          />

          <FormControlLabel
            control={
              <Switch
                checked={relationshipType === 'implementation'}
                onChange={(e) =>
                  setRelationshipType(e.target.checked ? 'implementation' : 'primary')
                }
              />
            }
            label={
              relationshipType === 'implementation'
                ? 'Relationship: Implementation coach'
                : 'Relationship: Primary coach'
            }
          />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, mt: -1 }}>
            Choose whether this coach is the user&apos;s primary coach or implementation coach.
          </Typography>

          <FormControlLabel
            control={
              <Checkbox
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
            }
            label="Replace existing coach"
          />

          <LoadingButton
            variant="contained"
            onClick={assign}
            loading={busy}
            disabled={!user || !coach}
          >
            Assign
          </LoadingButton>

          <Alert severity="info" variant="outlined">
            Adds the coach alongside any current coaches. Check &quot;replace existing coach&quot; to remove them first.
          </Alert>
        </Box>

        <Box sx={{ flex: 1, minWidth: { xs: '100%', md: 280 } }}>
          <Typography variant="adminSectionTitle" sx={{ mb: 1 }}>
            Current coaches
          </Typography>

          {!user ? (
            <Alert severity="info">Select a user to view their current coaches.</Alert>
          ) : loadingCoaches ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : currentCoaches.length === 0 ? (
            <Alert severity="info">No active coaches assigned.</Alert>
          ) : (
            <Box sx={{ display: 'grid', gap: 1 }}>
              {currentCoaches.map((c) => {
                const removing = removingCoachIds.includes(c.id);
                const label =
                  c.relationship_type === 'implementation'
                    ? 'Implementation coach'
                    : 'Primary coach';

                return (
                  <Paper key={c.id} variant="outlined" sx={{ px: 2, py: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                      <Box>
                        <Typography variant="body1" fontWeight={500}>
                          {c.name || 'Unnamed coach'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {c.email || 'No email available'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {label}
                        </Typography>
                      </Box>
                      <IconButton
                        aria-label={`Remove ${c.name || 'coach'}`}
                        onClick={() => removeCoach(c.id)}
                        disabled={removing}
                        size="small"
                      >
                        {removing ? <CircularProgress size={18} /> : <CloseIcon fontSize="small" />}
                      </IconButton>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack({ ...snack, open: false })}
        message={snack.message}
      />
    </>
  );
}
