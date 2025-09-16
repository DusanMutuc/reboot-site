'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import { LoadingButton } from '@mui/lab';

type Course = { id: number; name: string; start_date: string | null };
type UserSummary = { id: string; name: string; email: string };
type LookerSummary = UserSummary & { looker_link: string | null };
type PhoneSummary = UserSummary & { phone: string | null };

type ActionRequiredResponse = {
  courses: Course[];
  defaultCourseId: number | null;
  selectedCourseId: number | null;
  missingCoachUsers: UserSummary[];
  missingLookerUsers: LookerSummary[];
  missingPhoneUsers: PhoneSummary[];
};

type Person = { id: string; name: string; email: string };

type UserDetails = {
  id: string;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  looker_link: string;
};

const emptyDetails: UserDetails = {
  id: '',
  email: '',
  phone: '',
  first_name: '',
  last_name: '',
  looker_link: '',
};

function sortSummaries<T extends UserSummary>(items: T[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
}

function buildName(first: string, last: string, fallback: string) {
  const full = `${first?.trim() ?? ''} ${last?.trim() ?? ''}`.trim();
  return full || fallback || 'Unnamed user';
}

function formatDate(date: string | null) {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}

function isValidUrl(value: string) {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

export default function AdminActionRequired() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [missingCoaches, setMissingCoaches] = useState<UserSummary[]>([]);
  const [missingLooker, setMissingLooker] = useState<LookerSummary[]>([]);
  const [missingPhone, setMissingPhone] = useState<PhoneSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>(
    { open: false, message: '', severity: 'success' }
  );

  const [lookerInputs, setLookerInputs] = useState<Record<string, string>>({});
  const [savingLookerIds, setSavingLookerIds] = useState<string[]>([]);
  const [phoneInputs, setPhoneInputs] = useState<Record<string, string>>({});
  const [savingPhoneIds, setSavingPhoneIds] = useState<string[]>([]);

  const [userOptions, setUserOptions] = useState<Person[]>([]);
  const [userOptionsLoading, setUserOptionsLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Person | null>(null);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const [detailsForm, setDetailsForm] = useState(emptyDetails);

  const editorLookerInvalid =
    !!userDetails && detailsForm.looker_link.trim().length > 0 && !isValidUrl(detailsForm.looker_link);

  async function loadActionData(courseId?: number) {
    setLoading(true);
    setError(null);
    try {
      const query = typeof courseId === 'number' ? `?course_id=${courseId}` : '';
      const res = await fetch(`/api/admin/action-required${query}`);
      const data: ActionRequiredResponse = await res.json();
      if (!res.ok) throw new Error((data as { error?: string })?.error || res.statusText);

      setCourses(data.courses ?? []);
      setMissingCoaches(sortSummaries(data.missingCoachUsers ?? []));
      setMissingLooker(sortSummaries(data.missingLookerUsers ?? []));
      setMissingPhone(sortSummaries(data.missingPhoneUsers ?? []));
      setLookerInputs({});
      setPhoneInputs({});

      const effectiveCourse =
        typeof courseId === 'number'
          ? data.selectedCourseId ?? courseId
          : data.selectedCourseId ?? data.defaultCourseId ?? null;
      setSelectedCourseId(effectiveCourse ?? null);

      setLoadedOnce(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load action data';
      setError(message);
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadActionData().catch(() => {});
  }, []);

  useEffect(() => {
    setUserOptionsLoading(true);
    fetch('/api/admin/list-users')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || res.statusText);
        const items = Array.isArray(data?.items) ? data.items : [];
        setUserOptions(items);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load users';
        setSnack({ open: true, message, severity: 'error' });
      })
      .finally(() => setUserOptionsLoading(false));
  }, []);

  useEffect(() => {
    if (!userDetails || !userDetails.id) {
      setDetailsForm(emptyDetails);
      return;
    }
    setDetailsForm({
      id: userDetails.id,
      email: userDetails.email,
      phone: userDetails.phone ?? '',
      first_name: userDetails.first_name,
      last_name: userDetails.last_name,
      looker_link: userDetails.looker_link ?? '',
    });
  }, [userDetails]);

  const coachCountLabel = useMemo(
    () => `${missingCoaches.length} user${missingCoaches.length === 1 ? '' : 's'}`,
    [missingCoaches.length]
  );

  const lookerCountLabel = useMemo(
    () => `${missingLooker.length} user${missingLooker.length === 1 ? '' : 's'}`,
    [missingLooker.length]
  );

  const phoneCountLabel = useMemo(
    () => `${missingPhone.length} user${missingPhone.length === 1 ? '' : 's'}`,
    [missingPhone.length]
  );

  async function updateLookerLink(user: LookerSummary, value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setSnack({ open: true, message: 'Link cannot be empty', severity: 'error' });
      return;
    }
    if (!isValidUrl(trimmed)) {
      setSnack({ open: true, message: 'Link must start with http:// or https://', severity: 'error' });
      return;
    }

    setSavingLookerIds((prev) => [...prev, user.id]);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ looker_link: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);

      setMissingLooker((prev) => prev.filter((item) => item.id !== user.id));
      setLookerInputs((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      if (userDetails?.id === user.id) {
        setUserDetails({
          ...userDetails,
          looker_link: trimmed,
        });
      }
      setSnack({ open: true, message: `Saved Looker link for ${user.name}`, severity: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update Looker link';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setSavingLookerIds((prev) => prev.filter((id) => id !== user.id));
    }
  }

  async function updatePhone(user: PhoneSummary, value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setSnack({ open: true, message: 'Phone cannot be empty', severity: 'error' });
      return;
    }

    setSavingPhoneIds((prev) => [...prev, user.id]);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);

      setMissingPhone((prev) => prev.filter((item) => item.id !== user.id));
      setPhoneInputs((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      if (userDetails?.id === user.id) {
        setUserDetails({
          ...userDetails,
          phone: trimmed,
        });
      }
      setSnack({ open: true, message: `Saved phone number for ${user.name}`, severity: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update phone number';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setSavingPhoneIds((prev) => prev.filter((id) => id !== user.id));
    }
  }

  async function loadUserDetails(id: string) {
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`);
      const data: UserDetails = await res.json();
      if (!res.ok) throw new Error((data as { error?: string })?.error || res.statusText);
      setUserDetails(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load user details';
      setDetailsError(message);
      setUserDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function saveUserDetails() {
    if (!userDetails?.id) return;

    const trimmedLooker = detailsForm.looker_link.trim();
    if (trimmedLooker && !isValidUrl(trimmedLooker)) {
      setSnack({ open: true, message: 'Looker link must start with http:// or https://', severity: 'error' });
      return;
    }

    setSavingDetails(true);
    try {
      const phoneInputValue = detailsForm.phone?.trim() ?? '';
      const payload = {
        first_name: detailsForm.first_name.trim(),
        last_name: detailsForm.last_name.trim(),
        looker_link: trimmedLooker,
        phone: phoneInputValue.length > 0 ? phoneInputValue : null,
      };
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userDetails.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: UserDetails = await res.json();
      if (!res.ok) throw new Error((data as { error?: string })?.error || res.statusText);

      setUserDetails(data);
      setSnack({ open: true, message: 'User details updated', severity: 'success' });

      const name = buildName(data.first_name, data.last_name, data.email);
      setSelectedUser((prev) => (prev && prev.id === data.id ? { ...prev, name, email: data.email } : prev));
      setUserOptions((prev) =>
        prev.map((item) => (item.id === data.id ? { ...item, name, email: data.email } : item))
      );
      setMissingCoaches((prev) => {
        if (!prev.some((item) => item.id === data.id)) return prev;
        const updated = prev.map((item) =>
          item.id === data.id ? { ...item, name, email: data.email } : item
        );
        return sortSummaries(updated);
      });

      const lookerValue = data.looker_link?.trim() ?? '';
      const hasLooker = lookerValue.length > 0;
      setMissingLooker((prev) => {
        const idx = prev.findIndex((item) => item.id === data.id);
        if (hasLooker) {
          if (idx === -1) return prev;
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        }
        const nextItem: LookerSummary = {
          id: data.id,
          name,
          email: data.email,
          looker_link: hasLooker ? lookerValue : null,
        };
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = nextItem;
          return sortSummaries(next);
        }
        return sortSummaries([...prev, nextItem]);
      });

      const nextPhoneValue = data.phone?.trim() ?? '';
      setMissingPhone((prev) => {
        const idx = prev.findIndex((item) => item.id === data.id);
        if (nextPhoneValue) {
          if (idx === -1) return prev;
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        }
        const nextItem: PhoneSummary = {
          id: data.id,
          name,
          email: data.email,
          phone: nextPhoneValue.length > 0 ? nextPhoneValue : null,
        };
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = nextItem;
          return sortSummaries(next);
        }
        return sortSummaries([...prev, nextItem]);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update user';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setSavingDetails(false);
    }
  }

  async function sendResetEmail() {
    if (!userDetails?.id) return;
    setSendingReset(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userDetails.id)}/reset-password`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);
      setSnack({ open: true, message: 'Password reset email sent', severity: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send password reset email';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setSendingReset(false);
    }
  }

  const handleCourseChange = (value: string) => {
    if (!value) {
      setSelectedCourseId(null);
      return;
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    setSelectedCourseId(parsed);
    loadActionData(parsed).catch(() => {});
  };

  const lookerInputValue = (id: string) => lookerInputs[id] ?? '';
  const phoneInputValue = (id: string) => phoneInputs[id] ?? '';

    const invalidLookerIds = new Set(
      Object.entries(lookerInputs)
        .filter(([, value]) => value.trim().length > 0 && !isValidUrl(value))
        .map(([id]) => id)
    );

  const showGlobalSpinner = !loadedOnce && loading;

  const handleSnackClose = () => setSnack((prev) => ({ ...prev, open: false }));

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {showGlobalSpinner ? (
        <Paper sx={{ p: 4, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }} color="text.secondary">
            Loading admin data…
          </Typography>
        </Paper>
      ) : (
        <>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Typography variant="h6" fontWeight={600}>
                  Course coverage
                </Typography>
                <Chip label={coachCountLabel} size="small" />
                <Box sx={{ flex: 1 }} />
                <LoadingButton
                  size="small"
                  variant="outlined"
                  loading={loading}
                  onClick={() => loadActionData(selectedCourseId ?? undefined)}
                >
                  Refresh
                </LoadingButton>
              </Box>

              {courses.length > 0 ? (
                <TextField
                  select
                  label="Course"
                  value={selectedCourseId ?? ''}
                  onChange={(event) => handleCourseChange(event.target.value)}
                  helperText="Select a course to see users without an assigned coach."
                  sx={{ maxWidth: 360 }}
                >
                  {courses.map((course) => {
                    const date = formatDate(course.start_date);
                    return (
                      <MenuItem key={course.id} value={course.id}>
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                          <Typography>{course.name}</Typography>
                          {date && (
                            <Typography variant="caption" color="text.secondary">
                              Starts {date}
                            </Typography>
                          )}
                        </Box>
                      </MenuItem>
                    );
                  })}
                </TextField>
              ) : (
                <Alert severity="info">No courses available.</Alert>
              )}

              {loading && loadedOnce && <LinearProgress />}

              {error && (
                <Alert severity="error">{error}</Alert>
              )}

              {missingCoaches.length === 0 ? (
                <Alert severity="success">All users for this course have an assigned coach.</Alert>
              ) : (
                <Box sx={{ display: 'grid', gap: 1 }}>
                  {missingCoaches.map((user) => (
                    <Paper key={user.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Typography fontWeight={600}>{user.name}</Typography>
                      <Typography color="text.secondary">{user.email || 'No email on file'}</Typography>
                    </Paper>
                  ))}
                </Box>
              )}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h6" fontWeight={600}>
                  Missing Looker links
                </Typography>
                <Chip label={lookerCountLabel} size="small" />
              </Box>

              {missingLooker.length === 0 ? (
                <Alert severity="success">Everyone has a Looker link.</Alert>
              ) : (
                <Stack spacing={1.5}>
                  {missingLooker.map((user) => {
                    const value = lookerInputValue(user.id);
                    const invalid = invalidLookerIds.has(user.id);
                    const saving = savingLookerIds.includes(user.id);
                    return (
                      <Paper key={user.id} variant="outlined" sx={{ p: 2 }}>
                        <Stack spacing={1.5}>
                          <Box>
                            <Typography fontWeight={600}>{user.name}</Typography>
                            <Typography color="text.secondary">{user.email || 'No email on file'}</Typography>
                          </Box>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
                            <TextField
                              fullWidth
                              label="Looker link"
                              placeholder="https://..."
                              value={value}
                              onChange={(event) =>
                                setLookerInputs((prev) => ({ ...prev, [user.id]: event.target.value }))
                              }
                              error={invalid}
                              helperText={invalid ? 'Must start with http:// or https://' : ' '}
                            />
                            <LoadingButton
                              variant="contained"
                              onClick={() => updateLookerLink(user, value)}
                              disabled={!value.trim() || invalid}
                              loading={saving}
                            >
                              Save
                            </LoadingButton>
                          </Stack>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h6" fontWeight={600}>
                  Missing phone numbers
                </Typography>
                <Chip label={phoneCountLabel} size="small" />
              </Box>

              {missingPhone.length === 0 ? (
                <Alert severity="success">All users have a phone number.</Alert>
              ) : (
                <Stack spacing={1.5}>
                  {missingPhone.map((user) => {
                    const value = phoneInputValue(user.id);
                    const saving = savingPhoneIds.includes(user.id);
                    return (
                      <Paper key={user.id} variant="outlined" sx={{ p: 2 }}>
                        <Stack spacing={1.5}>
                          <Box>
                            <Typography fontWeight={600}>{user.name}</Typography>
                            <Typography color="text.secondary">{user.email || 'No email on file'}</Typography>
                          </Box>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
                            <TextField
                              fullWidth
                              label="Phone number"
                              placeholder="(555) 123-4567"
                              value={value}
                              onChange={(event) =>
                                setPhoneInputs((prev) => ({ ...prev, [user.id]: event.target.value }))
                              }
                            />
                            <LoadingButton
                              variant="contained"
                              onClick={() => updatePhone(user, value)}
                              disabled={!value.trim()}
                              loading={saving}
                            >
                              Save
                            </LoadingButton>
                          </Stack>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={600}>
                User editor
              </Typography>

              <Autocomplete<Person>
                options={userOptions}
                loading={userOptionsLoading}
                getOptionLabel={(option) => `${option.name} — ${option.email}`.trim()}
                value={selectedUser}
                onChange={(_, value) => {
                  setSelectedUser(value);
                  if (value?.id) {
                    loadUserDetails(value.id).catch(() => {});
                  } else {
                    setUserDetails(null);
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select user"
                    helperText="Search by name or email to manage a user."
                  />
                )}
              />

              {detailsLoading ? (
                <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : detailsError ? (
                <Alert severity="error">{detailsError}</Alert>
              ) : !userDetails ? (
                <Alert severity="info">Select a user to edit their details.</Alert>
              ) : (
                <Stack spacing={2} divider={<Divider flexItem />}>
                      <Stack spacing={1.5}>
                        <Typography fontWeight={600}>Profile information</Typography>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                          <TextField
                            label="First name"
                        value={detailsForm.first_name}
                        onChange={(event) =>
                          setDetailsForm((prev) => ({ ...prev, first_name: event.target.value }))
                        }
                        fullWidth
                      />
                      <TextField
                        label="Last name"
                        value={detailsForm.last_name}
                        onChange={(event) =>
                          setDetailsForm((prev) => ({ ...prev, last_name: event.target.value }))
                        }
                        fullWidth
                      />
                    </Stack>
                        <TextField
                          label="Looker link"
                          value={detailsForm.looker_link}
                          onChange={(event) =>
                            setDetailsForm((prev) => ({ ...prev, looker_link: event.target.value }))
                          }
                          helperText={editorLookerInvalid ? 'Must start with http:// or https://' : 'Leave blank to remove the link.'}
                          error={editorLookerInvalid}
                          fullWidth
                        />
                      </Stack>

                      <Stack spacing={1.5}>
                    <Typography fontWeight={600}>Contact</Typography>
                    <TextField
                      label="Email"
                      value={userDetails.email}
                      InputProps={{ readOnly: true }}
                      helperText="Email cannot be changed."
                      fullWidth
                    />
                    <TextField
                      label="Phone number"
                      value={detailsForm.phone}
                      onChange={(event) =>
                        setDetailsForm((prev) => ({ ...prev, phone: event.target.value }))
                      }
                      helperText="Leave blank to remove the phone number."
                      fullWidth
                    />
                  </Stack>

                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <LoadingButton
                      variant="contained"
                      onClick={saveUserDetails}
                      loading={savingDetails}
                      disabled={editorLookerInvalid}
                    >
                      Save changes
                    </LoadingButton>
                    <LoadingButton
                      variant="outlined"
                      onClick={sendResetEmail}
                      loading={sendingReset}
                    >
                      Send reset password email
                    </LoadingButton>
                  </Stack>
                </Stack>
              )}
            </Stack>
          </Paper>
        </>
      )}

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={handleSnackClose}>
        <Alert onClose={handleSnackClose} severity={snack.severity} sx={{ width: '100%' }}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
