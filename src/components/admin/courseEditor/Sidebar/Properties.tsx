'use client';

import { useEffect, useMemo, useState } from 'react';
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

export type NodeDraft = {
  title: string;
  slug: string;
  description: string;
  hero_image: string;
  icon: string;
  objectives: string;
  metadata: string;
};

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
  resources,
  savingState,
  savingMessage,
  availableChildTypes,
}: PropertiesProps) {
  const [childType, setChildType] = useState<NodeType>('lesson');
  const [settingsDraft, setSettingsDraft] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);

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
  }, [selectedBlock?.id, selectedBlock?.settings]);

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
        <TextField label="Title" value={nodeDraft.title} onChange={(event) => onNodeFieldChange('title', event.target.value)} />
        <TextField label="Slug" value={nodeDraft.slug} onChange={(event) => onNodeFieldChange('slug', event.target.value)} />
        <TextField
          label="Description"
          multiline
          minRows={3}
          value={nodeDraft.description}
          onChange={(event) => onNodeFieldChange('description', event.target.value)}
        />
        <TextField label="Hero image URL" value={nodeDraft.hero_image} onChange={(event) => onNodeFieldChange('hero_image', event.target.value)} />
        <TextField label="Icon" value={nodeDraft.icon} onChange={(event) => onNodeFieldChange('icon', event.target.value)} />
        <TextField
          label="Objectives"
          multiline
          minRows={3}
          value={nodeDraft.objectives}
          onChange={(event) => onNodeFieldChange('objectives', event.target.value)}
        />
        <TextField
          label="Metadata (JSON)"
          multiline
          minRows={4}
          value={nodeDraft.metadata}
          onChange={(event) => onNodeFieldChange('metadata', event.target.value)}
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

    const isPendingBlock = selectedBlock.id < 0;

    const handleNumericField = (field: 'start_ms' | 'end_ms', raw: string) => {
      if (!selectedBlock) return;
      if (isPendingBlock) return;
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
    };

    const handleSettingsChange = (value: string) => {
      setSettingsDraft(value);
      if (!selectedBlock) return;
      if (isPendingBlock) return;
      if (!value.trim()) {
        setSettingsError(null);
        onUpdateBlock(selectedBlock.id, { settings: null });
        return;
      }
      try {
        const parsed = JSON.parse(value);
        setSettingsError(null);
        onUpdateBlock(selectedBlock.id, { settings: parsed });
      } catch (error) {
        setSettingsError('Settings must be valid JSON');
      }
    };

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
                onChange={(event) => handleNumericField('start_ms', event.target.value)}
                disabled={isPendingBlock}
              />
              <TextField
                label="End (ms)"
                value={selectedBlock.end_ms != null ? String(selectedBlock.end_ms) : ''}
                onChange={(event) => handleNumericField('end_ms', event.target.value)}
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
              onChange={(event) => !isPendingBlock && onUpdateBlock(selectedBlock.id, { label: event.target.value || null })}
              disabled={isPendingBlock}
            />
            <TextField
              label="Notes"
              multiline
              minRows={3}
              value={selectedBlock.notes ?? ''}
              onChange={(event) => !isPendingBlock && onUpdateBlock(selectedBlock.id, { notes: event.target.value || null })}
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
            onChange={(event) => handleSettingsChange(event.target.value)}
            error={!!settingsError}
            helperText={settingsError ?? 'Optional advanced configuration for this block.'}
            disabled={isPendingBlock}
          />
        )}

        {isPendingBlock && (
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
