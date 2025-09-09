'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Paper, Typography, Alert } from '@mui/material';
import DashboardEmbed from '@/components/dashboardEmbed';
import Loading from '@/components/loading';
import ErrorMessage from '@/components/errorMessage';
import { supabase } from '@/lib/supabaseClient';

type StudentRow = { user_id: string; full_name: string };

function StudentChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-block',
        padding: '8px 12px',
        borderRadius: 999,
        border: '1px solid',
        borderColor: selected ? '#000' : 'rgba(0,0,0,0.2)',
        background: selected ? 'rgba(0,0,0,0.06)' : 'transparent',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

export default function StudentsPanel({ courseId }: { courseId: number | null }) {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [studentDashboard, setStudentDashboard] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dashErr, setDashErr] = useState<string | null>(null);

  // Load roster
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_users', {
          _course_id: courseId ?? null,
        });
        if (error) throw error;
        setRows((data ?? []) as StudentRow[]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load students';
        setErr(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId]);

  const sorted = useMemo(
    () => rows.slice().sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [rows]
  );

  // Reset selection when course changes or roster changes
  useEffect(() => {
    setSelectedId(null);
    setSelectedName(null);
    setStudentDashboard(null);
    setDashErr(null);
  }, [courseId, rows.length]);

  // Auto-select first student (optional UX)
  useEffect(() => {
    if (sorted.length && !selectedId) {
      setSelectedId(sorted[0].user_id);
      setSelectedName(sorted[0].full_name);
    }
  }, [sorted, selectedId]);

  // Fetch Looker link on selection
  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      try {
        setBusy(true);
        setDashErr(null);
        setStudentDashboard(null);
        const { data, error } = await supabase
          .from('profiles')
          .select('looker_link')
          .eq('id', selectedId)
          .maybeSingle();
        if (error) throw error;
        const url = (data?.looker_link || '').trim();
        setStudentDashboard(url || null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load student dashboard link';
        setDashErr(msg);
      } finally {
        setBusy(false);
      }
    })();
  }, [selectedId]);

  if (loading) return <Loading />;
  if (error)   return <ErrorMessage message={error} />;

  return (
    <Box sx={{ width: '100%', mx: 'auto', my: 2 }}>
      {/* Horizontal chooser */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          overflowX: 'auto',
          pb: 1,
          mb: 2,
          px: 2,
        }}
      >
        {sorted.map((s) => (
          <StudentChip
            key={s.user_id}
            label={s.full_name}
            selected={s.user_id === selectedId}
            onClick={() => {
              setSelectedId(s.user_id);
              setSelectedName(s.full_name);
            }}
          />
        ))}
        {sorted.length === 0 && (
          <Alert severity="info" sx={{ flexShrink: 0 }}>
            No students found on your roster.
          </Alert>
        )}
      </Box>

      {/* Full-width dashboard */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        {!selectedId && <Alert severity="info">Select a student to view their M2 Dashboard.</Alert>}
        {selectedId && (
          <>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              {selectedName ? `${selectedName} – M2 Dashboard` : 'Student M2 Dashboard'}
            </Typography>
            {busy && <Loading />}
            {dashErr && <ErrorMessage message={dashErr} />}
            {!!studentDashboard && <DashboardEmbed src={studentDashboard} />}
            {!busy && !dashErr && !studentDashboard && (
              <Alert severity="warning">No Looker Studio link found for this student.</Alert>
            )}
          </>
        )}
      </Paper>
    </Box>
  );
}
