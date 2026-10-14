'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Chip, Collapse, IconButton, InputAdornment, MenuItem, Skeleton, Stack, TableSortLabel, TextField, Tooltip, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SwapVertRoundedIcon from '@mui/icons-material/SwapVertRounded';
import { UserStatusChip } from '@/components/UserStatusChip';
import { brand } from '@/lib/homeTheme';
import type { StatusOverviewRow, StatusOverviewSortBy, StatusOverviewSortDirection } from '@/lib/statusOverviewTypes';
import type { UserStatus } from '@/types/coaching';

type Props = {
  rows: StatusOverviewRow[];
  allRows: StatusOverviewRow[];
  loading: boolean;
  error: string | null;
  query: string;
  sortBy: StatusOverviewSortBy;
  sortDirection: StatusOverviewSortDirection;
  onQuery: (query: string) => void;
  onSort: (sort: StatusOverviewSortBy) => void;
  onSortDirection: () => void;
  onStatus: (row: StatusOverviewRow) => void;
  onRetry: () => void;
  workspaceHref: (userId: string) => string;
  formatDate: (value: string | null) => string;
};

type StatusFilter = 'all' | UserStatus | 'paused';
const rosterGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', sm: 'minmax(105px, 1.35fr) 150px .8fr .8fr 104px', lg: 'minmax(140px, 1.4fr) 160px .8fr .8fr .65fr 104px' },
  gap: { xs: 1, sm: 1.5 }, alignItems: 'center',
};

function RosterMember({ row, onStatus, workspaceHref, formatDate }: Pick<Props, 'onStatus' | 'workspaceHref' | 'formatDate'> & { row: StatusOverviewRow }) {
  const [expanded, setExpanded] = useState(false);
  const id = `roster-details-${row.user_id}`;
  const muted = { opacity: row.pause_started_at ? 0.45 : 1, fontSize: 13 };
  const details = [
    ['Last 1on1', formatDate(row.last_one_on_one_at)], ['Last KPI', formatDate(row.last_kpi_at)],
    ['Attendance', `${row.attended_count} / ${row.expected_count}`],
    ['Courses completed', `${row.completed_courses} / ${row.total_courses}`], ['Last group session', formatDate(row.last_group_at)],
  ];

  return <Box component="article" sx={{ borderBottom: `1px solid ${brand.border}` }}>
    <Box sx={{ ...rosterGrid, py: 1.75 }}>
      <Button aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)} sx={{ color: brand.ink, fontSize: 14, fontWeight: 600, textAlign: 'left', justifyContent: 'flex-start', gap: 1, p: 0, minWidth: 0, minHeight: 38, '&:hover': { bgcolor: 'transparent', color: brand.turquoiseDeep } }}>
        <ExpandMoreRoundedIcon sx={{ fontSize: 19, flexShrink: 0, color: brand.inkSoft, transform: expanded ? 'rotate(180deg)' : 'none' }} /><Box component="span" sx={{ overflowWrap: 'anywhere' }}>{row.full_name || 'Unknown user'}</Box>
      </Button>
      <Box sx={{ gridColumn: { xs: 1, sm: 'auto' }, gridRow: { xs: 2, sm: 'auto' }, pl: { xs: 3.25, sm: 0 } }}>
        {row.pause_started_at ? <Tooltip title={`Paused since ${formatDate(row.pause_started_at)}`}><Chip label="Member is paused" size="small" color="info" sx={{ fontSize: 12 }} /></Tooltip>
          : <UserStatusChip compact clickable onClick={() => onStatus(row)} reason={row.user_status_manual_reason} source={row.user_status_source} status={row.user_status} />}
      </Box>
      <Typography sx={{ ...muted, display: { xs: 'none', sm: 'block' } }}>{formatDate(row.last_one_on_one_at)}</Typography>
      <Typography sx={{ ...muted, display: { xs: 'none', sm: 'block' } }}>{formatDate(row.last_kpi_at)}</Typography>
      <Typography sx={{ ...muted, display: { xs: 'none', lg: 'block' } }}>{row.attended_count} / {row.expected_count}</Typography>
      <Button component={Link} href={workspaceHref(row.user_id)} aria-label={`Open ${row.full_name || 'this member'}'s coaching space`} endIcon={<ArrowForwardRoundedIcon />} sx={{ minHeight: 38, minWidth: 0, px: 0, py: 0.5, fontSize: 12, color: brand.turquoiseDeep, justifySelf: 'end', gridColumn: { xs: 2, sm: 'auto' }, gridRow: { xs: '1 / span 2', sm: 'auto' } }}>Open space</Button>
    </Box>
    <Collapse in={expanded}><Box id={id} sx={{ bgcolor: brand.card, borderRadius: '10px', ml: { xs: 0, sm: 3.25 }, p: 2.5, mb: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        {details.map(([label, value]) => <Box key={label}><Typography sx={{ fontSize: 12, color: brand.inkSoft, mb: 0.5 }}>{label}</Typography><Typography sx={{ ...muted, fontWeight: 600 }}>{value}</Typography></Box>)}
      </Box>
      {row.user_status_manual_reason ? <Typography sx={{ fontSize: 12, color: brand.inkSoft, borderTop: `1px solid ${brand.border}`, pt: 1.5, mt: 2 }}>Status reason: {row.user_status_manual_reason}</Typography> : null}
      {row.pause_started_at ? <Typography sx={{ fontSize: 12, color: brand.inkSoft, mt: 2 }}>Paused since {formatDate(row.pause_started_at)}.</Typography> : null}
    </Box></Collapse>
  </Box>;
}

const sortOptions: [StatusOverviewSortBy, string][] = [['name', 'Member'], ['status', 'Status'], ['one_on_one', 'Last 1on1'], ['kpi', 'Last KPI'], ['group', 'Last group session'], ['courses', 'Courses completed']];

export default function CoachMemberRoster(props: Props) {
  const { rows, allRows, loading, error, query, sortBy, sortDirection, onQuery, onSort, onSortDirection, onRetry } = props;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const filters: [StatusFilter, string][] = [['all', 'All'], ['green', 'On track'], ['yellow', 'Needs attention'], ['red', 'Emergency']];
  if (allRows.some((row) => row.pause_started_at)) filters.push(['paused', 'Paused']);
  const matchesStatus = (row: StatusOverviewRow, filter: StatusFilter) => filter === 'all' || (filter === 'paused' ? Boolean(row.pause_started_at) : !row.pause_started_at && row.user_status === filter);
  const visibleRows = rows.filter((row) => matchesStatus(row, statusFilter));
  const header = (label: string, sort?: StatusOverviewSortBy) => sort ? <TableSortLabel active={sortBy === sort} direction={sortDirection} onClick={() => onSort(sort)}>{label}</TableSortLabel> : label;

  return <Box>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
      <Box role="group" aria-label="Member status filters" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {filters.map(([filter, label]) => <Button key={filter} aria-pressed={statusFilter === filter} onClick={() => setStatusFilter(filter)} sx={{ minWidth: 0, minHeight: 36, fontSize: 12, px: 1.25, py: 0.5, border: `1px solid ${statusFilter === filter ? brand.ink : brand.border}`, borderRadius: '6px', bgcolor: statusFilter === filter ? brand.ink : 'transparent', color: statusFilter === filter ? brand.card : brand.inkSoft, '&:hover': { bgcolor: statusFilter === filter ? brand.slateSoft : brand.turquoiseTint } }}>{label} · {allRows.filter((row) => matchesStatus(row, filter)).length}</Button>)}
      </Box>
      <TextField placeholder="Find a member" size="small" value={query} onChange={(event) => onQuery(event.target.value)} slotProps={{ htmlInput: { 'aria-label': 'Search roster members' }, input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 19, color: brand.inkSoft }} /></InputAdornment> } }} sx={{ width: { xs: '100%', sm: 220 }, '& input': { fontSize: 14, py: 1.25 } }} />
    </Box>
    {loading ? <Stack spacing={1.5} aria-label="Loading member roster">{[0, 1, 2, 3].map((key) => <Skeleton key={key} variant="rounded" height={64} />)}</Stack> : error ? <Alert severity="error" action={<Button color="inherit" onClick={onRetry}>Try again</Button>}>{error}</Alert> : <>
      <Box sx={{ ...rosterGrid, display: { xs: 'none', sm: 'grid' }, fontSize: 12, color: brand.inkSoft, pb: 1.5 }}>{header('Member', 'name')}{header('Status', 'status')}{header('Last 1on1', 'one_on_one')}{header('Last KPI', 'kpi')}<Box sx={{ display: { xs: 'none', lg: 'block' } }}>Attendance</Box><Box /></Box>
      {visibleRows.length ? <Box sx={{ borderTop: `1px solid ${brand.border}` }}>{visibleRows.map((row) => <RosterMember key={row.user_id} row={row} onStatus={props.onStatus} workspaceHref={props.workspaceHref} formatDate={props.formatDate} />)}</Box> : <Typography sx={{ fontSize: 14, color: brand.inkSoft, py: 3 }}>No members matched this view.</Typography>}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center', mt: 2 }}>
        <Box><Typography sx={{ fontSize: 12, color: brand.inkSoft }}>Select a status to review its reason.</Typography><Typography role="status" sx={{ fontSize: 12, color: brand.inkSoft, mt: 0.5 }}>{visibleRows.length} member{visibleRows.length === 1 ? '' : 's'}</Typography></Box>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <TextField select size="small" label="Sort by" value={sortBy} onChange={(event) => onSort(event.target.value as StatusOverviewSortBy)} sx={{ minWidth: 170, '& .MuiSelect-select': { fontSize: 12, py: 1 } }}>{sortOptions.map(([value, label]) => <MenuItem key={value} value={value} sx={{ fontSize: 13 }}>{label}</MenuItem>)}</TextField>
          <Tooltip title={sortDirection === 'asc' ? 'Sort descending' : 'Sort ascending'}><IconButton aria-label={sortDirection === 'asc' ? 'Sort descending' : 'Sort ascending'} onClick={onSortDirection} sx={{ color: brand.turquoiseDeep }}><SwapVertRoundedIcon /></IconButton></Tooltip>
        </Stack>
      </Box>
    </>}
  </Box>;
}
