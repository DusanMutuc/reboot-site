'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Box, Container, Stack, Typography, Paper, TextField, useMediaQuery
} from '@mui/material';
import CoursePicker from './CoursePicker';
import UserListWithProgress from './UserListWithProgress';
import DetailedUserProgressView from './DetailedUserProgressView';
import SmartDocsAnswers from './SmartDocsAnswers';
//
// 🔧 Tweak this to make the coach view bigger/smaller across this page.
// 1.00 = no change, 1.10 = +10%, 0.95 = -5%, etc.
//
const COACH_UI_SCALE = 1.0;

type Mode = 'coach' | 'admin';
type CourseLite = { id: number; title: string | null };

export default function StudentProgressView({ mode }: { mode: Mode }) {
  const [courses, setCourses] = useState<CourseLite[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const isNarrow = useMediaQuery('(max-width:900px)');
  const PANEL_HEIGHT = isNarrow ? 'auto' : '70vh';
  const isCoach = mode === 'coach';
  const sz = (px: number) => (isCoach ? Math.round(px * COACH_UI_SCALE) : px);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('content_nodes')
        .select('id,title')
        .eq('node_type', 'course')
        .order('title', { ascending: true });
      if (!active) return;
      const rows = (data ?? []) as CourseLite[];
      setCourses(rows);
      if (rows.length && courseId == null) setCourseId(rows[0].id);
    })();
    return () => { active = false; };
  }, []); // eslint-disable-line

  const selectedCourse = useMemo(
    () => courses.find(c => c.id === courseId) ?? null,
    [courses, courseId]
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 2, fontSize: sz(24) }}>
          Student Progress
        </Typography>

        <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 3 }}>
  <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }}>
    {/* Wrapper that scales the Autocomplete's input/label/icons when mode === 'coach' */}
    <Box
      sx={{
        width: { xs: '100%', sm: 380 },
        ...(mode === 'coach' && {
          // label “Course”
          '& .MuiInputLabel-root': { fontSize: sz(13) },
          // the input root (height)
          '& .MuiInputBase-root': { minHeight: sz(42) },
          // the text inside the input
          '& .MuiInputBase-input': { fontSize: sz(14), py: `${Math.max(0, sz(6) - 6)}px` },
          // dropdown arrow / clear icons
          '& .MuiSvgIcon-root': { fontSize: sz(20) },
          // Autocomplete-specific indicators (safer targets)
          '& .MuiAutocomplete-popupIndicator svg, & .MuiAutocomplete-clearIndicator svg': { fontSize: sz(20) },
        }),
      }}
    >
      <CoursePicker
        courses={courses}
        value={courseId}
        onChange={setCourseId}
        disabled={courses.length === 0}
      />
    </Box>

    <TextField
      size="small"
      label="Search students"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      sx={{
        width: { xs: '100%', sm: 320 },
        ...(mode === 'coach' && {
          '& .MuiInputLabel-root': { fontSize: sz(13) },
          '& .MuiInputBase-input': { fontSize: sz(14) },
          '& .MuiSvgIcon-root': { fontSize: sz(20) },
        }),
      }}
    />
  </Stack>
</Paper>


        {/* Columns row */}
<Stack
  direction={{ xs: 'column', md: 'row' }}
  spacing={3}
  alignItems="flex-start"
  sx={{ minHeight: 0 }}
>
  {/* LEFT RAIL */}
  <Paper
    elevation={0}
    sx={{
      flexBasis: isNarrow ? '100%' : 360,
      flexShrink: 0,
      alignSelf: 'flex-start',
      height: PANEL_HEIGHT,          // 🔸 SAME HEIGHT
      maxHeight: PANEL_HEIGHT,       // 🔸 SAME HEIGHT
      border: '1px solid',
      borderColor: 'grey.200',
      borderRadius: 3,
      p: 0,
      overflow: 'hidden',            // internal list scrolls
      minHeight: 0,
      display: 'grid',
      gridTemplateRows: '1fr',
      ...(isCoach && {
        '& .MuiTypography-subtitle2': { fontSize: sz(14) },
        '& .MuiTypography-caption': { fontSize: sz(12) },
      }),
    }}
  >
    <UserListWithProgress
      mode={mode}
      courseId={courseId}
      search={search}
      selectedUserId={selectedUserId}
      onSelectUser={setSelectedUserId}
    />
  </Paper>

  {/* RIGHT PANEL */}
  <Paper
    elevation={0}
    sx={{
      flexGrow: 1,
      height: PANEL_HEIGHT,          // 🔸 SAME HEIGHT
      maxHeight: PANEL_HEIGHT,       // 🔸 SAME HEIGHT
      border: '1px solid',
      borderColor: 'grey.200',
      borderRadius: 3,
      p: 0,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',            // wrapper clips, inner scrolls
      ...(isCoach && {
        '& .MuiTypography-body2': { fontSize: sz(14) },
      }),
    }}
  >
    {/* Inner scroll area */}
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <DetailedUserProgressView courseId={courseId} userId={selectedUserId} mode={mode} />
    </Box>
  </Paper>
</Stack>

{/* SmartDocs answers – full width under both panels */}
<Box sx={{ mt: 3 }}>
  <SmartDocsAnswers courseId={courseId} userId={selectedUserId} mode={mode} />
</Box>
      </Container>
    </Box>
  );
}
