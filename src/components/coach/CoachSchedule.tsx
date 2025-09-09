'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Alert, Typography, Card, CardContent, Divider, ToggleButton, ToggleButtonGroup, CircularProgress } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PlaceIcon from '@mui/icons-material/Place';
import PersonIcon from '@mui/icons-material/Person';

type ApiEvent = {
  id: string;
  calendarId: string;
  groupId: string | null;
  title: string | null;
  status: string | null;
  start: string; // ISO UTC (server normalized)
  end: string;   // ISO UTC
  contact: { id: string | null; name: string | null; email: string | null; phone: string | null };
  location: string | null;
};

type ApiResponse = { timezone: string; items: ApiEvent[] };

function getBrowserTZ(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export default function CoachSchedule() {
  const [days, setDays] = useState<7 | 14>(14);
  const [tz, setTz] = useState<string>(getBrowserTZ());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<ApiEvent[]>([]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // Call your API with days & detected timezone
        const url = `/api/my-schedule?days=${days}&tz=${encodeURIComponent(tz)}`;
        const res = await fetch(url, { cache: 'no-store' });

        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          const base = detail?.message || `Request failed (${res.status})`;
          const more = detail?.detail ? `: ${String(detail.detail).slice(0, 200)}` : '';
          throw new Error(base + more);
        }

        const data: ApiResponse = await res.json();
        if (isMounted) {
          setItems(Array.isArray(data?.items) ? data.items : []);
          // server echoes back a validated timezone; update local copy for formatting consistency
          setTz(data?.timezone || tz);
        }
      } catch (e: any) {
        if (isMounted) setErr(e?.message || 'Failed to load schedule');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
    // re-fetch when days/tz changes
  }, [days, tz]);

  const groups = useMemo(() => {
    // group by local date (using Intl for client-side tz formatting)
    const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: '2-digit', month: 'short' });
    const out: Record<string, ApiEvent[]> = {};
    for (const ev of items) {
      const d = new Date(ev.start); // ISO UTC
      const localKey = fmtDay.format(d) + ' — ' + d.toLocaleDateString(undefined, { year: 'numeric' });
      if (!out[localKey]) out[localKey] = [];
      out[localKey].push(ev);
    }
    // sort each day by start ascending (already sorted by server, but keep it safe)
    Object.values(out).forEach(list => list.sort((a, b) => (a.start < b.start ? -1 : 1)));
    return out;
  }, [items]);

  const timeRange = (ev: ApiEvent) => {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    // Display times in the browser’s locale/timezone
    const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${timeFmt.format(start)} – ${timeFmt.format(end)}`;
    // If you’d rather show the timezone explicitly, append ` (${tz})`
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2 }}>
        <Typography variant="h5" fontWeight={700}>Your Schedule</Typography>
        <ToggleButtonGroup
          value={days}
          exclusive
          size="small"
          onChange={(_, v) => v && setDays(v)}
        >
          <ToggleButton value={7}>Next 7 days</ToggleButton>
          <ToggleButton value={14}>Next 14 days</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {loading && (
        <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && err && <Alert severity="error">{err}</Alert>}

      {!loading && !err && items.length === 0 && (
        <Alert severity="info">No events found for the selected range.</Alert>
      )}

      {!loading && !err && items.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Object.entries(groups).map(([dayLabel, list]) => (
            <Box key={dayLabel}>
              <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 600 }}>{dayLabel}</Typography>
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                {list.map(ev => (
                  <Card key={ev.id} variant="outlined">
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {ev.title || 'Untitled meeting'}
                      </Typography>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <AccessTimeIcon fontSize="small" />
                        <Typography variant="body2">{timeRange(ev)}</Typography>
                      </Box>

                      {(ev.location || ev.contact?.name) && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 0.5 }}>
                          {ev.location && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <PlaceIcon fontSize="small" />
                              <Typography variant="body2">{ev.location}</Typography>
                            </Box>
                          )}
                          {ev.contact?.name && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <PersonIcon fontSize="small" />
                              <Typography variant="body2">
                                {ev.contact.name}
                                {ev.contact.email ? ` • ${ev.contact.email}` : ''}
                                {ev.contact.phone ? ` • ${ev.contact.phone}` : ''}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      )}

                      {ev.status && (
                        <>
                          <Divider sx={{ my: 1 }} />
                          <Typography variant="caption" sx={{ opacity: 0.8 }}>
                            Status: {ev.status}
                          </Typography>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
