'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { JobHeading } from './JobHeading';
import { fetchPlacementGroups } from '@/lib/discoveryJobsClient';
import type { PlacementGroup, PlacementGroupsResponse } from '@/lib/discoveryJobsClient';
import { formatLabel, splitTitleMarker } from '@/lib/discoveryJobTypes';

/**
 * A review inbox, not an editor.
 *
 * The decision is made in the builder, where the material is already rendered properly. Placements
 * inside course chapters and lessons are rolled up to the whole course; only canonical Library
 * guides and whole courses appear as groups here.
 *
 * What this screen exists for is the thing the builders cannot do: say what is still outstanding.
 * Without it, an old resource is only reviewed if someone happens to open the guide it lives in,
 * and nothing can answer "how many are left?".
 */
export default function JobBPlacement({ onDecided }: { onDecided: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<PlacementGroupsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [scope, setScope] = useState<'todo' | 'all'>('todo');

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchPlacementGroups()); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The list could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Keep the sidebar badge in step with whatever this list last saw.
  useEffect(() => { if (data) onDecided(); }, [data, onDecided]);
  // Returning from the builder should show the answer that was just recorded.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [load]);

  const groups = data?.groups ?? [];
  const outstanding = groups.filter((group) => group.needs > 0);
  const shown = scope === 'todo' ? outstanding : groups;
  const selected = groups.find((group) => group.nodeId === selectedNodeId) ?? shown[0] ?? null;

  const openInBuilder = (group: PlacementGroup, blockId?: number) => {
    const path = group.home.editor === 'library' ? '/admin/library-editor' : '/admin/course-builder';
    const resource = blockId ? group.resources.find((item) => item.blockId === blockId) : null;
    const params = new URLSearchParams({ node: String(resource?.placementNodeId ?? group.nodeId) });
    if (blockId) params.set('block', String(blockId));
    if (group.home.rootId) params.set('root', String(group.home.rootId));
    router.push(`${path}?${params}`);
  };

  return (
    <Stack gap={2}>
      <JobHeading
        title="Check standalone use"
        help="placement"
        trailing={
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            <Box component="strong" sx={{ fontFamily: 'monospace' }}>{data?.progress.decided ?? 0}</Box>
            {' of '}
            <Box component="strong" sx={{ fontFamily: 'monospace' }}>{data?.progress.population ?? 0}</Box>
            {' done'}
          </Typography>
        }
      >
        Some resources only make sense alongside the material they sit in. Pick a Library guide or course
        to see what still needs an answer — you answer it in the builder, with the full context in front of you.
      </JobHeading>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap alignItems="center">
        <Chip label={`Needs answers ${outstanding.length}`} size="small" onClick={() => setScope('todo')}
          color={scope === 'todo' ? 'primary' : 'default'} variant={scope === 'todo' ? 'filled' : 'outlined'} />
        <Chip label={`All guides & courses ${groups.length}`} size="small" onClick={() => setScope('all')}
          color={scope === 'all' ? 'primary' : 'default'} variant={scope === 'all' ? 'filled' : 'outlined'} />
        {!!data?.progress.reopened && (
          <Chip size="small" color="warning" variant="outlined"
            label={`${data.progress.reopened} need another look`} />
        )}
      </Stack>

      {loading && !data ? (
        <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress size={24} /></Box>
      ) : !shown.length ? (
        <Paper variant="outlined" sx={{ borderRadius: 2, borderStyle: 'dashed', p: 6, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>All caught up</Typography>
          <Typography variant="body2" color="text.secondary">
            Every resource inside a Library guide or course has been answered.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{
          display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px minmax(0, 1fr)' },
          gap: 2.5, alignItems: 'start',
        }}>
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 1.75, py: 1.25, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{shown.length} guides &amp; courses</Typography>
            </Box>
            <Box sx={{ maxHeight: 620, overflowY: 'auto' }}>
              {shown.map((group) => {
                const active = selected?.nodeId === group.nodeId;
                return (
                  <Box
                    key={group.nodeId} component="button" type="button" aria-pressed={active}
                    onClick={() => setSelectedNodeId(group.nodeId)}
                    sx={{
                      display: 'block', width: '100%', textAlign: 'left', border: 0,
                      borderBottom: '1px solid', borderColor: 'divider', font: 'inherit',
                      bgcolor: active ? 'action.selected' : 'transparent', px: 1.75, py: 1.25,
                      cursor: 'pointer', position: 'relative',
                      '&:hover': { bgcolor: active ? 'action.selected' : 'action.hover' },
                      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                      '&::before': active ? {
                        content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                        bgcolor: 'primary.main',
                      } : undefined,
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: active ? 700 : 500 }}>
                      {group.nodeTitle}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {group.decided} of {group.total} done
                      {group.reopened ? ` · ${group.reopened} to revisit` : ''}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Paper>

          {selected && (
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" useFlexGap
                sx={{ px: 2, py: 1.75, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ flex: 1, minWidth: 240 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>{selected.nodeTitle}</Typography>
                  <Typography variant="caption" color="text.disabled">
                    {selected.nodeType === 'lesson' ? 'Library guide' : formatLabel(selected.nodeType)}
                    {' · '}{selected.nodeState} · {selected.total} resources
                  </Typography>
                </Box>
                <Button
                  variant="outlined" startIcon={<OpenInNewIcon fontSize="small" />}
                  onClick={() => openInBuilder(selected)}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Open in {selected.home.editor === 'library' ? 'Library editor' : 'Course builder'}
                </Button>
              </Stack>

              {selected.resources.map((resource) => {
                const { subject, marker } = splitTitleMarker(resource.title);
                return (
                  <Box key={resource.id} sx={{
                    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 180px 120px', gap: 2,
                    alignItems: 'center', px: 2, py: 1.5,
                    borderBottom: '1px solid', borderColor: 'divider',
                  }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.4 }}>
                        {subject}
                        {marker && <Box component="span" sx={{ color: 'text.disabled' }}>{marker}</Box>}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {formatLabel(resource.mediaType)}
                        {selected.nodeType === 'course' ? ` · in ${resource.placementNodeTitle}` : ''}
                        {' · '}position {resource.position}
                        {resource.placementCount > 1
                          ? ` · also in ${resource.placementCount - 1} other lesson`
                          : ''}
                      </Typography>
                    </Box>

                    <Box>
                      {resource.stale ? (
                        <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 600 }}>
                          Needs another look
                        </Typography>
                      ) : resource.decided ? (
                        <Typography variant="caption" sx={{ color: 'primary.dark', fontWeight: 600 }}>
                          {resource.answer === 'direct' ? 'Works on its own' : 'Kept with the lesson'}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.disabled">Not answered</Typography>
                      )}
                    </Box>

                    <Button
                      size="small" variant={resource.needs ? 'outlined' : 'text'}
                      onClick={() => openInBuilder(selected, resource.blockId)}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      {resource.needs ? 'Answer' : 'Review'}
                    </Button>
                  </Box>
                );
              })}

              <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}>
                <Typography variant="caption" color="text.secondary">
                  Answers are given in the builder, alongside the rest of the guide. They record the same
                  decision this list tracks.
                </Typography>
              </Box>
            </Paper>
          )}
        </Box>
      )}
    </Stack>
  );
}
