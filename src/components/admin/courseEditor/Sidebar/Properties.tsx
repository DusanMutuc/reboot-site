'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';

import type { BlockType, ContentBlock, NodeChild, NodeSubtree, NodeType } from '@/types/course';
import type { SavingState } from '../state/editorStore';
import type { RenderableResource } from '@/components/course/BlockRenderer';
import { BLOCK_DEFINITIONS } from '../registry/blockRegistry';

export type NodeDraft = {
  title: string;
  slug: string;
  description: string;
  hero_image: string;
  icon: string;
  objectives: string;
  metadata: string;
};

export type PropertiesTab = 'details' | 'children' | 'blocks';

export type PropertiesProps = {
  subtree: NodeSubtree | null;
  nodeDraft: NodeDraft | null;
  metadataError: string | null;
  onNodeFieldChange: (field: keyof NodeDraft, value: string) => void;
  onRequestAddChild: (mode: 'create' | 'attach', options?: { type?: NodeType }) => void;
  onReorderChild: (childId: number, direction: 'up' | 'down') => void;
  onUpdateChild: (childId: number, updates: Partial<NodeChild>) => void;
  onRemoveChild: (childId: number) => void;
  selectedBlockId: number | null;
  onSelectBlock: (blockId: number | null) => void;
  onAddBlock: (type: BlockType) => void;
  onQueueBlockUpdate: (blockId: number, updates: Partial<ContentBlock>) => void;
  onDeleteBlock: (blockId: number) => void;
  onReorderBlock: (blockId: number, direction: 'up' | 'down') => void;
  onOpenResourcePicker: (mode: 'insert' | 'update', blockId?: number) => void;
  resources: Record<number, RenderableResource>;
  savingState: SavingState;
  savingMessage: string;
  tab: PropertiesTab;
  onTabChange: (tab: PropertiesTab) => void;
  availableChildTypes: NodeType[];
};

function BlockToolbar({
  isFirst,
  isLast,
  onReorder,
  onDelete,
  onSelect,
}: {
  isFirst: boolean;
  isLast: boolean;
  onReorder: (direction: 'up' | 'down') => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Button size="small" onClick={onSelect} variant="outlined">
        Select
      </Button>
      <Tooltip title="Move up">
        <span>
          <IconButton size="small" disabled={isFirst} onClick={() => onReorder('up')}>
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Move down">
        <span>
          <IconButton size="small" disabled={isLast} onClick={() => onReorder('down')}>
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Delete block">
        <IconButton size="small" color="error" onClick={onDelete}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

export default function Properties({
  subtree,
  nodeDraft,
  metadataError,
  onNodeFieldChange,
  onRequestAddChild,
  onReorderChild,
  onUpdateChild,
  onRemoveChild,
  selectedBlockId,
  onSelectBlock,
  onAddBlock,
  onQueueBlockUpdate,
  onDeleteBlock,
  onReorderBlock,
  onOpenResourcePicker,
  resources,
  savingState,
  savingMessage,
  tab,
  onTabChange,
  availableChildTypes,
}: PropertiesProps) {
  const [childType, setChildType] = useState<NodeType>('lesson');

  useEffect(() => {
    if (availableChildTypes.length > 0 && !availableChildTypes.includes(childType)) {
      setChildType(availableChildTypes[0]);
    }
  }, [availableChildTypes, childType]);

  const blocks = subtree ? [...subtree.blocks].sort((a, b) => a.position - b.position) : [];

  const renderDetailsTab = () => {
    if (!subtree || !nodeDraft) {
      return <Typography color="text.secondary">Select a node to edit details.</Typography>;
    }

    return (
      <Stack spacing={2}>
        <TextField
          label="Title"
          value={nodeDraft.title}
          onChange={(event) => onNodeFieldChange('title', event.target.value)}
        />
        <TextField
          label="Slug"
          value={nodeDraft.slug}
          onChange={(event) => onNodeFieldChange('slug', event.target.value)}
        />
        <TextField
          label="Description"
          multiline
          minRows={3}
          value={nodeDraft.description}
          onChange={(event) => onNodeFieldChange('description', event.target.value)}
        />
        <TextField
          label="Hero image URL"
          value={nodeDraft.hero_image}
          onChange={(event) => onNodeFieldChange('hero_image', event.target.value)}
        />
        <TextField
          label="Icon"
          value={nodeDraft.icon}
          onChange={(event) => onNodeFieldChange('icon', event.target.value)}
        />
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

  const renderChildrenTab = () => {
    if (!subtree) {
      return <Typography color="text.secondary">Select a node to manage children.</Typography>;
    }

    return (
      <Stack spacing={2}>
        <Stack direction="row" spacing={1}>
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
              <Stack
                key={child.edge.child_id}
                spacing={1}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}
              >
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
                        <IconButton
                          size="small"
                          disabled={index === 0}
                          onClick={() => onReorderChild(child.edge.child_id, 'up')}
                        >
                          <ArrowUpwardIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Move down">
                      <span>
                        <IconButton
                          size="small"
                          disabled={index === arr.length - 1}
                          onClick={() => onReorderChild(child.edge.child_id, 'down')}
                        >
                          <ArrowDownwardIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={!!child.edge.is_required}
                          onChange={(event) =>
                            onUpdateChild(child.edge.child_id, { is_required: event.target.checked })
                          }
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

  const renderBlocksTab = () => {
    if (!subtree) {
      return <Typography color="text.secondary">Select a node to manage blocks.</Typography>;
    }

    const canEditBlocks = subtree.children.length === 0;

    if (!canEditBlocks) {
      return <Alert severity="info">Blocks are available only on leaf nodes.</Alert>;
    }

    return (
      <Stack spacing={2}>
        <Stack direction="row" spacing={1}>
          {BLOCK_DEFINITIONS.map((definition) => (
            <Button
              key={definition.type}
              variant="contained"
              startIcon={definition.icon}
              onClick={() => onAddBlock(definition.type)}
            >
              {definition.label}
            </Button>
          ))}
        </Stack>

        {blocks.length === 0 ? (
          <Alert severity="info">This node has no blocks yet.</Alert>
        ) : (
          <Stack spacing={2}>
            {blocks.map((block, index) => {
              const isSelected = selectedBlockId === block.id;
              return (
                <Stack
                  key={block.id}
                  spacing={1.5}
                  sx={{
                    border: '1px solid',
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    p: 2,
                    backgroundColor: isSelected ? 'primary.light' : 'transparent',
                    backgroundImage: 'none',
                  }}
                >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2">Block {block.position + 1}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {block.block_type}
                    </Typography>
                  </Stack>
                  <BlockToolbar
                    isFirst={index === 0}
                    isLast={index === blocks.length - 1}
                    onReorder={(direction) => onReorderBlock(block.id, direction)}
                    onDelete={() => onDeleteBlock(block.id)}
                    onSelect={() => onSelectBlock(block.id)}
                  />
                </Stack>

                {block.block_type === 'text' && (
                  <TextField
                    label="Markdown"
                    multiline
                    minRows={4}
                    value={block.text_md ?? ''}
                    onChange={(event) => onQueueBlockUpdate(block.id, { text_md: event.target.value })}
                  />
                )}

                {block.block_type === 'asset' && (
                  <Stack spacing={1.5}>
                    <Button variant="outlined" onClick={() => onOpenResourcePicker('update', block.id)} startIcon={<SearchIcon />}>
                      {block.resource_id ? 'Change resource' : 'Select resource'}
                    </Button>
                    <Typography variant="body2">
                      {block.resource_id
                        ? resources[block.resource_id]?.title ?? 'Resource selected'
                        : 'No resource selected'}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <TextField
                        label="Start (ms)"
                        value={block.start_ms != null ? String(block.start_ms) : ''}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          if (Number.isNaN(parsed) || parsed < 0) {
                            onQueueBlockUpdate(block.id, { start_ms: null });
                          } else {
                            onQueueBlockUpdate(block.id, { start_ms: parsed });
                          }
                        }}
                      />
                      <TextField
                        label="End (ms)"
                        value={block.end_ms != null ? String(block.end_ms) : ''}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          if (Number.isNaN(parsed) || parsed < 0) {
                            onQueueBlockUpdate(block.id, { end_ms: null });
                          } else {
                            onQueueBlockUpdate(block.id, { end_ms: parsed });
                          }
                        }}
                      />
                    </Stack>
                  </Stack>
                )}

                <TextField
                  label="Label"
                  value={block.label ?? ''}
                  onChange={(event) => onQueueBlockUpdate(block.id, { label: event.target.value || null })}
                />
                </Stack>
              );
            })}
          </Stack>
        )}
      </Stack>
    );
  };

  return (
    <Stack spacing={2} sx={{ p: 3, height: '100%', overflowY: 'auto' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle1">Properties</Typography>
        <Typography variant="body2" color={savingState === 'error' ? 'error.main' : 'text.secondary'}>
          {savingMessage}
        </Typography>
      </Stack>

      <Tabs value={tab} onChange={(_, value) => onTabChange(value)}>
        <Tab label="Details" value="details" />
        <Tab label="Children" value="children" />
        <Tab label="Blocks" value="blocks" />
      </Tabs>

      <Box sx={{ flex: 1 }}>
        {tab === 'details' && renderDetailsTab()}
        {tab === 'children' && renderChildrenTab()}
        {tab === 'blocks' && renderBlocksTab()}
      </Box>
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
  return (
    <TextField
      select
      label="Child type"
      value={value}
      onChange={(event) => onChange(event.target.value as NodeType)}
    >
      {options.map((option) => (
        <MenuItem key={option} value={option}>
          {option}
        </MenuItem>
      ))}
    </TextField>
  );
}
