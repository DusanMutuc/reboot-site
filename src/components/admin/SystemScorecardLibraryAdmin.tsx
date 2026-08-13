'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

import ScorecardDraftEditor from '@/components/admin/scorecard/ScorecardDraftEditor';
import ScorecardPublishDialog from '@/components/admin/scorecard/ScorecardPublishDialog';
import type {
  ScorecardDraftCategoryInput,
  ScorecardLibraryAdminPayload,
  ScorecardLibraryAudience,
  ScorecardLibraryMappingUpdate,
  ScorecardLibraryOption,
  ScorecardLibrarySystem,
  ScorecardLibraryTemplate,
  ScorecardVersionPublishPreview,
  ScorecardVersionPublishResult,
  ScorecardVersionReviewResolution,
} from '@/types/systemScorecardLibrary';

type ErrorBody = { error?: string; details?: unknown };

function defaultTemplate(
  templates: ScorecardLibraryTemplate[],
  audience: ScorecardLibraryAudience,
) {
  const matching = templates
    .filter((template) => template.audience === audience)
    .sort((left, right) => right.version - left.version);
  return (
    matching.find((template) => template.state === 'draft') ??
    matching.find((template) => template.state === 'active') ??
    matching[0] ??
    null
  );
}

function replaceSystemMapping(
  payload: ScorecardLibraryAdminPayload,
  update: ScorecardLibraryMappingUpdate,
): ScorecardLibraryAdminPayload {
  return {
    ...payload,
    templates: payload.templates.map((template) => ({
      ...template,
      categories: template.categories.map((category) => ({
        ...category,
        systems: category.systems.map((system) =>
          system.id === update.systemId
            ? {
                ...system,
                libraryItemId: update.libraryItemId,
                mappedItem: update.mappedItem,
              }
            : system,
        ),
      })),
    })),
  };
}

function stateLabel(template: ScorecardLibraryTemplate) {
  if (template.state === 'active') return 'Active';
  if (template.state === 'draft') return 'Draft';
  return 'History';
}

function SystemMappingRow({
  system,
  options,
  pending,
  readOnly,
  onChange,
}: {
  system: ScorecardLibrarySystem;
  options: ScorecardLibraryOption[];
  pending: boolean;
  readOnly: boolean;
  onChange: (systemId: number, option: ScorecardLibraryOption | null) => void;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(220px, 0.8fr) minmax(320px, 1.2fr)' },
        gap: { xs: 1.25, md: 3 },
        alignItems: 'center',
        py: 1.6,
        px: { xs: 0.5, sm: 1.25 },
        borderBottom: '1px solid',
        borderColor: 'grey.100',
        transition: 'background-color 160ms ease',
        '&:hover': { bgcolor: 'rgba(15, 118, 110, 0.035)' },
        '&:last-child': { borderBottom: 0 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.35 }}>
          {system.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {system.key}
        </Typography>
      </Box>

      {readOnly ? (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {system.mappedItem?.title ?? 'No library item connected'}
          </Typography>
          {system.mappedItem ? (
            <Typography variant="caption" color="text.secondary">
              {system.mappedItem.breadcrumb}
            </Typography>
          ) : null}
        </Box>
      ) : (
        <Autocomplete
          size="small"
          options={options}
          value={system.mappedItem}
          disabled={pending}
          loading={pending}
          getOptionLabel={(option) => option.title}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          onChange={(_, option) => onChange(system.id, option)}
          noOptionsText="No matching library items"
          renderOption={(props, option) => (
            <Box component="li" {...props} key={option.id}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 750 }}>
                  {option.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {option.breadcrumb}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Linked library item"
              placeholder="Search the library"
              slotProps={{
                input: {
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {pending ? <CircularProgress color="inherit" size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                },
              }}
            />
          )}
        />
      )}
    </Box>
  );
}

export default function SystemScorecardLibraryAdmin() {
  const [payload, setPayload] = useState<ScorecardLibraryAdminPayload | null>(null);
  const [audience, setAudience] = useState<ScorecardLibraryAudience>('foundation');
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pendingSystemIds, setPendingSystemIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [publishPreview, setPublishPreview] = useState<ScorecardVersionPublishPreview | null>(null);

  const load = useCallback(async (preferredTemplateKey?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/system-scorecard-library', { cache: 'no-store' });
      const body = (await response.json()) as ScorecardLibraryAdminPayload & ErrorBody;
      if (!response.ok) throw new Error(body.error || 'Failed to load Systems Scorecard.');
      setPayload(body);
      setSelectedTemplateKey((current) => {
        const preferred = preferredTemplateKey ?? current;
        if (preferred && body.templates.some((template) => template.key === preferred)) {
          return preferred;
        }
        return defaultTemplate(body.templates, audience)?.key ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Systems Scorecard.');
    } finally {
      setLoading(false);
    }
  }, [audience]);

  useEffect(() => {
    void load();
  }, [load]);

  const audienceTemplates = useMemo(
    () =>
      (payload?.templates ?? [])
        .filter((template) => template.audience === audience)
        .sort((left, right) => right.version - left.version),
    [audience, payload?.templates],
  );
  const selectedTemplate = useMemo(
    () =>
      audienceTemplates.find((template) => template.key === selectedTemplateKey) ??
      defaultTemplate(audienceTemplates, audience),
    [audience, audienceTemplates, selectedTemplateKey],
  );
  const draftTemplate = audienceTemplates.find((template) => template.state === 'draft') ?? null;
  const activeTemplate = audienceTemplates.find((template) => template.state === 'active') ?? null;
  const libraryOptions = useMemo(
    () =>
      (payload?.libraryOptions ?? []).filter(
        (option) => audience === 'legends' || option.source === 'main',
      ),
    [audience, payload?.libraryOptions],
  );
  const allSystems = useMemo(
    () => selectedTemplate?.categories.flatMap((category) => category.systems) ?? [],
    [selectedTemplate],
  );
  const mappedCount = allSystems.filter((system) => system.libraryItemId != null).length;
  const query = search.trim().toLowerCase();
  const visibleCategories = useMemo(
    () =>
      (selectedTemplate?.categories ?? [])
        .map((category) => ({
          ...category,
          systems: category.systems.filter(
            (system) =>
              !query ||
              system.label.toLowerCase().includes(query) ||
              system.key.toLowerCase().includes(query) ||
              category.label.toLowerCase().includes(query),
          ),
        }))
        .filter((category) => category.systems.length > 0),
    [query, selectedTemplate],
  );

  const postAction = async <T,>(body: Record<string, unknown>): Promise<T> => {
    const response = await fetch('/api/admin/system-scorecard-library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as T & ErrorBody;
    if (!response.ok) throw new Error(result.error || 'The scorecard action failed.');
    return result;
  };

  const cloneVersion = async () => {
    if (!activeTemplate || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await postAction<{ templateKey: string }>({
        action: 'clone',
        sourceTemplateKey: activeTemplate.key,
      });
      await load(result.templateKey);
      setSelectedTemplateKey(result.templateKey);
      setMessage(`Version ${activeTemplate.version + 1} created as a draft.`);
    } catch (cloneError) {
      setError(cloneError instanceof Error ? cloneError.message : 'Failed to create a new version.');
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async (
    templateKey: string,
    name: string,
    categories: ScorecardDraftCategoryInput[],
  ) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await postAction<{ templateKey: string }>({
        action: 'save-draft',
        templateKey,
        name,
        categories,
      });
      await load(templateKey);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save the scorecard draft.';
      setError(message);
      throw saveError;
    } finally {
      setBusy(false);
    }
  };

  const openPublishPreview = async (templateKey: string) => {
    setBusy(true);
    setError(null);
    try {
      const preview = await postAction<ScorecardVersionPublishPreview>({
        action: 'preview',
        templateKey,
      });
      setPublishPreview(preview);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Failed to preview the upgrade.');
      throw previewError;
    } finally {
      setBusy(false);
    }
  };

  const saveAndPreview = async (
    templateKey: string,
    name: string,
    categories: ScorecardDraftCategoryInput[],
  ) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await postAction<{ templateKey: string }>({
        action: 'save-draft',
        templateKey,
        name,
        categories,
      });
      const preview = await postAction<ScorecardVersionPublishPreview>({
        action: 'preview',
        templateKey,
      });
      await load(templateKey);
      setPublishPreview(preview);
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : 'Failed to prepare this version.';
      setError(message);
      throw previewError;
    } finally {
      setBusy(false);
    }
  };

  const publishVersion = async (resolutions: ScorecardVersionReviewResolution[]) => {
    if (!publishPreview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await postAction<ScorecardVersionPublishResult>({
        action: 'publish',
        templateKey: publishPreview.templateKey,
        resolutions,
      });
      setPublishPreview(null);
      await load(result.templateKey);
      setMessage(
        result.published
          ? `Version published. ${result.migratedReviewCount} incomplete review${result.migratedReviewCount === 1 ? '' : 's'} upgraded.`
          : `${result.migratedReviewCount} incomplete review${result.migratedReviewCount === 1 ? '' : 's'} upgraded.`,
      );
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Failed to publish the scorecard version.');
    } finally {
      setBusy(false);
    }
  };

  const discardDraft = async (templateKey: string) => {
    if (busy || !window.confirm('Discard this unpublished scorecard version?')) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/system-scorecard-library?templateKey=${encodeURIComponent(templateKey)}`,
        { method: 'DELETE' },
      );
      const result = (await response.json()) as ErrorBody;
      if (!response.ok) throw new Error(result.error || 'Failed to discard the scorecard draft.');
      setSelectedTemplateKey(activeTemplate?.key ?? null);
      await load(activeTemplate?.key ?? null);
      setMessage('Draft discarded.');
    } catch (discardError) {
      setError(discardError instanceof Error ? discardError.message : 'Failed to discard the draft.');
    } finally {
      setBusy(false);
    }
  };

  const saveMapping = useCallback(
    async (systemId: number, option: ScorecardLibraryOption | null) => {
      if (!payload || pendingSystemIds.has(systemId)) return;
      setPendingSystemIds((current) => new Set(current).add(systemId));
      setError(null);
      setMessage(null);
      try {
        const response = await fetch('/api/admin/system-scorecard-library', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemId, libraryItemId: option?.id ?? null }),
        });
        const body = (await response.json()) as ScorecardLibraryMappingUpdate & ErrorBody;
        if (!response.ok || body.systemId !== systemId) {
          throw new Error(body.error || 'Failed to save the library mapping.');
        }
        setPayload((current) => (current ? replaceSystemMapping(current, body) : current));
        setMessage(option ? `Connected to ${option.title}.` : 'Library connection removed.');
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to save the library mapping.');
      } finally {
        setPendingSystemIds((current) => {
          const next = new Set(current);
          next.delete(systemId);
          return next;
        });
      }
    },
    [payload, pendingSystemIds],
  );

  if (loading && !payload) {
    return (
      <Stack spacing={2} sx={{ py: 2 }}>
        <LinearProgress />
        <Typography variant="body2" color="text.secondary">
          Loading Systems Scorecard…
        </Typography>
      </Stack>
    );
  }

  if (!payload) {
    return <Alert severity="error">{error || 'Systems Scorecard could not be loaded.'}</Alert>;
  }

  return (
    <Stack spacing={3.5}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(320px, 1fr) auto' },
          gap: 2,
          alignItems: 'center',
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 850 }}>
            Scorecard versions
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
            Build new versions without changing completed Business Reviews. Safe incomplete reviews upgrade automatically.
          </Typography>
        </Box>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={audience}
          onChange={(_, value: ScorecardLibraryAudience | null) => {
            if (!value) return;
            setAudience(value);
            setSearch('');
            setSelectedTemplateKey(defaultTemplate(payload.templates, value)?.key ?? null);
          }}
          aria-label="Scorecard audience"
        >
          <ToggleButton value="foundation">Foundation</ToggleButton>
          <ToggleButton value="legends">Legends</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {error ? <Alert severity="error" onClose={() => setError(null)}>{error}</Alert> : null}
      {message ? <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert> : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 0.55fr) minmax(0, 1fr) auto' },
          gap: 2,
          alignItems: 'center',
          py: 2,
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Select
          size="small"
          value={selectedTemplate?.key ?? ''}
          onChange={(event) => {
            setSelectedTemplateKey(event.target.value);
            setSearch('');
          }}
          aria-label="Scorecard version"
        >
          {audienceTemplates.map((template) => (
            <MenuItem key={template.key} value={template.key}>
              v{template.version} · {stateLabel(template)}
            </MenuItem>
          ))}
        </Select>

        {selectedTemplate ? (
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>
              {selectedTemplate.name}
            </Typography>
            <Chip
              size="small"
              color={selectedTemplate.state === 'active' ? 'success' : selectedTemplate.state === 'draft' ? 'warning' : 'default'}
              variant={selectedTemplate.state === 'active' ? 'filled' : 'outlined'}
              label={stateLabel(selectedTemplate)}
            />
            <Typography variant="caption" color="text.secondary">
              {selectedTemplate.reviewCount} review{selectedTemplate.reviewCount === 1 ? '' : 's'}
            </Typography>
          </Stack>
        ) : <Box />}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          {activeTemplate?.upgradeCandidateCount ? (
            <Button
              variant="outlined"
              startIcon={<PublishRoundedIcon />}
              disabled={busy}
              onClick={() => void openPublishPreview(activeTemplate.key).catch(() => undefined)}
            >
              Review {activeTemplate.upgradeCandidateCount} pending
            </Button>
          ) : null}
          {draftTemplate ? (
            selectedTemplate?.key !== draftTemplate.key ? (
              <Button variant="outlined" onClick={() => setSelectedTemplateKey(draftTemplate.key)}>
                Open draft v{draftTemplate.version}
              </Button>
            ) : null
          ) : (
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              disabled={busy || !activeTemplate}
              onClick={() => void cloneVersion()}
            >
              Create new version
            </Button>
          )}
        </Stack>
      </Box>

      {selectedTemplate?.state === 'draft' ? (
        <ScorecardDraftEditor
          template={selectedTemplate}
          sourceTemplate={activeTemplate}
          libraryOptions={libraryOptions}
          busy={busy}
          onSave={saveDraft}
          onPublish={saveAndPreview}
          onDiscard={discardDraft}
        />
      ) : selectedTemplate ? (
        <Stack spacing={2.5}>
          {selectedTemplate.state === 'archived' ? (
            <Alert severity="info" icon={<HistoryRoundedIcon />}>
              This historical version is read-only because completed or incomplete reviews still reference it.
            </Alert>
          ) : null}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
              gap: 2,
              alignItems: 'center',
              pb: 2,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <TextField
              size="small"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search systems"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <LinkRoundedIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
                {mappedCount} of {allSystems.length} linked
              </Typography>
            </Stack>
          </Box>

          {visibleCategories.length ? (
            <Stack spacing={3}>
              {visibleCategories.map((category) => (
                <Box key={category.id}>
                  <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.75 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>
                      {category.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {category.systems.length} systems
                    </Typography>
                  </Stack>
                  <Box sx={{ borderTop: '1px solid', borderColor: 'grey.200' }}>
                    {category.systems.map((system) => (
                      <SystemMappingRow
                        key={system.id}
                        system={system}
                        options={libraryOptions}
                        pending={pendingSystemIds.has(system.id)}
                        readOnly={selectedTemplate.state === 'archived'}
                        onChange={(systemId, option) => void saveMapping(systemId, option)}
                      />
                    ))}
                  </Box>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>
              No systems match this search.
            </Typography>
          )}
        </Stack>
      ) : (
        <Alert severity="warning">No scorecard version is configured for this audience.</Alert>
      )}

      <ScorecardPublishDialog
        preview={publishPreview}
        pending={busy}
        onClose={() => setPublishPreview(null)}
        onPublish={publishVersion}
      />
    </Stack>
  );
}
