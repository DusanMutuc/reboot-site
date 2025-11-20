'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Box,
  CircularProgress,
  Divider,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
  List,
  LinearProgress,
} from '@mui/material';

const COACH_UI_SCALE = 1.0;

type Mode = 'coach' | 'admin';

type UserLite = { user_id: string; full_name: string };
type ProgressRow = { total_leaves: number; completed_leaves: number; progress: number };

const PAGE_SIZE = 25;

export default function UserListWithProgress({
  mode,
  courseId,
  search,
  selectedUserId,
  onSelectUser,
}: {
  mode: Mode;
  courseId: number | null;
  search: string;
  selectedUserId: string | null;
  onSelectUser: (id: string | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [page, setPage] = useState(0);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});

  const isCoach = mode === 'coach';
  const sz = (px: number) => (isCoach ? Math.round(px * COACH_UI_SCALE) : px);

  const scrollRef = useRef<HTMLUListElement | null>(null);
  const didAutoSelectOnce = useRef(false);
  const prevCourseId = useRef<number | null | undefined>(undefined);

  // keep stable callback
  const onSelectRef = useRef(onSelectUser);
  useEffect(() => { onSelectRef.current = onSelectUser; }, [onSelectUser]);

  // reset when course changes — but DON'T clear selection on initial boot
  useEffect(() => {
    const isInitialBoot = prevCourseId.current == null && courseId != null;
    const changed = prevCourseId.current !== courseId;

    if (changed) {
      setUsers([]);
      setProgressMap({});
      setPage(0);
      if (!isInitialBoot) {
        onSelectRef.current(null); // clear only on human course change
      }
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      });
      didAutoSelectOnce.current = false;
      prevCourseId.current = courseId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // fetch users
  useEffect(() => {
    let active = true;
    (async () => {
      if (!courseId) return;
      setLoading(true);

      // Note: replace with course-scoped RPC when ready
      const { data, error } = await supabase.rpc('get_all_users', { _course_id: null });
      if (!active) return;

      if (!error && Array.isArray(data)) {
        const sorted = (data as UserLite[]).slice().sort((a, b) =>
          (a.full_name ?? '').localeCompare(b.full_name ?? '')
        );
        setUsers(sorted);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [courseId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;

    const score = (name: string) => {
      const n = (name || '').toLowerCase();
      if (n.startsWith(q)) return 0;
      const idx = n.indexOf(q);
      return idx >= 0 ? 1 : 99;
    };

    return users
      .filter((u) => (u.full_name ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        const sa = score(a.full_name ?? '');
        const sb = score(b.full_name ?? '');
        if (sa !== sb) return sa - sb;
        return (a.full_name ?? '').localeCompare(b.full_name ?? '');
      });
  }, [users, search]);

  // reset page on search
  useEffect(() => {
    setPage(0);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
  }, [search, filtered.length]);

  const paged = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // Auto-select first user once — ONLY if nothing is selected
  useEffect(() => {
    if (!didAutoSelectOnce.current && selectedUserId == null && filtered.length > 0) {
      didAutoSelectOnce.current = true;
      onSelectRef.current(filtered[0].user_id);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      });
    }
  }, [filtered, selectedUserId]);

  // fetch per-user progress for the currently visible page
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!courseId || paged.length === 0) return;

      const entries = await Promise.all(
        paged.map(async (u) => {
          const { data, error } = await supabase.rpc('get_user_course_progress', {
            _user_id: u.user_id,
            _course_id: courseId,
          });
          if (error) return [u.user_id, 0] as const;

          let row: ProgressRow | undefined;
          if (Array.isArray(data)) row = data[0] as ProgressRow | undefined;
          else if (data && typeof data === 'object') row = data as ProgressRow;

          const pct = row?.progress ? Math.round(row.progress * 100) : 0;
          return [u.user_id, pct] as const;
        })
      );
      if (!cancelled) {
        setProgressMap((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    })();
    return () => { cancelled = true; };
  }, [courseId, paged]);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr auto auto',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        bgcolor: 'white',
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{
          px: 2.5,
          py: 2,
          bgcolor: 'grey.50',
          borderBottom: '2px solid',
          borderColor: 'grey.200',
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 800,
            fontSize: sz(15),
            color: 'text.primary',
            letterSpacing: 0.3,
          }}
        >
          Students {courseId ? '' : '(pick a course)'}
        </Typography>
        {loading && <CircularProgress size={18} thickness={4} />}
      </Stack>

      {/* Scroll area */}
      <List
        ref={scrollRef}
        aria-label="Students"
        sx={{
          position: 'relative',
          overflowY: 'auto',
          minHeight: 0,
          overflowAnchor: 'none',
          py: 0.5,
        }}
      >
        {paged.map(({ user_id, full_name }) => {
          const raw = progressMap[user_id] ?? 0;
          const pct = Math.max(0, Math.min(100, raw));
          const isSelected = user_id === selectedUserId;

        return (
          <ListItemButton
            key={user_id}
            selected={isSelected}
            onClick={() => onSelectRef.current(user_id)}
            sx={{
              py: 2,
              px: 2.5,
              mx: 0.5,
              mb: 0.5,
              borderRadius: 1.5,
              transition: 'all 0.2s',
              bgcolor: isSelected ? 'primary.50' : 'transparent',
              '&:hover': {
                bgcolor: isSelected ? 'primary.100' : 'grey.50',
                transform: 'translateX(2px)',
              },
              '&.Mui-selected': {
                bgcolor: 'primary.50',
                borderLeft: '3px solid',
                borderColor: 'primary.main',
                '&:hover': { bgcolor: 'primary.100' },
              },
            }}
          >
            <ListItemText
              disableTypography
              primary={
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                  <Typography
                    sx={{
                      fontWeight: isSelected ? 700 : 600,
                      fontSize: sz(15),
                      color: isSelected ? 'primary.main' : 'text.primary',
                    }}
                  >
                    {full_name}
                  </Typography>
                  <Box
                    sx={{
                      minWidth: 44,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 1,
                      bgcolor:
                        pct === 100 ? 'success.main' : pct > 0 ? 'warning.main' : 'grey.300',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: sz(13),
                      transition: 'all 0.2s',
                    }}
                  >
                    {pct}%
                  </Box>
                </Stack>
              }
              secondary={
                <LinearProgress
                  variant="determinate"
                  value={pct}
                  sx={{
                    mt: 1.25,
                    height: sz(8),
                    borderRadius: 999,
                    bgcolor: 'grey.200',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 999,
                      bgcolor: pct === 100 ? 'success.main' : pct > 0 ? 'warning.main' : 'grey.400',
                      transition: 'transform 0.4s ease',
                    },
                  }}
                />
              }
            />
          </ListItemButton>
        );
        })}
      </List>

      <Divider sx={{ borderColor: 'grey.200' }} />

      {/* Footer */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{
          px: 2.5,
          py: 1.5,
          bgcolor: 'grey.50',
          borderTop: '1px solid',
          borderColor: 'grey.200',
        }}
      >
        <Typography sx={{ fontSize: sz(13), color: 'text.secondary', fontWeight: 500 }}>
          {filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}-
          {Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
        </Typography>

        <Stack direction="row" spacing={2}>
          <Typography
            sx={{
              fontSize: sz(13),
              fontWeight: 600,
              color: page === 0 ? 'text.disabled' : 'primary.main',
              cursor: page === 0 ? 'default' : 'pointer',
              transition: 'color 0.2s',
              '&:hover': page === 0 ? {} : { color: 'primary.dark' },
            }}
            onClick={() => page > 0 && setPage((p) => p - 1)}
          >
            Prev
          </Typography>
          <Typography
            sx={{
              fontSize: sz(13),
              fontWeight: 600,
              color: (page + 1) * PAGE_SIZE >= filtered.length ? 'text.disabled' : 'primary.main',
              cursor: (page + 1) * PAGE_SIZE >= filtered.length ? 'default' : 'pointer',
              transition: 'color 0.2s',
              '&:hover':
                (page + 1) * PAGE_SIZE >= filtered.length ? {} : { color: 'primary.dark' },
            }}
            onClick={() => (page + 1) * PAGE_SIZE < filtered.length && setPage((p) => p + 1)}
          >
            Next
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
