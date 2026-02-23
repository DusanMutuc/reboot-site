'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  Box, Container, Stack, Typography, Paper, TextField, useMediaQuery
} from '@mui/material';
import CoursePicker from './CoursePicker';
import UserListWithProgress from './UserListWithProgress';
import DetailedUserProgressView from './DetailedUserProgressView';
import SmartDocsAnswers from './SmartDocsAnswers';

const COACH_UI_SCALE = 1.0;
type Mode = 'coach' | 'admin';
type CourseLite = { id: number; title: string | null };

type StudentProgressViewProps = {
  mode: Mode;
  preselectedUserId?: string;
  onSelectedUserChange?: (userId: string | null) => void;
};

export default function StudentProgressView({ mode, preselectedUserId, onSelectedUserChange }: StudentProgressViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL is the shared source
  const userIdFromQuery = searchParams.get('userId') ?? null;
  const courseIdFromQuery = searchParams.get('courseId') ?? null;

  // Local UI state (like CoachNotesView)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(userIdFromQuery ?? preselectedUserId ?? null);
  const [courses, setCourses] = useState<CourseLite[]>([]);
  const [courseId, setCourseId] = useState<number | null>(courseIdFromQuery ? Number(courseIdFromQuery) : null);
  const [search, setSearch] = useState('');

  const isNarrow = useMediaQuery('(max-width:900px)');
  const PANEL_HEIGHT = isNarrow ? 'auto' : '70vh';
  const isCoach = mode === 'coach';
  const sz = (px: number) => (isCoach ? Math.round(px * COACH_UI_SCALE) : px);

  const setQuery = useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      const sp = new URLSearchParams(searchParams.toString());
      Object.entries(patch).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') sp.delete(k);
        else sp.set(k, String(v));
      });
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [pathname, router, searchParams]
  );


  useEffect(() => {
    if (!preselectedUserId) return;
    if (selectedUserId !== preselectedUserId) {
      setSelectedUserId(preselectedUserId);
    }
  }, [preselectedUserId, selectedUserId]);

  // If we DON'T have a local selection yet and the URL has a userId, adopt it once.
  useEffect(() => {
    if (!selectedUserId && userIdFromQuery) {
      setSelectedUserId(userIdFromQuery);
    }
  }, [userIdFromQuery, selectedUserId]);

  // When local user changes, mirror to URL (so other tabs can pick it up).
  useEffect(() => {
    if (selectedUserId !== userIdFromQuery) {
      setQuery({ userId: selectedUserId ?? null });
    }
  }, [selectedUserId, userIdFromQuery, setQuery]);


  useEffect(() => {
    onSelectedUserChange?.(selectedUserId);
  }, [selectedUserId, onSelectedUserChange]);

  // Load courses once; adopt from URL if valid, else select first and push to URL.
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

      if (!rows.length) {
        setCourseId(null);
        setQuery({ courseId: null });
        return;
      }

      const fromUrl = courseIdFromQuery && rows.some((c) => String(c.id) === courseIdFromQuery)
        ? Number(courseIdFromQuery)
        : null;

      const initial = fromUrl ?? rows[0].id;
      setCourseId(initial);
      if (!fromUrl) setQuery({ courseId: initial });
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep URL in sync if courseId changes programmatically
  useEffect(() => {
    const inUrl = courseIdFromQuery ? Number(courseIdFromQuery) : null;
    if (courseId != null && courseId !== inUrl) {
      setQuery({ courseId });
    }
  }, [courseId, courseIdFromQuery, setQuery]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 2, fontSize: sz(24) }}>
          Student Progress
        </Typography>

        <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 3 }}>
          <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Box
              sx={{
                width: { xs: '100%', sm: 380 },
                ...(mode === 'coach' && {
                  '& .MuiInputLabel-root': { fontSize: sz(13) },
                  '& .MuiInputBase-root': { minHeight: sz(42) },
                  '& .MuiInputBase-input': { fontSize: sz(14), py: `${Math.max(0, sz(6) - 6)}px` },
                  '& .MuiSvgIcon-root': { fontSize: sz(20) },
                  '& .MuiAutocomplete-popupIndicator svg, & .MuiAutocomplete-clearIndicator svg': { fontSize: sz(20) },
                }),
              }}
            >
              <CoursePicker
                courses={courses}
                value={courseId}
                onChange={(id) => {
                  // Human course change → update URL course and clear selectedUserId (both local & URL)
                  setCourseId(id);
                  setSelectedUserId(null);
                  setQuery({ courseId: id, userId: null });
                }}
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

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="flex-start" sx={{ minHeight: 0 }}>
          {/* LEFT LIST */}
          <Paper
            elevation={0}
            sx={{
              flexBasis: isNarrow ? '100%' : 360,
              flexShrink: 0,
              alignSelf: 'flex-start',
              height: PANEL_HEIGHT,
              maxHeight: PANEL_HEIGHT,
              border: '1px solid',
              borderColor: 'grey.200',
              borderRadius: 3,
              p: 0,
              overflow: 'hidden',
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
              onSelectUser={(userId) => {
                setSelectedUserId(userId);
                onSelectedUserChange?.(userId);
              }}
            />
          </Paper>

          {/* RIGHT PANEL */}
          <Paper
            elevation={0}
            sx={{
              flexGrow: 1,
              height: PANEL_HEIGHT,
              maxHeight: PANEL_HEIGHT,
              border: '1px solid',
              borderColor: 'grey.200',
              borderRadius: 3,
              p: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              ...(isCoach && {
                '& .MuiTypography-body2': { fontSize: sz(14) },
              }),
            }}
          >
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <DetailedUserProgressView courseId={courseId} userId={selectedUserId} mode={mode} />
            </Box>
          </Paper>
        </Stack>

        <Box sx={{ mt: 3 }}>
          <SmartDocsAnswers courseId={courseId} userId={selectedUserId} mode={mode} />
        </Box>
      </Container>
    </Box>
  );
}
