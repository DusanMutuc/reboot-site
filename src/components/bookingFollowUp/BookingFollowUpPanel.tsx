'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';

import type {
  BookingFollowUpGroup,
  BookingFollowUpMember,
  BookingFollowUpResponse,
  BookingMeetingSummary,
} from '@/types/bookingFollowUp';

type Props = {
  mode: 'coach' | 'admin';
};

type Filter = 'attention' | 'all';

type VisibleBookingFollowUpGroup = BookingFollowUpGroup & {
  totalMemberCount: number;
  attentionMemberCount: number;
};

const dangerCellSx = {
  bgcolor: '#fff1f2',
  color: '#b42318',
  borderLeft: '3px solid #ef4444',
} as const;

function needsAttention(member: BookingFollowUpMember): boolean {
  return member.isNewMember || member.needsImplementation || member.needsM2;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatMeetingRecency(meeting: BookingMeetingSummary | null): string {
  if (!meeting) return 'Never';
  if (meeting.daysAgo === 0) return `Today · ${formatDate(meeting.start)}`;
  if (meeting.daysAgo === 1) return `1 day ago · ${formatDate(meeting.start)}`;
  return `${meeting.daysAgo} days ago · ${formatDate(meeting.start)}`;
}

function formatUpcoming(meeting: BookingMeetingSummary | null): string | null {
  return meeting ? formatDate(meeting.start) : null;
}

function waitForRetry(signal: AbortSignal | undefined, delayMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException('Request aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export default function BookingFollowUpPanel({ mode }: Props) {
  const [report, setReport] = useState<BookingFollowUpResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('attention');
  const requestIdRef = useRef(0);

  const load = useCallback(async (signal?: AbortSignal, isRefresh = false) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const endpoint = mode === 'admin'
        ? '/api/admin/booking-follow-up'
        : '/api/coach/booking-follow-up';
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) await waitForRetry(signal, 900);

        try {
          const response = await fetch(endpoint, {
            cache: 'no-store',
            credentials: 'same-origin',
            signal,
          });
          const payload = (await response.json().catch(() => ({}))) as
            | BookingFollowUpResponse
            | { error?: string };

          if (!response.ok) {
            throw new Error('error' in payload && payload.error
              ? payload.error
              : `Request failed (${response.status})`);
          }

          if (requestIdRef.current === requestId) {
            setReport(payload as BookingFollowUpResponse);
          }
          lastError = null;
          break;
        } catch (attemptError) {
          if (attemptError instanceof DOMException && attemptError.name === 'AbortError') throw attemptError;
          lastError = attemptError instanceof Error
            ? attemptError
            : new Error('Could not load booking follow-up.');
        }
      }

      if (lastError) throw lastError;
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      if (requestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load booking follow-up.');
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [mode]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const summary = useMemo(() => {
    const members = report?.groups.flatMap((group) => group.members) ?? [];
    return {
      roster: members.length,
      attention: members.filter(needsAttention).length,
      implementation: members.filter((member) => member.needsImplementation).length,
      m2: members.filter((member) => member.needsM2).length,
      newMembers: members.filter((member) => member.isNewMember).length,
    };
  }, [report]);

  const visibleGroups = useMemo(() => {
    return (report?.groups ?? []).map((group) => {
      const attentionMembers = group.members.filter(needsAttention);
      return {
        ...group,
        totalMemberCount: group.members.length,
        attentionMemberCount: attentionMembers.length,
        members: filter === 'attention' ? attentionMembers : group.members,
      };
    });
  }, [filter, report]);

  const content = (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant={mode === 'coach' ? 'h2' : 'adminSectionTitle'} fontWeight={700}>
            Booking follow-up
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            GHL calendar check for implementation and M2 meetings that still need to be booked.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <ToggleButtonGroup
            value={filter}
            exclusive
            size="small"
            onChange={(_, value: Filter | null) => value && setFilter(value)}
            aria-label="Filter booking follow-up members"
          >
            <ToggleButton value="attention">Needs attention</ToggleButton>
            <ToggleButton value="all">All roster</ToggleButton>
          </ToggleButtonGroup>
          <Tooltip title="Scan GHL again">
            <span>
              <IconButton
                aria-label="Refresh booking follow-up"
                onClick={() => void load(undefined, true)}
                disabled={refreshing}
              >
                {refreshing ? <CircularProgress size={20} /> : <RefreshIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <Alert
          severity="error"
          action={<Button color="inherit" size="small" onClick={() => void load()}>Try again</Button>}
        >
          {error}
        </Alert>
      ) : !report || report.groups.length === 0 ? (
        <Alert severity="info">No active coach roster assignments were found.</Alert>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
              gap: 1.5,
              mb: 3,
            }}
          >
            <SummaryCard label="Needs attention" value={summary.attention} tone="danger" />
            <SummaryCard label="Implementation" value={summary.implementation} />
            <SummaryCard label="M2" value={summary.m2} />
            <SummaryCard label="New members" value={summary.newMembers} tone="new" />
          </Box>

          {filter === 'attention' && summary.attention === 0 ? (
            <Alert severity="success">Everyone on the scanned roster is currently covered.</Alert>
          ) : mode === 'admin' ? (
            <Stack spacing={1.5}>
              {visibleGroups.map((group) => (
                <AdminCoachGroup key={group.coachId} group={group} filter={filter} />
              ))}
            </Stack>
          ) : (
            visibleGroups.map((group) => (
              <CoachGroupContent key={group.coachId} group={group} filter={filter} />
            ))
          )}

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Last scanned {new Date(report.generatedAt).toLocaleString()} · Cancelled, invalid, and no-show events are ignored.
          </Typography>
        </>
      )}
    </>
  );

  if (mode === 'admin') return content;

  return (
    <Box sx={{ width: '100%', bgcolor: '#f4f7f6', py: { xs: 5, md: 8 }, px: 2 }}>
      <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto' }}>{content}</Box>
    </Box>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'danger' | 'new';
}) {
  const colors = tone === 'danger'
    ? { bgcolor: '#fff1f2', color: '#b42318', borderColor: '#fecdd3' }
    : tone === 'new'
      ? { bgcolor: '#fff8e7', color: '#9a6700', borderColor: '#fde68a' }
      : { bgcolor: '#effaf7', color: '#267c6d', borderColor: '#bce7dd' };

  return (
    <Paper variant="outlined" sx={{ p: 2, boxShadow: 'none', ...colors }}>
      <Typography variant="h5" fontWeight={800}>{value}</Typography>
      <Typography variant="caption" fontWeight={700}>{label}</Typography>
    </Paper>
  );
}

function AdminCoachGroup({ group, filter }: { group: VisibleBookingFollowUpGroup; filter: Filter }) {
  const attentionPercentage = group.totalMemberCount > 0
    ? (group.attentionMemberCount / group.totalMemberCount) * 100
    : 0;
  const indicatorColors = attentionPercentage > 50
    ? { bgcolor: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' }
    : attentionPercentage >= 25
      ? { bgcolor: '#ffedd5', color: '#9a3412', borderColor: '#fed7aa' }
      : { bgcolor: '#fef9c3', color: '#854d0e', borderColor: '#fde68a' };

  return (
    <Accordion
      disableGutters
      sx={{ border: '1px solid', borderColor: 'divider', boxShadow: 'none', overflow: 'hidden' }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', pr: 1, flexWrap: 'wrap' }}>
          <Typography fontWeight={700}>{group.coachName}</Typography>
          {group.coachEmail && <Typography variant="body2" color="text.secondary">{group.coachEmail}</Typography>}
          <Box sx={{ flex: 1 }} />
          {!group.dataComplete && <Chip color="warning" size="small" label="GHL unavailable" />}
          <Box
            sx={{
              px: 1.75,
              py: 0.75,
              border: '1px solid',
              borderRadius: 1,
              fontSize: '0.95rem',
              lineHeight: 1.3,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              ...indicatorColors,
            }}
          >
            {group.attentionMemberCount} need attention ({Math.round(attentionPercentage)}%)
          </Box>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        <CoachGroupContent group={group} filter={filter} />
      </AccordionDetails>
    </Accordion>
  );
}

function CoachGroupContent({ group, filter }: { group: BookingFollowUpGroup; filter: Filter }) {
  return (
    <Box>
      {group.dataWarning && (
        <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 0 }}>
          {group.dataWarning} No follow-up status will be inferred from incomplete data.
        </Alert>
      )}
      {group.members.length === 0 ? (
        <Alert severity="success" sx={{ borderRadius: 0 }}>
          {filter === 'attention'
            ? 'No members in this coach group currently need booking follow-up.'
            : 'No roster members found.'}
        </Alert>
      ) : (
        <MemberTable members={group.members} />
      )}
    </Box>
  );
}

function MemberTable({ members }: { members: BookingFollowUpMember[] }) {
  return (
    <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Table size="small" aria-label="Booking follow-up roster">
        <TableHead>
          <TableRow sx={{ bgcolor: '#f8faf9' }}>
            <TableCell>Member</TableCell>
            <TableCell>Last implementation</TableCell>
            <TableCell>Last M2</TableCell>
            <TableCell>Upcoming</TableCell>
            <TableCell>Booking status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.userId} hover>
              <TableCell sx={{ minWidth: member.people.length > 1 ? 240 : 190 }}>
                <Stack spacing={member.people.length > 1 ? 1 : 0}>
                  {member.people.map((person) => (
                    <Box key={person.userId}>
                      <Typography variant="body2" fontWeight={700}>{person.name}</Typography>
                      {person.email && (
                        <Typography variant="caption" color="text.secondary">
                          {person.email}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
                {!member.dataComplete && (
                  <Tooltip title={member.dataWarning ?? 'GHL data is incomplete.'}>
                    <Chip
                      icon={<WarningAmberRoundedIcon />}
                      label="Incomplete scan"
                      color="warning"
                      variant="outlined"
                      size="small"
                      sx={{ display: 'flex', width: 'fit-content', mt: 0.75 }}
                    />
                  </Tooltip>
                )}
              </TableCell>
              <MeetingHistoryCell
                meeting={member.lastImplementation}
                problematic={member.needsImplementation}
                secondary={member.implementationCycleComplete
                  ? '3 implementations completed — M2 is next'
                  : `${member.implementationsSinceLastM2} in current cycle`}
              />
              <MeetingHistoryCell
                meeting={member.lastM2}
                problematic={member.needsM2}
              />
              <TableCell sx={{ minWidth: 160 }}>
                <Stack spacing={0.5}>
                  {formatUpcoming(member.upcomingImplementation) && (
                    <Typography variant="caption">
                      Implementation: {formatUpcoming(member.upcomingImplementation)}
                    </Typography>
                  )}
                  {formatUpcoming(member.upcomingM2) && (
                    <Typography variant="caption">M2: {formatUpcoming(member.upcomingM2)}</Typography>
                  )}
                  {!member.upcomingImplementation && !member.upcomingM2 && (
                    <Typography variant="body2" color="text.secondary">None found</Typography>
                  )}
                </Stack>
              </TableCell>
              <TableCell sx={{ minWidth: 200 }}>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                  {member.isNewMember && (
                    <Chip
                      icon={<NewReleasesOutlinedIcon />}
                      color="warning"
                      size="small"
                      label="New member — no meetings"
                    />
                  )}
                  {member.needsImplementation && (
                    <Chip color="error" size="small" label="Implementation booking missing" />
                  )}
                  {member.needsM2 && <Chip color="error" size="small" label="M2 booking missing" />}
                  {!needsAttention(member) && member.dataComplete && (
                    <Chip color="success" variant="outlined" size="small" label="Covered" />
                  )}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function MeetingHistoryCell({
  meeting,
  problematic,
  secondary,
}: {
  meeting: BookingMeetingSummary | null;
  problematic: boolean;
  secondary?: string;
}) {
  return (
    <TableCell sx={{ minWidth: 175, ...(problematic ? dangerCellSx : {}) }}>
      <Typography variant="body2" fontWeight={problematic ? 700 : 500}>
        {formatMeetingRecency(meeting)}
      </Typography>
      {secondary && <Typography variant="caption" color="text.secondary">{secondary}</Typography>}
    </TableCell>
  );
}

function LoadingState() {
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 2 }}>
        {[0, 1, 2, 3].map((key) => <Skeleton key={key} variant="rounded" height={72} />)}
      </Box>
      <Divider sx={{ mb: 2 }} />
      {[0, 1, 2].map((key) => <Skeleton key={key} variant="rounded" height={58} sx={{ mb: 1 }} />)}
    </Box>
  );
}
