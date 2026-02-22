// src/components/coach/StudentsPanel.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Box,
  Paper,
  Typography,
  TextField,
  MenuItem,
  Button,
  Stack,
  Link as MuiLink,
} from '@mui/material';
import { supabase } from '@/lib/supabaseClient';
import Loading from '@/components/loading';
import ErrorMessage from '@/components/errorMessage';
import UserDashboard from '@/components/user/dashboard/UserDashboard';

type StudentRow = {
  user_id: string;
  full_name: string;
};

type ContactInfo = {
  email: string | null;
  phone: string | null;
};

interface StudentsPanelProps {
  courseId: number | null;
  initialUserId?: string;
  onStudentChange?: (id: string) => void;
}

export default function StudentsPanel({ courseId, initialUserId, onStudentChange, }: StudentsPanelProps) {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Load roster for this coach (optionally scoped by course)
  useEffect(() => {
    let cancelled = false;

    async function loadRoster() {
      try {
        setLoading(true);
        setErr(null);

        const { data, error } = await supabase.rpc('get_my_users_with_status');

        if (error) throw error;

        if (!cancelled) {
          const rows = (data ?? []) as StudentRow[];
          setRows(rows);

          if (rows.length === 0) {
            setSelectedId('');
            setSelectedName(null);
            return;
          }

          // Prefer route param if it exists in this roster
          if (initialUserId && rows.some((r) => r.user_id === initialUserId)) {
            setSelectedId(initialUserId);
            const row = rows.find((r) => r.user_id === initialUserId)!;
            setSelectedName(row.full_name);
          } else {
            // Fallback: first student
            setSelectedId(rows[0].user_id);
            setSelectedName(rows[0].full_name);
          }
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Failed to load students';
          setErr(msg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRoster();

    return () => {
      cancelled = true;
    };
  }, [courseId, initialUserId]);

  // Keep list sorted alphabetically
  const sorted = useMemo(
    () => rows.slice().sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [rows]
  );

  // Ensure selection stays valid when roster changes
  useEffect(() => {
    if (!sorted.length) {
      setSelectedId('');
      setSelectedName(null);
      setContact(null);
      setContactError(null);
      return;
    }

    const stillExists = sorted.some((r) => r.user_id === selectedId);
    if (!stillExists) {
      // If current selection disappeared, reset to first in sorted
      setSelectedId(sorted[0].user_id);
      setSelectedName(sorted[0].full_name);
    }
  }, [sorted, selectedId]);

  useEffect(() => {
    if (selectedId && onStudentChange) onStudentChange(selectedId);
  }, [selectedId, onStudentChange]);

  // Fetch contact info for selected student
  useEffect(() => {
    if (!selectedId) {
      setContact(null);
      setContactError(null);
      return;
    }

    let cancelled = false;

    async function loadContact() {
      try {
        setContactLoading(true);
        setContactError(null);
        setContact(null);

        const { data, error } = await supabase.rpc('get_user_contact', {
          _user_id: selectedId,
          _course_id: courseId ?? null,
        });

        if (error) throw error;

        if (!cancelled) {
          const row = Array.isArray(data) ? data[0] : data;
          const email = (row?.email ?? null) as string | null;
          const phone = (row?.phone ?? null) as string | null;
          setContact({ email, phone });
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg =
            e instanceof Error ? e.message : 'Failed to load contact info';
          setContactError(msg);
        }
      } finally {
        if (!cancelled) {
          setContactLoading(false);
        }
      }
    }

    loadContact();

    return () => {
      cancelled = true;
    };
  }, [selectedId, courseId]);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <Box sx={{ width: '100%', mt: 3 }}>
      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 2,
            alignItems: { xs: 'flex-start', sm: 'center' },
            mb: 3,
          }}
        >
          <Box flex={1}>
            <Typography variant="h6" fontWeight={600} mb={1}>
              Select a student
            </Typography>

            <TextField
              select
              fullWidth
              size="small"
              value={selectedId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedId(id);
                const row = sorted.find((r) => r.user_id === id);
                setSelectedName(row?.full_name ?? null);
              }}
              helperText={
                sorted.length === 0
                  ? 'No students found on your roster.'
                  : undefined
              }
              disabled={sorted.length === 0}
            >
              {sorted.map((s) => (
                <MenuItem key={s.user_id} value={s.user_id}>
                  {s.full_name}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {selectedId && (
            <Stack spacing={1}>
              <Button
                component={NextLink}
                href={`/coach/notes?userId=${selectedId}`}
                variant="outlined"
                size="small"
              >
                Open Coaching Notes
              </Button>
              <Button
                component={NextLink}
                href={`/coach/kpi-tracker/${selectedId}`}
                variant="outlined"
                size="small"
              >
                Edit KPIs
              </Button>
            </Stack>
          )}
        </Box>

        {selectedId ? (
          <>
            <Box mt={1}>
              <Typography variant="subtitle1" fontWeight={600} mb={1}>
                {selectedName ? `${selectedName}'s Dashboard` : 'Student Dashboard'}
              </Typography>
              <UserDashboard userId={selectedId} />
            </Box>

            <Box mt={3}>
              <Typography variant="subtitle1" fontWeight={600} mb={1}>
                Contact info
              </Typography>

              {contactLoading && (
                <Typography variant="body2" color="text.secondary">
                  Loading contact info...
                </Typography>
              )}

              {contactError && <ErrorMessage message={contactError} />}

              {!contactLoading && !contactError && (
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={3}
                  mt={0.5}
                >
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Email
                    </Typography>
                    {contact?.email ? (
                      <MuiLink href={`mailto:${contact.email}`}>
                        {contact.email}
                      </MuiLink>
                    ) : (
                      <Typography variant="body2">—</Typography>
                    )}
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Phone
                    </Typography>
                    {contact?.phone ? (
                      <MuiLink href={`tel:${contact.phone}`}>
                        {contact.phone}
                      </MuiLink>
                    ) : (
                      <Typography variant="body2">—</Typography>
                    )}
                  </Box>
                </Stack>
              )}
            </Box>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary" mt={2}>
            Select a student to view their dashboard.
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
