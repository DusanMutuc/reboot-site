// src/components/coach/CoachNotesUserList.tsx
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
} from '@mui/material';

const COACH_UI_SCALE = 1.0;

type Mode = 'coach' | 'admin';

type UserLite = { user_id: string; full_name: string };

const PAGE_SIZE = 25;

export default function CoachNotesUserList({
  mode,
  search,
  selectedUserId,
  onSelectUser,
}: {
  mode: Mode;
  search: string;
  selectedUserId: string | null;
  onSelectUser: (id: string | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [page, setPage] = useState(0);

  const isCoach = mode === 'coach';
  const sz = (px: number) => (isCoach ? Math.round(px * COACH_UI_SCALE) : px);

  const scrollRef = useRef<HTMLUListElement | null>(null);
  const didAutoSelectOnce = useRef(false);

  // initial fetch of users (same RPC you already use in progress view)
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
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
  }, []);

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

  // auto-select first user once
  useEffect(() => {
    if (!didAutoSelectOnce.current && selectedUserId == null && filtered.length > 0) {
      didAutoSelectOnce.current = true;
      onSelectUser(filtered[0].user_id);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      });
      return;
    }
    if (selectedUserId && !filtered.some((u) => u.user_id === selectedUserId)) {
      onSelectUser(null);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      });
    }
  }, [filtered, selectedUserId, onSelectUser]);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
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
          Students
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
          const isSelected = user_id === selectedUserId;

          return (
            <ListItemButton
              key={user_id}
              selected={isSelected}
              onClick={() => onSelectUser(user_id)}
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
                  '&:hover': {
                    bgcolor: 'primary.100',
                  },
                },
              }}
            >
              <ListItemText
                disableTypography
                primary={
                  <Typography
                    sx={{
                      fontWeight: isSelected ? 700 : 600,
                      fontSize: sz(15),
                      color: isSelected ? 'primary.main' : 'text.primary',
                    }}
                  >
                    {full_name}
                  </Typography>
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
