'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import { UserStatusDialog } from '@/components/UserStatusDialog';
import { UserStatusChip } from '@/components/UserStatusChip';
import type { StatusOverviewResponse, StatusOverviewRow } from '@/lib/statusOverviewTypes';
import type { UserStatus } from '@/types/coaching';

type WorkspaceMode = 'coach' | 'admin';
type SortBy = 'name' | 'status' | 'kpi' | 'one_on_one' | 'group' | 'courses';
type SortDirection = 'asc' | 'desc';

type StudentStatusOverviewProps = {
  courseId?: number | null;
  workspaceMode: WorkspaceMode;
};

const statusRank: Record<UserStatus, number> = {
  red: 0,
  yellow: 1,
  green: 2,
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function getEndpoint(workspaceMode: WorkspaceMode, courseId: number | null | undefined): string {
  if (workspaceMode === 'admin') {
    return '/api/admin/status-overview';
  }

  const params = new URLSearchParams();
  if (courseId != null) {
    params.set('courseId', String(courseId));
  }

  const query = params.toString();
  return query ? `/api/coach/status-overview?${query}` : '/api/coach/status-overview';
}

function getWorkspaceHref(
  workspaceMode: WorkspaceMode,
  userId: string,
  courseId: number | null | undefined,
): string {
  const params = new URLSearchParams({
    userId,
    tab: 'overview',
  });

  if (courseId != null) {
    params.set('courseId', String(courseId));
  }

  const basePath =
    workspaceMode === 'admin' ? '/admin/student-workspace' : '/coach/students-overview';

  return `${basePath}?${params.toString()}`;
}

function formatDateValue(value: string | null): string {
  if (!value) {
    return 'No data';
  }

  const normalizedValue =
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return 'No data';
  }

  return dateFormatter.format(date);
}

function compareNullableIsoDates(
  left: string | null,
  right: string | null,
  direction: SortDirection,
): number {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  return direction === 'asc' ? left.localeCompare(right) : right.localeCompare(left);
}

function compareRows(left: StatusOverviewRow, right: StatusOverviewRow, sortBy: SortBy, direction: SortDirection): number {
  switch (sortBy) {
    case 'status': {
      const value =
        (statusRank[left.user_status] ?? Number.MAX_SAFE_INTEGER) -
        (statusRank[right.user_status] ?? Number.MAX_SAFE_INTEGER);
      if (value !== 0) {
        return direction === 'asc' ? value : -value;
      }
      break;
    }
    case 'kpi': {
      const value = compareNullableIsoDates(left.last_kpi_at, right.last_kpi_at, direction);
      if (value !== 0) {
        return value;
      }
      break;
    }
    case 'one_on_one': {
      const value = compareNullableIsoDates(
        left.last_one_on_one_at,
        right.last_one_on_one_at,
        direction,
      );
      if (value !== 0) {
        return value;
      }
      break;
    }
    case 'group': {
      const value = compareNullableIsoDates(left.last_group_at, right.last_group_at, direction);
      if (value !== 0) {
        return value;
      }
      break;
    }
    case 'courses': {
      const value = left.completed_courses - right.completed_courses;
      if (value !== 0) {
        return direction === 'asc' ? value : -value;
      }
      break;
    }
    case 'name':
    default:
      break;
  }

  const leftKey = left.full_name.trim().toLocaleLowerCase();
  const rightKey = right.full_name.trim().toLocaleLowerCase();
  return direction === 'asc'
    ? leftKey.localeCompare(rightKey)
    : rightKey.localeCompare(leftKey);
}

function SortableHeader({
  active,
  direction,
  label,
  onClick,
}: {
  active: boolean;
  direction: SortDirection;
  label: string;
  onClick: () => void;
}) {
  return (
    <TableSortLabel active={active} direction={direction} onClick={onClick}>
      {label}
    </TableSortLabel>
  );
}

export default function StudentStatusOverview({
  courseId = null,
  workspaceMode,
}: StudentStatusOverviewProps) {
  const [rows, setRows] = useState<StatusOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedRow, setSelectedRow] = useState<StatusOverviewRow | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRows() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(getEndpoint(workspaceMode, courseId), {
          cache: 'no-store',
          signal: controller.signal,
        });

        const payload = (await response.json().catch(() => null)) as
          | StatusOverviewResponse
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            payload && 'error' in payload && payload.error
              ? payload.error
              : 'Failed to load status overview',
          );
        }

        setRows(payload && 'items' in payload ? payload.items : []);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load status overview';
        setError(message);
        setRows([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadRows();

    return () => controller.abort();
  }, [courseId, reloadToken, workspaceMode]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredRows = rows.filter((row) => {
    if (!normalizedQuery) {
      return true;
    }

    return row.full_name.toLocaleLowerCase().includes(normalizedQuery);
  });

  const visibleRows = [...filteredRows].sort((left, right) =>
    compareRows(left, right, sortBy, sortDirection),
  );

  const handleSort = (nextSortBy: SortBy) => {
    if (sortBy === nextSortBy) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(nextSortBy);
    setSortDirection('asc');
  };

  const handleSaved = () => {
    setReloadToken((current) => current + 1);
  };

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'center' }}
          sx={{ px: 3, py: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Status Overview
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Track student status, activity recency, and course completion in one view.
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {visibleRows.length} student{visibleRows.length === 1 ? '' : 's'}
            </Typography>
            <TextField
              size="small"
              label="Search students"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              sx={{ minWidth: { xs: '100%', sm: 260 } }}
            />
          </Stack>
        </Stack>

        {loading ? (
          <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 8 }}>
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary">
              Loading status overview...
            </Typography>
          </Stack>
        ) : error ? (
          <Box sx={{ p: 3 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        ) : visibleRows.length === 0 ? (
          <Box sx={{ p: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No students matched your search.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <SortableHeader
                      active={sortBy === 'name'}
                      direction={sortDirection}
                      label="Name"
                      onClick={() => handleSort('name')}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <SortableHeader
                      active={sortBy === 'status'}
                      direction={sortDirection}
                      label="Status"
                      onClick={() => handleSort('status')}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>Attendance</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <SortableHeader
                      active={sortBy === 'kpi'}
                      direction={sortDirection}
                      label="Last KPI"
                      onClick={() => handleSort('kpi')}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <SortableHeader
                      active={sortBy === 'one_on_one'}
                      direction={sortDirection}
                      label="Last 1:1"
                      onClick={() => handleSort('one_on_one')}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <SortableHeader
                      active={sortBy === 'group'}
                      direction={sortDirection}
                      label="Last Group"
                      onClick={() => handleSort('group')}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <SortableHeader
                      active={sortBy === 'courses'}
                      direction={sortDirection}
                      label="Courses"
                      onClick={() => handleSort('courses')}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={row.user_id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {row.full_name || 'Unknown user'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <UserStatusChip
                        clickable
                        onClick={() => setSelectedRow(row)}
                        reason={row.user_status_manual_reason}
                        source={row.user_status_source}
                        status={row.user_status}
                      />
                    </TableCell>
                    <TableCell>{row.attended_count}/{row.expected_count}</TableCell>
                    <TableCell>{formatDateValue(row.last_kpi_at)}</TableCell>
                    <TableCell>{formatDateValue(row.last_one_on_one_at)}</TableCell>
                    <TableCell>{formatDateValue(row.last_group_at)}</TableCell>
                    <TableCell>
                      {row.completed_courses}/{row.total_courses}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        component={Link}
                        href={getWorkspaceHref(workspaceMode, row.user_id, courseId)}
                        size="small"
                        variant="outlined"
                        endIcon={<OpenInNewIcon fontSize="small" />}
                      >
                        Open workspace
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <UserStatusDialog
        open={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        userId={selectedRow?.user_id ?? ''}
        currentStatus={selectedRow?.user_status ?? null}
        manualStatus={selectedRow?.user_status_manual ?? null}
        manualReason={selectedRow?.user_status_manual_reason ?? null}
        userLabel={selectedRow?.full_name || 'Unknown user'}
        onSaved={handleSaved}
      />
    </>
  );
}
