// components/admin/CoachRosters.tsx
'use client';
import { useEffect, useMemo, useState, Fragment } from 'react';
import {
  Accordion, AccordionSummary, AccordionDetails,
  Box, Chip, Divider, IconButton, InputAdornment,
  Paper, Skeleton, TextField, Typography, Tooltip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';

type Roster = {
  coach_id: string;
  coach_name: string;
  coach_email: string;
  effective_count: number;
  users: { user_id: string; name: string; email: string }[];
};

export default function CoachRosters() {
  const [items, setItems] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await fetch('/api/admin/coach-rosters');
      const j = await r.json();
      setItems(j.items || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items
      .map(group => ({
        ...group,
        users: group.users.filter(u =>
          u.name.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term)
        ),
      }))
      .filter(g => g.users.length > 0);
  }, [items, q]);

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Chip label={`${items.reduce((n, g) => n + g.users.length, 0)} users`} size="small" />
        <Chip label={`${items.length} coaches`} size="small" />
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          placeholder="Search users by name or email…"
          value={q}
          onChange={e => setQ(e.target.value)}
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
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={68} />
          ))}
        </Box>
      ) : filtered.length === 0 ? (
        <Typography color="text.secondary">No matching users.</Typography>
      ) : (
        filtered.map((g) => (
          <Accordion key={g.coach_id} disableGutters sx={{ borderRadius: 1, overflow: 'hidden', mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', pr: 1 }}>
                <Typography fontWeight={600}>{g.coach_name}</Typography>
                <Typography color="text.secondary">• {g.coach_email}</Typography>
                <Chip label={`${g.effective_count}`} size="small" sx={{ ml: 'auto' }} />
                <Tooltip title="Copy coach email">
                  <IconButton
                    size="small"
                    component="div" // render as <div>, not <button> to avoid nested button inside summary
                    onClick={(e) => { e.stopPropagation(); copy(g.coach_email); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).click();
                      }
                    }}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </AccordionSummary>

            <AccordionDetails>
              {g.users.length === 0 ? (
                <Typography color="text.secondary">No users.</Typography>
              ) : (
                <Box sx={{ display: 'grid', gap: 0.5 }}>
                  {g.users.map((u, idx) => (
                    <Fragment key={`${g.coach_id}-${u.user_id}`}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}>
                        <Typography sx={{ minWidth: 220 }}>{u.name}</Typography>
                        <Typography color="text.secondary" sx={{ flex: 1 }}>{u.email}</Typography>
                        <Tooltip title="Copy user email">
                          <IconButton size="small" onClick={() => copy(u.email)}>
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      {idx < g.users.length - 1 && <Divider />}
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
