'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, Divider,
  Link as MuiLink, Paper, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  fetchBrowse, fetchCandidates, setBrowseApproval,
} from '@/lib/discoveryJobsClient';
import type { BrowseItem, BrowseResponse, CandidateResponse, CandidateSort } from '@/lib/discoveryJobsClient';
import {
  DISCOVERY_BROWSE_BLOCKERS, durationLabel, formatLabel, splitTitleMarker,
} from '@/lib/discoveryJobTypes';
import { DISCOVERY_CATEGORY_LABELS } from '@/lib/discoveryAdminTypes';
import CategoryCoverage from '../CategoryCoverage';
import { JobHeading } from './JobHeading';
import type { JobKey } from './jobDefinitions';


/**
 * Job D is a collection, not a queue. No completion, no percentage, no items-remaining, no
 * caught-up state. The useful signal is coverage per category, because an empty category is a real
 * gap while a small total is not.
 */
export default function JobDBrowse({ onDecided, onOpenTopicsTab, onOpenJob }: {
  onDecided: () => void;
  onOpenTopicsTab: () => void;
  onOpenJob: (job: JobKey) => void;
}) {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BrowseItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'cant' | 'nocat'>('all');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchBrowse()); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The collection could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (item: BrowseItem) => {
    setBusy(true);
    try {
      await setBrowseApproval({ kind: 'resource', id: item.id }, false);
      setSelected(null);
      await load();
      onDecided();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The item could not be removed.');
    } finally { setBusy(false); }
  };

  const items = data?.items ?? [];
  const shown = filter === 'cant' ? items.filter((item) => item.blocker)
    : filter === 'nocat' ? items.filter((item) => !item.categories.length)
    : items;

  return (
    <Stack gap={2}>
      <JobHeading
        title="Homepage browse"
        help="browse"
        trailing={
          <Button variant="outlined" onClick={() => setPickerOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 600 }}>
            Add resources
          </Button>
        }
      >
        Choose which resources members see when they browse. Adding and removing take effect straight away.
      </JobHeading>

      <Alert severity="info">
        Topics don&rsquo;t have browse categories yet, so everything here shows under <strong>All</strong> rather
        than under a category.{' '}
        <MuiLink component="button" type="button" onClick={onOpenTopicsTab} sx={{ fontWeight: 600 }}>
          Set categories on the Topics tab →
        </MuiLink>
      </Alert>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.25 }}>
        <Stack direction="row" alignItems="baseline" gap={1.25}>
          <Typography component="span" sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1, fontFamily: 'monospace' }}>
            {data?.total ?? 0}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            resource{(data?.total ?? 0) === 1 ? '' : 's'} on the homepage
          </Typography>
        </Stack>
        <CategoryCoverage
          counts={data?.coverage ?? {}}
          caption={<>An item can appear in more than one category, so these won&rsquo;t add up to the total.</>}
        />
      </Paper>

      {loading && !data ? (
        <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress size={24} /></Box>
      ) : !items.length ? (
        <Paper variant="outlined" sx={{ borderRadius: 2, borderStyle: 'dashed', p: 6, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
            Nothing on the homepage yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '58ch', mx: 'auto', mb: 2, lineHeight: 1.7 }}>
            Add the resources you want members to see when they browse.
          </Typography>
          <Button variant="outlined" onClick={() => setPickerOpen(true)} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Add material
          </Button>
        </Paper>
      ) : (
        <>
          <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>
            <Chip label={`All ${items.length}`} size="small" onClick={() => setFilter('all')}
              color={filter === 'all' ? 'primary' : 'default'} variant={filter === 'all' ? 'filled' : 'outlined'} />
            <Chip label={`Not showing yet ${data?.cantAppear ?? 0}`} size="small" onClick={() => setFilter('cant')}
              color={filter === 'cant' ? 'warning' : 'default'} variant={filter === 'cant' ? 'filled' : 'outlined'} />
            <Chip label={`Under All only ${data?.noCategory ?? 0}`} size="small" onClick={() => setFilter('nocat')}
              color={filter === 'nocat' ? 'warning' : 'default'} variant={filter === 'nocat' ? 'filled' : 'outlined'} />
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: selected ? 'minmax(0,1fr) 400px' : '1fr' }, gap: 2.5, alignItems: 'start' }}>
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              {shown.map((item) => {
                const { subject, marker } = splitTitleMarker(item.title);
                const active = selected?.id === item.id;
                return (
                  // A collection you pick from: each row is a real button — reachable by Tab,
                  // activated by Enter or Space, named by the item it selects.
                  <Box
                    key={`resource:${item.id}`} component="button" type="button"
                    aria-pressed={active}
                    aria-label={`${item.title}, ${formatLabel(item.media_type)}. Select to preview or remove.`}
                    onClick={() => setSelected(active ? null : item)}
                    sx={{
                      display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px 190px', gap: 2, alignItems: 'center',
                      width: '100%', textAlign: 'left', border: 0, borderBottom: '1px solid', borderColor: 'divider',
                      bgcolor: active ? 'action.selected' : 'transparent', font: 'inherit', px: 1.75, py: 1.25,
                      cursor: 'pointer', position: 'relative',
                      '&:hover': { bgcolor: active ? 'action.selected' : 'action.hover' },
                      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                      '&::before': active ? {
                        content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: 'primary.main',
                      } : undefined,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{
                        fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {subject}
                        {marker && <Box component="span" sx={{ color: 'text.disabled', fontWeight: 400 }}>{marker}</Box>}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {formatLabel(item.media_type)}{item.guide ? ` · in ${item.guide}` : ''}
                      </Typography>
                    </Box>
                    <Stack direction="row" gap={0.5} flexWrap="wrap">
                      {item.categories.length
                        ? item.categories.map((code) => (
                          <Chip key={code} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }}
                            label={DISCOVERY_CATEGORY_LABELS[code] ?? code} />
                        ))
                        : <Typography variant="caption" color="text.disabled">All — no category</Typography>}
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'warning.dark' }}>
                      {item.blocker ? DISCOVERY_BROWSE_BLOCKERS[item.blocker]?.label ?? item.blocker : ''}
                    </Typography>
                  </Box>
                );
              })}
              <Box sx={{ px: 1.75, py: 1.25, bgcolor: 'action.hover' }}>
                <Typography variant="caption" color="text.secondary">
                  {shown.length} of {items.length} shown
                </Typography>
              </Box>
            </Paper>

            {selected && (
              <SelectedItemPanel item={selected} busy={busy} onClose={() => setSelected(null)}
                onRemove={() => void remove(selected)} />
            )}
          </Box>
        </>
      )}

      <AddMaterialDialog
        open={pickerOpen} onClose={() => setPickerOpen(false)} onAdded={() => void load()}
        onOpenJob={onOpenJob}
      />
    </Stack>
  );
}

/** A card preview is available on demand and never occupies the workspace. */
function SelectedItemPanel({ item, busy, onClose, onRemove }: {
  item: BrowseItem; busy: boolean; onClose: () => void; onRemove: () => void;
}) {
  const length = durationLabel(item.duration);
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', position: 'sticky', top: 12 }}>
      <Stack direction="row" alignItems="center" gap={1}
        sx={{ px: 2, py: 1.5, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">Selected item</Typography>
        <Button size="small" onClick={onClose} sx={{ ml: 'auto', textTransform: 'none' }}>Close</Button>
      </Stack>
      <Stack gap={2} sx={{ px: 2, py: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.4 }}>{item.title}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px' }}>
          <Typography variant="body2" color="text.secondary">Format</Typography>
          <Typography variant="body2">{formatLabel(item.media_type)}</Typography>
          <Typography variant="body2" color="text.secondary">State</Typography>
          <Typography variant="body2">{item.state}</Typography>
          {item.guide && (
            <>
              <Typography variant="body2" color="text.secondary">Used inside</Typography>
              <Typography variant="body2">{item.guide}</Typography>
            </>
          )}
          <Typography variant="body2" color="text.secondary">Categories</Typography>
          <Typography variant="body2">
            {item.categories.length
              ? item.categories.map((code) => DISCOVERY_CATEGORY_LABELS[code] ?? code).join(', ')
              : 'None yet — shows under All'}
          </Typography>
        </Box>

        {item.blocker && (
          <Alert severity="warning" sx={{ py: 0.5 }}>
            On the homepage, but not showing yet — {(DISCOVERY_BROWSE_BLOCKERS[item.blocker]?.label ?? item.blocker).toLowerCase()}.
          </Alert>
        )}

        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>How members see it</Typography>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
            How this looks to a member browsing the homepage.
          </Typography>
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{
              height: 116, display: 'grid', placeItems: 'center', bgcolor: 'action.hover',
              borderBottom: '1px solid', borderColor: 'divider', position: 'relative',
            }}>
              <Typography variant="caption" color="text.disabled">
                {item.has_thumbnail ? 'Thumbnail' : 'No thumbnail'}
              </Typography>
              {length && (
                <Chip size="small" label={length} sx={{
                  position: 'absolute', left: 8, top: 8, height: 20, fontSize: 11,
                  bgcolor: 'rgba(0,0,0,0.66)', color: '#fff',
                }} />
              )}
            </Box>
            <Box sx={{ p: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.4 }}>{item.title}</Typography>
              <Typography variant="caption" color="text.disabled">
                {formatLabel(item.media_type)} · Browse ›{' '}
                {item.categories.length
                  ? (DISCOVERY_CATEGORY_LABELS[item.categories[0]] ?? item.categories[0])
                  : 'All'}
              </Typography>
            </Box>
          </Paper>
        </Box>

        <Button size="small" startIcon={<OpenInNewIcon fontSize="small" />} component="a" target="_blank"
          rel="noopener noreferrer" href={`/r/${item.id}`}
          sx={{ textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start' }}>
          Open the material
        </Button>
      </Stack>
      <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" useFlexGap
        sx={{ px: 2, py: 1.75, bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.disabled">Takes effect straight away.</Typography>
        <Button variant="outlined" size="small" disabled={busy} onClick={onRemove}
          sx={{ ml: 'auto', textTransform: 'none', fontWeight: 600 }}>
          Remove from browse
        </Button>
      </Stack>
    </Paper>
  );
}

/**
 * Two directly navigable views. Ineligible items are shown WITH the reason, never hidden — hiding
 * them means an admin searches for something they know exists, gets nothing, and cannot find out
 * why. Every link routes OUT to the surface that owns the decision; none of them can be resolved
 * from inside this picker, which is what would turn curation into a back door.
 */
function AddMaterialDialog({ open, onClose, onAdded, onOpenJob }: {
  open: boolean; onClose: () => void; onAdded: () => void;
  onOpenJob: (job: JobKey) => void;
}) {
  const [section, setSection] = useState<'ready' | 'blocked'>('ready');
  const [query, setQuery] = useState('');
  // Newest first by default: the question people bring here is "has anything arrived that I should
  // consider?", and alphabetical buries a resource added yesterday between two from 2024.
  const [sort, setSort] = useState<CandidateSort>('newest');
  const [data, setData] = useState<CandidateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchCandidates(section, query, sort)); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Candidates could not be loaded.'); }
    finally { setLoading(false); }
  }, [section, query, sort]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => { void load(); }, query ? 220 : 0);
    return () => clearTimeout(timer);
  }, [open, load, query]);

  const add = async (id: number) => {
    setBusyId(id);
    try {
      const result = await setBrowseApproval({ kind: 'resource', id }, true);
      if (!result.ok) {
        setError(`${result.title} cannot be added: ${DISCOVERY_BROWSE_BLOCKERS[result.blocker]?.label ?? result.blocker}.`);
        return;
      }
      await load();
      onAdded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The item could not be added.');
    } finally { setBusyId(null); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box component="span" sx={{ fontWeight: 600 }}>Add resources to the homepage</Box>
        <TextField size="small" placeholder="Search all resources…" value={query}
          onChange={(event) => setQuery(event.target.value)} sx={{ ml: 'auto', minWidth: 280 }} />
      </DialogTitle>
      <Stack direction="row" alignItems="center" sx={{ px: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tabs value={section} onChange={(_, next) => setSection(next)}>
          <Tab value="ready" label={`Ready to add (${data?.readyTotal ?? 0})`} sx={{ textTransform: 'none' }} />
          <Tab value="blocked" label={`Not ready (${data?.blockedTotal ?? 0})`} sx={{ textTransform: 'none' }} />
        </Tabs>
        <Stack direction="row" gap={0.75} sx={{ ml: 'auto' }}>
          {(['newest', 'title'] as CandidateSort[]).map((option) => (
            <Chip
              key={option} size="small"
              label={option === 'newest' ? 'Newest first' : 'A–Z'}
              onClick={() => setSort(option)}
              color={sort === option ? 'primary' : 'default'}
              variant={sort === option ? 'filled' : 'outlined'}
            />
          ))}
        </Stack>
      </Stack>
      <DialogContent sx={{ p: 0, maxHeight: 440 }}>
        {error && <Alert severity="warning" sx={{ m: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {section === 'blocked' && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 3, pt: 2, pb: 0.5, maxWidth: '82ch', lineHeight: 1.6 }}>
            These can&rsquo;t go on the homepage yet. Each one links to where you can sort it out.
          </Typography>
        )}
        {loading && <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={20} /></Box>}
        {!loading && !data?.items.length && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>Nothing matches that search.</Typography>
        )}
        {!loading && data?.items.map((item) => {
          const { subject, marker } = splitTitleMarker(item.title);
          const blocker = item.blocker ? DISCOVERY_BROWSE_BLOCKERS[item.blocker] : null;
          return (
            <Box key={`resource:${item.id}`} sx={{
              // Titles wrap to two lines; the action column is fixed so nothing scrolls sideways
              // and the action never moves.
              display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 190px', gap: 2, alignItems: 'center',
              px: 3, py: 1.5, borderBottom: '1px solid', borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover' },
            }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{
                  fontWeight: item.blocker ? 400 : 500, display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.45,
                }}>
                  {subject}
                  {marker && <Box component="span" sx={{ color: 'text.disabled' }}>{marker}</Box>}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  {formatLabel(item.media_type)}{item.guide ? ` · in ${item.guide}` : ''}
                  {item.createdAt ? ` · added ${new Date(item.createdAt).toLocaleDateString()}` : ''}
                </Typography>
              </Box>
              {blocker ? (
                <Stack gap={0.25} sx={{ minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: blocker.tone === 'info' ? 'text.disabled' : 'warning.dark' }}>
                    {blocker.label}
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => {
                      if (item.blocker === 'context_not_reviewed') { onClose(); onOpenJob('placement'); }
                      else if (item.blocker === 'unpublished') window.open('/admin/resources', '_blank', 'noopener');
                    }}
                    sx={{ textTransform: 'none', justifyContent: 'flex-start', px: 0, fontSize: 12 }}
                  >
                    {blocker.action} →
                  </Button>
                </Stack>
              ) : (
                <Button variant="outlined" size="small" disabled={busyId === item.id} onClick={() => void add(item.id)}
                  sx={{ textTransform: 'none', fontWeight: 600 }}>
                  Add to browse
                </Button>
              )}
            </Box>
          );
        })}
      </DialogContent>
      <Divider />
      <Stack direction="row" alignItems="center" gap={2} sx={{ px: 3, py: 1.75, bgcolor: 'action.hover' }}>
        <Typography variant="body2" color="text.secondary">
          A pool to pick from, not a list to work through. Lessons and courses can&rsquo;t go on the
          homepage — resources only.
        </Typography>
        <Button onClick={onClose} sx={{ ml: 'auto', textTransform: 'none', fontWeight: 600 }}>Done</Button>
      </Stack>
    </Dialog>
  );
}
