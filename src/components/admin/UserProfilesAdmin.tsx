'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Autocomplete,
  TextField,
  Alert,
  Snackbar,
  CircularProgress,
} from '@mui/material';
import { LoadingButton } from '@mui/lab';

type Person = { id: string; name: string; email: string };

type UserPayload = {
  id: string;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  looker_link: string;
  ghl_user_id: string; // 👈 NEW
};

type SnackbarState = {
  open: boolean;
  message: string;
  severity: 'success' | 'error';
};

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  return r.json();
}

export default function UserProfilesAdmin() {
  const [users, setUsers] = useState<Person[]>([]);
  const [selectedUser, setSelectedUser] = useState<Person | null>(null);
  const [profile, setProfile] = useState<UserPayload | null>(null);

  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);

  const [snack, setSnack] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Load users list
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingUsers(true);
        const { items } = await getJSON<{ items: Person[] }>(
          '/api/admin/list-users'
        );
        if (!mounted) return;
        setUsers(items || []);
      } catch (e) {
        console.error('UserProfilesAdmin: error loading users', e);
        if (!mounted) return;
        setSnack({
          open: true,
          message: 'Failed to load users list',
          severity: 'error',
        });
      } finally {
        if (mounted) setLoadingUsers(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const userOptions = useMemo(
    () =>
      users.map((u) => ({
        ...u,
        label: `${u.name || '(no name)'} — ${u.email}`,
      })),
    [users]
  );

  const loadProfile = useCallback(async (userId: string) => {
    setLoadingProfile(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);

      const p = data as UserPayload & { ghl_user_id?: string };

      const merged: UserPayload = {
        id: p.id,
        email: (p.email || '').toLowerCase(),
        phone: p.phone ?? '',
        first_name: p.first_name ?? '',
        last_name: p.last_name ?? '',
        looker_link: p.looker_link ?? '',
        ghl_user_id: p.ghl_user_id ?? '', // 👈 NEW
      };

      setProfile(merged);
    } catch (e) {
      console.error('UserProfilesAdmin: error loading profile', e);
      setProfile(null);
      setSnack({
        open: true,
        message: 'Failed to load user profile',
        severity: 'error',
      });
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedUser?.id) {
      setProfile(null);
      return;
    }
    loadProfile(selectedUser.id).catch(() => {});
  }, [selectedUser?.id, loadProfile]);

  function handleFieldChange<K extends keyof UserPayload>(
    key: K,
    value: UserPayload[K]
  ) {
    setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!profile?.id) return;
    setSaving(true);
    try {
      const payload = {
        first_name: profile.first_name.trim(),
        last_name: profile.last_name.trim(),
        looker_link: profile.looker_link.trim(),
        // phone: send null if empty, string otherwise
        phone:
          profile.phone && profile.phone.toString().trim().length > 0
            ? profile.phone.toString().trim()
            : null,
        // ghl_user_id: send null if empty, string otherwise
        ghl_user_id:
          profile.ghl_user_id && profile.ghl_user_id.trim().length > 0
            ? profile.ghl_user_id.trim()
            : null,
      };

      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(profile.id)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);

      // Update local state with server-returned payload
      setProfile({
        id: data.id,
        email: (data.email || '').toLowerCase(),
        phone: data.phone ?? '',
        first_name: data.first_name ?? '',
        last_name: data.last_name ?? '',
        looker_link: data.looker_link ?? '',
        ghl_user_id: data.ghl_user_id ?? '', // 👈 NEW
      });

      setSnack({
        open: true,
        message: 'User profile saved.',
        severity: 'success',
      });
    } catch (e) {
      console.error('UserProfilesAdmin: error saving profile', e);
      setSnack({
        open: true,
        message: 'Failed to save user profile',
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper
      elevation={0}
      sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
    >
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        User Profiles
      </Typography>

      {/* User selector */}
      <Box sx={{ mb: 3 }}>
        {loadingUsers ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={22} />
          </Box>
        ) : (
          <Autocomplete
            options={userOptions}
            value={selectedUser}
            onChange={(_, v) => setSelectedUser(v)}
            renderInput={(params) => (
              <TextField {...params} label="Select user to edit…" />
            )}
          />
        )}
      </Box>

      {/* Profile form */}
      {!selectedUser ? (
        <Alert severity="info">
          Select a user to view and edit their profile information.
        </Alert>
      ) : loadingProfile && !profile ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box
          component="form"
          autoComplete="off"
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          }}
        >
          {/* Left column */}
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField
              label="First name"
              value={profile?.first_name ?? ''}
              onChange={(e) => handleFieldChange('first_name', e.target.value)}
            />

            <TextField
              label="Last name"
              value={profile?.last_name ?? ''}
              onChange={(e) => handleFieldChange('last_name', e.target.value)}
            />

            <TextField
              label="Email"
              value={profile?.email ?? ''}
              InputProps={{ readOnly: true }}
              helperText="Email is managed through auth and cannot be edited here."
            />
          </Box>

          {/* Right column */}
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField
              label="Phone"
              value={profile?.phone ?? ''}
              onChange={(e) => handleFieldChange('phone', e.target.value)}
              helperText="Leave empty to clear the phone number."
            />

            <TextField
              label="Looker dashboard link"
              value={profile?.looker_link ?? ''}
              onChange={(e) => handleFieldChange('looker_link', e.target.value)}
              helperText="Optional: per-user Looker / dashboard URL."
            />

            <TextField
              label="GHL user ID"
              value={profile?.ghl_user_id ?? ''}
              onChange={(e) => handleFieldChange('ghl_user_id', e.target.value)}
              helperText="Optional: used for GHL integration per user."
            />
          </Box>

          <Box sx={{ gridColumn: '1 / -1', textAlign: 'right', mt: 1 }}>
            <LoadingButton
              variant="contained"
              onClick={handleSave}
              loading={saving}
              disabled={!profile}
            >
              Save user profile
            </LoadingButton>
          </Box>
        </Box>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        message={snack.message}
      />
    </Paper>
  );
}
