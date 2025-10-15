'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import type { ContentBlock, NodeChild, NodeSubtree, NodeType } from '@/types/course';
import type { SavingState } from '../state/editorStore';
import type { RenderableResource } from '@/components/course/BlockRenderer';
import { useUndoRedoInput } from '@/hooks/useUndoRedoInput';
import { supabase } from '@/lib/supabaseClient';

export type NodeDraft = {
  title: string;
  slug: string;
  description: string;
  hero_image: string;
  icon: string;
  objectives: string;
  metadata: string;
};

type SmartDocPromptDraft = {
  id: number | null;
  label: string;
  prompt_type: 'text' | 'textarea';
  help_text: string;
  required: boolean;
};

type SmartDocDraft = {
  docId: number | null;
  title: string;
  description: string;
  is_published: boolean;
  prompts: SmartDocPromptDraft[];
  original: {
    docId: number | null;
    title: string;
    description: string;
    is_published: boolean;
    prompts: SmartDocPromptDraft[];
  } | null;
};

function createEmptyPromptDraft(): SmartDocPromptDraft {
  return {
    id: null,
    label: '',
    prompt_type: 'text',
    help_text: '',
    required: false,
  };
}

function clonePrompts(prompts: SmartDocPromptDraft[]): SmartDocPromptDraft[] {
  return prompts.map((prompt) => ({ ...prompt }));
}

function createEmptySmartDocDraft(docId: number | null = null): SmartDocDraft {
  return {
    docId,
    title: '',
    description: '',
    is_published: false,
    prompts: [createEmptyPromptDraft()],
    original: null,
  };
}

function promptsEqual(a: SmartDocPromptDraft[], b: SmartDocPromptDraft[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.id !== right.id ||
      left.label !== right.label ||
      left.prompt_type !== right.prompt_type ||
      (left.help_text ?? '') !== (right.help_text ?? '') ||
      !!left.required !== !!right.required
    ) {
      return false;
    }
  }
  return true;
}

function validateSmartDocDraft(draft: SmartDocDraft | null): string | null {
  if (!draft) {
    return 'Smart doc is not ready yet';
  }
  const title = draft.title.trim();
  if (title.length < 3) {
    return 'Title must be at least 3 characters';
  }
  if (draft.prompts.length === 0) {
    return 'Add at least one prompt';
  }
  for (const prompt of draft.prompts) {
    if (!prompt.label.trim()) {
      return 'Each prompt requires a label';
    }
    if (prompt.prompt_type !== 'text' && prompt.prompt_type !== 'textarea') {
      return 'Prompt type must be text or textarea';
    }
  }
  return null;
}

export type PropertiesProps = {
  subtree: NodeSubtree | null;
  nodeDraft: NodeDraft | null;
  metadataError: string | null;
  onNodeFieldChange: (field: keyof NodeDraft, value: string) => void;
  onRequestAddChild: (mode: 'create' | 'attach', options?: { type?: NodeType }) => void;
  onReorderChild: (childId: number, direction: 'up' | 'down') => void;
  onUpdateChild: (childId: number, updates: Partial<NodeChild>) => void;
  onRemoveChild: (childId: number) => void;
  selectedBlock: ContentBlock | null;
  onClearBlockSelection: () => void;
  onUpdateBlock: (blockId: number, updates: Partial<ContentBlock>, options?: { debounce?: boolean }) => void;
  onDeleteBlock: (blockId: number) => void;
  onOpenResourcePicker: (mode: 'insert' | 'update', blockId?: number) => void;
  onFinalizeSmartDocBlock: (
    block: ContentBlock,
    docId: number,
    options?: { suppressToast?: boolean },
  ) => Promise<void>;
  resources: Record<number, RenderableResource>;
  savingState: SavingState;
  savingMessage: string;
  availableChildTypes: NodeType[];
};

export default function Properties({
  subtree,
  nodeDraft,
  metadataError,
  onNodeFieldChange,
  onRequestAddChild,
  onReorderChild,
  onUpdateChild,
  onRemoveChild,
  selectedBlock,
  onClearBlockSelection,
  onUpdateBlock,
  onDeleteBlock,
  onOpenResourcePicker,
  onFinalizeSmartDocBlock,
  resources,
  savingState,
  savingMessage,
  availableChildTypes,
}: PropertiesProps) {
  const [childType, setChildType] = useState<NodeType>('lesson');
  const [settingsDraft, setSettingsDraft] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [smartDocDraft, setSmartDocDraft] = useState<SmartDocDraft | null>(null);
  const [smartDocLoading, setSmartDocLoading] = useState(false);
  const [smartDocSaving, setSmartDocSaving] = useState(false);
  const [smartDocError, setSmartDocError] = useState<string | null>(null);
  const [smartDocMessage, setSmartDocMessage] = useState<string | null>(null);
  const smartDocLoadedRef = useRef<number | null>(null);

  const nodeScopeKey = subtree?.node.id ?? null;
  const blockScopeKey = selectedBlock?.id ?? null;
  const isPendingBlock = (selectedBlock?.id ?? 0) < 0;

  const titleInput = useUndoRedoInput({
    value: nodeDraft?.title ?? '',
    onChange: (next) => onNodeFieldChange('title', next),
    scopeKey: nodeScopeKey,
  });
  const slugInput = useUndoRedoInput({
    value: nodeDraft?.slug ?? '',
    onChange: (next) => onNodeFieldChange('slug', next),
    scopeKey: nodeScopeKey,
  });
  const descriptionInput = useUndoRedoInput({
    value: nodeDraft?.description ?? '',
    onChange: (next) => onNodeFieldChange('description', next),
    scopeKey: nodeScopeKey,
  });
  const heroImageInput = useUndoRedoInput({
    value: nodeDraft?.hero_image ?? '',
    onChange: (next) => onNodeFieldChange('hero_image', next),
    scopeKey: nodeScopeKey,
  });
  const iconInput = useUndoRedoInput({
    value: nodeDraft?.icon ?? '',
    onChange: (next) => onNodeFieldChange('icon', next),
    scopeKey: nodeScopeKey,
  });
  const objectivesInput = useUndoRedoInput({
    value: nodeDraft?.objectives ?? '',
    onChange: (next) => onNodeFieldChange('objectives', next),
    scopeKey: nodeScopeKey,
  });
  const metadataInput = useUndoRedoInput({
    value: nodeDraft?.metadata ?? '',
    onChange: (next) => onNodeFieldChange('metadata', next),
    scopeKey: nodeScopeKey,
  });

  const handleNumericField = useCallback(
    (field: 'start_ms' | 'end_ms', raw: string) => {
      if (!selectedBlock || selectedBlock.id < 0) {
        return;
      }
      const value = raw.trim();
      if (!value) {
        onUpdateBlock(selectedBlock.id, { [field]: null });
        return;
      }
      const parsed = Number(value);
      if (Number.isNaN(parsed) || parsed < 0) {
        return;
      }
      onUpdateBlock(selectedBlock.id, { [field]: parsed });
    },
    [onUpdateBlock, selectedBlock],
  );

  const handleLabelChange = useCallback(
    (value: string) => {
      if (!selectedBlock || selectedBlock.id < 0) {
        return;
      }
      onUpdateBlock(selectedBlock.id, { label: value ? value : null });
    },
    [onUpdateBlock, selectedBlock],
  );

  const handleNotesChange = useCallback(
    (value: string) => {
      if (!selectedBlock || selectedBlock.id < 0) {
        return;
      }
      onUpdateBlock(selectedBlock.id, { notes: value ? value : null });
    },
    [onUpdateBlock, selectedBlock],
  );

  const handleSettingsChange = useCallback(
    (value: string) => {
      setSettingsDraft(value);
      if (!selectedBlock || selectedBlock.id < 0) {
        return;
      }
      if (!value.trim()) {
        setSettingsError(null);
        onUpdateBlock(selectedBlock.id, { settings: null });
        return;
      }
      try {
        const parsed = JSON.parse(value);
        setSettingsError(null);
        onUpdateBlock(selectedBlock.id, { settings: parsed });
      } catch {
        setSettingsError('Settings must be valid JSON');
      }
    },
    [onUpdateBlock, selectedBlock, setSettingsDraft, setSettingsError],
  );

  useEffect(() => {
    if (!selectedBlock || selectedBlock.block_type !== 'smart_doc') {
      setSmartDocDraft(null);
      setSmartDocLoading(false);
      setSmartDocSaving(false);
      setSmartDocError(null);
      setSmartDocMessage(null);
      smartDocLoadedRef.current = null;
      return;
    }

    if (!selectedBlock.smart_doc_id) {
      smartDocLoadedRef.current = null;
      setSmartDocDraft((prev) => (prev && prev.docId === null ? prev : createEmptySmartDocDraft(null)));
      setSmartDocLoading(false);
      setSmartDocError(null);
      return;
    }

    const docId = selectedBlock.smart_doc_id;
    if (smartDocLoadedRef.current === docId) {
      return;
    }

    smartDocLoadedRef.current = docId;
    setSmartDocLoading(true);
    setSmartDocError(null);
    setSmartDocMessage(null);

    let cancelled = false;

    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('smart_docs')
          .select(
            `id, title, description, is_published, smart_doc_prompts:smart_doc_prompts (
              id, position, label, prompt_type, help_text, required
            )`,
          )
          .eq('id', docId)
          .single();

        if (cancelled) return;

        if (error) {
          setSmartDocError(error.message ?? 'Failed to load smart doc');
          setSmartDocDraft(createEmptySmartDocDraft(docId));
        } else if (data) {
          const prompts = (data.smart_doc_prompts ?? [])
            .slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((prompt) => ({
              id: prompt.id ?? null,
              label: prompt.label ?? '',
              prompt_type: (prompt.prompt_type as 'text' | 'textarea') ?? 'text',
              help_text: prompt.help_text ?? '',
              required: !!prompt.required,
            }));
          const normalizedPrompts = prompts.length > 0 ? prompts : [createEmptyPromptDraft()];
          const next: SmartDocDraft = {
            docId: data.id ?? docId,
            title: data.title ?? '',
            description: data.description ?? '',
            is_published: !!data.is_published,
            prompts: clonePrompts(normalizedPrompts),
            original: {
              docId: data.id ?? docId,
              title: data.title ?? '',
              description: data.description ?? '',
              is_published: !!data.is_published,
              prompts: clonePrompts(normalizedPrompts),
            },
          };
          setSmartDocDraft(next);
        } else {
          setSmartDocDraft(createEmptySmartDocDraft(docId));
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load smart doc';
        setSmartDocError(message);
        setSmartDocDraft(createEmptySmartDocDraft(docId));
      } finally {
        if (!cancelled) {
          setSmartDocLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedBlock]);

  const smartDocDirty = useMemo(() => {
    if (!smartDocDraft) return false;
    if (!smartDocDraft.original) return true;
    if (smartDocDraft.title !== smartDocDraft.original.title) return true;
    if (smartDocDraft.description !== smartDocDraft.original.description) return true;
    if (smartDocDraft.is_published !== smartDocDraft.original.is_published) return true;
    if (!promptsEqual(smartDocDraft.prompts, smartDocDraft.original.prompts)) return true;
    return false;
  }, [smartDocDraft]);

  const smartDocValidationError = useMemo(() => validateSmartDocDraft(smartDocDraft), [smartDocDraft]);

  const handleSmartDocFieldChange = useCallback((field: 'title' | 'description', value: string) => {
    setSmartDocDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
    setSmartDocError(null);
    setSmartDocMessage(null);
  }, []);

  const handlePromptChange = useCallback(
    (index: number, field: 'label' | 'prompt_type' | 'help_text', value: string) => {
      setSmartDocDraft((prev) => {
        if (!prev) return prev;
        const prompts = prev.prompts.map((prompt, idx) =>
          idx === index ? { ...prompt, [field]: value } : prompt,
        );
        return { ...prev, prompts };
      });
      setSmartDocError(null);
      setSmartDocMessage(null);
    },
    [],
  );

  const handlePromptRequiredChange = useCallback((index: number, checked: boolean) => {
    setSmartDocDraft((prev) => {
      if (!prev) return prev;
      const prompts = prev.prompts.map((prompt, idx) =>
        idx === index ? { ...prompt, required: checked } : prompt,
      );
      return { ...prev, prompts };
    });
    setSmartDocError(null);
    setSmartDocMessage(null);
  }, []);

  const handleAddPrompt = useCallback(() => {
    setSmartDocDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, prompts: [...prev.prompts, createEmptyPromptDraft()] };
    });
    setSmartDocError(null);
    setSmartDocMessage(null);
  }, []);

  const handleRemovePrompt = useCallback((index: number) => {
    setSmartDocDraft((prev) => {
      if (!prev) return prev;
      if (prev.prompts.length <= 1) {
        return prev;
      }
      const prompts = prev.prompts.filter((_, idx) => idx !== index);
      return { ...prev, prompts: prompts.length > 0 ? prompts : [createEmptyPromptDraft()] };
    });
    setSmartDocError(null);
    setSmartDocMessage(null);
  }, []);

  const handleMovePrompt = useCallback((index: number, direction: 'up' | 'down') => {
    setSmartDocDraft((prev) => {
      if (!prev) return prev;
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.prompts.length) {
        return prev;
      }
      const prompts = [...prev.prompts];
      const [prompt] = prompts.splice(index, 1);
      prompts.splice(nextIndex, 0, prompt);
      return { ...prev, prompts };
    });
    setSmartDocError(null);
    setSmartDocMessage(null);
  }, []);

  const handleSaveSmartDoc = useCallback(async () => {
    if (!selectedBlock || selectedBlock.block_type !== 'smart_doc') return;
    const validationError = validateSmartDocDraft(smartDocDraft);
    if (validationError) {
      setSmartDocError(validationError);
      return;
    }
    if (!smartDocDraft) return;

    setSmartDocSaving(true);
    setSmartDocError(null);
    setSmartDocMessage(null);

    try {
      let docId = smartDocDraft.docId;
      const title = smartDocDraft.title.trim();
      const description = smartDocDraft.description.trim();

      if (!docId) {
        const { data: doc, error } = await supabase
          .from('smart_docs')
          .insert({ title, description: description ? description : null, is_published: false })
          .select('id, title, description, is_published')
          .single();
        if (error) {
          throw new Error(error.message);
        }
        docId = doc.id as number;

        const promptsPayload = smartDocDraft.prompts.map((prompt, index) => ({
          doc_id: docId,
          label: prompt.label.trim(),
          prompt_type: prompt.prompt_type,
          help_text: prompt.help_text.trim() ? prompt.help_text.trim() : null,
          required: !!prompt.required,
          options_json: null,
          validation_json: null,
          position: index,
        }));

        if (promptsPayload.length > 0) {
          const { error: promptError } = await supabase.from('smart_doc_prompts').insert(promptsPayload);
          if (promptError) {
            throw new Error(promptError.message);
          }
        }
      } else {
        const { error: updateError } = await supabase
          .from('smart_docs')
          .update({ title, description: description ? description : null, is_published: smartDocDraft.is_published })
          .eq('id', docId)
          .select('id')
          .single();
        if (updateError) {
          throw new Error(updateError.message);
        }

        const nextPrompts = smartDocDraft.prompts.map((prompt, index) => ({
          ...prompt,
          position: index,
        }));

        const existingPrompts = smartDocDraft.original?.prompts ?? [];
        const nextIds = new Set(nextPrompts.map((prompt) => prompt.id).filter((id): id is number => id != null));
        const toDeleteIds = existingPrompts
          .map((prompt) => prompt.id)
          .filter((id): id is number => id != null && !nextIds.has(id));
        if (toDeleteIds.length > 0) {
          const { error: deleteError } = await supabase.from('smart_doc_prompts').delete().in('id', toDeleteIds);
          if (deleteError) {
            throw new Error(deleteError.message);
          }
        }

        for (const prompt of nextPrompts) {
          if (!prompt.id) continue;
          const previous = existingPrompts.find((item) => item.id === prompt.id);
          if (!previous) continue;
          if (
            previous.label !== prompt.label ||
            previous.prompt_type !== prompt.prompt_type ||
            (previous.help_text ?? '') !== (prompt.help_text ?? '') ||
            !!previous.required !== !!prompt.required ||
            previous.position !== prompt.position
          ) {
            const { error: promptUpdateError } = await supabase
              .from('smart_doc_prompts')
              .update({
                label: prompt.label.trim(),
                prompt_type: prompt.prompt_type,
                help_text: prompt.help_text.trim() ? prompt.help_text.trim() : null,
                required: !!prompt.required,
                options_json: null,
                validation_json: null,
                position: prompt.position,
              })
              .eq('id', prompt.id)
              .eq('doc_id', docId);
            if (promptUpdateError) {
              throw new Error(promptUpdateError.message);
            }
          }
        }

        const toInsert = nextPrompts.filter((prompt) => !prompt.id);
        if (toInsert.length > 0) {
          const { error: insertError } = await supabase.from('smart_doc_prompts').insert(
            toInsert.map((prompt) => ({
              doc_id: docId,
              label: prompt.label.trim(),
              prompt_type: prompt.prompt_type,
              help_text: prompt.help_text.trim() ? prompt.help_text.trim() : null,
              required: !!prompt.required,
              options_json: null,
              validation_json: null,
              position: prompt.position,
            })),
          );
          if (insertError) {
            throw new Error(insertError.message);
          }
        }
      }

      const { data: refreshed, error: fetchError } = await supabase
        .from('smart_docs')
        .select(
          `id, title, description, is_published, smart_doc_prompts:smart_doc_prompts (
            id, position, label, prompt_type, help_text, required
          )`,
        )
        .eq('id', docId!)
        .single();

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      const prompts = (refreshed?.smart_doc_prompts ?? [])
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((prompt) => ({
          id: prompt.id ?? null,
          label: prompt.label ?? '',
          prompt_type: (prompt.prompt_type as 'text' | 'textarea') ?? 'text',
          help_text: prompt.help_text ?? '',
          required: !!prompt.required,
        }));
      const normalizedPrompts = prompts.length > 0 ? prompts : [createEmptyPromptDraft()];

      setSmartDocDraft({
        docId: refreshed?.id ?? docId!,
        title: refreshed?.title ?? '',
        description: refreshed?.description ?? '',
        is_published: !!refreshed?.is_published,
        prompts: clonePrompts(normalizedPrompts),
        original: {
          docId: refreshed?.id ?? docId!,
          title: refreshed?.title ?? '',
          description: refreshed?.description ?? '',
          is_published: !!refreshed?.is_published,
          prompts: clonePrompts(normalizedPrompts),
        },
      });
      smartDocLoadedRef.current = docId!;

      if (!selectedBlock.smart_doc_id || selectedBlock.smart_doc_id !== docId) {
        await onFinalizeSmartDocBlock(selectedBlock, docId!, { suppressToast: true });
      }

      setSmartDocMessage('Smart doc saved');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save smart doc';
      setSmartDocError(message);
    } finally {
      setSmartDocSaving(false);
    }
  }, [onFinalizeSmartDocBlock, selectedBlock, smartDocDraft]);

  const renderSmartDocForm = () => {
    if (!selectedBlock || selectedBlock.block_type !== 'smart_doc') {
      return null;
    }

    if (smartDocLoading || !smartDocDraft) {
      return <Typography color="text.secondary">Loading smart doc…</Typography>;
    }

    return (
      <Stack spacing={2}>
        {selectedBlock.id < 0 ? (
          <Alert severity="info">Fill out the smart doc details, then save to create this block.</Alert>
        ) : null}
        {smartDocError ? <Alert severity="error">{smartDocError}</Alert> : null}
        {smartDocMessage ? <Alert severity="success">{smartDocMessage}</Alert> : null}
        <TextField
          label="Smart doc title"
          required
          value={smartDocDraft.title}
          onChange={(event) => handleSmartDocFieldChange('title', event.target.value)}
        />
        <TextField
          label="Description"
          value={smartDocDraft.description}
          onChange={(event) => handleSmartDocFieldChange('description', event.target.value)}
          multiline
          minRows={3}
        />
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2">Prompts</Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleAddPrompt}
              disabled={smartDocSaving}
            >
              Add prompt
            </Button>
          </Stack>
          <Stack spacing={1.5}>
            {smartDocDraft.prompts.map((prompt, index) => (
              <Stack
                key={prompt.id ?? `prompt-${index}`}
                spacing={1}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2">Prompt {index + 1}</Typography>
                  <Stack direction="row" spacing={1}>
                    <Tooltip title="Move up">
                      <span>
                        <IconButton size="small" disabled={index === 0} onClick={() => handleMovePrompt(index, 'up')}>
                          <ArrowUpwardIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Move down">
                      <span>
                        <IconButton
                          size="small"
                          disabled={index === smartDocDraft.prompts.length - 1}
                          onClick={() => handleMovePrompt(index, 'down')}
                        >
                          <ArrowDownwardIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Remove prompt">
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={smartDocDraft.prompts.length <= 1}
                          onClick={() => handleRemovePrompt(index)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </Stack>
                <TextField
                  label="Label"
                  value={prompt.label}
                  onChange={(event) => handlePromptChange(index, 'label', event.target.value)}
                  required
                />
                <TextField
                  label="Prompt type"
                  select
                  value={prompt.prompt_type}
                  onChange={(event) => handlePromptChange(index, 'prompt_type', event.target.value as 'text' | 'textarea')}
                >
                  <MenuItem value="text">Short text</MenuItem>
                  <MenuItem value="textarea">Paragraph</MenuItem>
                </TextField>
                <TextField
                  label="Help text"
                  value={prompt.help_text}
                  onChange={(event) => handlePromptChange(index, 'help_text', event.target.value)}
                  multiline
                  minRows={2}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={prompt.required}
                      onChange={(event) => handlePromptRequiredChange(index, event.target.checked)}
                    />
                  }
                  label="Required"
                />
              </Stack>
            ))}
          </Stack>
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="contained"
            onClick={handleSaveSmartDoc}
            disabled={
              smartDocSaving ||
              !smartDocDraft ||
              !!smartDocValidationError ||
              (!smartDocDirty && smartDocDraft.docId != null)
            }
          >
            {smartDocSaving ? 'Saving…' : smartDocDraft.docId ? 'Save smart doc' : 'Create smart doc'}
          </Button>
          {smartDocSaving ? <Typography color="text.secondary">Saving…</Typography> : null}
        </Stack>
      </Stack>
    );
  };

  const startInput = useUndoRedoInput({
    value:
      selectedBlock && selectedBlock.start_ms != null
        ? String(selectedBlock.start_ms)
        : '',
    onChange: (next) => handleNumericField('start_ms', next),
    scopeKey: blockScopeKey,
  });

  const endInput = useUndoRedoInput({
    value:
      selectedBlock && selectedBlock.end_ms != null
        ? String(selectedBlock.end_ms)
        : '',
    onChange: (next) => handleNumericField('end_ms', next),
    scopeKey: blockScopeKey,
  });

  const labelInput = useUndoRedoInput({
    value: selectedBlock?.label ?? '',
    onChange: handleLabelChange,
    scopeKey: blockScopeKey,
  });

  const notesInput = useUndoRedoInput({
    value: selectedBlock?.notes ?? '',
    onChange: handleNotesChange,
    scopeKey: blockScopeKey,
  });

  const settingsInput = useUndoRedoInput({
    value: settingsDraft,
    onChange: handleSettingsChange,
    scopeKey: blockScopeKey,
  });

  useEffect(() => {
    if (availableChildTypes.length > 0 && !availableChildTypes.includes(childType)) {
      setChildType(availableChildTypes[0]);
    }
  }, [availableChildTypes, childType]);

  useEffect(() => {
    if (!selectedBlock) {
      setSettingsDraft('');
      setSettingsError(null);
      return;
    }
    if (selectedBlock.settings) {
      setSettingsDraft(JSON.stringify(selectedBlock.settings, null, 2));
    } else {
      setSettingsDraft('');
    }
    setSettingsError(null);
  }, [selectedBlock]);

  const canEditBlocks = subtree ? subtree.children.length === 0 : false;

  const blockResource = useMemo(() => {
    if (!selectedBlock || !selectedBlock.resource_id) return null;
    return resources[selectedBlock.resource_id] ?? null;
  }, [resources, selectedBlock]);

  const renderNodeDetails = () => {
    if (!subtree || !nodeDraft) {
      return <Typography color="text.secondary">Select a node to edit details.</Typography>;
    }

    return (
      <Stack spacing={2}>
        <Typography variant="subtitle2">Node details</Typography>
        <TextField
          label="Title"
          value={nodeDraft.title}
          onChange={(event) => titleInput.handleChange(event.target.value)}
          onKeyDown={titleInput.handleKeyDown}
        />
        <TextField
          label="Slug"
          value={nodeDraft.slug}
          onChange={(event) => slugInput.handleChange(event.target.value)}
          onKeyDown={slugInput.handleKeyDown}
        />
        <TextField
          label="Description"
          multiline
          minRows={3}
          value={nodeDraft.description}
          onChange={(event) => descriptionInput.handleChange(event.target.value)}
          onKeyDown={descriptionInput.handleKeyDown}
        />
        <TextField
          label="Hero image URL"
          value={nodeDraft.hero_image}
          onChange={(event) => heroImageInput.handleChange(event.target.value)}
          onKeyDown={heroImageInput.handleKeyDown}
        />
        <TextField
          label="Icon"
          value={nodeDraft.icon}
          onChange={(event) => iconInput.handleChange(event.target.value)}
          onKeyDown={iconInput.handleKeyDown}
        />
        <TextField
          label="Objectives"
          multiline
          minRows={3}
          value={nodeDraft.objectives}
          onChange={(event) => objectivesInput.handleChange(event.target.value)}
          onKeyDown={objectivesInput.handleKeyDown}
        />
        <TextField
          label="Metadata (JSON)"
          multiline
          minRows={4}
          value={nodeDraft.metadata}
          onChange={(event) => metadataInput.handleChange(event.target.value)}
          onKeyDown={metadataInput.handleKeyDown}
          error={!!metadataError}
          helperText={metadataError ?? 'Provide structured metadata for this node.'}
        />
      </Stack>
    );
  };

  const renderChildren = () => {
    if (!subtree) {
      return <Typography color="text.secondary">Select a node to manage children.</Typography>;
    }

    return (
      <Stack spacing={2}>
        <Typography variant="subtitle2">Children</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <TabsHiddenSelect value={childType} onChange={(value) => setChildType(value)} options={availableChildTypes} />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => onRequestAddChild('create', { type: childType })}
            disabled={availableChildTypes.length === 0}
          >
            Create child
          </Button>
          <Button variant="outlined" onClick={() => onRequestAddChild('attach')} startIcon={<SearchIcon />}>
            Attach existing
          </Button>
        </Stack>
        <Stack spacing={1.5}>
          {subtree.children
            .slice()
            .sort((a, b) => a.edge.position - b.edge.position)
            .map((child, index, arr) => (
              <Stack key={child.edge.child_id} spacing={1} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2">{child.subtree.node.title ?? `Node #${child.subtree.node.id}`}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {child.subtree.node.node_type}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Tooltip title="Move up">
                      <span>
                        <IconButton size="small" disabled={index === 0} onClick={() => onReorderChild(child.edge.child_id, 'up')}>
                          <ArrowUpwardIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Move down">
                      <span>
                        <IconButton size="small" disabled={index === arr.length - 1} onClick={() => onReorderChild(child.edge.child_id, 'down')}>
                          <ArrowDownwardIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={!!child.edge.is_required}
                          onChange={(event) => onUpdateChild(child.edge.child_id, { is_required: event.target.checked })}
                        />
                      }
                      label="Required"
                    />
                    <Tooltip title="Detach child">
                      <IconButton size="small" color="error" onClick={() => onRemoveChild(child.edge.child_id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
                {child.edge.label && (
                  <Typography variant="body2" color="text.secondary">
                    {child.edge.label}
                  </Typography>
                )}
              </Stack>
            ))}
        </Stack>
      </Stack>
    );
  };

  const renderBlockProperties = () => {
    if (!selectedBlock) return null;

    return (
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack spacing={0.5}>
            <Typography variant="subtitle2">Block {selectedBlock.position + 1}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
              {selectedBlock.block_type}
            </Typography>
          </Stack>
          <Button variant="text" startIcon={<ArrowBackIcon />} onClick={onClearBlockSelection}>
            Back to node
          </Button>
        </Stack>

        {!canEditBlocks && (
          <Alert severity="info">Blocks can only be edited on leaf nodes.</Alert>
        )}

        {selectedBlock.block_type === 'text' ? (
          <Alert severity="info">Text blocks are edited inline on the canvas.</Alert>
        ) : null}

        {selectedBlock.block_type === 'smart_doc'
          ? renderSmartDocForm()
          : (
              <>
                {selectedBlock.block_type === 'asset' && (
                  <Stack spacing={2}>
                    <Button
                      variant="outlined"
                      startIcon={<SearchIcon />}
                      onClick={() => onOpenResourcePicker('update', selectedBlock.id)}
                      disabled={isPendingBlock}
                    >
                      {selectedBlock.resource_id ? 'Change resource' : 'Select resource'}
                    </Button>
                    <Typography variant="body2" color="text.secondary">
                      {blockResource ? blockResource.title : 'No resource selected'}
                    </Typography>
                    <Stack direction="row" spacing={2}>
                      <TextField
                        label="Start (ms)"
                        value={selectedBlock.start_ms != null ? String(selectedBlock.start_ms) : ''}
                        onChange={(event) => startInput.handleChange(event.target.value)}
                        onKeyDown={startInput.handleKeyDown}
                        disabled={isPendingBlock}
                      />
                      <TextField
                        label="End (ms)"
                        value={selectedBlock.end_ms != null ? String(selectedBlock.end_ms) : ''}
                        onChange={(event) => endInput.handleChange(event.target.value)}
                        onKeyDown={endInput.handleKeyDown}
                        disabled={isPendingBlock}
                      />
                    </Stack>
                  </Stack>
                )}

                {(selectedBlock.block_type === 'asset' || selectedBlock.block_type === 'divider') && (
                  <Stack spacing={2}>
                    <TextField
                      label="Label"
                      value={selectedBlock.label ?? ''}
                      onChange={(event) => labelInput.handleChange(event.target.value)}
                      onKeyDown={labelInput.handleKeyDown}
                      disabled={isPendingBlock}
                    />
                    <TextField
                      label="Notes"
                      multiline
                      minRows={3}
                      value={selectedBlock.notes ?? ''}
                      onChange={(event) => notesInput.handleChange(event.target.value)}
                      onKeyDown={notesInput.handleKeyDown}
                      disabled={isPendingBlock}
                    />
                  </Stack>
                )}

                {selectedBlock.block_type === 'asset' && (selectedBlock.settings != null || settingsDraft) && (
                  <TextField
                    label="Settings (JSON)"
                    multiline
                    minRows={4}
                    value={settingsDraft}
                    onChange={(event) => settingsInput.handleChange(event.target.value)}
                    onKeyDown={settingsInput.handleKeyDown}
                    error={!!settingsError}
                    helperText={settingsError ?? 'Optional advanced configuration for this block.'}
                    disabled={isPendingBlock}
                  />
                )}
              </>
            )}

        {isPendingBlock && selectedBlock.block_type !== 'smart_doc' && (
          <Alert severity="info">This block is being saved. Additional options will be available shortly.</Alert>
        )}

        <Box>
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => onDeleteBlock(selectedBlock.id)} disabled={isPendingBlock}>
            Delete block
          </Button>
        </Box>
      </Stack>
    );
  };

  return (
    <Stack spacing={3} sx={{ p: 3, height: '100%', overflowY: 'auto' }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle1">Properties</Typography>
        <Typography variant="body2" color={savingState === 'error' ? 'error.main' : 'text.secondary'}>
          {savingMessage}
        </Typography>
      </Stack>

      {selectedBlock ? (
        renderBlockProperties()
      ) : (
        <Stack spacing={3}>
          {renderNodeDetails()}
          <Divider />
          {renderChildren()}
        </Stack>
      )}
    </Stack>
  );
}

function TabsHiddenSelect({
  value,
  onChange,
  options,
}: {
  value: NodeType;
  onChange: (value: NodeType) => void;
  options: NodeType[];
}) {
  const displayOptions = options.length > 0 ? options : ([value] as NodeType[]);
  return (
    <TextField select label="Child type" value={value} onChange={(event) => onChange(event.target.value as NodeType)}>
      {displayOptions.map((option) => (
        <MenuItem key={option} value={option}>
          {option}
        </MenuItem>
      ))}
    </TextField>
  );
}
