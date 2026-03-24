'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Stack,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  CircularProgress,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import KpiTracker from '@/components/KpiTracker';
import UserDashboardExpanded from '@/components/user/dashboard/UserDashboardExpanded';
import { supabase } from '@/lib/supabaseClient';

type AdminStudentOption = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export default function AdminStudentTracker() {
  const [students, setStudents] = useState<AdminStudentOption[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [dashKey, setDashKey] = useState(0); // refreshSignal

  useEffect(() => {
    let alive = true;

    const loadStudents = async () => {
      setLoadingStudents(true);
      setStudentsError(null);

      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .order('first_name', { ascending: true })
        .order('last_name', { ascending: true });

      if (!alive) return;

      if (error) {
        console.error(
          'Error loading students for AdminStudentTracker:',
          error.message,
          error
        );
        setStudentsError(error.message);
        setStudents([]);
        setLoadingStudents(false);
        return;
      }

      const mapped: AdminStudentOption[] = (data as ProfileRow[]).map((row) => {
        const nameParts = [row.first_name, row.last_name].filter(
          (part): part is string => Boolean(part)
        );
        const name = nameParts.join(' ') || 'Unnamed user';

        return {
          id: row.id,
          name,
        };
      });

      setStudents(mapped);
      setLoadingStudents(false);
    };

    void loadStudents();

    return () => {
      alive = false;
    };
  }, []);

  const handleStudentChange = (event: SelectChangeEvent<string>) => {
    const nextId = event.target.value as string;
    setSelectedUserId(nextId);
    setDashKey(0); // reset refresh signal when switching students
  };

  const handleKpiSaved = () => {
    // When KPIs are saved, bump refreshSignal so UserDashboardExpanded refetches
    setDashKey((k) => k + 1);
  };

  const hasSelection = Boolean(selectedUserId);
  const selectedStudent = students.find((s) => s.id === selectedUserId);

  return (
    <Box
      sx={{
        width: '100%',
        background: 'linear-gradient(to bottom right, #f8f9fa 0%, #e9f5f2 100%)',
      }}
    >
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" spacing={1.5} mb={3}>
          <Typography variant="adminPageTitle" sx={{ fontWeight: 800 }}>
            Student Tracker
          </Typography>
          {selectedStudent && (
            <Typography variant="body2" color="text.secondary">
              Viewing: {selectedStudent.name}
            </Typography>
          )}
        </Stack>

        {/* Student selector */}
        <Paper
          elevation={3}
          sx={{
            p: 3,
            mb: 4,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          {loadingStudents ? (
            <Box display="flex" alignItems="center" gap={2}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">
                Loading students...
              </Typography>
            </Box>
          ) : studentsError ? (
            <Typography variant="body2" color="error">
              Failed to load students: {studentsError}
            </Typography>
          ) : students.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No students available to track.
            </Typography>
          ) : (
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel id="student-select-label">Select student</InputLabel>
              <Select
                labelId="student-select-label"
                label="Select student"
                value={selectedUserId}
                onChange={handleStudentChange}
              >
                {students.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Paper>

        {/* Empty-state when no student chosen */}
        {!hasSelection ? (
          <Paper
            sx={{
              p: 4,
              borderRadius: 3,
              textAlign: 'center',
              bgcolor: 'background.paper',
            }}
          >
            <Typography variant="body1" color="text.secondary">
              Select a student above to view their tracker and expanded dashboard.
            </Typography>
          </Paper>
        ) : (
          <>
            {/* KPI tracker for the selected student */}
            <KpiTracker
              onSaved={handleKpiSaved}
              userIdOverride={selectedUserId}
            />

            {/* Expanded dashboard for the same student */}
            <Box sx={{ mt: 6 }}>
              <UserDashboardExpanded
                userId={selectedUserId}
                refreshSignal={dashKey}
              />
            </Box>
          </>
        )}
      </Container>
    </Box>
  );
}
