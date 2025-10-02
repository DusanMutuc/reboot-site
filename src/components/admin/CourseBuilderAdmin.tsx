'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';
import EditIcon from '@mui/icons-material/Edit';
import LinkIcon from '@mui/icons-material/Link';
import ImageIcon from '@mui/icons-material/Image';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo';
import InsertLinkIcon from '@mui/icons-material/InsertLink';
import { LoadingButton } from '@mui/lab';
import { supabase } from '@/lib/supabaseClient';
import Collapse from '@mui/material/Collapse';


const NODE_STATES = ['draft', 'published', 'archived'] as const;
const BLOCK_TYPES = ['text', 'asset', 'embed', 'image', 'link'] as const;

type CourseNodeState = (typeof NODE_STATES)[number];
type BlockType = (typeof BLOCK_TYPES)[number];

type ResourceTag = { id: number; name: string; category: string | null };

type ResourceSummary = {
  id: number;
  title: string;
  type: string;
  thumbnail: string | null;
  tags: ResourceTag[];
};

type ResourceRow = {
  id: number;
  title: string;
  type: string;
  thumbnail: string | null;
  resource_tags?: { tag: ResourceTag }[];
};

type ChildRelationshipFlags = {
  isOptional: boolean;
  lockUntilPreviousComplete: boolean;
  allowSkip: boolean;
};

type BaseBlock<T extends BlockType> = {
  id: string;
  type: T;
  published: boolean;
  tags: ResourceTag[];
  errors?: string[];
};

type TextBlock = BaseBlock<'text'> & {
  text: string;
};

type AssetBlock = BaseBlock<'asset'> & {
  resourceId: number | null;
  resourceTitle: string;
  description: string;
};

type EmbedBlock = BaseBlock<'embed'> & {
  embedUrl: string;
  caption: string;
};

type ImageBlock = BaseBlock<'image'> & {
  imageUrl: string;
  caption: string;
  altText: string;
};

type LinkBlock = BaseBlock<'link'> & {
  url: string;
  label: string;
  description: string;
};

type CourseBlock = TextBlock | AssetBlock | EmbedBlock | ImageBlock | LinkBlock;

type CourseNode = {
  id: string;
  parentId: string | null;
  order: number;
  title: string;
  slug: string;
  state: CourseNodeState;
  objectives: string;
  heroUrl: string;
  iconUrl: string;
  metadata: Record<string, unknown>;
  childFlags: ChildRelationshipFlags;
  blocks: CourseBlock[];
  children: CourseNode[];
};

type CourseTreeResponse = {
  nodes: CourseNode[];
};

type NodePayload = {
  id: string;
  parent_id: string | null;
  order: number;
  title: string;
  slug: string;
  state: CourseNodeState;
  objectives: string;
  hero_url: string;
  icon_url: string;
  metadata: Record<string, unknown>;
  child_flags: ChildRelationshipFlags;
  blocks: CourseBlock[];
  children?: NodePayload[];
};

const DEFAULT_CHILD_FLAGS: ChildRelationshipFlags = {
  isOptional: false,
  lockUntilPreviousComplete: false,
  allowSkip: false,
};

const EMPTY_TEXT_BLOCK = (): TextBlock => ({
  id: `temp-block-${crypto.randomUUID()}`,
  type: 'text',
  published: false,
  tags: [],
  text: '',
});

function cloneNode(node: CourseNode): CourseNode {
  return {
    ...node,
    metadata: JSON.parse(JSON.stringify(node.metadata ?? {})),
    childFlags: { ...node.childFlags },
    blocks: node.blocks.map((block) => ({
      ...block,
      tags: block.tags.map((tag) => ({ ...tag })),
    })),
    children: node.children.map((child) => cloneNode(child)),
  };
}

function normalizePayload(node: NodePayload): CourseNode {
  return {
    id: node.id,
    parentId: node.parent_id,
    order: node.order,
    title: node.title ?? '',
    slug: node.slug ?? '',
    state: node.state ?? 'draft',
    objectives: node.objectives ?? '',
    heroUrl: node.hero_url ?? '',
    iconUrl: node.icon_url ?? '',
    metadata: node.metadata ?? {},
    childFlags: node.child_flags ?? { ...DEFAULT_CHILD_FLAGS },
    blocks: (node.blocks ?? []).map((block) => ({
      ...block,
      tags: (block.tags ?? []).map((tag: ResourceTag) => ({ ...tag })),
    })),
    children: (node.children ?? []).map((child) => normalizePayload(child)),
  };
}

function findNode(nodes: CourseNode[], nodeId: string): CourseNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const found = findNode(node.children, nodeId);
    if (found) return found;
  }
  return null;
}

function updateTree(nodes: CourseNode[], nodeId: string, updater: (node: CourseNode) => CourseNode): CourseNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return updater(node);
    }
    if (node.children.length) {
      return {
        ...node,
        children: updateTree(node.children, nodeId, updater),
      };
    }
    return node;
  });
}

function removeNode(nodes: CourseNode[], nodeId: string): CourseNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: removeNode(node.children, nodeId),
    }))
    .filter((node) => node.id !== nodeId);
}

function insertChild(nodes: CourseNode[], parentId: string | null, newNode: CourseNode): CourseNode[] {
  if (parentId === null) {
    return [...nodes, newNode];
  }
  return nodes.map((node) => {
    if (node.id === parentId) {
      return {
        ...node,
        children: [...node.children, newNode],
      };
    }
    return {
      ...node,
      children: insertChild(node.children, parentId, newNode),
    };
  });
}

function replaceNode(nodes: CourseNode[], tempId: string, actual: CourseNode): CourseNode[] {
  return nodes.map((node) => {
    if (node.id === tempId) {
      return actual;
    }
    if (node.children.length) {
      return {
        ...node,
        children: replaceNode(node.children, tempId, actual),
      };
    }
    return node;
  });
}

function reorderSibling(nodes: CourseNode[], parentId: string | null, nodeId: string, direction: 'up' | 'down'): CourseNode[] {
  const reorderList = (list: CourseNode[]): CourseNode[] => {
    const idx = list.findIndex((item) => item.id === nodeId);
    if (idx === -1) return list;
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= list.length) return list;
    const copy = [...list];
    const [moving] = copy.splice(idx, 1);
    copy.splice(swapWith, 0, moving);
    return copy.map((item, index) => ({ ...item, order: index }));
  };

  if (parentId === null) {
    return reorderList(nodes);
  }

  return nodes.map((node) => {
    if (node.id === parentId) {
      return {
        ...node,
        children: reorderList(node.children),
      };
    }
    return {
      ...node,
      children: reorderSibling(node.children, parentId, nodeId, direction),
    };
  });
}

function safeParseJson(value: string): [Record<string, unknown> | null, string | null] {
  if (!value.trim()) return [{}, null];
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return [parsed as Record<string, unknown>, null];
    }
    return [null, 'Metadata must be a JSON object'];
  } catch (err) {
    return [null, (err as Error).message];
  }
}

function blockIcon(type: BlockType) {
  switch (type) {
    case 'asset':
      return <OndemandVideoIcon fontSize="small" />;
    case 'embed':
      return <InsertLinkIcon fontSize="small" />;
    case 'image':
      return <ImageIcon fontSize="small" />;
    case 'link':
      return <LinkIcon fontSize="small" />;
    default:
      return <TextFieldsIcon fontSize="small" />;
  }
}

type NodeEditorState = {
  title: string;
  slug: string;
  state: CourseNodeState;
  objectives: string;
  heroUrl: string;
  iconUrl: string;
  metadataInput: string;
  childFlags: ChildRelationshipFlags;
  blocks: CourseBlock[];
};

const buildNodeEditorState = (node: CourseNode | null): NodeEditorState | null => {
  if (!node) return null;
  return {
    title: node.title,
    slug: node.slug,
    state: node.state,
    objectives: node.objectives,
    heroUrl: node.heroUrl,
    iconUrl: node.iconUrl,
    metadataInput: JSON.stringify(node.metadata ?? {}, null, 2),
    childFlags: { ...node.childFlags },
    blocks: node.blocks.map((block) => ({
      ...block,
      tags: block.tags.map((tag) => ({ ...tag })),
    })),
  };
};

type TagDialogState = {
  open: boolean;
  blockId: string | null;
};

type ResourceDialogState = {
  open: boolean;
  blockId: string | null;
};

type LoadingState = {
  initial: boolean;
  refreshing: boolean;
};

export default function CourseBuilderAdmin() {
  const [tree, setTree] = useState<CourseNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeEditor, setNodeEditor] = useState<NodeEditorState | null>(null);
  const [loading, setLoading] = useState<LoadingState>({ initial: true, refreshing: false });
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>(
    { open: false, message: '', severity: 'success' }
  );
  const [pendingNodes, setPendingNodes] = useState<Set<string>>(new Set());
  const [tagDialog, setTagDialog] = useState<TagDialogState>({ open: false, blockId: null });
  const [resourceDialog, setResourceDialog] = useState<ResourceDialogState>({ open: false, blockId: null });
  const [availableTags, setAvailableTags] = useState<ResourceTag[]>([]);
  const [resourceSearch, setResourceSearch] = useState('');
  const [resourceResults, setResourceResults] = useState<ResourceSummary[]>([]);
  const [resourceLoading, setResourceLoading] = useState(false);

  const selectedNode = useMemo(() => (selectedNodeId ? findNode(tree, selectedNodeId) : null), [tree, selectedNodeId]);

  useEffect(() => {
    if (!selectedNode) {
      setNodeEditor(null);
      return;
    }
    setNodeEditor(buildNodeEditorState(selectedNode));
  }, [selectedNode]);

  const loadTags = useCallback(async () => {
    const { data, error: tagError } = await supabase.from('tags').select('id,name,category').order('name');
    if (tagError) {
      setSnack({ open: true, message: tagError.message, severity: 'error' });
      return;
    }
    setAvailableTags((data ?? []) as ResourceTag[]);
  }, []);

  useEffect(() => {
    loadTags().catch(() => {});
  }, [loadTags]);

  const fetchTree = useCallback(async (opts: { quiet?: boolean } = {}) => {
    setError(null);
    setLoading((prev) => ({ initial: prev.initial, refreshing: !prev.initial || !!opts.quiet }));
    try {
      const res = await fetch('/api/admin/course-builder/tree');
      const body: CourseTreeResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(body?.error || res.statusText);
      const nodes = (body.nodes ?? []).map((node) => normalizePayload(node as unknown as NodePayload));
      setTree(nodes);
      if (nodes.length && !selectedNodeId) {
        setSelectedNodeId(nodes[0].id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load course tree';
      setError(message);
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setLoading({ initial: false, refreshing: false });
    }
  }, [selectedNodeId]);

  useEffect(() => {
    fetchTree().catch(() => {});
  }, [fetchTree]);

  const setPending = useCallback((nodeId: string, value: boolean) => {
    setPendingNodes((prev) => {
      const next = new Set(prev);
      if (value) next.add(nodeId);
      else next.delete(nodeId);
      return next;
    });
  }, []);

  const createNode = useCallback(
    async (parentId: string | null) => {
      const tempId = `temp-node-${crypto.randomUUID()}`;
      const newNode: CourseNode = {
        id: tempId,
        parentId,
        order: 999,
        title: 'Untitled node',
        slug: '',
        state: 'draft',
        objectives: '',
        heroUrl: '',
        iconUrl: '',
        metadata: {},
        childFlags: { ...DEFAULT_CHILD_FLAGS },
        blocks: [EMPTY_TEXT_BLOCK()],
        children: [],
      };
      const optimistic = insertChild(tree, parentId, newNode);
      setTree(optimistic);
      setSelectedNodeId(tempId);
      try {
        const res = await fetch('/api/admin/course-builder/nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId, order: newNode.order, title: newNode.title }),
        });
        const body: { node?: NodePayload; error?: string } = await res.json();
        if (!res.ok) throw new Error(body?.error || res.statusText);
        if (!body.node) throw new Error('Missing node from response');
        const normalized = normalizePayload(body.node);
        setTree((prev) => replaceNode(prev, tempId, normalized));
        setSelectedNodeId(normalized.id);
        setSnack({ open: true, message: 'Node created', severity: 'success' });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create node';
        setTree((prev) => removeNode(prev, tempId));
        setSnack({ open: true, message, severity: 'error' });
      }
    },
    [tree]
  );

  const duplicateNode = useCallback(
    async (node: CourseNode) => {
      const tempId = `temp-node-${crypto.randomUUID()}`;
      const optimisticNode = { ...cloneNode(node), id: tempId, title: `${node.title} (copy)` };
      const optimistic = insertChild(tree, node.parentId, optimisticNode);
      setTree(optimistic);
      try {
        const res = await fetch(`/api/admin/course-builder/nodes/${node.id}/duplicate`, {
          method: 'POST',
        });
        const body: { node?: NodePayload; error?: string } = await res.json();
        if (!res.ok) throw new Error(body?.error || res.statusText);
        if (!body.node) throw new Error('Missing node from response');
        const normalized = normalizePayload(body.node);
        setTree((prev) => replaceNode(prev, tempId, normalized));
        setSelectedNodeId(normalized.id);
        setSnack({ open: true, message: 'Node duplicated', severity: 'success' });
      } catch (err: unknown) {
        setTree((prev) => removeNode(prev, tempId));
        const message = err instanceof Error ? err.message : 'Failed to duplicate node';
        setSnack({ open: true, message, severity: 'error' });
      }
    },
    [tree]
  );

  const deleteNode = useCallback(
    async (node: CourseNode) => {
      const { id } = node;
      const before = tree;
      setTree(removeNode(tree, id));
      try {
        const res = await fetch(`/api/admin/course-builder/nodes/${id}`, { method: 'DELETE' });
        const body: { error?: string } = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || res.statusText);
        setSnack({ open: true, message: 'Node deleted', severity: 'success' });
        if (selectedNodeId === id) setSelectedNodeId(null);
      } catch (err: unknown) {
        setTree(before);
        const message = err instanceof Error ? err.message : 'Failed to delete node';
        setSnack({ open: true, message, severity: 'error' });
      }
    },
    [selectedNodeId, tree]
  );

  const reorderNode = useCallback(
    async (node: CourseNode, direction: 'up' | 'down') => {
      const reordered = reorderSibling(tree, node.parentId, node.id, direction);
      if (reordered === tree) return;
      setTree(reordered);
      try {
        const res = await fetch(`/api/admin/course-builder/nodes/${node.id}/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction }),
        });
        const body: { error?: string } = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || res.statusText);
        setSnack({ open: true, message: 'Order updated', severity: 'success' });
      } catch (err: unknown) {
        setSnack({
          open: true,
          message: err instanceof Error ? err.message : 'Failed to reorder node',
          severity: 'error',
        });
        fetchTree({ quiet: true }).catch(() => {});
      }
    },
    [fetchTree, tree]
  );

  const handleSelectNode = (id: string) => {
    setSelectedNodeId(id);
  };

  const updateNodeEditor = <K extends keyof NodeEditorState>(key: K, value: NodeEditorState[K]) => {
    setNodeEditor((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
  };

  const updateBlock = (blockId: string, updater: (block: CourseBlock) => CourseBlock) => {
    setNodeEditor((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        blocks: prev.blocks.map((block) => (block.id === blockId ? updater(block) : block)),
      };
    });
  };

  const removeBlock = (blockId: string) => {
    setNodeEditor((prev) => {
      if (!prev) return prev;
      return { ...prev, blocks: prev.blocks.filter((block) => block.id !== blockId) };
    });
  };

  const addBlock = (type: BlockType) => {
    const baseId = `temp-block-${crypto.randomUUID()}`;
    const block: CourseBlock = (() => {
      switch (type) {
        case 'asset':
          return {
            id: baseId,
            type,
            published: false,
            tags: [],
            resourceId: null,
            resourceTitle: '',
            description: '',
          } satisfies AssetBlock;
        case 'embed':
          return {
            id: baseId,
            type,
            published: false,
            tags: [],
            embedUrl: '',
            caption: '',
          } satisfies EmbedBlock;
        case 'image':
          return {
            id: baseId,
            type,
            published: false,
            tags: [],
            imageUrl: '',
            caption: '',
            altText: '',
          } satisfies ImageBlock;
        case 'link':
          return {
            id: baseId,
            type,
            published: false,
            tags: [],
            url: '',
            label: '',
            description: '',
          } satisfies LinkBlock;
        default:
          return {
            id: baseId,
            type: 'text',
            published: false,
            tags: [],
            text: '',
          } satisfies TextBlock;
      }
    })();

    setNodeEditor((prev) => {
      if (!prev) return prev;
      return { ...prev, blocks: [...prev.blocks, block] };
    });
  };

  const handleSaveNode = async () => {
    if (!selectedNodeId || !nodeEditor) return;
    const [metadata, metadataError] = safeParseJson(nodeEditor.metadataInput);
    if (metadataError) {
      setSnack({ open: true, message: metadataError, severity: 'error' });
      return;
    }
    const payload = {
      title: nodeEditor.title,
      slug: nodeEditor.slug,
      state: nodeEditor.state,
      objectives: nodeEditor.objectives,
      heroUrl: nodeEditor.heroUrl,
      iconUrl: nodeEditor.iconUrl,
      metadata,
      childFlags: nodeEditor.childFlags,
      blocks: nodeEditor.blocks,
    };
    const optimistic = updateTree(tree, selectedNodeId, (node) => ({
      ...node,
      title: payload.title,
      slug: payload.slug,
      state: payload.state,
      objectives: payload.objectives,
      heroUrl: payload.heroUrl,
      iconUrl: payload.iconUrl,
      metadata: payload.metadata,
      childFlags: { ...payload.childFlags },
      blocks: payload.blocks.map((block) => ({
        ...block,
        tags: block.tags.map((tag) => ({ ...tag })),
      })),
    }));

    const before = tree;
    setTree(optimistic);
    setPending(selectedNodeId, true);
    try {
      const res = await fetch(`/api/admin/course-builder/nodes/${selectedNodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body: { node?: NodePayload; error?: string } = await res.json();
      if (!res.ok) throw new Error(body?.error || res.statusText);
      if (body.node) {
        const normalized = normalizePayload(body.node);
        setTree((prev) => replaceNode(prev, selectedNodeId, normalized));
      }
      setSnack({ open: true, message: 'Node saved', severity: 'success' });
    } catch (err: unknown) {
      setTree(before);
      const message = err instanceof Error ? err.message : 'Failed to save node';
      setSnack({ open: true, message, severity: 'error' });
    } finally {
      setPending(selectedNodeId, false);
    }
  };

  const toggleBlockPublish = (blockId: string) => {
    updateBlock(blockId, (block) => ({ ...block, published: !block.published }));
  };

  const openTagDialog = (blockId: string) => setTagDialog({ open: true, blockId });
  const closeTagDialog = () => setTagDialog({ open: false, blockId: null });
  const openResourceDialog = (blockId: string) => setResourceDialog({ open: true, blockId });
  const closeResourceDialog = () => setResourceDialog({ open: false, blockId: null });

  const handleToggleTag = (blockId: string, tag: ResourceTag) => {
    updateBlock(blockId, (block) => {
      const exists = block.tags.some((t) => t.id === tag.id);
      return {
        ...block,
        tags: exists ? block.tags.filter((t) => t.id !== tag.id) : [...block.tags, tag],
      };
    });
  };

  const runResourceQuery = useCallback(
    async (query: string) => {
      setResourceLoading(true);
      try {
        let builder = supabase
          .from('resources')
          .select('id,title,type,thumbnail,resource_tags(tag:tags(id,name,category))')
          .limit(25)
          .order('created_at', { ascending: false });
        if (query.trim()) {
          builder = builder.ilike('title', `%${query.trim()}%`);
        }
        const { data, error: resourceError } = await builder;
        if (resourceError) throw resourceError;
        const mapped: ResourceSummary[] = (data ?? []).map((row: ResourceRow) => ({
          id: row.id,
          title: row.title,
          type: row.type,
          thumbnail: row.thumbnail,
          tags: (row.resource_tags ?? []).map((entry) => entry.tag),
        }));
        setResourceResults(mapped);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load resources';
        setSnack({ open: true, message, severity: 'error' });
      } finally {
        setResourceLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!resourceDialog.open) return;
    runResourceQuery(resourceSearch).catch(() => {});
  }, [resourceDialog.open, resourceSearch, runResourceQuery]);

  const attachResource = (blockId: string, resource: ResourceSummary) => {
    updateBlock(blockId, (block) => {
      if (block.type !== 'asset') return block;
      return {
        ...block,
        resourceId: resource.id,
        resourceTitle: resource.title,
        tags: resource.tags.map((tag) => ({ ...tag })),
      } satisfies AssetBlock;
    });
    closeResourceDialog();
  };

  const renderBlockEditor = (block: CourseBlock) => {
    const commonHeader = (
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <ListItemIcon sx={{ minWidth: 32 }}>{blockIcon(block.type)}</ListItemIcon>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          {block.type.toUpperCase()}
        </Typography>
        <Tooltip title={block.published ? 'Unpublish block' : 'Publish block'}>
          <IconButton size="small" onClick={() => toggleBlockPublish(block.id)}>
            {block.published ? <ToggleOnIcon color="success" /> : <ToggleOffIcon color="action" />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Edit tags">
          <IconButton size="small" onClick={() => openTagDialog(block.id)}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Remove block">
          <IconButton size="small" onClick={() => removeBlock(block.id)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    );

    const tagList = (
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
        {block.tags.length === 0 && <Typography variant="caption">No tags selected</Typography>}
        {block.tags.map((tag) => (
          <Chip key={tag.id} size="small" label={tag.name} onDelete={() => handleToggleTag(block.id, tag)} />
        ))}
      </Stack>
    );

    switch (block.type) {
      case 'text':
        return (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }} key={block.id}>
            {commonHeader}
            {tagList}
            <TextField
              label="Body"
              value={block.text}
              onChange={(event) =>
                updateBlock(block.id, (current) => ({ ...current, text: event.target.value } as TextBlock))
              }
              multiline
              minRows={4}
              fullWidth
            />
          </Paper>
        );
      case 'asset':
        return (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }} key={block.id}>
            {commonHeader}
            {tagList}
            <Stack spacing={2}>
              <TextField
                label="Resource"
                value={block.resourceTitle || ''}
                InputProps={{ readOnly: true }}
                helperText={block.resourceId ? `Resource ID: ${block.resourceId}` : 'No resource linked'}
              />
              <Button variant="outlined" onClick={() => openResourceDialog(block.id)}>
                Choose resource
              </Button>
              <TextField
                label="Description"
                value={block.description}
                onChange={(event) =>
                  updateBlock(block.id, (current) => ({ ...current, description: event.target.value } as AssetBlock))
                }
                multiline
                minRows={2}
              />
            </Stack>
          </Paper>
        );
      case 'embed':
        return (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }} key={block.id}>
            {commonHeader}
            {tagList}
            <Stack spacing={2}>
              <TextField
                label="Embed URL"
                value={block.embedUrl}
                onChange={(event) =>
                  updateBlock(block.id, (current) => ({ ...current, embedUrl: event.target.value } as EmbedBlock))
                }
              />
              <TextField
                label="Caption"
                value={block.caption}
                onChange={(event) =>
                  updateBlock(block.id, (current) => ({ ...current, caption: event.target.value } as EmbedBlock))
                }
                multiline
                minRows={2}
              />
            </Stack>
          </Paper>
        );
      case 'image':
        return (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }} key={block.id}>
            {commonHeader}
            {tagList}
            <Stack spacing={2}>
              <TextField
                label="Image URL"
                value={block.imageUrl}
                onChange={(event) =>
                  updateBlock(block.id, (current) => ({ ...current, imageUrl: event.target.value } as ImageBlock))
                }
              />
              <TextField
                label="Caption"
                value={block.caption}
                onChange={(event) =>
                  updateBlock(block.id, (current) => ({ ...current, caption: event.target.value } as ImageBlock))
                }
              />
              <TextField
                label="Alt text"
                value={block.altText}
                onChange={(event) =>
                  updateBlock(block.id, (current) => ({ ...current, altText: event.target.value } as ImageBlock))
                }
              />
            </Stack>
          </Paper>
        );
      case 'link':
        return (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }} key={block.id}>
            {commonHeader}
            {tagList}
            <Stack spacing={2}>
              <TextField
                label="URL"
                value={block.url}
                onChange={(event) =>
                  updateBlock(block.id, (current) => ({ ...current, url: event.target.value } as LinkBlock))
                }
              />
              <TextField
                label="Label"
                value={block.label}
                onChange={(event) =>
                  updateBlock(block.id, (current) => ({ ...current, label: event.target.value } as LinkBlock))
                }
              />
              <TextField
                label="Description"
                value={block.description}
                onChange={(event) =>
                  updateBlock(block.id, (current) => ({ ...current, description: event.target.value } as LinkBlock))
                }
                multiline
                minRows={2}
              />
            </Stack>
          </Paper>
        );
      default:
        return null;
    }
  };

  return (
    <Stack spacing={3} sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <Typography variant="h5">Course builder</Typography>
        {(loading.initial || loading.refreshing) && <CircularProgress size={20} thickness={6} />}
        <Tooltip title="Refresh">
          <span>
            <IconButton onClick={() => fetchTree().catch(() => {})} disabled={loading.initial}>
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => createNode(null).catch(() => {})}>
          Add top-level node
        </Button>
      </Stack>

      {error && (
        <Alert severity="error">
          {error}
        </Alert>
      )}

      {loading.initial ? (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
          <Paper variant="outlined" sx={{ flexBasis: { md: '30%' }, flexShrink: 0, p: 1, width: '100%' }}>
            {tree.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No nodes yet. Create your first node to begin.
                </Typography>
              </Box>
            ) : (
              <CourseTree
                nodes={tree}
                selectedId={selectedNodeId}
                pendingIds={pendingNodes}
                onSelect={handleSelectNode}
                onAddChild={(nodeId) => createNode(nodeId).catch(() => {})}
                onDuplicate={(node) => duplicateNode(node).catch(() => {})}
                onDelete={(node) => deleteNode(node).catch(() => {})}
                onReorder={(node, direction) => reorderNode(node, direction).catch(() => {})}
              />
            )}
          </Paper>

          <Paper variant="outlined" sx={{ flexGrow: 1, p: 3, minHeight: 400 }}>
            {!selectedNodeId || !nodeEditor ? (
              <Typography variant="body2" color="text.secondary">
                Select a node from the tree to edit its details.
              </Typography>
            ) : (
              <Stack spacing={3}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    label="Title"
                    value={nodeEditor.title}
                    onChange={(event) => updateNodeEditor('title', event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Slug"
                    value={nodeEditor.slug}
                    onChange={(event) => updateNodeEditor('slug', event.target.value)}
                    fullWidth
                  />
                </Stack>

                <FormControl fullWidth>
                  <InputLabel id="node-state-label">State</InputLabel>
                  <Select
                    labelId="node-state-label"
                    label="State"
                    value={nodeEditor.state}
                    onChange={(event) => updateNodeEditor('state', event.target.value as CourseNodeState)}
                  >
                    {NODE_STATES.map((state) => (
                      <MenuItem key={state} value={state}>
                        {state}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  label="Objectives"
                  value={nodeEditor.objectives}
                  onChange={(event) => updateNodeEditor('objectives', event.target.value)}
                  multiline
                  minRows={3}
                />

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    label="Hero image URL"
                    value={nodeEditor.heroUrl}
                    onChange={(event) => updateNodeEditor('heroUrl', event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Icon URL"
                    value={nodeEditor.iconUrl}
                    onChange={(event) => updateNodeEditor('iconUrl', event.target.value)}
                    fullWidth
                  />
                </Stack>

                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Child relationship
                  </Typography>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={nodeEditor.childFlags.isOptional}
                          onChange={(event) =>
                            updateNodeEditor('childFlags', {
                              ...nodeEditor.childFlags,
                              isOptional: event.target.checked,
                            })
                          }
                        />
                      }
                      label="Optional"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={nodeEditor.childFlags.lockUntilPreviousComplete}
                          onChange={(event) =>
                            updateNodeEditor('childFlags', {
                              ...nodeEditor.childFlags,
                              lockUntilPreviousComplete: event.target.checked,
                            })
                          }
                        />
                      }
                      label="Lock until previous complete"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={nodeEditor.childFlags.allowSkip}
                          onChange={(event) =>
                            updateNodeEditor('childFlags', {
                              ...nodeEditor.childFlags,
                              allowSkip: event.target.checked,
                            })
                          }
                        />
                      }
                      label="Allow skip"
                    />
                  </Stack>
                </Box>

                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Metadata (JSON)
                  </Typography>
                  <TextField
                    value={nodeEditor.metadataInput}
                    onChange={(event) => updateNodeEditor('metadataInput', event.target.value)}
                    multiline
                    minRows={6}
                    fullWidth
                    placeholder={'{\n  "key": "value"\n}'}
                  />
                </Box>

                <Divider />

                <Box>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                    <Typography variant="h6">Blocks</Typography>
                    <Stack direction="row" spacing={1}>
                      {BLOCK_TYPES.map((type) => (
                        <Button key={type} variant="outlined" size="small" onClick={() => addBlock(type)}>
                          Add {type}
                        </Button>
                      ))}
                    </Stack>
                  </Stack>
                  {nodeEditor.blocks.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No blocks added yet.
                    </Typography>
                  ) : (
                    nodeEditor.blocks.map((block) => renderBlockEditor(block))
                  )}
                </Box>

                <Stack direction="row" spacing={2} justifyContent="flex-end">
                  <LoadingButton
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={() => handleSaveNode().catch(() => {})}
                    loading={pendingNodes.has(selectedNodeId)}
                  >
                    Save node
                  </LoadingButton>
                </Stack>
              </Stack>
            )}
          </Paper>
        </Stack>
      )}

      <TagSelectionDialog
        availableTags={availableTags}
        state={tagDialog}
        onClose={closeTagDialog}
        onToggle={(tag) => tagDialog.blockId && handleToggleTag(tagDialog.blockId, tag)}
        currentTags={
          tagDialog.blockId
            ? nodeEditor?.blocks.find((block) => block.id === tagDialog.blockId)?.tags ?? []
            : []
        }
      />

      <ResourcePickerDialog
        state={resourceDialog}
        onClose={closeResourceDialog}
        results={resourceResults}
        loading={resourceLoading}
        query={resourceSearch}
        onQueryChange={setResourceSearch}
        onSelect={(resource) => resourceDialog.blockId && attachResource(resourceDialog.blockId, resource)}
      />

      <Snackbar
        open={snack.open}
        autoHideDuration={6000}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      >
        <Alert
          severity={snack.severity}
          onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
          sx={{ width: '100%' }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}

type TagSelectionDialogProps = {
  state: TagDialogState;
  onClose: () => void;
  onToggle: (tag: ResourceTag) => void;
  availableTags: ResourceTag[];
  currentTags: ResourceTag[];
};

type CourseTreeProps = {
  nodes: CourseNode[];
  selectedId: string | null;
  pendingIds: Set<string>;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDuplicate: (node: CourseNode) => void;
  onDelete: (node: CourseNode) => void;
  onReorder: (node: CourseNode, direction: 'up' | 'down') => void;
  depth?: number;
};

function CourseTree({
  nodes,
  selectedId,
  pendingIds,
  onSelect,
  onAddChild,
  onDuplicate,
  onDelete,
  onReorder,
  depth = 0,
}: CourseTreeProps) {
  return (
    <List disablePadding>
      {nodes.map((node) => (
        <CourseTreeNode
          key={node.id}
          node={node}
          selectedId={selectedId}
          pendingIds={pendingIds}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onReorder={onReorder}
          depth={depth}
        />
      ))}
    </List>
  );
}

type CourseTreeNodeProps = {
  node: CourseNode;
  selectedId: string | null;
  pendingIds: Set<string>;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDuplicate: (node: CourseNode) => void;
  onDelete: (node: CourseNode) => void;
  onReorder: (node: CourseNode, direction: 'up' | 'down') => void;
  depth: number;
};

function CourseTreeNode({
  node,
  selectedId,
  pendingIds,
  onSelect,
  onAddChild,
  onDuplicate,
  onDelete,
  onReorder,
  depth,
}: CourseTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedId === node.id;
  const pending = pendingIds.has(node.id);
  const hasChildren = node.children.length > 0;

  const handleToggle = (event: MouseEvent) => {
    event.stopPropagation();
    setExpanded((prev) => !prev);
  };

  const handleSelect = () => onSelect(node.id);

  return (
    <Box component="div" sx={{ ml: depth * 2 }}>
      <ListItem disablePadding>
        <ListItemButton selected={isSelected} onClick={handleSelect} sx={{ alignItems: 'flex-start', py: 1 }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            {hasChildren ? (
              <IconButton size="small" onClick={handleToggle}>
                {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </IconButton>
            ) : (
              <Box sx={{ width: 24 }} />
            )}
          </ListItemIcon>
          <ListItemText
            primary={
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" fontWeight={600}>
                  {node.title || 'Untitled node'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {node.slug || '–'}
                </Typography>
                {pending && <CircularProgress size={14} thickness={6} />}
              </Stack>
            }
            secondary={
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
                <Chip size="small" label={node.state} />
                <Tooltip title="Add child">
                  <IconButton size="small" onClick={(event) => { event.stopPropagation(); onAddChild(node.id); }}>
                    <AddIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Duplicate">
                  <IconButton size="small" onClick={(event) => { event.stopPropagation(); onDuplicate(node); }}>
                    <ContentCopyIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Move up">
                  <IconButton size="small" onClick={(event) => { event.stopPropagation(); onReorder(node, 'up'); }}>
                    <ArrowUpwardIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Move down">
                  <IconButton size="small" onClick={(event) => { event.stopPropagation(); onReorder(node, 'down'); }}>
                    <ArrowDownwardIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton size="small" color="error" onClick={(event) => { event.stopPropagation(); onDelete(node); }}>
                    <DeleteIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
              </Stack>
            }
          />
        </ListItemButton>
      </ListItem>
      {hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <CourseTree
            nodes={node.children}
            selectedId={selectedId}
            pendingIds={pendingIds}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onReorder={onReorder}
            depth={depth + 1}
          />
        </Collapse>
      )}
    </Box>
  );
}

function TagSelectionDialog({ state, onClose, availableTags, currentTags, onToggle }: TagSelectionDialogProps) {
  const activeIds = new Set(currentTags.map((tag) => tag.id));
  return (
    <Dialog open={state.open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Select tags</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1}>
          {availableTags.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No tags available.
            </Typography>
          ) : (
            availableTags.map((tag) => (
              <Chip
                key={tag.id}
                label={tag.name}
                color={activeIds.has(tag.id) ? 'primary' : 'default'}
                onClick={() => onToggle(tag)}
              />
            ))
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

type ResourcePickerDialogProps = {
  state: ResourceDialogState;
  onClose: () => void;
  results: ResourceSummary[];
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (resource: ResourceSummary) => void;
};

function ResourcePickerDialog({
  state,
  onClose,
  results,
  loading,
  query,
  onQueryChange,
  onSelect,
}: ResourcePickerDialogProps) {
  return (
    <Dialog open={state.open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Select resource</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            label="Search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search resources"
          />
          {loading && <LinearProgress />}
          <Stack spacing={1}>
            {results.length === 0 && !loading && (
              <Typography variant="body2" color="text.secondary">
                No resources match your search.
              </Typography>
            )}
            {results.map((resource) => (
              <Paper
                key={resource.id}
                variant="outlined"
                sx={{ p: 2, cursor: 'pointer' }}
                onClick={() => onSelect(resource)}
              >
                <Typography variant="subtitle2">{resource.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {resource.type}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  {resource.tags.map((tag) => (
                    <Chip key={tag.id} size="small" label={tag.name} />
                  ))}
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
