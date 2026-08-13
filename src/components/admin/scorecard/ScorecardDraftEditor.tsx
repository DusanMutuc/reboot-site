'use client';

import { useEffect, useMemo, useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import type {
  ScorecardDraftCategoryInput,
  ScorecardDraftSystemInput,
  ScorecardLibraryOption,
  ScorecardLibraryTemplate,
} from '@/types/systemScorecardLibrary';

type EditableSystem = ScorecardDraftSystemInput & {
  clientId: string;
  autoGenerateKey: boolean;
};

type EditableCategory = Omit<ScorecardDraftCategoryInput, 'systems'> & {
  clientId: string;
  autoGenerateKey: boolean;
  systems: EditableSystem[];
};

type Props = {
  template: ScorecardLibraryTemplate;
  sourceTemplate: ScorecardLibraryTemplate | null;
  libraryOptions: ScorecardLibraryOption[];
  busy: boolean;
  onSave: (
    templateKey: string,
    name: string,
    categories: ScorecardDraftCategoryInput[],
  ) => Promise<void>;
  onPublish: (
    templateKey: string,
    name: string,
    categories: ScorecardDraftCategoryInput[],
  ) => Promise<void>;
  onDiscard: (templateKey: string) => Promise<void>;
};

function toStableKey(value: string, fallback: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function makeUniqueKey(base: string, existing: ReadonlySet<string>) {
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function toEditableCategories(
  template: ScorecardLibraryTemplate,
  sourceTemplate: ScorecardLibraryTemplate | null,
): EditableCategory[] {
  const sourceCategoryKeys = new Set(
    sourceTemplate?.categories.map((category) => category.key) ?? [],
  );
  const sourceSystemKeys = new Set(
    sourceTemplate?.categories.flatMap((category) =>
      category.systems.map((system) => system.key),
    ) ?? [],
  );

  return template.categories.map((category) => ({
    clientId: `category:${category.id}`,
    autoGenerateKey: !sourceCategoryKeys.has(category.key),
    key: category.key,
    label: category.label,
    systems: category.systems.map((system) => ({
      clientId: `system:${system.id}`,
      autoGenerateKey: !sourceSystemKeys.has(system.key),
      key: system.key,
      label: system.label,
      libraryItemId: system.libraryItemId,
    })),
  }));
}

function toDraftCategories(categories: EditableCategory[]): ScorecardDraftCategoryInput[] {
  return categories.map((category) => ({
    key: category.key,
    label: category.label,
    systems: category.systems.map((system) => ({
      key: system.key,
      label: system.label,
      libraryItemId: system.libraryItemId,
    })),
  }));
}

let draftItemSequence = 0;

function createClientId(prefix: 'category' | 'system') {
  draftItemSequence += 1;
  return `${prefix}:new:${draftItemSequence}`;
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function ScorecardDraftEditor({
  template,
  sourceTemplate,
  libraryOptions,
  busy,
  onSave,
  onPublish,
  onDiscard,
}: Props) {
  const initialCategories = useMemo(
    () => toEditableCategories(template, sourceTemplate),
    [sourceTemplate, template],
  );
  const [name, setName] = useState(template.name);
  const [categories, setCategories] = useState<EditableCategory[]>(initialCategories);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setName(template.name);
    setCategories(toEditableCategories(template, sourceTemplate));
    setMessage(null);
  }, [sourceTemplate, template]);

  const dirty =
    name !== template.name || JSON.stringify(categories) !== JSON.stringify(initialCategories);
  const systemCount = categories.reduce((total, category) => total + category.systems.length, 0);

  const save = async () => {
    setMessage(null);
    try {
      await onSave(template.key, name, toDraftCategories(categories));
      setMessage('Draft saved.');
    } catch {
      // The parent surface owns the error alert.
    }
  };

  const publish = async () => {
    setMessage(null);
    try {
      await onPublish(template.key, name, toDraftCategories(categories));
    } catch {
      // The parent surface owns the error alert.
    }
  };

  const addCategory = () => {
    const existingKeys = new Set(categories.map((category) => category.key));
    const categoryKey = makeUniqueKey('new_category', existingKeys);
    setCategories((current) => [
      ...current,
      {
        clientId: createClientId('category'),
        autoGenerateKey: true,
        key: categoryKey,
        label: 'New category',
        systems: [
          {
            clientId: createClientId('system'),
            autoGenerateKey: true,
            key: makeUniqueKey(
              'new_system',
              new Set(current.flatMap((category) => category.systems.map((system) => system.key))),
            ),
            label: 'New system',
            libraryItemId: null,
          },
        ],
      },
    ]);
  };

  const addSystem = (categoryIndex: number) => {
    const existingKeys = new Set(
      categories.flatMap((category) => category.systems.map((system) => system.key)),
    );
    const key = makeUniqueKey('new_system', existingKeys);
    setCategories((current) =>
      current.map((category, index) =>
        index === categoryIndex
          ? {
              ...category,
              systems: [
                ...category.systems,
                {
                  clientId: createClientId('system'),
                  autoGenerateKey: true,
                  key,
                  label: 'New system',
                  libraryItemId: null,
                },
              ],
            }
          : category,
      ),
    );
  };

  return (
    <Stack spacing={3}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 1fr) auto' },
          gap: 2,
          alignItems: 'end',
          pb: 2.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <TextField
          label="Scorecard name"
          value={name}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            variant="outlined"
            color="inherit"
            disabled={busy}
            onClick={() => void onDiscard(template.key)}
          >
            Discard draft
          </Button>
          <Button
            variant="outlined"
            startIcon={<SaveRoundedIcon />}
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            Save draft
          </Button>
          <Button
            variant="contained"
            startIcon={<PublishRoundedIcon />}
            disabled={busy}
            onClick={() => void publish()}
          >
            Review & publish
          </Button>
        </Stack>
      </Box>

      {message ? <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert> : null}

      <Stack direction="row" spacing={1} alignItems="center">
        <Chip size="small" label={`${categories.length} categories`} />
        <Chip size="small" label={`${systemCount} systems`} />
        <Typography variant="caption" color="text.secondary">
          Stable keys carry ratings and priorities between versions.
        </Typography>
      </Stack>

      <Stack spacing={3}>
        {categories.map((category, categoryIndex) => (
          <Box
            key={category.clientId}
            sx={{
              borderTop: '2px solid',
              borderColor: 'grey.300',
              pt: 2,
              '@keyframes scorecardSectionIn': {
                from: { opacity: 0, transform: 'translateY(4px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
              animation: 'scorecardSectionIn 180ms ease-out both',
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 1fr) auto' },
                gap: 1.5,
                alignItems: 'center',
                mb: 2,
              }}
            >
              <Stack spacing={0.45}>
                <TextField
                  size="small"
                  label="Category name"
                  value={category.label}
                  disabled={busy}
                  onChange={(event) => {
                    const label = event.target.value;
                    setCategories((current) => {
                      const existingKeys = new Set(
                        current
                          .filter((_, index) => index !== categoryIndex)
                          .map((item) => item.key),
                      );
                      return current.map((item, index) =>
                        index === categoryIndex
                          ? {
                              ...item,
                              label,
                              key: item.autoGenerateKey
                                ? makeUniqueKey(toStableKey(label, 'category'), existingKeys)
                                : item.key,
                            }
                          : item,
                      );
                    });
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ px: 0.25 }}>
                  Stable key: {category.key}
                  {category.autoGenerateKey ? ' · generated automatically' : ' · preserved'}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
                <Tooltip title="Move category up">
                  <span>
                    <IconButton
                      size="small"
                      disabled={busy || categoryIndex === 0}
                      onClick={() => setCategories((current) => moveItem(current, categoryIndex, categoryIndex - 1))}
                    >
                      <ArrowUpwardRoundedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Move category down">
                  <span>
                    <IconButton
                      size="small"
                      disabled={busy || categoryIndex === categories.length - 1}
                      onClick={() => setCategories((current) => moveItem(current, categoryIndex, categoryIndex + 1))}
                    >
                      <ArrowDownwardRoundedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Remove category">
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      disabled={busy || categories.length === 1}
                      onClick={() => setCategories((current) => current.filter((_, index) => index !== categoryIndex))}
                    >
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Box>

            <Divider />

            {category.systems.map((system, systemIndex) => {
              const selectedLibraryItem = system.libraryItemId == null
                ? null
                : libraryOptions.find((option) => option.id === system.libraryItemId) ?? null;

              return (
                <Box
                  key={system.clientId}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      lg: 'minmax(260px, 0.9fr) minmax(300px, 1.1fr) auto',
                    },
                    gap: 1.25,
                    py: 1.5,
                    borderBottom: '1px solid',
                    borderColor: 'grey.100',
                    alignItems: 'center',
                  }}
                >
                  <Stack spacing={0.45}>
                    <TextField
                      size="small"
                      label="System name"
                      value={system.label}
                      disabled={busy}
                      onChange={(event) => {
                        const label = event.target.value;
                        setCategories((current) => {
                          const existingKeys = new Set(
                            current.flatMap((item, currentCategoryIndex) =>
                              item.systems
                                .filter(
                                  (_, currentSystemIndex) =>
                                    currentCategoryIndex !== categoryIndex ||
                                    currentSystemIndex !== systemIndex,
                                )
                                .map((candidate) => candidate.key),
                            ),
                          );
                          return current.map((item, currentCategoryIndex) =>
                            currentCategoryIndex === categoryIndex
                              ? {
                                  ...item,
                                  systems: item.systems.map((candidate, currentSystemIndex) =>
                                    currentSystemIndex === systemIndex
                                      ? {
                                          ...candidate,
                                          label,
                                          key: candidate.autoGenerateKey
                                            ? makeUniqueKey(
                                                toStableKey(label, 'system'),
                                                existingKeys,
                                              )
                                            : candidate.key,
                                        }
                                      : candidate,
                                  ),
                                }
                              : item,
                          );
                        });
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ px: 0.25 }}>
                      Stable key: {system.key}
                      {system.autoGenerateKey ? ' · generated automatically' : ' · preserved'}
                    </Typography>
                  </Stack>
                  <Autocomplete
                    size="small"
                    options={libraryOptions}
                    value={selectedLibraryItem}
                    disabled={busy}
                    getOptionLabel={(option) => option.title}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    onChange={(_, option) => {
                      setCategories((current) =>
                        current.map((item, currentCategoryIndex) =>
                          currentCategoryIndex === categoryIndex
                            ? {
                                ...item,
                                systems: item.systems.map((candidate, currentSystemIndex) =>
                                  currentSystemIndex === systemIndex
                                    ? { ...candidate, libraryItemId: option?.id ?? null }
                                    : candidate,
                                ),
                              }
                            : item,
                        ),
                      );
                    }}
                    renderInput={(params) => (
                      <TextField {...params} label="Library item" placeholder="Optional" />
                    )}
                  />
                  <Stack direction="row" justifyContent={{ xs: 'flex-start', lg: 'flex-end' }}>
                    <IconButton
                      size="small"
                      disabled={busy || systemIndex === 0}
                      aria-label={`Move ${system.label} up`}
                      onClick={() => {
                        setCategories((current) =>
                          current.map((item, index) =>
                            index === categoryIndex
                              ? { ...item, systems: moveItem(item.systems, systemIndex, systemIndex - 1) }
                              : item,
                          ),
                        );
                      }}
                    >
                      <ArrowUpwardRoundedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      disabled={busy || systemIndex === category.systems.length - 1}
                      aria-label={`Move ${system.label} down`}
                      onClick={() => {
                        setCategories((current) =>
                          current.map((item, index) =>
                            index === categoryIndex
                              ? { ...item, systems: moveItem(item.systems, systemIndex, systemIndex + 1) }
                              : item,
                          ),
                        );
                      }}
                    >
                      <ArrowDownwardRoundedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      disabled={busy || category.systems.length === 1}
                      aria-label={`Remove ${system.label}`}
                      onClick={() => {
                        setCategories((current) =>
                          current.map((item, index) =>
                            index === categoryIndex
                              ? { ...item, systems: item.systems.filter((_, candidateIndex) => candidateIndex !== systemIndex) }
                              : item,
                          ),
                        );
                      }}
                    >
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Box>
              );
            })}

            <Button
              size="small"
              startIcon={<AddRoundedIcon />}
              disabled={busy}
              sx={{ mt: 1.5 }}
              onClick={() => addSystem(categoryIndex)}
            >
              Add system
            </Button>
          </Box>
        ))}
      </Stack>

      <Button
        variant="outlined"
        startIcon={<AddRoundedIcon />}
        disabled={busy}
        onClick={addCategory}
        sx={{ alignSelf: 'flex-start' }}
      >
        Add category
      </Button>
    </Stack>
  );
}
