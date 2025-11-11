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

type CoachProfile = {
  user_id: string;
  bio: string;
  m2_booking_url: string;
  call15_url: string;
  coaching_dashboard_url: string;
  ghl_calendar_embed_url: string;
  coaching_notes_url: string;
  m2_form_url: string;
  impl_booking_url: string;
};

type CoachProfileResponse = {
  profile: Partial<CoachProfile> | null;
  ghl_user_id?: string | null;
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

const emptyProfile: CoachProfile = {
  user_id: '',
  bio: '',
  m2_booking_url: '',
  call15_url: '',
  coaching_dashboard_url: '',
  ghl_calendar_embed_url: '',
  coaching_notes_url: '',
  m2_form_url: '',
  impl_booking_url: '',
};

export default function CoachProfilesAdmin() {
  const [coaches, setCoaches] = useState<Person[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<Person | null>(null);
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [ghlUserId, setGhlUserId] = useState<string>(''); // lives in profiles now
  const [loadingCoaches, setLoadingCoaches] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Load coaches list
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingCoaches(true);
        const { items } = await getJSON<{ items: Person[] }>(
          '/api/admin/list-coaches',
        );
        if (!mounted) return;
        setCoaches(items || []);
      } catch (e) {
        console.error('CoachProfilesAdmin: error loading coaches', e);
        if (!mounted) return;
        setSnack({
          open: true,
          message: 'Failed to load coaches list',
          severity: 'error',
        });
      } finally {
        if (mounted) setLoadingCoaches(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const coachOptions = useMemo(
    () =>
      coaches.map((c) => ({
        ...c,
        label: `${c.name} — ${c.email}`,
      })),
    [coaches],
  );

  const loadProfile = useCallback(async (coachId: string) => {
    setLoadingProfile(true);
    try {
      const res = await fetch(
        `/api/admin/coach-profiles?user_id=${encodeURIComponent(coachId)}`,
      );
      const data = (await res.json()) as CoachProfileResponse;
      if (!res.ok) throw new Error((data as any)?.error || res.statusText);

      const p = data?.profile ?? null;

      const merged: CoachProfile = {
        ...emptyProfile,
        ...(p ?? {}),
        user_id: coachId,
        bio: p?.bio ?? '',
        m2_booking_url: p?.m2_booking_url ?? '',
        call15_url: p?.call15_url ?? '',
        coaching_dashboard_url: p?.coaching_dashboard_url ?? '',
        ghl_calendar_embed_url: p?.ghl_calendar_embed_url ?? '',
        coaching_notes_url: p?.coaching_notes_url ?? '',
        m2_form_url: p?.m2_form_url ?? '',
        impl_booking_url: p?.impl_booking_url ?? '',
      };

      setProfile(merged);
      setGhlUserId(data?.ghl_user_id ?? '');
    } catch (e) {
      console.error('CoachProfilesAdmin: error loading profile', e);
      setProfile(null);
      setGhlUserId('');
      setSnack({
        open: true,
        message: 'Failed to load coach profile',
        severity: 'error',
      });
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedCoach?.id) {
      setProfile(null);
      setGhlUserId('');
      return;
    }
    loadProfile(selectedCoach.id).catch(() => {});
  }, [selectedCoach?.id, loadProfile]);

  function handleFieldChange<K extends keyof CoachProfile>(key: K, value: CoachProfile[K]) {
    setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!profile || !profile.user_id) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/coach-profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          profile,
          ghl_user_id: ghlUserId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);

      setSnack({
        open: true,
        message: 'Coach profile saved.',
        severity: 'success',
      });
    } catch (e) {
      console.error('CoachProfilesAdmin: error saving profile', e);
      setSnack({
        open: true,
        message: 'Failed to save coach profile',
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
        Coach Profiles
      </Typography>

      {/* Coach selector */}
      <Box sx={{ mb: 3 }}>
        {loadingCoaches ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={22} />
          </Box>
        ) : (
          <Autocomplete
            options={coachOptions}
            value={selectedCoach}
            onChange={(_, v) => setSelectedCoach(v)}
            renderInput={(params) => (
              <TextField {...params} label="Select coach to edit…" />
            )}
          />
        )}
      </Box>

      {/* Profile form */}
      {!selectedCoach ? (
        <Alert severity="info">
          Select a coach to view and edit their profile information.
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
              label="Bio"
              multiline
              minRows={3}
              value={profile?.bio ?? ''}
              onChange={(e) => handleFieldChange('bio', e.target.value)}
            />

            <TextField
              label="Primary / Momentum coach booking URL (m2_booking_url)"
              value={profile?.m2_booking_url ?? ''}
              onChange={(e) =>
                handleFieldChange('m2_booking_url', e.target.value)
              }
              helperText="This is used for the main coach booking link."
            />

            <TextField
              label="Implementation coach booking URL (impl_booking_url)"
              value={profile?.impl_booking_url ?? ''}
              onChange={(e) =>
                handleFieldChange('impl_booking_url', e.target.value)
              }
              helperText="This is used for the Implementation Coach booking link button."
            />

            <TextField
              label="Legacy 15-min call URL (call15_url)"
              value={profile?.call15_url ?? ''}
              onChange={(e) => handleFieldChange('call15_url', e.target.value)}
              helperText="Optional legacy link; still available to reuse or phase out."
            />
          </Box>

          {/* Right column */}
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField
              label="Coaching dashboard URL"
              value={profile?.coaching_dashboard_url ?? ''}
              onChange={(e) =>
                handleFieldChange('coaching_dashboard_url', e.target.value)
              }
            />

            <TextField
              label="GHL calendar embed URL"
              value={profile?.ghl_calendar_embed_url ?? ''}
              onChange={(e) =>
                handleFieldChange('ghl_calendar_embed_url', e.target.value)
              }
            />

            <TextField
              label="GHL user ID (from profiles)"
              value={ghlUserId}
              onChange={(e) => setGhlUserId(e.target.value)}
              helperText="This is now stored on the main user profile."
            />

            <TextField
              label="Coaching notes URL"
              value={profile?.coaching_notes_url ?? ''}
              onChange={(e) =>
                handleFieldChange('coaching_notes_url', e.target.value)
              }
            />

            <TextField
              label="M2 form URL"
              value={profile?.m2_form_url ?? ''}
              onChange={(e) => handleFieldChange('m2_form_url', e.target.value)}
            />
          </Box>

          <Box sx={{ gridColumn: '1 / -1', textAlign: 'right', mt: 1 }}>
            <LoadingButton
              variant="contained"
              onClick={handleSave}
              loading={saving}
              disabled={!profile}
            >
              Save coach profile
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
