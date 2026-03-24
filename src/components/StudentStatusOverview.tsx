// src/components/coach/StudentStatusOverview.tsx
'use client';

import { useEffect, useMemo, useState, MouseEvent } from 'react';
import NextLink from 'next/link';
import {
  Box,
  Paper,
  Typography,
  Button,
  Divider,
  List,
  ListItem,
  Menu,
  MenuItem,
  Stack,
  IconButton,
  TextField,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { supabase } from '@/lib/supabaseClient';
import Loading from '@/components/loading';
import ErrorMessage from '@/components/errorMessage';
import type { UserStatus, UserStatusSource } from '@/types/coaching';
import { UserStatusChip } from '@/components/UserStatusChip';
import { UserStatusDialog } from '@/components/UserStatusDialog';

type RosterRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  user_status: UserStatus;
  user_status_source: UserStatusSource;   // 'manual' | 'auto'
  user_status_manual: UserStatus | null;
  user_status_manual_reason: string | null;
  // NEW: attendance numbers for the 2-month window
  attended_count: number | null;
  expected_count: number | null;
};

type SortBy = 'name' | 'status' | 'email' | 'phone';
type SortDir = 'asc' | 'desc';

const STATUS_RANK: Record<UserStatus, number> = { red: 3, yellow: 2, green: 1 };

// SIX-column grid now: Name | Status | Attendance | Email | Phone | Actions
const GRID_COLS = {
  xs: 'minmax(0,1.5fr) minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,1.2fr) minmax(0,1fr) minmax(160px,200px)',
  sm: 'minmax(0,1.7fr) minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,1.4fr) minmax(0,1.1fr) minmax(180px,220px)',
  md: 'minmax(0,1.9fr) minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,1.6fr) minmax(0,1.2fr) minmax(200px,240px)',
};


interface StudentStatusOverviewProps {
  courseId: number | null;
  workspaceMode?: 'coach' | 'admin';
}

export default function StudentStatusOverview({
  courseId,
  workspaceMode = 'coach',
}: StudentStatusOverviewProps) {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setErr] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [dialogUserId, setDialogUserId] = useState<string | null>(null);

  // sorting state
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // overlay menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuColumn, setMenuColumn] = useState<null | SortBy>(null);

  // search state
  const [query, setQuery] = useState<string>('');

  // contact cache: user_id -> { email, phone }
  const [contacts, setContacts] = useState<Record<string, { email: string | null; phone: string | null }>>({});
  const [contactsLoading, setContactsLoading] = useState(false);

  // Load roster (+attendance numbers)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const { data, error } = await supabase.rpc('get_my_users_with_status');
        if (error) throw error;
        if (!cancelled) setRows((data ?? []) as RosterRow[]);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load students');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [courseId, reloadToken]);

  // Load contact info only for IDs we don't have yet
  useEffect(() => {
    const missingIds = rows
      .map(r => r.user_id)
      .filter(uid => !(uid in contacts));
    if (missingIds.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        setContactsLoading(true);
        const results = await Promise.all(
          missingIds.map(async (uid) => {
            const { data, error } = await supabase.rpc('get_user_contact', {
              _user_id: uid,
              _course_id: null,
            });
            if (error) {
              const fallbackEmail = rows.find(r => r.user_id === uid)?.email ?? null;
              return [uid, { email: fallbackEmail, phone: null }] as const;
            }
            const row = Array.isArray(data) ? data[0] : data;
            const email = (row?.email ?? rows.find(r => r.user_id === uid)?.email ?? null) as string | null;
            const phone = (row?.phone ?? null) as string | null;
            return [uid, { email, phone }] as const;
          })
        );
        if (!cancelled) {
          setContacts(prev => {
            const next = { ...prev };
            for (const [uid, info] of results) next[uid] = info;
            return next;
          });
        }
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rows.length, Object.keys(contacts).length]); // keep deps stable size

  // Filter by name/email/phone before sorting
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (r.full_name || '').toLocaleLowerCase();
      const email = (contacts[r.user_id]?.email || r.email || '').toLocaleLowerCase();
      const phone = (contacts[r.user_id]?.phone || '').toLocaleLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [rows, contacts, query]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();

    const nameKey = (r: RosterRow) => (r.full_name || r.email || '').toLocaleLowerCase();
    const emailKey = (r: RosterRow) =>
      (contacts[r.user_id]?.email || r.email || '').toLocaleLowerCase();
    const phoneKey = (r: RosterRow) =>
      (contacts[r.user_id]?.phone || '').toLocaleLowerCase();

    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = nameKey(a).localeCompare(nameKey(b));
      } else if (sortBy === 'email') {
        cmp = emailKey(a).localeCompare(emailKey(b));
        if (cmp === 0) cmp = nameKey(a).localeCompare(nameKey(b));
      } else if (sortBy === 'phone') {
        cmp = phoneKey(a).localeCompare(phoneKey(b));
        if (cmp === 0) cmp = nameKey(a).localeCompare(nameKey(b));
      } else {
        const ar = STATUS_RANK[a.user_status] ?? 0;
        const br = STATUS_RANK[b.user_status] ?? 0;
        cmp = ar - br;
        if (cmp === 0) cmp = nameKey(a).localeCompare(nameKey(b));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return arr;
  }, [filtered, contacts, sortBy, sortDir]);

  const dialogUser = useMemo(
    () => sorted.find((r) => r.user_id === dialogUserId) ?? null,
    [sorted, dialogUserId]
  );

  const openMenuFor = (column: SortBy) => (e: MouseEvent<HTMLElement>) => {
    setMenuColumn(column);
    setMenuAnchor(e.currentTarget);
  };
  const closeMenu = () => { setMenuAnchor(null); setMenuColumn(null); };
  const chooseSort = (dir: SortDir) => { if (menuColumn) { setSortBy(menuColumn); setSortDir(dir); } closeMenu(); };

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;

  const sortIconFor = (column: SortBy) => {
    if (sortBy !== column) return <UnfoldMoreIcon fontSize="small" />;
    return sortDir === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />;
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto', mt: 3 }}>
      <Paper
        sx={{
          p: 2.5,
          borderRadius: 3,
          height: { xs: '75vh', md: '80vh' },
          display: 'flex',
          flexDirection: 'column',
          minHeight: 360,
        }}
      >
        {/* Top bar: title + search */}
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 2,
            mb: 1.5,
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant={workspaceMode === 'admin' ? 'adminSectionTitle' : 'h6'} fontWeight={600}>
            Student Status Overview
          </Typography>

          <TextField
            size="small"
            placeholder="Search name, email, or phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 320 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="clear search" onClick={() => setQuery('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          Green = on track · Yellow = needs attention · Red = emergency
        </Typography>

        <Divider sx={{ mb: 0 }} />

        {/* Scroll container with sticky header */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
          {/* Header */}
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              backgroundColor: 'background.paper',
              borderBottom: '1px solid',
              borderColor: 'divider',
              py: 1,
              px: 2,
              display: 'grid',
              gridTemplateColumns: GRID_COLS,
              alignItems: 'center',
              gap: 2,
            }}
          >
            {/* NAME */}
            <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
              <Typography variant={workspaceMode === 'admin' ? 'body1' : 'body2'} sx={{ fontWeight: 700, mr: 0.75 }}>
                Name
              </Typography>
              <IconButton size="small" aria-label="sort by name" onClick={openMenuFor('name')}>
                {sortIconFor('name')}
              </IconButton>
            </Box>

            {/* STATUS */}
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Typography variant={workspaceMode === 'admin' ? 'body1' : 'body2'} sx={{ fontWeight: 700, mr: 0.75 }}>
                Status
              </Typography>
              <IconButton size="small" aria-label="sort by status" onClick={openMenuFor('status')}>
                {sortIconFor('status')}
              </IconButton>
            </Box>

            {/* ATTENDANCE (x/y) */}
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Typography variant={workspaceMode === 'admin' ? 'body1' : 'body2'} sx={{ fontWeight: 700 }}>
                Attendance
              </Typography>
            </Box>

            {/* EMAIL */}
            <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
              <Typography variant={workspaceMode === 'admin' ? 'body1' : 'body2'} sx={{ fontWeight: 700, mr: 0.75 }}>
                Email
              </Typography>
              <IconButton size="small" aria-label="sort by email" onClick={openMenuFor('email')}>
                {sortIconFor('email')}
              </IconButton>
            </Box>

            {/* PHONE */}
            <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
              <Typography variant={workspaceMode === 'admin' ? 'body1' : 'body2'} sx={{ fontWeight: 700, mr: 0.75 }}>
                Phone
              </Typography>
              <IconButton size="small" aria-label="sort by phone" onClick={openMenuFor('phone')}>
                {sortIconFor('phone')}
              </IconButton>
            </Box>

            {/* ACTIONS */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Typography variant={workspaceMode === 'admin' ? 'body1' : 'body2'} sx={{ fontWeight: 700 }}>
                Actions
              </Typography>
            </Box>
          </Box>

          {/* Rows */}
          {sorted.length === 0 ? (
            <Box display="flex" alignItems="center" justifyContent="center" p={3}>
              <Typography variant="body2" color="text.secondary">
                No students found.
              </Typography>
            </Box>
          ) : (
            <List dense disablePadding sx={{ pt: 0 }}>
              {sorted.map((s) => {
                const fullName = s.full_name || s.email || 'Unknown user';
                const email = contacts[s.user_id]?.email ?? s.email ?? null;
                const phone = contacts[s.user_id]?.phone ?? null;

                const attended = s.attended_count ?? 0;
                const expected = s.expected_count ?? 0;
                const pct = expected > 0 ? Math.round((attended / expected) * 100) : null;

                return (
                  <ListItem
                    key={s.user_id}
                    disableGutters
                    sx={{
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      py: 1,
                      px: 2,
                      display: 'grid',
                      gridTemplateColumns: GRID_COLS,
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    {/* Name */}
                    <Box minWidth={0}>
                      <Typography
                        variant="body1"
                        sx={{
                          fontWeight: 700,
                          ...(workspaceMode === 'admin'
                            ? {}
                            : { fontSize: { xs: '1.06rem', sm: '1.12rem' } }),
                        }}
                        noWrap
                        title={fullName}
                      >
                        {fullName}
                      </Typography>
                    </Box>

                    {/* Status */}
                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                      <UserStatusChip
                        status={s.user_status}
                        source={s.user_status_source}
                        reason={s.user_status_manual_reason}
                        size="small"
                        clickable
                        onClick={() => setDialogUserId(s.user_id)}
                      />
                    </Box>

                    {/* Attendance x/y */}
                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                      <Tooltip
                        title={
                          expected > 0
                            ? `${attended}/${expected} (${pct}%) in the last 2 months`
                            : 'No counted meetings in the last 2 months'
                        }
                      >
                        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {expected > 0 ? `${attended}/${expected}` : '—'}
                        </Typography>
                      </Tooltip>
                    </Box>

                    {/* Email */}
                    <Box minWidth={0}>
                      {email ? (
                        <Tooltip title={email}>
                          <Typography variant="body2" noWrap>
                            {email}
                          </Typography>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      )}
                    </Box>

                    {/* Phone */}
                    <Box minWidth={0}>
                      {phone ? (
                        <Tooltip title={phone}>
                          <Typography variant="body2" noWrap>
                            {phone}
                          </Typography>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      )}
                    </Box>

                    {/* Actions */}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        endIcon={<OpenInNewIcon />}
                        component={NextLink}
                        href={
                          workspaceMode === 'admin'
                            ? `/admin/student-workspace?userId=${s.user_id}&tab=overview`
                            : `/coach/students-overview?userId=${s.user_id}&tab=overview`
                        }
                      >
                        Open workspace
                      </Button>
                    </Box>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>

        {/* Status dialog */}
        {dialogUser && (
          <UserStatusDialog
            open={!!dialogUser}
            onClose={() => setDialogUserId(null)}
            userId={dialogUser.user_id}
            currentStatus={dialogUser.user_status}
            manualStatus={dialogUser.user_status_manual}
            manualReason={dialogUser.user_status_manual_reason}
            userLabel={dialogUser.full_name}
            onSaved={() => setReloadToken((x) => x + 1)}
          />
        )}

        {/* Sort overlay */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={closeMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          keepMounted
        >
          <MenuItem onClick={() => chooseSort('asc')}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ArrowUpwardIcon fontSize="small" />
              <Typography variant="body2">Ascending</Typography>
            </Stack>
          </MenuItem>
          <MenuItem onClick={() => chooseSort('desc')}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ArrowDownwardIcon fontSize="small" />
              <Typography variant="body2">Descending</Typography>
            </Stack>
          </MenuItem>
        </Menu>
      </Paper>
    </Box>
  );
}
