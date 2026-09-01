'use client';

import {
  ChangeEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { LoadingButton } from '@mui/lab';
import CloseIcon from '@mui/icons-material/Close';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

type DirectoryPerson = {
  id: string;
  name: string;
  email: string;
};

type DirectoryPartnership = {
  id: string;
  name: string;
};

type UserDirectoryRow = {
  id: string;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  ghl_user_id: string | null;
  introduced_at: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  is_current_member: boolean;
  is_ninety_day_user: boolean;
  is_legend: boolean;
  is_past_member: boolean;
  primary_coaches: DirectoryPerson[];
  implementation_coaches: DirectoryPerson[];
  assistants: DirectoryPerson[];
  partnerships: DirectoryPartnership[];
};

type UserDraft = {
  first_name: string;
  last_name: string;
  phone: string;
  ghl_user_id: string;
  introduced_at: string;
  is_legend: boolean;
  is_past_member: boolean;
};

type UsersResponse = {
  items: UserDirectoryRow[];
  total: number;
};

type SnackbarState = {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info';
};

type MembershipFilter = 'all' | 'current' | 'ninety-day' | 'past';
type SetupFilter = 'all' | 'missing-phone' | 'missing-primary-coach' | 'missing-ghl';
type SortOption = 'name' | 'introduced-desc' | 'last-sign-in-desc';
type AttentionSeverity = 'blocking' | 'secondary';

type AttentionIssue = {
  label: string;
  severity: AttentionSeverity;
};

const DEFAULT_ROWS_PER_PAGE = 25;
const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200];
const SEARCH_DEBOUNCE_MS = 250;

async function fetchIndex(
  query: string,
  page: number,
  limit: number,
  filters: {
    membership: MembershipFilter;
    legendOnly: boolean;
    setup: SetupFilter;
    sort: SortOption;
  },
  signal?: AbortSignal,
): Promise<UsersResponse> {
  const url = new URL('/api/admin/users', window.location.origin);
  if (query) url.searchParams.set('query', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('membership', filters.membership);
  url.searchParams.set('setup', filters.setup);
  url.searchParams.set('sort', filters.sort);
  if (filters.legendOnly) url.searchParams.set('legend', 'only');

  const response = await fetch(url.toString(), { signal });
  const data = (await response.json().catch(() => ({}))) as UsersResponse & { error?: string };
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function displayName(user: Pick<UserDirectoryRow, 'first_name' | 'last_name' | 'email'>) {
  return `${user.first_name} ${user.last_name}`.trim() || user.email || 'Unnamed member';
}

function initials(user: Pick<UserDirectoryRow, 'first_name' | 'last_name' | 'email'>) {
  const value = `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.trim();
  return (value || user.email.charAt(0) || '?').toUpperCase();
}

function toDateInput(value: string | null) {
  return value && value.length >= 10 ? value.slice(0, 10) : '';
}

function toDraft(user: UserDirectoryRow): UserDraft {
  return {
    first_name: user.first_name ?? '',
    last_name: user.last_name ?? '',
    phone: user.phone ?? '',
    ghl_user_id: user.ghl_user_id ?? '',
    introduced_at: toDateInput(user.introduced_at),
    is_legend: user.is_legend,
    is_past_member: user.is_past_member,
  };
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return includeTime ? date.toLocaleString() : date.toLocaleDateString();
}

function peopleLabel(people: DirectoryPerson[]) {
  return people.map((person) => person.name || person.email).filter(Boolean).join(', ');
}

function MembershipSummary({ user }: { user: UserDirectoryRow }) {
  const status = user.is_ninety_day_user
    ? '90-Day programme member'
    : user.is_past_member
      ? 'Past member'
      : user.is_current_member
        ? 'Current member'
        : 'Inactive';

  return (
    <Stack direction="row" useFlexGap flexWrap="wrap" spacing={2} alignItems="center">
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Box
          aria-hidden="true"
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: user.is_ninety_day_user
              ? 'info.main'
              : user.is_current_member && !user.is_past_member
                ? 'success.main'
                : 'text.disabled',
          }}
        />
        <Typography variant="body2" color="text.secondary">{status}</Typography>
      </Stack>
      {user.is_legend ? (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <StarOutlineIcon sx={{ fontSize: 18, color: '#9a6b16' }} />
          <Typography variant="body2" sx={{ color: '#7d5714' }}>Legend</Typography>
        </Stack>
      ) : null}
    </Stack>
  );
}

function SupportSummary({ user }: { user: UserDirectoryRow }) {
  const primary = peopleLabel(user.primary_coaches);
  const implementation = peopleLabel(user.implementation_coaches);
  const assistants = peopleLabel(user.assistants);
  const partnership = user.partnerships.map((item) => item.name).join(', ');
  const additionalSupport = [
    implementation ? `Implementation: ${implementation}` : '',
    assistants ? `Assistant: ${assistants}` : '',
    partnership ? `Partnership: ${partnership}` : '',
  ].filter(Boolean);
  const additionalLabel = additionalSupport.join(' · ') || 'No additional support';

  return (
    <Stack spacing={0.4} sx={{ minWidth: 0, minHeight: 38, justifyContent: 'center' }}>
      <Tooltip title={primary || 'Unassigned'} placement="top-start">
        <Typography variant="caption" color="text.secondary" noWrap>
          <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>Primary:</Box>{' '}
          {primary || 'Unassigned'}
        </Typography>
      </Tooltip>
      <Tooltip title={additionalLabel} placement="top-start">
        <Typography variant="caption" color="text.secondary" noWrap>
          {additionalLabel}
        </Typography>
      </Tooltip>
    </Stack>
  );
}

function attentionIssues(user: UserDirectoryRow) {
  if (user.is_past_member) return [] as AttentionIssue[];

  const issues: AttentionIssue[] = [];
  if (!user.first_name.trim() || !user.last_name.trim()) {
    issues.push({ label: 'Missing name', severity: 'blocking' });
  }
  if (user.is_current_member && user.primary_coaches.length === 0) {
    issues.push({ label: 'No primary coach', severity: 'blocking' });
  }
  if (!user.phone?.trim()) issues.push({ label: 'Missing phone', severity: 'secondary' });
  if (!user.ghl_user_id?.trim()) issues.push({ label: 'Missing GHL', severity: 'secondary' });
  return issues;
}

function attentionLevel(user: UserDirectoryRow): 'blocking' | 'secondary' | 'ready' {
  const issues = attentionIssues(user);
  if (issues.some((issue) => issue.severity === 'blocking')) return 'blocking';
  if (issues.length > 0) return 'secondary';
  return 'ready';
}

function StatusAvatar({ user, size = 36 }: { user: UserDirectoryRow; size?: number }) {
  const level = attentionLevel(user);
  const statusLabel = level === 'blocking'
    ? 'Has a blocking setup issue'
    : level === 'secondary'
      ? 'Has setup follow-ups'
      : 'Setup ready';
  const statusColor = level === 'blocking'
    ? 'error.main'
    : level === 'secondary'
      ? 'warning.main'
      : 'success.main';

  return (
    <Tooltip title={statusLabel} placement="top">
      <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <Avatar
          sx={{
            width: size,
            height: size,
            bgcolor: 'grey.100',
            color: 'text.primary',
            border: '2px solid',
            borderColor: level === 'ready' ? 'divider' : statusColor,
            fontSize: size <= 36 ? 14 : 16,
            fontWeight: 600,
          }}
        >
          {initials(user)}
        </Avatar>
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: 11,
            height: 11,
            borderRadius: '50%',
            bgcolor: statusColor,
            border: '2px solid',
            borderColor: 'background.paper',
          }}
        />
      </Box>
    </Tooltip>
  );
}

function AttentionSummary({ user }: { user: UserDirectoryRow }) {
  const issues = attentionIssues(user);
  const blockers = issues.filter((issue) => issue.severity === 'blocking');
  const followUps = issues.filter((issue) => issue.severity === 'secondary');

  if (issues.length === 0) {
    return (
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minHeight: 38 }}>
        <CheckCircleOutlineIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
        <Typography variant="body2" color="text.secondary">
          {user.is_past_member ? 'No action needed' : 'Ready'}
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={0.35} sx={{ minWidth: 0, minHeight: 38, justifyContent: 'center' }}>
      {blockers.length > 0 ? (
        <Tooltip title={blockers.map((issue) => issue.label).join(' · ')} placement="top-start">
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            <ErrorOutlineIcon sx={{ fontSize: 18, color: 'error.main', flexShrink: 0 }} />
            <Typography variant="caption" color="error.main" fontWeight={700} noWrap>
              Blocker: {blockers.map((issue) => issue.label).join(' · ')}
            </Typography>
          </Stack>
        </Tooltip>
      ) : null}
      {followUps.length > 0 ? (
        <Tooltip title={followUps.map((issue) => issue.label).join(' · ')} placement="top-start">
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            <WarningAmberIcon sx={{ fontSize: 17, color: 'warning.dark', flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary" noWrap>
              Follow-up: {followUps.map((issue) => issue.label).join(' · ')}
            </Typography>
          </Stack>
        </Tooltip>
      ) : null}
    </Stack>
  );
}

function SupportDetail({ label, people }: { label: string; people: DirectoryPerson[] }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      {people.length === 0 ? (
        <Typography variant="body2">Unassigned</Typography>
      ) : (
        <Stack spacing={0.75} sx={{ mt: 0.5 }}>
          {people.map((person) => (
            <Box key={person.id}>
              <Typography variant="body2">{person.name || person.email}</Typography>
              {person.email ? <Typography variant="caption" color="text.secondary">{person.email}</Typography> : null}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default function UserProfilesAdmin() {
  const [users, setUsers] = useState<UserDirectoryRow[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [serverQuery, setServerQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const [membership, setMembership] = useState<MembershipFilter>('current');
  const [legendOnly, setLegendOnly] = useState(false);
  const [setup, setSetup] = useState<SetupFilter>('all');
  const [sort, setSort] = useState<SortOption>('name');
  const [selectedUser, setSelectedUser] = useState<UserDirectoryRow | null>(null);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<UserDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [resetConfirmUser, setResetConfirmUser] = useState<UserDirectoryRow | null>(null);
  const [resetting, setResetting] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserDirectoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [snack, setSnack] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'info',
  });
  const debounceRef = useRef<number | null>(null);

  const isDirty = useMemo(
    () => Boolean(draft && savedDraft && JSON.stringify(draft) !== JSON.stringify(savedDraft)),
    [draft, savedDraft],
  );
  const filtersActive = membership !== 'current' || legendOnly || setup !== 'all' || sort !== 'name';

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setServerQuery(deferredQuery.trim());
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [deferredQuery]);

  useEffect(() => {
    setPage(0);
  }, [legendOnly, membership, setup, sort]);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        setLoadingUsers(true);
        const result = await fetchIndex(
          serverQuery,
          page + 1,
          rowsPerPage,
          { membership, legendOnly, setup, sort },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        if (result.items.length === 0 && result.total > 0 && page > 0) {
          setPage(Math.max(0, Math.ceil(result.total / rowsPerPage) - 1));
          return;
        }

        setUsers(result.items);
        setTotalUsers(result.total);
      } catch (error: unknown) {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;
        const message = error instanceof Error ? error.message : 'Failed to load members';
        setSnack({ open: true, message, severity: 'error' });
      } finally {
        if (!controller.signal.aborted) {
          setLoadingUsers(false);
          setHasFetched(true);
        }
      }
    })();

    return () => controller.abort();
  }, [legendOnly, membership, page, refreshKey, rowsPerPage, serverQuery, setup, sort]);

  const openUser = useCallback((user: UserDirectoryRow) => {
    const nextDraft = toDraft(user);
    setSelectedUser(user);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
  }, []);

  const closeDrawer = useCallback(() => {
    setSelectedUser(null);
    setDraft(null);
    setSavedDraft(null);
  }, []);

  const requestCloseDrawer = useCallback(() => {
    if (saving) return;
    if (isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    closeDrawer();
  }, [closeDrawer, isDirty, saving]);

  function updateDraft<K extends keyof UserDraft>(key: K, value: UserDraft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  const handleSave = useCallback(async () => {
    if (!selectedUser || !draft) return;
    setSaving(true);

    try {
      const profilePayload: Record<string, string | boolean | null> = {
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        phone: draft.phone.trim() || null,
        ghl_user_id: draft.ghl_user_id.trim() || null,
        introduced_at: draft.introduced_at || null,
      };
      if (!selectedUser.is_ninety_day_user) {
        profilePayload.is_legend = draft.is_legend;
        profilePayload.is_past_member = draft.is_past_member;
      }

      const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(profilePayload),
      });
      const data = (await response.json()) as Partial<UserDirectoryRow> & { error?: string };
      if (!response.ok) throw new Error(data.error || response.statusText);

      const updatedUser: UserDirectoryRow = {
        ...selectedUser,
        email: (data.email || selectedUser.email).toLowerCase(),
        phone: data.phone ?? null,
        first_name: data.first_name ?? '',
        last_name: data.last_name ?? '',
        ghl_user_id: data.ghl_user_id ?? null,
        introduced_at: data.introduced_at ?? null,
        is_legend: data.is_legend ?? false,
        is_past_member: data.is_past_member ?? false,
        is_current_member: data.is_past_member ? false : selectedUser.is_current_member,
      };
      const nextDraft = toDraft(updatedUser);
      setSelectedUser(updatedUser);
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
      setUsers((current) => current.map((user) => (user.id === updatedUser.id ? updatedUser : user)));
      setRefreshKey((current) => current + 1);
      setSnack({ open: true, message: 'Member profile saved.', severity: 'success' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save member';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [draft, selectedUser]);

  const handleSendPasswordReset = useCallback(async () => {
    if (!resetConfirmUser) return;
    setResetting(true);

    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(resetConfirmUser.id)}/reset-password`,
        { method: 'POST' },
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || response.statusText);
      setSnack({
        open: true,
        message: `Password recovery email sent to ${resetConfirmUser.email}.`,
        severity: 'success',
      });
      setResetConfirmUser(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to send password recovery email';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setResetting(false);
    }
  }, [resetConfirmUser]);

  const handleDelete = useCallback(async () => {
    if (!deletingUser) return;
    setDeleting(true);

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(deletingUser.id)}`, {
        method: 'DELETE',
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || response.statusText);
      setDeletingUser(null);
      closeDrawer();
      setRefreshKey((current) => current + 1);
      setSnack({ open: true, message: 'Member deleted.', severity: 'success' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete member';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [closeDrawer, deletingUser]);

  function clearFilters() {
    setMembership('current');
    setLegendOnly(false);
    setSetup('all');
    setSort('name');
  }

  const renderSkeleton = () => (
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
      <Table size="small">
        <TableBody>
          {Array.from({ length: 8 }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: 5 }).map((__, cellIndex) => (
                <TableCell key={cellIndex}><Skeleton height={44} /></TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );

  return (
    <>
      <Box sx={{ display: 'grid', gap: 2.5 }}>
        <Typography variant="body2" color="text.secondary">
          Search members, review their support team, and address anything that needs attention.
        </Typography>

        <Stack
          direction="row"
          useFlexGap
          flexWrap="wrap"
          spacing={1.25}
          alignItems="center"
        >
          <TextField
            size="small"
            placeholder="Search name, email, phone, coach, or assistant"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            sx={{ flex: '1 1 340px', maxWidth: 520, minWidth: { xs: '100%', sm: 320 } }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>
                ),
              },
            }}
          />

          <ToggleButtonGroup
            exclusive
            size="small"
            value={membership}
            onChange={(_event, value: MembershipFilter | null) => {
              if (value) setMembership(value);
            }}
            aria-label="Membership filter"
            sx={{
              '& .MuiToggleButton-root': {
                minWidth: 72,
                px: 1.5,
              },
            }}
          >
            <ToggleButton value="current">Current</ToggleButton>
            <ToggleButton value="ninety-day">90-Day</ToggleButton>
            <ToggleButton value="past">Past</ToggleButton>
            <ToggleButton value="all">All</ToggleButton>
          </ToggleButtonGroup>

          <Button
            size="small"
            variant={legendOnly ? 'contained' : 'outlined'}
            color="inherit"
            onClick={() => setLegendOnly((current) => !current)}
            sx={{
              minHeight: 40,
              borderColor: 'divider',
              ...(legendOnly
                ? { bgcolor: 'grey.900', color: 'common.white', '&:hover': { bgcolor: 'grey.800' } }
                : { color: 'text.primary' }),
            }}
          >
            Legends
          </Button>

          <TextField
            select
            size="small"
            label="Attention"
            value={setup}
            onChange={(event) => setSetup(event.target.value as SetupFilter)}
            sx={{ minWidth: 185 }}
          >
            <MenuItem value="all">All members</MenuItem>
            <MenuItem value="missing-phone">Missing phone</MenuItem>
            <MenuItem value="missing-primary-coach">No primary coach</MenuItem>
            <MenuItem value="missing-ghl">Missing GHL ID</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOption)}
            sx={{ minWidth: 165 }}
          >
            <MenuItem value="name">Name</MenuItem>
            <MenuItem value="introduced-desc">Recently introduced</MenuItem>
            <MenuItem value="last-sign-in-desc">Recent sign-in</MenuItem>
          </TextField>

          <Box sx={{ flexGrow: 1 }} />
          {filtersActive ? <Button size="small" onClick={clearFilters}>Reset</Button> : null}
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 90, textAlign: 'right' }}>
            {loadingUsers && hasFetched ? 'Updating…' : `${totalUsers} ${totalUsers === 1 ? 'member' : 'members'}`}
          </Typography>
        </Stack>

        {!hasFetched && loadingUsers ? (
          renderSkeleton()
        ) : users.length === 0 ? (
          <Alert severity="info">No members match the current search and filters.</Alert>
        ) : (
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ width: '100%', overflowX: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 360 }}>Member</TableCell>
                    <TableCell sx={{ minWidth: 360 }}>Support</TableCell>
                    <TableCell sx={{ minWidth: 360 }}>Needs attention</TableCell>
                    <TableCell align="right" sx={{ width: 56 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow
                      key={user.id}
                      hover
                      tabIndex={0}
                      onClick={() => openUser(user)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openUser(user);
                        }
                      }}
                      sx={{
                        height: 72,
                        cursor: 'pointer',
                        '& > .MuiTableCell-root': { py: 1 },
                        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                      }}
                    >
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <StatusAvatar user={user} />
                          <Box sx={{ minWidth: 0 }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={600} noWrap>{displayName(user)}</Typography>
                              {membership !== 'current' || !user.is_current_member || user.is_ninety_day_user ? (
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                  <Box
                                    aria-hidden="true"
                                    sx={{
                                      width: 7,
                                      height: 7,
                                      borderRadius: '50%',
                                      bgcolor: user.is_ninety_day_user
                                        ? 'info.main'
                                        : user.is_current_member && !user.is_past_member
                                          ? 'success.main'
                                          : 'text.disabled',
                                    }}
                                  />
                                  <Typography variant="caption" color="text.secondary">
                                    {user.is_ninety_day_user
                                      ? '90-Day'
                                      : user.is_past_member
                                        ? 'Past member'
                                        : user.is_current_member
                                          ? 'Current'
                                          : 'Inactive'}
                                  </Typography>
                                </Stack>
                              ) : null}
                              {user.is_legend ? (
                                <Tooltip title="Legend member">
                                  <Stack direction="row" spacing={0.35} alignItems="center">
                                    <StarOutlineIcon sx={{ fontSize: 17, color: '#9a6b16' }} />
                                    <Typography variant="caption" sx={{ color: '#7d5714' }}>Legend</Typography>
                                  </Stack>
                                </Tooltip>
                              ) : null}
                            </Stack>
                            <Typography variant="caption" color="text.secondary" display="block" noWrap>{user.email}</Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell><SupportSummary user={user} /></TableCell>
                      <TableCell><AttentionSummary user={user} /></TableCell>
                      <TableCell align="right">
                        <Tooltip title="Open member profile">
                          <IconButton size="small" aria-label={`Open ${displayName(user)}`}>
                            <ChevronRightIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <TablePagination
              component="div"
              count={totalUsers}
              page={page}
              onPageChange={(_event, nextPage) => setPage(nextPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(event: ChangeEvent<HTMLInputElement>) => {
                setRowsPerPage(parseInt(event.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
            />
            {loadingUsers && hasFetched ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                <CircularProgress size={18} />
              </Box>
            ) : null}
          </Paper>
        )}
      </Box>

      <Drawer
        anchor="right"
        open={Boolean(selectedUser)}
        onClose={requestCloseDrawer}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 560 }, maxWidth: '100%' } } }}
      >
        {selectedUser && draft ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ p: 2.5, borderBottom: 1, borderColor: 'divider' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                  <StatusAvatar user={selectedUser} size={40} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" fontWeight={700} noWrap>{displayName(selectedUser)}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>{selectedUser.email}</Typography>
                  </Box>
                </Stack>
                <IconButton aria-label="Close member profile" onClick={requestCloseDrawer}>
                  <CloseIcon />
                </IconButton>
              </Stack>
              <Box sx={{ mt: 1.5 }}><MembershipSummary user={{ ...selectedUser, ...draft }} /></Box>
            </Box>

            <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
              <Stack spacing={3} divider={<Divider flexItem />}>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="adminSectionTitle">Profile</Typography>
                    <Typography variant="body2" color="text.secondary">Core contact and onboarding details.</Typography>
                  </Box>
                  <TextField label="Email" value={selectedUser.email} fullWidth slotProps={{ input: { readOnly: true } }} />
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                    <TextField
                      label="First name"
                      value={draft.first_name}
                      onChange={(event) => updateDraft('first_name', event.target.value)}
                    />
                    <TextField
                      label="Last name"
                      value={draft.last_name}
                      onChange={(event) => updateDraft('last_name', event.target.value)}
                    />
                  </Box>
                  <TextField
                    label="Phone"
                    value={draft.phone}
                    onChange={(event) => updateDraft('phone', event.target.value)}
                    placeholder="Optional"
                  />
                  <TextField
                    label="Introduced date"
                    type="date"
                    value={draft.introduced_at}
                    onChange={(event) => updateDraft('introduced_at', event.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Stack>

                <Stack spacing={1.5}>
                  <Box>
                    <Typography variant="adminSectionTitle">Membership</Typography>
                    <Typography variant="body2" color="text.secondary">Access and lifecycle status.</Typography>
                  </Box>
                  {selectedUser.is_ninety_day_user ? (
                    <Alert severity="info" variant="outlined">
                      This member&apos;s cycle and promotion are managed from the 90-Day admin tab.
                    </Alert>
                  ) : (
                    <>
                      <FormControlLabel
                        control={(
                          <Checkbox
                            checked={draft.is_legend}
                            onChange={(event) => updateDraft('is_legend', event.target.checked)}
                          />
                        )}
                        label="Legend access"
                      />
                      <FormControlLabel
                        control={(
                          <Checkbox
                            checked={draft.is_past_member}
                            onChange={(event) => updateDraft('is_past_member', event.target.checked)}
                          />
                        )}
                        label="Past member"
                      />
                      {draft.is_past_member !== selectedUser.is_past_member ? (
                        <Alert severity="warning" variant="outlined">
                          This changes the member&apos;s lifecycle access when you save.
                        </Alert>
                      ) : null}
                    </>
                  )}
                </Stack>

                <Stack spacing={2}>
                  <Box>
                    <Typography variant="adminSectionTitle">Support team</Typography>
                    <Typography variant="body2" color="text.secondary">Active relationships managed elsewhere in Admin.</Typography>
                  </Box>
                  <SupportDetail label="Primary coach" people={selectedUser.primary_coaches} />
                  <SupportDetail label="Implementation coach" people={selectedUser.implementation_coaches} />
                  <SupportDetail label="Assistants" people={selectedUser.assistants} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">Partnership</Typography>
                    <Typography variant="body2">
                      {selectedUser.partnerships.map((partnership) => partnership.name).join(', ') || 'None'}
                    </Typography>
                  </Box>
                </Stack>

                <Stack spacing={2}>
                  <Box>
                    <Typography variant="adminSectionTitle">Integrations</Typography>
                    <Typography variant="body2" color="text.secondary">Technical connections are kept out of the main directory.</Typography>
                  </Box>
                  <TextField
                    label="GHL user ID"
                    value={draft.ghl_user_id}
                    onChange={(event) => updateDraft('ghl_user_id', event.target.value)}
                    placeholder="Optional"
                  />
                </Stack>

                <Stack spacing={2}>
                  <Box>
                    <Typography variant="adminSectionTitle">Account</Typography>
                    <Typography variant="body2" color="text.secondary">Authentication details and account actions.</Typography>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Created</Typography>
                      <Typography variant="body2">{formatDate(selectedUser.created_at, true)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Last sign-in</Typography>
                      <Typography variant="body2">{formatDate(selectedUser.last_sign_in_at, true)}</Typography>
                    </Box>
                  </Box>
                  <Button
                    variant="outlined"
                    startIcon={<MailOutlineIcon />}
                    onClick={() => setResetConfirmUser(selectedUser)}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Send password recovery
                  </Button>
                  <Alert severity="error" variant="outlined">
                    <Stack spacing={1} alignItems="flex-start">
                      <Typography variant="body2">
                        Permanently deleting a member removes their account and associated records.
                      </Typography>
                      <Button
                        color="error"
                        size="small"
                        startIcon={<DeleteForeverIcon />}
                        onClick={() => setDeletingUser(selectedUser)}
                      >
                        Delete member
                      </Button>
                    </Stack>
                  </Alert>
                </Stack>
              </Stack>
            </Box>

            <Box sx={{ p: 2.5, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                <Typography variant="body2" color={isDirty ? 'warning.main' : 'text.secondary'}>
                  {isDirty ? 'Unsaved changes' : 'No unsaved changes'}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button onClick={requestCloseDrawer} disabled={saving}>Close</Button>
                  <LoadingButton variant="contained" onClick={handleSave} loading={saving} disabled={!isDirty}>
                    Save changes
                  </LoadingButton>
                </Stack>
              </Stack>
            </Box>
          </Box>
        ) : null}
      </Drawer>

      <Dialog open={discardConfirmOpen} onClose={() => setDiscardConfirmOpen(false)}>
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogContent>Your edits have not been saved.</DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardConfirmOpen(false)}>Keep editing</Button>
          <Button
            color="error"
            onClick={() => {
              setDiscardConfirmOpen(false);
              closeDrawer();
            }}
          >
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(resetConfirmUser)} onClose={() => !resetting && setResetConfirmUser(null)}>
        <DialogTitle>Send password recovery email?</DialogTitle>
        <DialogContent>
          Send a password recovery email to {resetConfirmUser?.email || 'this member'}?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetConfirmUser(null)} disabled={resetting}>Cancel</Button>
          <LoadingButton variant="contained" onClick={handleSendPasswordReset} loading={resetting}>
            Send email
          </LoadingButton>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deletingUser)} onClose={() => !deleting && setDeletingUser(null)}>
        <DialogTitle>Delete {deletingUser ? displayName(deletingUser) : 'member'}?</DialogTitle>
        <DialogContent>
          This permanently deletes the account and cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingUser(null)} disabled={deleting}>Cancel</Button>
          <LoadingButton color="error" variant="contained" onClick={handleDelete} loading={deleting}>
            Delete member
          </LoadingButton>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack((current) => ({ ...current, open: false }))}
      >
        <Alert
          onClose={() => setSnack((current) => ({ ...current, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </>
  );
}
