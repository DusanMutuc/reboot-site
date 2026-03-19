'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

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
type CoachProfileAPI = CoachProfileResponse & { error?: string };

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
        `/api/admin/coach-profiles?user_id=${encodeURIComponent(coachId)}`
      );
      const data = (await res.json()) as CoachProfileAPI;
      if (!res.ok) throw new Error(data.error || res.statusText);

      const p = data.profile ?? null;

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
      setGhlUserId(data.ghl_user_id ?? '');
    } catch (err: unknown) {
      console.error('CoachProfilesAdmin: error loading profile', err);
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
    <>
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
              label="Primary booking link"
              value={profile?.m2_booking_url ?? ''}
              onChange={(e) =>
                handleFieldChange('m2_booking_url', e.target.value)
              }
              helperText="Main scheduling link shown to members."
            />

            <TextField
              label="Implementation booking link"
              value={profile?.impl_booking_url ?? ''}
              onChange={(e) =>
                handleFieldChange('impl_booking_url', e.target.value)
              }
              helperText="Secondary scheduling link used for implementation support."
            />
          </Box>

          {/* Right column */}
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField
              label="Coach dashboard link"
              value={profile?.coaching_dashboard_url ?? ''}
              onChange={(e) =>
                handleFieldChange('coaching_dashboard_url', e.target.value)
              }
            />

            <TextField
              label="Coaching notes link"
              value={profile?.coaching_notes_url ?? ''}
              onChange={(e) =>
                handleFieldChange('coaching_notes_url', e.target.value)
              }
            />

            <TextField
              label="Momentum form link"
              value={profile?.m2_form_url ?? ''}
              onChange={(e) => handleFieldChange('m2_form_url', e.target.value)}
            />
          </Box>

          <Box sx={{ gridColumn: '1 / -1' }}>
            <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Advanced and legacy fields
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Only expand this section if you need older links or CRM-specific values.
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                  }}
                >
                  <TextField
                    label="Legacy 15-minute call link"
                    value={profile?.call15_url ?? ''}
                    onChange={(e) => handleFieldChange('call15_url', e.target.value)}
                    helperText="Optional older scheduling link kept for backwards compatibility."
                  />

                  <TextField
                    label="Embedded calendar URL"
                    value={profile?.ghl_calendar_embed_url ?? ''}
                    onChange={(e) =>
                      handleFieldChange('ghl_calendar_embed_url', e.target.value)
                    }
                    helperText="Used only where an embedded calendar is still required."
                  />

                  <TextField
                    label="CRM user ID"
                    value={ghlUserId}
                    onChange={(e) => setGhlUserId(e.target.value)}
                    helperText="Internal mapping value stored on the main user profile."
                  />
                </Box>
              </AccordionDetails>
            </Accordion>
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
    </>
  );
}
