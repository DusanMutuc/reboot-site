'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle, IconButton, InputAdornment,
  Link, List, ListItemButton, ListItemText, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import {
  AddRounded, ArrowDownwardRounded, ArrowUpwardRounded, CheckRounded,
  DeleteOutlineRounded, DescriptionOutlined, OpenInNewRounded, SearchRounded,
} from '@mui/icons-material';
import type {
  ImplementationGuide, ImplementationGuideAudience, ImplementationGuideStep,
  ImplementationGuideSystem, ImplementationGuidesAdminResponse,
} from '@/types/implementationGuides';

type NavigationGuard = (run: () => void) => void;
type Props = { onNavigationGuardChange?: (guard: NavigationGuard | null) => void };
type Resource = ImplementationGuidesAdminResponse['resources'][number];
type ResourceReference = ImplementationGuideStep['resources'][number];

class GuideRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.redirected || response.status === 401) {
    throw new GuideRequestError('Your session has expired. Sign in again before saving; your draft is still here.', 401);
  }
  if (response.status === 503) {
    throw new GuideRequestError('Implementation Guides is not ready on this environment yet. The database update needs to be applied before guides can be loaded or saved.', 503);
  }
  let body;
  try { body = await response.json(); }
  catch { throw new GuideRequestError('The server returned an incomplete response. Please try again.', response.status); }
  if (!response.ok) {
    throw new GuideRequestError(typeof body?.error === 'string' ? body.error : 'Could not complete the request. Please try again.', response.status);
  }
  return body as T;
}

function identity(system: ImplementationGuideSystem) { return `${system.audience}:${system.key}`; }
function cloneSteps(steps: ImplementationGuideStep[]): ImplementationGuideStep[] {
  return steps.map((step) => ({ ...step, resources: step.resources.map((resource) => ({ ...resource })) }));
}
function pageError(resource: ResourceReference) {
  if (resource.pageStart !== null && (!Number.isInteger(resource.pageStart) || resource.pageStart < 1)) return 'Use a whole page number of 1 or higher.';
  if (resource.pageEnd !== null && (!Number.isInteger(resource.pageEnd) || resource.pageEnd < 1)) return 'Use a whole page number of 1 or higher.';
  if (resource.pageEnd !== null && resource.pageStart === null) return 'Add the starting page first.';
  if (resource.pageEnd !== null && resource.pageStart !== null && resource.pageEnd < resource.pageStart) return 'The last page must be on or after the first page.';
  return null;
}

export default function ImplementationGuidesAdmin({ onNavigationGuardChange }: Props) {
  const router = useRouter();
  const [payload, setPayload] = useState<ImplementationGuidesAdminResponse | null>(null);
  const [audience, setAudience] = useState<ImplementationGuideAudience>('foundation');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [steps, setSteps] = useState<ImplementationGuideStep[]>([]);
  const [baseline, setBaseline] = useState<ImplementationGuideStep[]>([]);
  const [revision, setRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [discardAction, setDiscardAction] = useState<{ run: () => void; reload?: boolean } | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [newStepId, setNewStepId] = useState<string | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const protection = useRef({ dirty: false, saving: false });
  const dirty = JSON.stringify(steps) !== JSON.stringify(baseline);
  protection.current = { dirty, saving };

  const selected = payload?.systems.find((system) => identity(system) === selectedKey) ?? null;
  const resourcesById = useMemo(() => new Map(payload?.resources.map((resource) => [resource.id, resource]) ?? []), [payload?.resources]);
  const audienceSystems = useMemo(() => (payload?.systems ?? [])
    .filter((system) => system.audience === audience)
    .sort((left, right) => left.categoryPosition - right.categoryPosition || left.position - right.position || left.label.localeCompare(right.label)), [payload?.systems, audience]);
  const visibleGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const groups = new Map<number, { label: string; systems: ImplementationGuideSystem[] }>();
    for (const system of audienceSystems) {
      if (query && !`${system.label} ${system.categoryLabel}`.toLowerCase().includes(query)) continue;
      const group = groups.get(system.categoryId) ?? { label: system.categoryLabel, systems: [] };
      group.systems.push(system);
      groups.set(system.categoryId, group);
    }
    return [...groups.entries()];
  }, [audienceSystems, search]);
  const configuredCount = audienceSystems.filter((system) => (system.guide?.steps.length ?? 0) > 0).length;

  const selectSystem = useCallback((system: ImplementationGuideSystem | null) => {
    const nextSteps = cloneSteps(system?.guide?.steps ?? []);
    setSelectedKey(system ? identity(system) : null);
    setSteps(nextSteps);
    setBaseline(cloneSteps(nextSteps));
    setRevision(system?.guide?.revision ?? null);
    setError(null); setMessage(null); setConflict(false); setShowValidation(false); setNewStepId(null);
  }, []);

  const load = useCallback(async (preferredKey?: string | null, preferredAudience: ImplementationGuideAudience = 'foundation') => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true); setLoadError(null);
    try {
      const response = await fetch('/api/admin/implementation-guides', { cache: 'no-store', signal: controller.signal });
      const next = await readResponse<ImplementationGuidesAdminResponse>(response);
      if (controller.signal.aborted) return;
      setPayload(next);
      const nextSelected = next.systems.find((system) => identity(system) === preferredKey)
        ?? [...next.systems].filter((system) => system.audience === preferredAudience)
          .sort((left, right) => left.categoryPosition - right.categoryPosition || left.position - right.position)[0]
        ?? null;
      selectSystem(nextSelected);
    } catch (caught) {
      if (!controller.signal.aborted) setLoadError(caught instanceof Error ? caught.message : 'Unable to load implementation guides. Please try again.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [selectSystem]);

  useEffect(() => {
    void load();
    return () => loadController.current?.abort();
  }, [load]);

  const leave = useCallback<NavigationGuard>((run) => {
    if (protection.current.saving) { setError('Please wait for the save to finish before leaving this guide.'); return; }
    if (protection.current.dirty) setDiscardAction({ run }); else run();
  }, []);

  useEffect(() => {
    onNavigationGuardChange?.(leave);
    return () => onNavigationGuardChange?.(null);
  }, [leave, onNavigationGuardChange]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!protection.current.dirty && !protection.current.saving) return;
      event.preventDefault(); event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      if ((!protection.current.dirty && !protection.current.saving) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.origin === window.location.origin) return;
      event.preventDefault(); event.stopPropagation();
      leave(() => {
        if (destination.origin === window.location.origin) router.push(`${destination.pathname}${destination.search}${destination.hash}`);
        else window.location.assign(destination.href);
      });
    };
    // A popstate arrives after the browser moved history. Restore this entry before
    // the app router sees it, then repeat the movement only after draft confirmation.
    const pageUrl = window.location.href;
    const pageState = window.history.state;
    const popstate = (event: PopStateEvent) => {
      if (!protection.current.dirty && !protection.current.saving) return;
      event.stopImmediatePropagation();
      window.history.pushState(pageState, '', pageUrl);
      leave(() => window.history.back());
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', click, true);
    window.addEventListener('popstate', popstate, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', click, true);
      window.removeEventListener('popstate', popstate, true);
    };
  }, [leave, router]);

  const changeStep = (id: string, update: Partial<ImplementationGuideStep>) => {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, ...update } : step));
    setMessage(null);
  };
  const changeReference = (stepId: string, index: number, update: Partial<ResourceReference>) => {
    setSteps((current) => current.map((step) => step.id === stepId ? {
      ...step, resources: step.resources.map((resource, resourceIndex) => resourceIndex === index ? { ...resource, ...update } : resource),
    } : step));
    setMessage(null);
  };
  const moveStep = (index: number, offset: number) => {
    setSteps((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
    setMessage(null);
  };
  const addStep = () => {
    const id = crypto.randomUUID();
    setSteps((current) => [...current, { id, title: '', description: '', resources: [] }]);
    setNewStepId(id); setMessage(null);
  };
  const reloadLatest = () => {
    if (saving) return;
    setDiscardAction({ reload: true, run: () => { void load(selectedKey, audience); } });
  };

  async function save() {
    if (!selected || saving || conflict || !dirty) return;
    setShowValidation(true);
    const invalidIndex = steps.findIndex((step) => !step.title.trim() || !step.description.trim()
      || step.title.length > 160 || step.description.length > 8000 || step.resources.some((resource) => !!pageError(resource))
      || new Set(step.resources.map((resource) => `${resource.resourceId}:${resource.pageStart}:${resource.pageEnd}`)).size !== step.resources.length);
    if (invalidIndex !== -1) {
      setError(`Check step ${invalidIndex + 1}: each step needs a title and description, and resource page references must be valid and not duplicated.`);
      document.getElementById(`implementation-step-${steps[invalidIndex].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch('/api/admin/implementation-guides', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience: selected.audience, systemKey: selected.key, expectedRevision: revision ?? 0, steps }),
      });
      const result = await readResponse<{ guide: ImplementationGuide }>(response);
      setPayload((current) => current ? {
        ...current, systems: current.systems.map((system) => identity(system) === identity(selected) ? { ...system, guide: result.guide } : system),
      } : current);
      const savedSteps = cloneSteps(result.guide.steps);
      setSteps(savedSteps); setBaseline(cloneSteps(savedSteps)); setRevision(result.guide.revision);
      setShowValidation(false); setMessage('Guide saved.');
    } catch (caught) {
      if (caught instanceof GuideRequestError && caught.status === 409) {
        setConflict(true);
        setError(null);
      } else setError(caught instanceof Error ? `${caught.message} Your edits have been kept.` : 'The save could not be confirmed. Your edits have been kept.');
    } finally { setSaving(false); }
  }

  if (loading && !payload) return <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 6 }}><CircularProgress size={22} /><Typography>Loading systems and guides…</Typography></Stack>;
  if (!payload) return <Alert severity="error" action={<Button color="inherit" onClick={() => void load()}>Retry</Button>}>{loadError ?? 'Unable to load guides.'}</Alert>;

  return (
    <Stack spacing={2.5}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Build the steps coaches work through</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Give each system a clear sequence, practical descriptions, and useful resources.</Typography>
        </Box>
        <ToggleButtonGroup value={audience} exclusive size="small" disabled={saving || loading} aria-label="Guide audience" onChange={(_, value: ImplementationGuideAudience | null) => {
          if (!value || value === audience) return;
          leave(() => {
            setAudience(value); setSearch('');
            const first = [...payload.systems].filter((system) => system.audience === value)
              .sort((left, right) => left.categoryPosition - right.categoryPosition || left.position - right.position)[0] ?? null;
            selectSystem(first);
          });
        }}>
          <ToggleButton value="foundation">Foundation</ToggleButton><ToggleButton value="legends">Legends</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {loadError && <Alert severity="error" action={<Button color="inherit" onClick={reloadLatest}>Retry</Button>}>{loadError}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(235px, 0.8fr) minmax(0, 2fr)', border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'clip', alignItems: 'start' }}>
        <Box sx={{ position: 'sticky', top: 16, borderRight: 1, borderColor: 'divider', alignSelf: 'start', maxHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <TextField fullWidth size="small" label="Search systems" value={search} onChange={(event) => setSearch(event.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>{configuredCount} of {audienceSystems.length} systems have steps</Typography>
          </Box>
          <Box sx={{ overflowY: 'auto', pb: 1 }}>
            {visibleGroups.map(([categoryId, group]) => <Box key={categoryId}>
              <Typography variant="overline" color="text.secondary" sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'block', lineHeight: 1.5, fontWeight: 700 }}>{group.label}</Typography>
              <List disablePadding aria-label={group.label}>
                {group.systems.map((system) => {
                  const active = identity(system) === selectedKey;
                  const count = system.guide?.steps.length ?? 0;
                  return <ListItemButton key={identity(system)} selected={active} disabled={saving || loading} onClick={() => { if (!active) leave(() => selectSystem(system)); }} sx={{ px: 2, py: 1.25, borderLeft: '3px solid', borderLeftColor: active ? 'primary.main' : 'transparent', alignItems: 'flex-start' }}>
                    <ListItemText primary={system.label} secondary={active && dirty ? 'Unsaved changes' : count ? `${count} step${count === 1 ? '' : 's'}` : 'No steps yet'} primaryTypographyProps={{ variant: 'body2', fontWeight: active ? 750 : 550 }} secondaryTypographyProps={{ variant: 'caption', color: active && dirty ? 'warning.main' : 'text.secondary', sx: { mt: 0.5 } }} />
                    {count > 0 && <CheckRounded sx={{ fontSize: 16, color: 'success.main', mt: 0.5, ml: 0.75 }} />}
                  </ListItemButton>;
                })}
              </List>
            </Box>)}
            {!visibleGroups.length && <Typography color="text.secondary" variant="body2" sx={{ p: 3 }}>{audienceSystems.length ? 'No systems match your search.' : 'No active systems for this audience.'}</Typography>}
          </Box>
        </Box>

        <Box sx={{ minWidth: 0, p: 3 }}>
          {selected ? <Stack spacing={2.5}>
            <Box>
              <Typography variant="overline" color="text.secondary">{selected.categoryLabel}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.25 }}>{selected.label}</Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.25 }}>
                <Chip size="small" variant="outlined" label={`${steps.length} step${steps.length === 1 ? '' : 's'}`} />
                <Typography variant="caption" color="text.secondary">{selected.guide?.updatedAt ? `Last saved ${new Date(selected.guide.updatedAt).toLocaleString()}` : 'No guide saved yet'}</Typography>
              </Stack>
            </Box>

            <Box sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper', py: 1.5, borderTop: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
              <Typography variant="body2" color={dirty ? 'warning.main' : 'text.secondary'} role="status">{loading ? 'Reloading…' : saving ? 'Saving changes…' : dirty ? 'Unsaved changes' : 'All changes saved'}</Typography>
              <Stack direction="row" spacing={1}>
                <Button disabled={!dirty || saving || loading} onClick={() => setDiscardAction({ run: () => selectSystem(selected) })}>Discard</Button>
                <Button variant="contained" disabled={!dirty || saving || loading || conflict} onClick={() => void save()} startIcon={saving ? <CircularProgress size={15} color="inherit" /> : undefined}>Save changes</Button>
              </Stack>
            </Box>

            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
            {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}
            {conflict && <Alert severity="warning" action={<Button color="inherit" onClick={reloadLatest}>Reload latest</Button>}>This guide changed since you opened it. Your draft is still here. Reload the latest guide before saving again.</Alert>}

            {!steps.length && <Box sx={{ p: 4, bgcolor: 'grey.50', border: '1px dashed', borderColor: 'divider', borderRadius: 2, textAlign: 'center' }}>
              <DescriptionOutlined sx={{ color: 'text.secondary', fontSize: 32, mb: 1 }} />
              <Typography variant="subtitle1" fontWeight={700}>Give this system its first step</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>Use a short action title, then explain what the coach and member should do.</Typography>
              <Button variant="outlined" startIcon={<AddRounded />} disabled={saving || loading} onClick={addStep}>Add first step</Button>
            </Box>}

            {steps.map((step, index) => <Paper id={`implementation-step-${step.id}`} key={step.id} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Stack spacing={2}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Step {index + 1}</Typography>
                  <Stack direction="row" spacing={0.25}>
                    <Tooltip title="Move up"><span><IconButton size="small" aria-label={`Move step ${index + 1} up`} disabled={saving || loading || index === 0} onClick={() => moveStep(index, -1)}><ArrowUpwardRounded fontSize="small" /></IconButton></span></Tooltip>
                    <Tooltip title="Move down"><span><IconButton size="small" aria-label={`Move step ${index + 1} down`} disabled={saving || loading || index === steps.length - 1} onClick={() => moveStep(index, 1)}><ArrowDownwardRounded fontSize="small" /></IconButton></span></Tooltip>
                    <Tooltip title="Remove step"><span><IconButton size="small" aria-label={`Remove step ${index + 1}`} disabled={saving || loading} onClick={() => { if (steps.length === 1) setClearOpen(true); else { setSteps((current) => current.filter((item) => item.id !== step.id)); setMessage(null); } }}><DeleteOutlineRounded fontSize="small" /></IconButton></span></Tooltip>
                  </Stack>
                </Stack>
                <TextField label="Step title" required fullWidth value={step.title} disabled={saving || loading} autoFocus={newStepId === step.id} onChange={(event) => changeStep(step.id, { title: event.target.value })} placeholder="Choose your sending platform" error={showValidation && !step.title.trim()} helperText={showValidation && !step.title.trim() ? 'Add a short action title.' : undefined} slotProps={{ htmlInput: { maxLength: 160 } }} />
                <TextField label="Description" required fullWidth multiline minRows={3} maxRows={18} value={step.description} disabled={saving || loading} onChange={(event) => changeStep(step.id, { description: event.target.value })} placeholder="Explain the action, what to check, and what completed looks like." error={showValidation && !step.description.trim()} helperText={showValidation && !step.description.trim() ? 'Add a description for the coach.' : 'Use paragraphs or simple bullet points to explain the work.'} slotProps={{ htmlInput: { maxLength: 8000 } }} />

                <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
                  <Typography variant="body2" fontWeight={700} sx={{ mb: 1.25 }}>Resources <Typography component="span" variant="caption" color="text.secondary">· Optional</Typography></Typography>
                  <Stack spacing={1.5}>
                    {step.resources.map((reference, resourceIndex) => {
                      const resource = resourcesById.get(reference.resourceId);
                      const invalidPage = pageError(reference);
                      return <Box key={`${reference.resourceId}:${resourceIndex}`} sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1.5 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <DescriptionOutlined fontSize="small" color="action" />
                          <Box sx={{ flex: 1, minWidth: 0 }}><Link href={`/r/${reference.resourceId}`} target="_blank" rel="noopener noreferrer" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 14, fontWeight: 650 }}>{resource?.title ?? `Unavailable resource #${reference.resourceId}`}<OpenInNewRounded sx={{ fontSize: 13, flexShrink: 0 }} /></Link><Typography variant="caption" color="text.secondary" display="block">{resource ? `${resource.type.toUpperCase()}${resource.state !== 'published' ? ` · ${resource.state}` : ''}` : 'This resource may have been removed from the library.'}</Typography></Box>
                          <IconButton size="small" aria-label={`Remove ${resource?.title ?? 'resource'} from step ${index + 1}`} disabled={saving || loading} onClick={() => changeStep(step.id, { resources: step.resources.filter((_, referenceIndex) => referenceIndex !== resourceIndex) })}><DeleteOutlineRounded fontSize="small" /></IconButton>
                        </Stack>
                        {(resource?.type === 'pdf' || reference.pageStart !== null || reference.pageEnd !== null) && <Box sx={{ mt: 1.5 }}>
                          <Stack direction="row" spacing={1.5}>
                            <TextField size="small" label="First page" type="number" value={reference.pageStart ?? ''} disabled={saving || loading} onChange={(event) => changeReference(step.id, resourceIndex, { pageStart: event.target.value === '' ? null : Number(event.target.value) })} error={!!invalidPage} slotProps={{ htmlInput: { min: 1, step: 1, 'aria-label': `First PDF page for ${resource?.title ?? 'resource'}` } }} sx={{ width: 130 }} />
                            <TextField size="small" label="Last page" type="number" value={reference.pageEnd ?? ''} disabled={saving || loading} onChange={(event) => changeReference(step.id, resourceIndex, { pageEnd: event.target.value === '' ? null : Number(event.target.value) })} error={!!invalidPage} slotProps={{ htmlInput: { min: reference.pageStart ?? 1, step: 1, 'aria-label': `Last PDF page for ${resource?.title ?? 'resource'}` } }} sx={{ width: 130 }} />
                          </Stack>
                          <Typography variant="caption" color={invalidPage ? 'error' : 'text.secondary'} sx={{ display: 'block', mt: 0.75 }}>{invalidPage ?? 'Optional PDF page numbers. Leave both empty to link the whole file.'}</Typography>
                        </Box>}
                      </Box>;
                    })}
                    {step.resources.length < 10 && <Autocomplete<Resource, false, false, false> value={null} options={payload.resources} getOptionLabel={(resource) => resource.title} isOptionEqualToValue={(option, value) => option.id === value.id} disabled={saving || loading} onChange={(_, resource) => { if (resource) changeStep(step.id, { resources: [...step.resources, { resourceId: resource.id, pageStart: null, pageEnd: null }] }); }} renderOption={(props, resource) => { const { key: optionKey, ...optionProps } = props; return <li {...optionProps} key={`${resource.id}:${optionKey}`}><Box><Typography variant="body2">{resource.title}</Typography><Typography variant="caption" color="text.secondary">{resource.type.toUpperCase()}{resource.state !== 'published' ? ` · ${resource.state}` : ''}</Typography></Box></li>; }} renderInput={(params) => <TextField {...params} size="small" label="Attach a library resource" placeholder="Search by resource title" />} />}
                    {step.resources.length >= 10 && <Typography variant="caption" color="text.secondary">Maximum of 10 resources per step.</Typography>}
                  </Stack>
                </Box>
              </Stack>
            </Paper>)}

            {steps.length > 0 && <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Button variant="outlined" startIcon={<AddRounded />} disabled={saving || loading || steps.length >= 50} onClick={addStep}>{steps.length >= 50 ? '50-step limit reached' : 'Add step'}</Button>
              <Button color="error" startIcon={<DeleteOutlineRounded />} disabled={saving || loading} onClick={() => setClearOpen(true)}>Remove all steps</Button>
            </Stack>}
          </Stack> : <Typography color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>Select a system to create or edit its guide.</Typography>}
        </Box>
      </Box>

      <Dialog open={!!discardAction} onClose={() => setDiscardAction(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{discardAction?.reload ? 'Reload the latest guide?' : 'Discard unsaved changes?'}</DialogTitle>
        <DialogContent><DialogContentText>{discardAction?.reload ? 'Your current draft will be replaced only after the latest guide loads successfully.' : 'Changes to this guide have not been saved. Discard them to continue.'}</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setDiscardAction(null)}>Keep editing</Button><Button color="error" variant="contained" onClick={() => {
          const action = discardAction;
          setDiscardAction(null);
          if (!action) return;
          if (!action.reload) { setSteps(cloneSteps(baseline)); protection.current = { dirty: false, saving: false }; }
          action.run();
        }}>{discardAction?.reload ? 'Reload latest' : 'Discard changes'}</Button></DialogActions>
      </Dialog>
      <Dialog open={clearOpen} onClose={() => setClearOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove all steps from this guide?</DialogTitle>
        <DialogContent><DialogContentText>This will leave {selected?.label} without an implementation checklist. The removal is saved only when you select Save changes.</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setClearOpen(false)}>Cancel</Button><Button variant="contained" color="error" onClick={() => { setSteps([]); setMessage(null); setClearOpen(false); }}>Remove all steps</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}
