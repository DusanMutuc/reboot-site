'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';

import { navigateWithDiscoveryGuard } from '@/lib/discoveryAdminNavigation';
import type { FindContentDecision, FindContentDetail, FindContentResult } from '@/lib/discoveryRemainingTypes';
import { JobHeading } from './jobs/JobHeading';

const ANSWERS: Record<string, string> = {
  assigned: 'Topics assigned', none_needed: 'No topic needed', direct: 'Suitable independently',
  context: 'Keep within its guide', allowed: 'Searchable', excluded: 'Kept out of search',
};

function formatDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function typeLabel(value: string) {
  const labels: Record<string, string> = { lesson: 'Library guide', course: 'Course', video: 'Video', podcast: 'Podcast', pdf: 'PDF', document: 'Document', audio: 'Audio', image: 'Image', link: 'Link' };
  return labels[value.toLowerCase()] ?? value;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'The lookup failed.');
  return body;
}

function decisionText(decision: FindContentDecision, detail: FindContentDetail) {
  if (decision.question === 'topics' && decision.answer === 'assigned' && detail.topics.length) {
    return detail.topics.map((topic) => topic.name).join(', ');
  }
  if (!decision.decided && decision.question === 'topics' && !detail.topics.length) return 'No topics assigned';
  return ANSWERS[decision.answer] ?? decision.answer;
}

export default function FindContentAdmin() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<FindContentResult[]>([]);
  const [selected, setSelected] = useState<FindContentResult | null>(null);
  const [detail, setDetail] = useState<FindContentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (!query.trim()) { setItems([]); setSelected(null); setDetail(null); return; }
      setLoading(true); setError(null);
      try {
        const payload = await readJson<{ items: FindContentResult[] }>(await fetch(`/api/admin/discovery/find?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }));
        if (controller.signal.aborted) return;
        setItems(payload.items);
        setSelected((current) => payload.items.find((item) => current && item.kind === current.kind && item.id === current.id) ?? payload.items[0] ?? null);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'The lookup failed.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 220);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    const controller = new AbortController();
    setDetailLoading(true); setError(null);
    void fetch(`/api/admin/discovery/find?view=detail&kind=${selected.kind}&id=${selected.id}`, { signal: controller.signal })
      .then((response) => readJson<{ item: FindContentDetail }>(response))
      .then((payload) => { if (!controller.signal.aborted) setDetail(payload.item); })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Could not read that item.'); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selected]);

  const idMatches = useMemo(() => items.filter((item) => item.exactIdMatch), [items]);
  const ordinary = useMemo(() => items.filter((item) => !item.exactIdMatch), [items]);
  const navigate = (href: string) => navigateWithDiscoveryGuard(() => router.push(href));

  const reopen = (decision: FindContentDecision) => {
    if (!detail) return;
    const ref = `${detail.kind}:${detail.id}`;
    if (decision.question === 'topics') {
      if (detail.kind === 'resource') navigate(`/admin/discovery-topics?item=${ref}`);
      else navigate(detail.mediaType === 'course' ? `/admin/course-builder?node=${detail.id}` : `/admin/library-editor?node=${detail.id}`);
    } else if (decision.question === 'visibility') navigate(`/admin/discovery-hidden?item=${ref}`);
  };

  const renderRows = (rows: FindContentResult[]) => rows.map((item) => {
    const focused = selected?.kind === item.kind && selected.id === item.id;
    return (
      <Box key={`${item.kind}:${item.id}`} role="option" aria-selected={focused} onClick={() => setSelected(item)}
        sx={{ px: 2, py: 1.3, borderBottom: '1px solid', borderColor: 'divider', cursor: 'pointer', position: 'relative', bgcolor: focused ? 'action.selected' : 'transparent', '&:hover': { bgcolor: focused ? 'action.selected' : 'action.hover' }, '&::before': focused ? { content: '""', position: 'absolute', inset: '0 auto 0 0', width: 3, bgcolor: 'primary.main' } : undefined }}>
        <Stack direction="row" gap={1.25} alignItems="flex-start">
          <Chip size="small" variant="outlined" label={typeLabel(item.mediaType)} sx={{ mt: 0.15, minWidth: 88 }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: focused ? 700 : 500 }}>{item.title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {item.kind}:{item.id}{item.placementTitles.length ? ` · in ${item.placementTitles.join(', ')}` : ''}
            </Typography>
            {item.ineligibleReason ? <Typography variant="caption" color="warning.dark" sx={{ display: 'block' }}>{item.ineligibleReason}</Typography> : null}
          </Box>
        </Stack>
      </Box>
    );
  });

  return (
    <Stack gap={2.5}>
      <JobHeading title="Find content" help="find">See what was decided about a known item, then return to the place that owns that decision.</JobHeading>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(560px, 1fr) minmax(340px, 0.52fr)' }, gap: 2, alignItems: 'start' }}>
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <TextField fullWidth size="small" autoFocus value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, alternate name, ID, or containing guide" InputProps={{ startAdornment: <SearchRoundedIcon sx={{ mr: 1, color: 'text.disabled' }} /> }} />
          </Box>
          <Box role="listbox" aria-label="Matching content" sx={{ minHeight: 430, maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
            {loading ? <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress size={24} /></Stack> : null}
            {!loading && idMatches.length ? <><Typography variant="body2" sx={{ px: 2, py: 1, fontWeight: 700, bgcolor: 'grey.50' }}>ID matches</Typography>{renderRows(idMatches)}</> : null}
            {!loading && ordinary.length ? <>{idMatches.length ? <Typography variant="body2" sx={{ px: 2, py: 1, fontWeight: 700, bgcolor: 'grey.50' }}>Other matches</Typography> : null}{renderRows(ordinary)}</> : null}
            {!loading && query.trim() && !items.length ? <Typography color="text.secondary" sx={{ p: 5, textAlign: 'center' }}>Nothing matched. Try a title, an alternate name, an ID, or the guide it sits in.</Typography> : null}
            {!loading && !query.trim() ? <Typography color="text.secondary" sx={{ p: 5, textAlign: 'center' }}>Search for the item you already have in mind.</Typography> : null}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.25, minHeight: 430 }}>
          {detailLoading ? <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress size={24} /></Stack> : null}
          {!detailLoading && !detail ? <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>Choose an item to read its decisions.</Typography> : null}
          {!detailLoading && detail ? (
            <Stack gap={2}>
              <Box>
                <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 0.5 }}><Chip size="small" label={typeLabel(detail.mediaType)} /><Typography variant="caption" color="text.secondary">{detail.kind}:{detail.id}</Typography></Stack>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{detail.title}</Typography>
                {detail.ineligibleReason ? <Alert severity="info" sx={{ mt: 1.5 }}>{detail.ineligibleReason}</Alert> : null}
              </Box>
              {detail.inDiscoveryScope ? <>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Decisions</Typography>
                <Stack divider={<Divider flexItem />}>
                  {detail.decisions.filter((decision) => detail.kind === 'resource' || decision.question !== 'placement').map((decision) => (
                    <Box key={decision.question} sx={{ py: 1.15 }}>
                      <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" color="text.secondary">{decision.question === 'topics' ? 'Topics' : decision.question === 'placement' ? 'Standalone use' : 'In search'}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{decisionText(decision, detail)}</Typography>
                          <Typography variant="caption" color={decision.stale ? 'warning.dark' : 'text.secondary'}>
                            {decision.decided ? `${decision.decidedLabel ?? 'Admin'} · ${formatDate(decision.decidedAt)}` : decision.question === 'topics' && !detail.topics.length ? 'Not yet reviewed' : 'No review recorded'}
                            {decision.stale ? ' · the content has changed since' : ''}
                          </Typography>
                        </Box>
                        {decision.question !== 'placement' ? <Button size="small" onClick={() => reopen(decision)}>{decision.decided ? 'Reopen' : 'Review'}</Button> : null}
                      </Stack>
                      {decision.question === 'placement' && detail.placements.length ? (
                        <Stack gap={0.5} sx={{ mt: 1 }}>
                          {detail.placements.map((placement) => <Button key={placement.blockId} size="small" variant="text" sx={{ justifyContent: 'flex-start' }}
                            onClick={() => navigate(`/admin/${placement.editor === 'library' ? 'library-editor' : 'course-builder'}?node=${placement.nodeId}&block=${placement.blockId}`)}>
                            Open in {placement.nodeTitle}
                          </Button>)}
                        </Stack>
                      ) : null}
                    </Box>
                  ))}
                </Stack>
              </> : null}
              <Divider />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Current state</Typography>
              <Stack gap={1.25}>
                <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                  <Box><Typography variant="caption" color="text.secondary">Published</Typography><Typography variant="body2" sx={{ fontWeight: 600 }}>{detail.state === 'published' ? 'Yes' : `No · ${detail.state}`}</Typography></Box>
                  <Button size="small" endIcon={<OpenInNewRoundedIcon />} onClick={() => navigate(detail.publishedHref)}>Open</Button>
                </Stack>
                {detail.kind === 'resource' ? <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                  <Box><Typography variant="caption" color="text.secondary">Homepage browse</Typography><Typography variant="body2" sx={{ fontWeight: 600 }}>{detail.isBrowsable ? `On${detail.categories.length ? ` · ${detail.categories.join(', ')}` : ''}` : 'Not included'}</Typography></Box>
                  <Tooltip title="Homepage browse is current state, not a recorded review decision."><Button size="small" onClick={() => navigate(`/admin/discovery-browse?item=resource:${detail.id}`)}>Curate</Button></Tooltip>
                </Stack> : null}
              </Stack>
            </Stack>
          ) : null}
        </Paper>
      </Box>
    </Stack>
  );
}
