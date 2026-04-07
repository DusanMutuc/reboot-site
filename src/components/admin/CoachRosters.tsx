// components/admin/CoachRosters.tsx
'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import LegendMemberIcon, { LEGEND_MEMBER_TOOLTIP } from '@/components/LegendMemberIcon';

type Roster = {
  coach_id: string;
  coach_name: string;
  coach_email: string;
  effective_count: number;
  legend_count: number;
  users: { user_id: string; name: string; email: string; is_legend: boolean }[];
};

export default function CoachRosters() {
  const [items, setItems] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const response = await fetch('/api/admin/coach-rosters');
      const json = await response.json();
      setItems(json.items || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;

    return items
      .map((group) => ({
        ...group,
        users: group.users.filter((user) =>
          user.name.toLowerCase().includes(term) ||
          user.email.toLowerCase().includes(term),
        ),
      }))
      .filter((group) => group.users.length > 0);
  }, [items, q]);

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Chip label={`${items.reduce((count, group) => count + group.users.length, 0)} users`} size="small" />
        <Chip label={`${items.length} coaches`} size="small" />
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          placeholder="Search users by name or email..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {loading ? (
        <Box sx={{ display: 'grid', gap: 1 }}>
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} variant="rounded" height={68} />
          ))}
        </Box>
      ) : filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No matching users.</Typography>
      ) : (
        filtered.map((group) => (
          <Accordion key={group.coach_id} disableGutters sx={{ borderRadius: 1, overflow: 'hidden', mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', pr: 1 }}>
                <Typography variant="body1" fontWeight={600}>{group.coach_name}</Typography>
                <Typography variant="body2" color="text.secondary">{`- ${group.coach_email}`}</Typography>
                <Chip label={`${group.effective_count}`} size="small" sx={{ ml: 'auto' }} />
                <Tooltip title={LEGEND_MEMBER_TOOLTIP}>
                  <Chip
                    icon={<StarIcon fontSize="small" />}
                    label={`${group.legend_count}`}
                    size="small"
                    sx={{
                      '& .MuiChip-icon': {
                        color: '#d97706',
                      },
                    }}
                  />
                </Tooltip>
                <Tooltip title="Copy coach email">
                  <IconButton
                    size="small"
                    component="div"
                    onClick={(event) => {
                      event.stopPropagation();
                      copy(group.coach_email);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        (event.currentTarget as HTMLElement).click();
                      }
                    }}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </AccordionSummary>

            <AccordionDetails>
              {group.users.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No users.</Typography>
              ) : (
                <Box sx={{ display: 'grid', gap: 0.5 }}>
                  {group.users.map((user, index) => (
                    <Fragment key={`${group.coach_id}-${user.user_id}`}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 220 }}>
                          <Typography variant="body1">{user.name}</Typography>
                          {user.is_legend ? <LegendMemberIcon /> : null}
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{user.email}</Typography>
                        <Tooltip title="Copy user email">
                          <IconButton size="small" onClick={() => copy(user.email)}>
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      {index < group.users.length - 1 && <Divider />}
                    </Fragment>
                  ))}
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        ))
      )}
    </>
  );
}
