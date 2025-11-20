// src/components/coach/CoachNotesView.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Stack,
  Typography,
  Paper,
  TextField,
  useMediaQuery,
} from '@mui/material';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import CoachNotesUserList from './CoachNotesUserList';
import CoachingNotesPanel from './CoachingNotesPanel';
import UserWinsPanel from './UserWinsPanel';

const COACH_UI_SCALE = 1.0;
type Mode = 'coach' | 'admin';

export default function CoachNotesView({ mode }: { mode: Mode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const userIdFromQuery = searchParams.get('userId') ?? null;

  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(userIdFromQuery);

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

  // If we DON'T have a selection yet and the URL has a userId, use it once.
  useEffect(() => {
    if (!selectedUserId && userIdFromQuery) {
      setSelectedUserId(userIdFromQuery);
    }
  }, [userIdFromQuery, selectedUserId]);

  // When user changes selection here, push to URL so other tabs can pick it up.
  useEffect(() => {
    if (selectedUserId && selectedUserId !== userIdFromQuery) {
      setQuery({ userId: selectedUserId });
    }
  }, [selectedUserId, userIdFromQuery, setQuery]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 2, fontSize: sz(24) }}>
          Coaching Notes
        </Typography>

        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 3,
            border: '1px solid',
            borderColor: 'grey.200',
            borderRadius: 3,
          }}
        >
          <Stack
            spacing={2}
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
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

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          alignItems="flex-start"
          sx={{ minHeight: 0 }}
        >
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
            <CoachNotesUserList
              mode={mode}
              search={search}
              selectedUserId={selectedUserId}
              onSelectUser={setSelectedUserId}
            />
          </Paper>

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
              <CoachingNotesPanel userId={selectedUserId} />
            </Box>
          </Paper>
        </Stack>

        <Box sx={{ mt: 3 }}>
          <UserWinsPanel userId={selectedUserId} />
        </Box>
      </Container>
    </Box>
  );
}
