'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArticleIcon from '@mui/icons-material/Article';
import LayersIcon from '@mui/icons-material/Layers';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import StorageIcon from '@mui/icons-material/Storage';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import EditIcon from '@mui/icons-material/Edit';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

import { supabase } from '@/lib/supabaseClient';
import { BlockRenderer } from '@/components/course/BlockRenderer';

import type { RenderableResource } from '@/components/course/BlockRenderer';

export type NodeType = 'course' | 'lesson' | 'chapter' | 'collection' | 'playlist';
export type NodeState = 'draft' | 'published' | 'archived';
export type BlockType = 'text' | 'asset' | 'divider';

type ContentNode = {
  id: number;
  node_type: NodeType;
  title: string;
  slug: string | null;
  state: NodeState;
  description: string | null;
  hero_image: string | null;
  icon: string | null;
  objectives: string | null;
  metadata: Record<string, unknown> | null;
  [key: string]: unknown;
};

type NodeChild = {
  parent_id: number;
  child_id: number;
  position: number;
  is_required: boolean | null;
  label: string | null;
  notes: string | null;
};

type ContentBlock = {
  id: number;
  node_id: number;
  block_type: BlockType;
  position: number;
  text_md: string | null;
  resource_id: number | null;
  start_ms: number | null;
  end_ms: number | null;
  label: string | null;
  notes: string | null;
  settings: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
};

type NodeSubtree = {
  node: ContentNode;
  blocks: ContentBlock[];
  children: Array<{
    edge: NodeChild;
    subtree: NodeSubtree;
  }>;
};

type NodeEdgeRule = {
  parent_type: string;
  child_kind: string;
  child_type: string;
};

type ResourceRow = {
  id: number;
  title: string;
  type: string | null;
  state: string | null;
  thumbnail: string | null;
  duration: number | null;
  url: string | null;
};

const NODE_ICONS: Partial<Record<NodeType, JSX.Element>> = {
  course: <MenuBookIcon fontSize="small" />,
  lesson: <ArticleIcon fontSize="small" />,
  chapter: <LayersIcon fontSize="small" />,
  collection: <CollectionsBookmarkIcon fontSize="small" />,
  playlist: <PlaylistPlayIcon fontSize="small" />,
};

const BLOCK_ICONS: Record<BlockType, JSX.Element> = {
  text: <TextFieldsIcon fontSize="small" />,
  asset: <VideoLibraryIcon fontSize="small" />,
  divider: <HorizontalRuleIcon fontSize="small" />,
};

const STATE_COLORS: Record<NodeState, 'default' | 'success' | 'warning'> = {
  draft: 'default',
  published: 'success',
  archived: 'warning',
};

function matchesQuery(value: string, query: string) {
  if (!query) return true;
  return value.toLowerCase().includes(query.toLowerCase());
}

function cloneSubtree(subtree: NodeSubtree): NodeSubtree {
  return {
    node: { ...subtree.node },
    blocks: subtree.blocks.map((block) => ({ ...block })),
    children: subtree.children.map((child) => ({
      edge: { ...child.edge },
      subtree: cloneSubtree(child.subtree),
    })),
  };
}

function replaceSubtree(tree: NodeSubtree, updated: NodeSubtree): { next: NodeSubtree; replaced: boolean } {
  if (tree.node.id === updated.node.id) {
    return { next: updated, replaced: true };
  }

  let replaced = false;
  const children = tree.children.map((child) => {
    const result = replaceSubtree(child.subtree, updated);
    if (result.replaced) {
      replaced = true;
      return {
        edge: { ...child.edge },
        subtree: result.next,
      };
    }
    return child;
  });

  if (!replaced) {
    return { next: tree, replaced: false };
  }

  return {
    next: {
      node: { ...tree.node },
      blocks: tree.blocks.map((block) => ({ ...block })),
      children,
    },
    replaced: true,
  };
}

function mergeSubtree(list: NodeSubtree[], updated: NodeSubtree) {
  let found = false;
  const next = list.map((tree) => {
    const result = replaceSubtree(tree, updated);
    if (result.replaced) {
      found = true;
      return result.next;
    }
    return tree;
  });

  if (!found) {
    next.push(updated);
  }

  return next;
}

function pruneTree(tree: NodeSubtree, nodeId: number): { next: NodeSubtree; removed: boolean } {
  let removed = false;
  const children = tree.children
    .map((child) => {
      if (child.subtree.node.id === nodeId) {
        removed = true;
        return null;
      }
      const result = pruneTree(child.subtree, nodeId);
      if (result.removed) {
        removed = true;
        return {
          edge: { ...child.edge },
          subtree: result.next,
        };
      }
      return child;
    })
    .filter(Boolean) as NodeSubtree['children'];

  if (!removed) {
    return { next: tree, removed: false };
  }

  return {
    next: {
      node: { ...tree.node },
      blocks: tree.blocks.map((block) => ({ ...block })),
      children,
    },
    removed: true,
  };
}

function removeSubtree(list: NodeSubtree[], nodeId: number) {
  const next: NodeSubtree[] = [];
  for (const tree of list) {
    if (tree.node.id === nodeId) {
      continue;
    }
    const result = pruneTree(tree, nodeId);
    if (result.removed) {
      next.push(result.next);
    } else {
      next.push(tree);
    }
  }
  return next;
}

function findSubtree(list: NodeSubtree[], nodeId: number): NodeSubtree | null {
  for (const tree of list) {
    if (tree.node.id === nodeId) return tree;
    for (const child of tree.children) {
      const found = findSubtree([child.subtree], nodeId);
      if (found) return found;
    }
  }
  return null;
}

function findParentEdge(list: NodeSubtree[], nodeId: number): NodeChild | null {
  for (const tree of list) {
    for (const child of tree.children) {
      if (child.edge.child_id === nodeId) {
        return child.edge;
      }
      const nested = findParentEdge([child.subtree], nodeId);
      if (nested) return nested;
    }
  }
  return null;
}

function collectStats(subtree: NodeSubtree) {
  const nodeCounts = new Map<string, number>();
  const blockCounts = new Map<string, number>();

  const walk = (node: NodeSubtree) => {
    const type = node.node.node_type ?? 'unknown';
    nodeCounts.set(type, (nodeCounts.get(type) ?? 0) + 1);
    for (const block of node.blocks) {
      const key = block.block_type ?? 'unknown';
      blockCounts.set(key, (blockCounts.get(key) ?? 0) + 1);
    }
    for (const child of node.children) {
      walk(child.subtree);
    }
  };

  walk(subtree);

  return {
    nodes: Array.from(nodeCounts.entries()).map(([type, count]) => ({ type, count })),
    blocks: Array.from(blockCounts.entries()).map(([type, count]) => ({ type, count })),
  };
}

function updateBlockDraft(subtree: NodeSubtree, blockId: number, updates: Partial<ContentBlock>): NodeSubtree {
  const blocks = subtree.blocks.map((block) => (block.id === blockId ? { ...block, ...updates } : block));
  const children = subtree.children.map((child) => ({
    edge: { ...child.edge },
    subtree: updateBlockDraft(child.subtree, blockId, updates),
  }));
  return {
    node: { ...subtree.node },
    blocks,
    children,
  };
}

function updateBlockAcrossTree(list: NodeSubtree[], blockId: number, updates: Partial<ContentBlock>) {
  return list.map((tree) => updateBlockDraft(tree, blockId, updates));
}

function updateNodeDraft(subtree: NodeSubtree, nodeId: number, updates: Partial<ContentNode>): NodeSubtree {
  const node = subtree.node.id === nodeId ? { ...subtree.node, ...updates } : { ...subtree.node };
  const children = subtree.children.map((child) => ({
    edge: { ...child.edge },
    subtree: updateNodeDraft(child.subtree, nodeId, updates),
  }));
  return {
    node,
    blocks: subtree.blocks.map((block) => ({ ...block })),
    children,
  };
}

function updateNodeAcrossTree(list: NodeSubtree[], nodeId: number, updates: Partial<ContentNode>) {
  return list.map((tree) => updateNodeDraft(tree, nodeId, updates));
}

function sortBlocks(blocks: ContentBlock[]) {
  return [...blocks].sort((a, b) => a.position - b.position);
}
type TreeNodeProps = {
  subtree: NodeSubtree;
  level: number;
  expanded: Set<number>;
  toggle: (id: number) => void;
  onSelect: (id: number) => void;
  selectedId: number | null;
  search: string;
  onMenu: (event: MouseEvent<HTMLElement>, nodeId: number) => void;
};

function TreeNode({ subtree, level, expanded, toggle, onSelect, selectedId, search, onMenu }: TreeNodeProps) {
  const hasChildren = subtree.children.length > 0;
  const isExpanded = expanded.has(subtree.node.id) || (!!search && hasChildren);
  const matches = matchesQuery(subtree.node.title ?? '', search);
  const childMatches = subtree.children.some((child) => matchesQuery(child.subtree.node.title ?? '', search));

  if (search && !matches && !childMatches) {
    return null;
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: level * 1.5, py: 0.5 }}>
        {hasChildren ? (
          <IconButton size="small" onClick={() => toggle(subtree.node.id)}>
            {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        ) : (
          <Box sx={{ width: 32 }} />
        )}
        <Chip
          size="small"
          icon={NODE_ICONS[subtree.node.node_type] ?? <StorageIcon fontSize="small" />}
          label={subtree.node.title ?? 'Untitled'}
          color={selectedId === subtree.node.id ? 'primary' : 'default'}
          onClick={() => onSelect(subtree.node.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            onMenu(event, subtree.node.id);
          }}
          sx={{
            maxWidth: '100%',
            '& .MuiChip-label': {
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          }}
        />
        <Chip size="small" label={subtree.node.state} color={STATE_COLORS[subtree.node.state]} variant="outlined" />
      </Stack>
      {hasChildren && isExpanded && (
        <Box>
          {subtree.children.map((child) => (
            <TreeNode
              key={child.subtree.node.id}
              subtree={child.subtree}
              level={level + 1}
              expanded={expanded}
              toggle={toggle}
              onSelect={onSelect}
              selectedId={selectedId}
              search={search}
              onMenu={onMenu}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
type ResourcePickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (resource: ResourceRow) => void;
};

function ResourcePickerDialog({ open, onClose, onSelect }: ResourcePickerProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ResourceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (term: string) => {
      setLoading(true);
      setError(null);
      try {
        let request = supabase
          .from('resources')
          .select('id,title,type,state,thumbnail,duration,url')
          .order('updated_at', { ascending: false })
          .limit(50);
        const trimmed = term.trim();
        if (trimmed) {
          request = request.ilike('title', `%${trimmed}%`);
        }
        const { data, error: fetchError } = await request;
        if (fetchError) {
          throw new Error(fetchError.message);
        }
        setRows((data ?? []) as ResourceRow[]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load resources';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (open) void load(query);
  }, [open, query, load]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Select a resource</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search resources"
            InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1 }} /> }}
          />
          {loading && (
            <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">
                Loading resources…
              </Typography>
            </Stack>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {!loading && !error && (
            <Stack spacing={2}>
              {rows.map((row) => (
                <Card
                  key={row.id}
                  variant="outlined"
                  sx={{ cursor: 'pointer' }}
                  onClick={() => {
                    onSelect(row);
                    onClose();
                  }}
                >
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ p: 2 }}>
                    {row.thumbnail && (
                      <Box
                        component="img"
                        src={row.thumbnail}
                        alt={row.title}
                        sx={{ width: 120, borderRadius: 1, objectFit: 'cover' }}
                      />
                    )}
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1">{row.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[row.type, row.state].filter(Boolean).join(' · ')}
                      </Typography>
                      {row.url && (
                        <Button
                          size="small"
                          endIcon={<OpenInNewIcon fontSize="small" />}
                          href={row.url ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          sx={{ mt: 1 }}
                        >
                          Open resource
                        </Button>
                      )}
                    </Box>
                  </Stack>
                </Card>
              ))}
              {rows.length === 0 && (
                <Typography variant="body2" color="text.secondary" align="center">
                  No resources found. Try a different search term.
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} startIcon={<CloseIcon />}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
type SnackbarState = { message: string; severity: 'success' | 'error' | 'info' } | null;

type DeleteDialogState = {
  open: boolean;
  nodeId: number | null;
  subtree: NodeSubtree | null;
};

type AddChildDialogState = {
  open: boolean;
  parentId: number | null;
  mode: 'create' | 'attach';
};

type DuplicateDialogState = {
  open: boolean;
  nodeId: number | null;
};

type SearchResultsState = {
  loading: boolean;
  rows: ContentNode[];
  error?: string | null;
};

type SavingState = 'idle' | 'saving' | 'saved' | 'error';

type NodeDraft = {
  title: string;
  slug: string;
  description: string;
  state: NodeState;
  hero_image: string;
  icon: string;
  objectives: string;
  metadata: string;
};
export default function CourseBuilderAdmin() {
  const [trees, setTrees] = useState<NodeSubtree[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<NodeEdgeRule[]>([]);
  const [snack, setSnack] = useState<SnackbarState>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuNodeId, setMenuNodeId] = useState<number | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({ open: false, nodeId: null, subtree: null });
  const [addChildDialog, setAddChildDialog] = useState<AddChildDialogState>({ open: false, parentId: null, mode: 'create' });
  const [duplicateDialog, setDuplicateDialog] = useState<DuplicateDialogState>({ open: false, nodeId: null });
  const [searchResults, setSearchResults] = useState<SearchResultsState>({ loading: false, rows: [] });
  const [newChildType, setNewChildType] = useState<string>('lesson');
  const [newChildTitle, setNewChildTitle] = useState('');
  const [attachQuery, setAttachQuery] = useState('');
  const [panelMode, setPanelMode] = useState<'node' | 'block'>('node');
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [resourceDialogMode, setResourceDialogMode] = useState<
    { type: 'insert'; nodeId: number; index: number } | { type: 'update'; blockId: number }
  | null>(null);
  const [insertMenu, setInsertMenu] = useState<{ anchor: HTMLElement; index: number } | null>(null);
  const [dragState, setDragState] = useState<{ blockId: number | null; overIndex: number | null }>({
    blockId: null,
    overIndex: null,
  });
  const [resourceCache, setResourceCache] = useState<Record<number, ResourceRow>>({});
  const [savingState, setSavingState] = useState<SavingState>('idle');
  const [savingMessage, setSavingMessage] = useState('All changes saved');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockUpdateQueue = useRef(new Map<number, Partial<ContentBlock>>());
  const blockDebounceTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nodeUpdateQueue = useRef(new Map<number, Partial<ContentNode>>());
  const nodeDebounceTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const optimisticSnapshot = useRef<NodeSubtree[] | null>(null);
  const [nodeDraft, setNodeDraft] = useState<NodeDraft | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(true);
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [treeRes, rulesRes] = await Promise.all([
        fetch('/api/admin/course-builder/nodes?rootType=course'),
        fetch('/api/admin/course-builder/rules'),
      ]);

      if (!treeRes.ok) {
        const body = await treeRes.json().catch(() => ({ error: 'Failed to load course tree' }));
        throw new Error(body.error ?? 'Failed to load course tree');
      }

      if (!rulesRes.ok) {
        const body = await rulesRes.json().catch(() => ({ error: 'Failed to load edge rules' }));
        throw new Error(body.error ?? 'Failed to load edge rules');
      }

      const treePayload = (await treeRes.json()) as { subtrees: NodeSubtree[] };
      const rulesPayload = (await rulesRes.json()) as { rules: NodeEdgeRule[] };

      setTrees(treePayload.subtrees ?? []);
      setRules(rulesPayload.rules ?? []);
      const first = treePayload.subtrees?.[0]?.node.id ?? null;
      setSelectedId(first);
      setSelectedBlockId(null);
      setExpanded(new Set(treePayload.subtrees.map((subtree) => subtree.node.id)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedSubtree = useMemo(() => {
    if (selectedId == null) return null;
    return findSubtree(trees, selectedId);
  }, [trees, selectedId]);

  const sortedBlocks = useMemo(() => {
    if (!selectedSubtree) return [];
    return sortBlocks(selectedSubtree.blocks);
  }, [selectedSubtree]);

  const selectedBlock = useMemo(() => {
    if (selectedBlockId == null || !selectedSubtree) return null;
    return selectedSubtree.blocks.find((block) => block.id === selectedBlockId) ?? null;
  }, [selectedBlockId, selectedSubtree]);

  useEffect(() => {
    if (!selectedSubtree) {
      setNodeDraft(null);
      return;
    }
    setNodeDraft({
      title: selectedSubtree.node.title ?? '',
      slug: selectedSubtree.node.slug ?? '',
      description: selectedSubtree.node.description ?? '',
      state: (selectedSubtree.node.state ?? 'draft') as NodeState,
      hero_image: selectedSubtree.node.hero_image ?? '',
      icon: selectedSubtree.node.icon ?? '',
      objectives: selectedSubtree.node.objectives ?? '',
      metadata: selectedSubtree.node.metadata ? JSON.stringify(selectedSubtree.node.metadata, null, 2) : '',
    });
    setPanelMode('node');
    setSelectedBlockId(null);
    setMetadataError(null);
    setShowMarkdownPreview(true);
    setEditingBlockId(null);
  }, [selectedSubtree]);

  useEffect(() => {
    if (!deleteDialog.open || !deleteDialog.subtree) {
      return;
    }
    setDeleteDialog((prev) => ({ ...prev, subtree: prev.subtree }));
  }, [deleteDialog.open, deleteDialog.subtree]);

  useEffect(() => {
    if (!selectedSubtree) return;
    const resourceIds = selectedSubtree.blocks
      .filter((block) => block.block_type === 'asset' && block.resource_id)
      .map((block) => block.resource_id!)
      .filter((id, index, arr) => arr.indexOf(id) === index);

    for (const id of resourceIds) {
      if (!resourceCache[id]) {
        void ensureResource(id);
      }
    }
  }, [selectedSubtree, resourceCache, ensureResource]);

  useEffect(() => {
    if (addChildDialog.open && addChildDialog.mode === 'attach' && addChildDialog.parentId != null) {
      setSearchResults((prev) => ({ ...prev, loading: true, error: null }));
      const controller = new AbortController();
      const load = async () => {
        try {
          const res = await fetch(
            `/api/admin/course-builder/nodes?search=${encodeURIComponent(attachQuery)}&excludeParent=${addChildDialog.parentId}`,
            { signal: controller.signal },
          );
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to search nodes' }));
            throw new Error(body.error ?? 'Failed to search nodes');
          }
          const data = (await res.json()) as { subtrees: NodeSubtree[] };
          const rows = (data.subtrees ?? []).map((subtree) => subtree.node);
          setSearchResults({ loading: false, rows });
        } catch (err) {
          if (controller.signal.aborted) return;
          const message = err instanceof Error ? err.message : 'Failed to search nodes';
          setSearchResults({ loading: false, rows: [], error: message });
        }
      };
      void load();
      return () => controller.abort();
    }
    if (!addChildDialog.open) {
      setSearchResults({ loading: false, rows: [] });
    }
  }, [addChildDialog, attachQuery]);

  const deleteStats = useMemo(() => {
    return deleteDialog.subtree ? collectStats(deleteDialog.subtree) : null;
  }, [deleteDialog.subtree]);

  const availableChildTypes = useMemo(() => {
    if (!selectedSubtree) return [] as string[];
    return rules
      .filter((rule) => rule.parent_type === selectedSubtree.node.node_type && rule.child_kind === 'node')
      .map((rule) => rule.child_type);
  }, [rules, selectedSubtree]);

  useEffect(() => {
    if (addChildDialog.open && addChildDialog.mode === 'create') {
      setNewChildType(availableChildTypes[0] ?? 'lesson');
      setNewChildTitle('');
    }
  }, [addChildDialog.open, addChildDialog.mode, availableChildTypes]);

  const startSaving = useCallback((message?: string) => {
    setSavingState('saving');
    setSavingMessage(message ?? 'Saving…');
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const completeSaving = useCallback((message?: string) => {
    setSavingState('saved');
    setSavingMessage(message ?? 'Changes saved');
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      setSavingState('idle');
      setSavingMessage('All changes saved');
    }, 2000);
  }, []);

  const failSaving = useCallback((message?: string) => {
    setSavingState('error');
    setSavingMessage(message ?? 'Failed to save changes');
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const blockTimers = blockDebounceTimers.current;
    const nodeTimers = nodeDebounceTimers.current;
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      blockTimers.forEach((timer) => clearTimeout(timer));
      nodeTimers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleMenu = useCallback((event: MouseEvent<HTMLElement>, nodeId: number) => {
    setMenuAnchor(event.currentTarget);
    setMenuNodeId(nodeId);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuAnchor(null);
    setMenuNodeId(null);
  }, []);

  const runMutation = useCallback(
    async (
      request: () => Promise<NodeSubtree | { subtree?: NodeSubtree; parentSubtree?: NodeSubtree | null }>,
      options: {
        optimistic?: (prev: NodeSubtree[]) => NodeSubtree[];
        message?: string;
        savingMessage?: string;
        silent?: boolean;
      } = {},
    ) => {
      if (options.optimistic) {
        setTrees((prev) => {
          optimisticSnapshot.current = prev.map((tree) => cloneSubtree(tree));
          return options.optimistic ? options.optimistic(prev) : prev;
        });
      }

      startSaving(options.savingMessage);

      try {
        const payload = await request();
        setTrees((prev) => {
          if ('subtree' in payload && payload.subtree) {
            return mergeSubtree(prev, payload.subtree);
          }
          if ('parentSubtree' in payload) {
            const parentSubtree = payload.parentSubtree;
            if (!parentSubtree) {
              return removeSubtree(prev, payload.subtree?.node.id ?? -1);
            }
            return mergeSubtree(prev.filter((tree) => tree.node.id !== parentSubtree.node.id), parentSubtree);
          }
          return mergeSubtree(prev, payload as NodeSubtree);
        });
        if (options.message) {
          setSnack({ message: options.message, severity: 'success' });
        }
        completeSaving();
        optimisticSnapshot.current = null;
        return payload;
      } catch (err) {
        if (optimisticSnapshot.current) {
          setTrees(optimisticSnapshot.current);
        }
        optimisticSnapshot.current = null;
        const message = err instanceof Error ? err.message : 'Failed to save changes';
        failSaving(message);
        if (!options.silent) {
          setSnack({ message, severity: 'error' });
        }
        throw err;
      }
    },
    [completeSaving, failSaving, startSaving],
  );

  const ensureResource = useCallback(
    async (resourceId: number) => {
      if (resourceCache[resourceId]) {
        return resourceCache[resourceId];
      }
      const { data, error: fetchError } = await supabase
        .from('resources')
        .select('id,title,type,state,thumbnail,duration,url')
        .eq('id', resourceId)
        .maybeSingle();
      if (fetchError) {
        throw new Error(fetchError.message);
      }
      if (data) {
        const row = data as ResourceRow;
        setResourceCache((prev) => ({ ...prev, [resourceId]: row }));
        return row;
      }
      return null;
    },
    [resourceCache],
  );

  const flushBlockUpdate = useCallback(
    async (blockId: number) => {
      const pending = blockUpdateQueue.current.get(blockId);
      if (!pending) return;
      blockUpdateQueue.current.delete(blockId);
      const timer = blockDebounceTimers.current.get(blockId);
      if (timer) {
        clearTimeout(timer);
        blockDebounceTimers.current.delete(blockId);
      }

      await runMutation(
        async () => {
          const res = await fetch(`/api/admin/course-builder/blocks/${blockId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: pending }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to update block' }));
            throw new Error(body.error ?? 'Failed to update block');
          }
          return (await res.json()) as { subtree: NodeSubtree };
        },
        { silent: true },
      );
    },
    [runMutation],
  );

  const queueBlockUpdate = useCallback(
    (blockId: number, updates: Partial<ContentBlock>, options: { debounce?: boolean } = { debounce: true }) => {
      setTrees((prev) => {
        if (!optimisticSnapshot.current) {
          optimisticSnapshot.current = prev.map((tree) => cloneSubtree(tree));
        }
        return updateBlockAcrossTree(prev, blockId, updates);
      });
      const current = blockUpdateQueue.current.get(blockId) ?? {};
      blockUpdateQueue.current.set(blockId, { ...current, ...updates });

      if (options.debounce) {
        const existing = blockDebounceTimers.current.get(blockId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          void flushBlockUpdate(blockId);
        }, 800);
        blockDebounceTimers.current.set(blockId, timer);
      } else {
        void flushBlockUpdate(blockId);
      }
    },
    [flushBlockUpdate],
  );

  const flushNodeUpdate = useCallback(
    async (nodeId: number) => {
      const pending = nodeUpdateQueue.current.get(nodeId);
      if (!pending) return;
      nodeUpdateQueue.current.delete(nodeId);
      const timer = nodeDebounceTimers.current.get(nodeId);
      if (timer) {
        clearTimeout(timer);
        nodeDebounceTimers.current.delete(nodeId);
      }

      await runMutation(
        async () => {
          const res = await fetch(`/api/admin/course-builder/nodes/${nodeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: pending }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to update node' }));
            throw new Error(body.error ?? 'Failed to update node');
          }
          return (await res.json()) as { subtree: NodeSubtree };
        },
        { silent: true },
      );
    },
    [runMutation],
  );

  const queueNodeUpdate = useCallback(
    (nodeId: number, updates: Partial<ContentNode>, options: { debounce?: boolean } = { debounce: true }) => {
      setTrees((prev) => {
        if (!optimisticSnapshot.current) {
          optimisticSnapshot.current = prev.map((tree) => cloneSubtree(tree));
        }
        return updateNodeAcrossTree(prev, nodeId, updates);
      });
      const current = nodeUpdateQueue.current.get(nodeId) ?? {};
      nodeUpdateQueue.current.set(nodeId, { ...current, ...updates });

      if (options.debounce) {
        const existing = nodeDebounceTimers.current.get(nodeId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          void flushNodeUpdate(nodeId);
        }, 800);
        nodeDebounceTimers.current.set(nodeId, timer);
      } else {
        void flushNodeUpdate(nodeId);
      }
    },
    [flushNodeUpdate],
  );

  const handleSelectBlock = useCallback((blockId: number) => {
    setSelectedBlockId(blockId);
    setPanelMode('block');
    setPropertiesOpen(true);
    setEditingBlockId(null);
  }, []);

  const handleReorderBlocksToIndex = useCallback(
    async (blockId: number, targetIndex: number) => {
      if (!selectedSubtree) return;
      const ordered = sortBlocks(selectedSubtree.blocks);
      const currentIndex = ordered.findIndex((block) => block.id === blockId);
      if (currentIndex === -1) return;

      const nextOrder = [...ordered];
      const [moved] = nextOrder.splice(currentIndex, 1);
      let insertIndex = targetIndex;
      if (targetIndex > currentIndex) {
        insertIndex = Math.max(0, targetIndex - 1);
      }
      insertIndex = Math.min(Math.max(insertIndex, 0), nextOrder.length);
      nextOrder.splice(insertIndex, 0, moved);

      const withPositions = nextOrder.map((block, index) => ({ ...block, position: index }));
      const updates = withPositions.map((block) => ({ block_id: block.id, position: block.position }));

      await runMutation(
        async () => {
          const res = await fetch(`/api/admin/course-builder/nodes/${selectedSubtree.node.id}/blocks/reorder`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to reorder blocks' }));
            throw new Error(body.error ?? 'Failed to reorder blocks');
          }
          return (await res.json()) as { subtree: NodeSubtree };
        },
        {
          optimistic: (prev) => {
            const snapshot = prev.map((tree) => cloneSubtree(tree));
            const target = findSubtree(snapshot, selectedSubtree.node.id);
            if (target) {
              target.blocks = withPositions;
            }
            return snapshot;
          },
          silent: true,
        },
      );
    },
    [runMutation, selectedSubtree],
  );

  const handleDeleteBlock = useCallback(
    async (blockId: number) => {
      await runMutation(
        async () => {
          const res = await fetch(`/api/admin/course-builder/blocks/${blockId}`, { method: 'DELETE' });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to delete block' }));
            throw new Error(body.error ?? 'Failed to delete block');
          }
          return (await res.json()) as { subtree: NodeSubtree };
        },
        { message: 'Block deleted' },
      );
      if (selectedBlockId === blockId) {
        setSelectedBlockId(null);
        setPanelMode('node');
      }
    },
    [runMutation, selectedBlockId],
  );

  const handleCreateBlock = useCallback(
    async (nodeId: number, block: Partial<ContentBlock> & { block_type: BlockType }, position: number) => {
      const beforeIds = findSubtree(trees, nodeId)?.blocks.map((row) => row.id) ?? [];
      const payload = await runMutation(
        async () => {
          const res = await fetch(`/api/admin/course-builder/nodes/${nodeId}/blocks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ block: { ...block, position } }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to create block' }));
            throw new Error(body.error ?? 'Failed to create block');
          }
          return (await res.json()) as { subtree: NodeSubtree };
        },
        { message: 'Block created', savingMessage: 'Creating block…' },
      );

      const subtree = 'subtree' in payload && payload.subtree ? payload.subtree : (payload as NodeSubtree);
      const newBlock = subtree.blocks.find((row) => !beforeIds.includes(row.id));
      if (newBlock) {
        setSelectedBlockId(newBlock.id);
        setPanelMode('block');
        setPropertiesOpen(true);
        setEditingBlockId(newBlock.id);
      }
    },
    [runMutation, trees],
  );

  const handleAddBlockAt = useCallback(
    (index: number, type: BlockType) => {
      if (!selectedSubtree) return;
      setInsertMenu(null);
      if (type === 'asset') {
        setResourceDialogMode({ type: 'insert', nodeId: selectedSubtree.node.id, index });
        setResourceDialogOpen(true);
        return;
      }

      const baseText = 'Start writing your content…';
      const payload: Partial<ContentBlock> & { block_type: BlockType } =
        type === 'text'
          ? { block_type: 'text', text_md: baseText }
          : { block_type: 'divider' };
      void handleCreateBlock(selectedSubtree.node.id, payload, index);
    },
    [handleCreateBlock, selectedSubtree],
  );

  const handleResourceSelected = useCallback(
    (resource: ResourceRow) => {
      setResourceCache((prev) => ({ ...prev, [resource.id]: resource }));
      if (!resourceDialogMode) return;
      if (resourceDialogMode.type === 'insert') {
        void handleCreateBlock(
          resourceDialogMode.nodeId,
          { block_type: 'asset', resource_id: resource.id },
          resourceDialogMode.index,
        );
      } else if (resourceDialogMode.type === 'update') {
        queueBlockUpdate(resourceDialogMode.blockId, { resource_id: resource.id }, { debounce: false });
      }
      setResourceDialogMode(null);
      setResourceDialogOpen(false);
    },
    [handleCreateBlock, queueBlockUpdate, resourceDialogMode],
  );

  const handleNodeFieldChange = useCallback(
    (field: keyof NodeDraft, value: string) => {
      if (!selectedSubtree) return;
      setNodeDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
      const nodeId = selectedSubtree.node.id;
      if (field === 'metadata') {
        if (!value.trim()) {
          setMetadataError(null);
          queueNodeUpdate(nodeId, { metadata: null });
          return;
        }
        try {
          const parsed = JSON.parse(value);
          setMetadataError(null);
          queueNodeUpdate(nodeId, { metadata: parsed });
        } catch {
          setMetadataError('Metadata must be valid JSON');
        }
        return;
      }

      if (field === 'state') {
        queueNodeUpdate(nodeId, { state: value as NodeState }, { debounce: false });
        return;
      }

      const mapped: Partial<ContentNode> = {
        [field]: value ? value : null,
      } as Partial<ContentNode>;
      queueNodeUpdate(nodeId, mapped);
    },
    [queueNodeUpdate, selectedSubtree],
  );

  const handleAddChild = useCallback(
    async (parentId: number | null, payload: { node_type: string; title: string }) => {
      await runMutation(
        async () => {
          const res = await fetch('/api/admin/course-builder/nodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node: payload, parent: parentId ? { parent_id: parentId } : null }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to create node' }));
            throw new Error(body.error ?? 'Failed to create node');
          }
          return (await res.json()) as { subtree: NodeSubtree };
        },
        { message: 'Node created', savingMessage: 'Creating node…' },
      );
    },
    [runMutation],
  );

  const handleAttachExisting = useCallback(
    async (parentId: number, childId: number) => {
      await runMutation(
        async () => {
          const res = await fetch(`/api/admin/course-builder/nodes/${parentId}/children`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ child_id: childId }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to attach child' }));
            throw new Error(body.error ?? 'Failed to attach child');
          }
          return (await res.json()) as { subtree: NodeSubtree };
        },
        { message: 'Child attached' },
      );
    },
    [runMutation],
  );

  const handleDuplicate = useCallback(
    async (nodeId: number, parentId: number | null) => {
      await runMutation(
        async () => {
          const res = await fetch(`/api/admin/course-builder/nodes/${nodeId}/duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent: parentId ? { parent_id: parentId } : null }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to duplicate node' }));
            throw new Error(body.error ?? 'Failed to duplicate node');
          }
          return (await res.json()) as { subtree: NodeSubtree };
        },
        { message: 'Node duplicated', savingMessage: 'Duplicating node…' },
      );
    },
    [runMutation],
  );

  const handleRemoveChild = useCallback(
    async (parentId: number, childId: number) => {
      await runMutation(
        async () => {
          const res = await fetch(`/api/admin/course-builder/nodes/${parentId}/children/${childId}`, { method: 'DELETE' });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to remove child' }));
            throw new Error(body.error ?? 'Failed to remove child');
          }
          return (await res.json()) as { subtree: NodeSubtree };
        },
        { message: 'Child removed' },
      );
    },
    [runMutation],
  );

  const handleDeleteNode = useCallback(
    async (nodeId: number) => {
      const parentEdge = findParentEdge(trees, nodeId);
      await runMutation(
        async () => {
          const res = await fetch(`/api/admin/course-builder/nodes/${nodeId}`, { method: 'DELETE' });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to delete node' }));
            throw new Error(body.error ?? 'Failed to delete node');
          }
          return (await res.json()) as { parentSubtree: NodeSubtree | null };
        },
        {
          message: 'Node deleted',
          optimistic: (prev) => removeSubtree(prev, nodeId),
        },
      );
      setSelectedId(parentEdge ? parentEdge.parent_id : null);
      setSelectedBlockId(null);
      setPanelMode('node');
    },
    [runMutation, trees],
  );

  const handleReorderChild = useCallback(
    async (parentId: number, childId: number, direction: 'up' | 'down') => {
      const parent = findSubtree(trees, parentId);
      if (!parent) return;
      const children = [...parent.children].sort((a, b) => a.edge.position - b.edge.position);
      const index = children.findIndex((child) => child.edge.child_id === childId);
      const swapWith = direction === 'up' ? index - 1 : index + 1;
      if (swapWith < 0 || swapWith >= children.length) return;

      const reordered = [...children];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(swapWith, 0, moved);

      const updates = reordered.map((child, idx) => ({ child_id: child.edge.child_id, position: idx }));

      await runMutation(
        async () => {
          const res = await fetch(`/api/admin/course-builder/nodes/${parentId}/children/reorder`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to reorder children' }));
            throw new Error(body.error ?? 'Failed to reorder children');
          }
          return (await res.json()) as { subtree: NodeSubtree };
        },
        {
          optimistic: (prev) => {
            const snapshot = prev.map((tree) => cloneSubtree(tree));
            const target = findSubtree(snapshot, parentId);
            if (target) {
              target.children = reordered.map((child, idx) => ({
                edge: { ...child.edge, position: idx },
                subtree: child.subtree,
              }));
            }
            return snapshot;
          },
        },
      );
    },
    [runMutation, trees],
  );

  const handleUpdateChild = useCallback(
    async (parentId: number, child: NodeSubtree['children'][number], updates: Partial<NodeChild>) => {
      await runMutation(
        async () => {
          const res = await fetch(`/api/admin/course-builder/nodes/${parentId}/children/reorder`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              updates: [
                {
                  child_id: child.edge.child_id,
                  position: child.edge.position,
                  ...updates,
                },
              ],
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to update child' }));
            throw new Error(body.error ?? 'Failed to update child');
          }
          return (await res.json()) as { subtree: NodeSubtree };
        },
        { silent: true },
      );
    },
    [runMutation],
  );

  if (loading) {
    return (
      <Paper sx={{ p: 4, display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress />
          <Typography variant="body2">Loading course builder…</Typography>
        </Stack>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button startIcon={<RefreshIcon />} onClick={() => void loadData()}>
          Retry
        </Button>
      </Paper>
    );
  }

  const canEditBlocks = !!selectedSubtree && selectedSubtree.children.length === 0;
  const resourceForBlock = (block: ContentBlock): RenderableResource | null => {
    if (!block.resource_id) return null;
    return resourceCache[block.resource_id] ?? null;
  };

  const renderDropZone = (index: number) => (
    <Box
      key={`drop-${index}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragState((prev) => ({ ...prev, overIndex: index }));
      }}
      onDragLeave={() => setDragState((prev) => ({ ...prev, overIndex: prev.overIndex === index ? null : prev.overIndex }))}
      onDrop={(event) => {
        event.preventDefault();
        if (dragState.blockId != null) {
          void handleReorderBlocksToIndex(dragState.blockId, index);
        }
        setDragState({ blockId: null, overIndex: null });
      }}
      sx={{
        position: 'relative',
        my: 1,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <Button
        variant="outlined"
        size="small"
        startIcon={<AddIcon />}
        onClick={(event) => {
          setInsertMenu({ anchor: event.currentTarget, index });
        }}
      >
        Add block
      </Button>
      {dragState.overIndex === index && (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: 12,
            right: 12,
            height: 2,
            bgcolor: 'primary.main',
          }}
        />
      )}
    </Box>
  );

  const renderBlockCard = (block: ContentBlock, index: number) => {
    const isSelected = selectedBlockId === block.id;
    const isText = block.block_type === 'text';
    const isEditing = editingBlockId === block.id;
    return (
      <Box
        key={block.id}
        sx={{
          position: 'relative',
          borderRadius: 2,
          border: '1px solid',
          borderColor: isSelected ? 'primary.main' : 'transparent',
          bgcolor: isSelected ? 'action.hover' : 'background.paper',
          px: 4,
          py: 3,
          transition: 'border-color 0.2s ease, background-color 0.2s ease',
          '&:hover .block-controls': { opacity: 1 },
          cursor: 'pointer',
        }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          setDragState({ blockId: block.id, overIndex: null });
        }}
        onDragEnd={() => setDragState({ blockId: null, overIndex: null })}
        onClick={() => handleSelectBlock(block.id)}
      >
        <Box
          className="block-handle"
          sx={{
            position: 'absolute',
            left: 12,
            top: 16,
            opacity: 0.4,
            display: 'flex',
            alignItems: 'center',
            '&:hover': { opacity: 1 },
          }}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
        <Stack direction="row" spacing={1} className="block-controls" sx={{ position: 'absolute', right: 12, top: 12, opacity: 0 }}>
          {isText && (
            <Tooltip title={isEditing ? 'Stop editing' : 'Edit inline'}>
              <IconButton
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingBlockId(isEditing ? null : block.id);
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Delete block">
            <IconButton
              size="small"
              color="error"
              onClick={(event) => {
                event.stopPropagation();
                void handleDeleteBlock(block.id);
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Stack spacing={2}>
          <Chip
            size="small"
            icon={BLOCK_ICONS[block.block_type]}
            label={`${block.block_type.toUpperCase()} · #${index + 1}`}
            variant="outlined"
            sx={{ alignSelf: 'flex-start' }}
          />
          {block.label && (
            <Typography variant="subtitle2" color="text.secondary">
              {block.label}
            </Typography>
          )}
          {isText && isEditing ? (
            <TextField
              multiline
              minRows={6}
              value={block.text_md ?? ''}
              onChange={(event) => queueBlockUpdate(block.id, { text_md: event.target.value })}
              onBlur={() => setEditingBlockId(null)}
              autoFocus
            />
          ) : (
            <BlockRenderer block={block} resource={resourceForBlock(block)} />
          )}
        </Stack>
      </Box>
    );
  };

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            lg: propertiesOpen ? '260px minmax(0,1fr) 320px' : '260px minmax(0,1fr)',
          },
          alignItems: 'start',
        }}
      >
        <Paper variant="outlined" sx={{ p: 2, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          <Stack spacing={2}>
            <TextField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search nodes"
              InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1 }} /> }}
            />
            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                startIcon={<AddIcon />}
                onClick={() => setAddChildDialog({ open: true, parentId: null, mode: 'create' })}
              >
                Add Course
              </Button>
              <Tooltip title="Refresh">
                <IconButton onClick={() => void loadData()}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Stack>
            <Divider />
            {trees.map((tree) => (
              <TreeNode
                key={tree.node.id}
                subtree={tree}
                level={0}
                expanded={expanded}
                toggle={toggleExpand}
                onSelect={(id) => {
                  setSelectedId(id);
                  setPanelMode('node');
                  setSelectedBlockId(null);
                }}
                selectedId={selectedId}
                search={search}
                onMenu={handleMenu}
              />
            ))}
          </Stack>
        </Paper>

        <Stack spacing={2} sx={{ minHeight: 'calc(100vh - 200px)' }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            {selectedSubtree ? (
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
                <Stack spacing={0.5}>
                  <Typography variant="h6">{selectedSubtree.node.title ?? 'Untitled node'}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedSubtree.node.node_type}
                  </Typography>
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={nodeDraft?.state ?? selectedSubtree.node.state}
                    onChange={(_, value) => value && handleNodeFieldChange('state', value)}
                  >
                    <ToggleButton value="draft">Draft</ToggleButton>
                    <ToggleButton value="published">Published</ToggleButton>
                    <ToggleButton value="archived">Archived</ToggleButton>
                  </ToggleButtonGroup>
                  <Button variant="outlined" onClick={() => { setPanelMode('node'); setPropertiesOpen(true); }}>
                    Node details
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<TextFieldsIcon />}
                    disabled={!canEditBlocks}
                    onClick={() => {
                      if (!selectedSubtree) return;
                      handleAddBlockAt(sortedBlocks.length, 'text');
                    }}
                    sx={{ display: { xs: 'none', md: 'inline-flex' } }}
                  >
                    Quick text block
                  </Button>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {savingState === 'saving' && <CircularProgress size={16} />}
                    {savingState === 'saved' && <CheckCircleOutlineIcon color="success" fontSize="small" />}
                    {savingState === 'error' && <ErrorOutlineIcon color="error" fontSize="small" />}
                    <Typography variant="caption" color="text.secondary">
                      {savingMessage}
                    </Typography>
                  </Stack>
                </Stack>
              </Stack>
            ) : (
              <Typography color="text.secondary">Select a node to begin editing.</Typography>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 3, flex: 1, overflowY: 'auto' }}>
            {selectedSubtree ? (
              <Box sx={{ maxWidth: 820, mx: 'auto' }}>
                {canEditBlocks ? (
                  <Stack spacing={2}>
                    {renderDropZone(0)}
                    {sortedBlocks.map((block, index) => (
                      <Stack key={block.id} spacing={2}>
                        {renderBlockCard(block, index)}
                        {renderDropZone(index + 1)}
                      </Stack>
                    ))}
                    {sortedBlocks.length === 0 && (
                      <Alert severity="info" sx={{ mt: 2 }}>
                        This node has no content blocks yet. Use the add buttons to get started.
                      </Alert>
                    )}
                  </Stack>
                ) : (
                  <Alert severity="info">
                    Content blocks are available only for nodes without child nodes. Select a lesson or chapter leaf node to edit blocks.
                  </Alert>
                )}
              </Box>
            ) : (
              <Typography color="text.secondary">Select a node from the tree to preview its content.</Typography>
            )}
          </Paper>
        </Stack>

        {propertiesOpen && (
          <Paper variant="outlined" sx={{ p: 3, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="subtitle1">
                {panelMode === 'block' && selectedBlock ? 'Block properties' : 'Node details'}
              </Typography>
              <Tooltip title="Collapse panel">
                <IconButton size="small" onClick={() => setPropertiesOpen(false)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>

            {panelMode === 'block' && selectedBlock ? (
              <Stack spacing={2}>
                <Typography variant="subtitle2">Block #{selectedBlock.position + 1}</Typography>
                {selectedBlock.block_type === 'text' && (
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        variant={showMarkdownPreview ? 'outlined' : 'contained'}
                        size="small"
                        onClick={() => setShowMarkdownPreview((prev) => !prev)}
                      >
                        {showMarkdownPreview ? 'Edit raw markdown' : 'Show preview'}
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          setEditingBlockId(selectedBlock.id);
                          setPanelMode('block');
                        }}
                      >
                        Edit inline
                      </Button>
                    </Stack>
                    {!showMarkdownPreview ? (
                      <TextField
                        multiline
                        minRows={8}
                        value={selectedBlock.text_md ?? ''}
                        onChange={(event) => queueBlockUpdate(selectedBlock.id, { text_md: event.target.value })}
                      />
                    ) : (
                      <BlockRenderer block={selectedBlock} resource={null} />
                    )}
                  </Stack>
                )}

                {selectedBlock.block_type === 'asset' && (
                  <Stack spacing={2}>
                    <Button
                      variant="outlined"
                      startIcon={<SearchIcon />}
                      onClick={() => {
                        setResourceDialogMode({ type: 'update', blockId: selectedBlock.id });
                        setResourceDialogOpen(true);
                      }}
                    >
                      {selectedBlock.resource_id ? 'Change resource' : 'Select resource'}
                    </Button>
                    {selectedBlock.resource_id && (
                      <Card variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle1">
                          {resourceForBlock(selectedBlock)?.title ?? `Resource #${selectedBlock.resource_id}`}
                        </Typography>
                        {resourceForBlock(selectedBlock)?.url && (
                          <Button
                            size="small"
                            endIcon={<OpenInNewIcon fontSize="small" />}
                            href={resourceForBlock(selectedBlock)?.url ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            sx={{ mt: 1 }}
                          >
                            Open resource
                          </Button>
                        )}
                      </Card>
                    )}
                    <TextField
                      label="Caption"
                      value={selectedBlock.label ?? ''}
                      onChange={(event) => queueBlockUpdate(selectedBlock.id, { label: event.target.value || null })}
                    />
                    <Stack direction="row" spacing={1}>
                      <TextField
                        label="Start (ms)"
                        value={selectedBlock.start_ms != null ? String(selectedBlock.start_ms) : ''}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          if (Number.isNaN(parsed) || parsed < 0) {
                            queueBlockUpdate(selectedBlock.id, { start_ms: null });
                          } else {
                            queueBlockUpdate(selectedBlock.id, { start_ms: parsed });
                          }
                        }}
                      />
                      <TextField
                        label="End (ms)"
                        value={selectedBlock.end_ms != null ? String(selectedBlock.end_ms) : ''}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          if (Number.isNaN(parsed) || parsed < 0) {
                            queueBlockUpdate(selectedBlock.id, { end_ms: null });
                          } else {
                            queueBlockUpdate(selectedBlock.id, { end_ms: parsed });
                          }
                        }}
                      />
                    </Stack>
                  </Stack>
                )}

                {selectedBlock.block_type === 'divider' && (
                  <Alert severity="info">Divider blocks have no configurable properties.</Alert>
                )}

                <Button
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => void handleDeleteBlock(selectedBlock.id)}
                >
                  Delete block
                </Button>
              </Stack>
            ) : selectedSubtree && nodeDraft ? (
              <Stack spacing={3}>
                <Stack spacing={2}>
                  <TextField
                    label="Title"
                    value={nodeDraft.title}
                    onChange={(event) => handleNodeFieldChange('title', event.target.value)}
                  />
                  <TextField
                    label="Slug"
                    value={nodeDraft.slug}
                    onChange={(event) => handleNodeFieldChange('slug', event.target.value)}
                  />
                  <TextField
                    label="Description"
                    multiline
                    minRows={3}
                    value={nodeDraft.description}
                    onChange={(event) => handleNodeFieldChange('description', event.target.value)}
                  />
                  <TextField
                    label="Hero image URL"
                    value={nodeDraft.hero_image}
                    onChange={(event) => handleNodeFieldChange('hero_image', event.target.value)}
                  />
                  <TextField
                    label="Icon"
                    value={nodeDraft.icon}
                    onChange={(event) => handleNodeFieldChange('icon', event.target.value)}
                  />
                  <TextField
                    label="Objectives"
                    multiline
                    minRows={3}
                    value={nodeDraft.objectives}
                    onChange={(event) => handleNodeFieldChange('objectives', event.target.value)}
                  />
                  <TextField
                    label="Metadata (JSON)"
                    multiline
                    minRows={4}
                    value={nodeDraft.metadata}
                    onChange={(event) => handleNodeFieldChange('metadata', event.target.value)}
                    error={!!metadataError}
                    helperText={metadataError ?? 'Provide structured metadata for this node'}
                  />
                </Stack>

                <Divider />

                <Stack spacing={1} direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2">Children</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => setAddChildDialog({ open: true, parentId: selectedSubtree.node.id, mode: 'create' })}
                    >
                      Add child
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setAddChildDialog({ open: true, parentId: selectedSubtree.node.id, mode: 'attach' })}
                    >
                      Attach existing
                    </Button>
                  </Stack>
                </Stack>

                <Stack spacing={1.5}>
                  {selectedSubtree.children
                    .slice()
                    .sort((a, b) => a.edge.position - b.edge.position)
                    .map((child, index, arr) => (
                      <Paper key={child.edge.child_id} variant="outlined" sx={{ p: 2 }}>
                        <Stack spacing={1.5}>
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
                                    onClick={() => handleReorderChild(selectedSubtree.node.id, child.edge.child_id, 'up')}
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
                                    onClick={() => handleReorderChild(selectedSubtree.node.id, child.edge.child_id, 'down')}
                                  >
                                    <ArrowDownwardIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Remove child">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => void handleRemoveChild(selectedSubtree.node.id, child.edge.child_id)}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </Stack>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Checkbox
                              checked={child.edge.is_required ?? true}
                              onChange={(event) =>
                                void handleUpdateChild(selectedSubtree.node.id, child, {
                                  is_required: event.target.checked,
                                })
                              }
                              size="small"
                            />
                            <Typography variant="body2">Required for progression</Typography>
                          </Stack>
                        </Stack>
                      </Paper>
                    ))}
                  {selectedSubtree.children.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      This node has no children.
                    </Typography>
                  )}
                </Stack>
              </Stack>
            ) : (
              <Typography color="text.secondary">Select a node to edit details.</Typography>
            )}
          </Paper>
        )}
      </Box>

      {!propertiesOpen && (
        <Box sx={{ position: 'fixed', bottom: 24, right: 24 }}>
          <Button variant="contained" onClick={() => setPropertiesOpen(true)}>
            Open properties
          </Button>
        </Box>
      )}

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            if (!menuNodeId) return;
            closeMenu();
            setAddChildDialog({ open: true, parentId: menuNodeId, mode: 'create' });
          }}
        >
          <AddIcon fontSize="small" sx={{ mr: 1 }} /> Add child
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!menuNodeId) return;
            closeMenu();
            setAddChildDialog({ open: true, parentId: menuNodeId, mode: 'attach' });
          }}
        >
          <SearchIcon fontSize="small" sx={{ mr: 1 }} /> Attach existing
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!menuNodeId) return;
            closeMenu();
            setDuplicateDialog({ open: true, nodeId: menuNodeId });
          }}
        >
          <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} /> Duplicate
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!menuNodeId) return;
            closeMenu();
            const subtree = findSubtree(trees, menuNodeId);
            setDeleteDialog({ open: true, nodeId: menuNodeId, subtree: subtree ?? null });
          }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Delete
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={insertMenu?.anchor}
        open={!!insertMenu}
        onClose={() => setInsertMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <MenuItem onClick={() => insertMenu && handleAddBlockAt(insertMenu.index, 'text')}>
          <TextFieldsIcon fontSize="small" sx={{ mr: 1 }} /> Text block
        </MenuItem>
        <MenuItem onClick={() => insertMenu && handleAddBlockAt(insertMenu.index, 'asset')}>
          <VideoLibraryIcon fontSize="small" sx={{ mr: 1 }} /> Resource block
        </MenuItem>
        <MenuItem onClick={() => insertMenu && handleAddBlockAt(insertMenu.index, 'divider')}>
          <HorizontalRuleIcon fontSize="small" sx={{ mr: 1 }} /> Divider
        </MenuItem>
      </Menu>

      <Dialog
        open={deleteDialog.open && !!deleteDialog.subtree}
        onClose={() => setDeleteDialog({ open: false, nodeId: null, subtree: null })}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Delete node</DialogTitle>
        <DialogContent dividers>
          {deleteStats ? (
            <Stack spacing={2}>
              <Alert severity="warning">
                Deleting <strong>{deleteDialog.subtree!.node.title ?? 'this node'}</strong> will also remove the following:
              </Alert>
              <Stack spacing={1}>
                {deleteStats.nodes.map(({ type, count }) => (
                  <Typography key={type}>{count} × {type}</Typography>
                ))}
                {deleteStats.blocks.map(({ type, count }) => (
                  <Typography key={`block-${type}`}>{count} × {type} blocks</Typography>
                ))}
              </Stack>
              <Alert severity="error">This action cannot be undone.</Alert>
            </Stack>
          ) : (
            <CircularProgress size={24} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, nodeId: null, subtree: null })}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              if (!deleteDialog.nodeId) return;
              void handleDeleteNode(deleteDialog.nodeId);
              setDeleteDialog({ open: false, nodeId: null, subtree: null });
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={addChildDialog.open}
        onClose={() => setAddChildDialog({ open: false, parentId: null, mode: 'create' })}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{addChildDialog.mode === 'create' ? 'Create child node' : 'Attach existing node'}</DialogTitle>
        <DialogContent dividers>
          {addChildDialog.mode === 'create' ? (
            <Stack spacing={2}>
              <FormControl fullWidth disabled={availableChildTypes.length === 0}>
                <InputLabel id="child-type">Child type</InputLabel>
                <Select
                  labelId="child-type"
                  label="Child type"
                  value={newChildType}
                  onChange={(event) => setNewChildType(event.target.value as string)}
                >
                  {availableChildTypes.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Title"
                value={newChildTitle}
                onChange={(event) => setNewChildTitle(event.target.value)}
              />
            </Stack>
          ) : (
            <Stack spacing={2}>
              <TextField
                label="Search nodes"
                value={attachQuery}
                onChange={(event) => setAttachQuery(event.target.value)}
              />
              {searchResults.loading && <CircularProgress size={20} />}
              {searchResults.error && <Alert severity="error">{searchResults.error}</Alert>}
              {!searchResults.loading && !searchResults.error && (
                <Stack spacing={1}>
                  {searchResults.rows.map((row) => (
                    <Button
                      key={row.id}
                      variant="outlined"
                      onClick={() => {
                        if (!addChildDialog.parentId) return;
                        void handleAttachExisting(addChildDialog.parentId, row.id);
                        setAddChildDialog({ open: false, parentId: null, mode: 'create' });
                      }}
                    >
                      {row.title ?? `Node #${row.id}`} ({row.node_type})
                    </Button>
                  ))}
                  {searchResults.rows.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No nodes found.
                    </Typography>
                  )}
                </Stack>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddChildDialog({ open: false, parentId: null, mode: 'create' })}>Cancel</Button>
          {addChildDialog.mode === 'create' ? (
            <Button
              variant="contained"
              disabled={!newChildTitle.trim()}
              onClick={() => {
                if (addChildDialog.mode !== 'create') return;
                void handleAddChild(addChildDialog.parentId, { node_type: newChildType, title: newChildTitle });
                setAddChildDialog({ open: false, parentId: null, mode: 'create' });
              }}
            >
              Create
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>

      <Dialog
        open={duplicateDialog.open}
        onClose={() => setDuplicateDialog({ open: false, nodeId: null })}
      >
        <DialogTitle>Duplicate node</DialogTitle>
        <DialogContent dividers>
          <Typography>
            Duplicate this node and attach the copy to the same parent?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateDialog({ open: false, nodeId: null })}>Cancel</Button>
          <Button
            onClick={() => {
              if (!duplicateDialog.nodeId) return;
              const parent = findParentEdge(trees, duplicateDialog.nodeId);
              void handleDuplicate(duplicateDialog.nodeId, parent ? parent.parent_id : null);
              setDuplicateDialog({ open: false, nodeId: null });
            }}
          >
            Duplicate
          </Button>
        </DialogActions>
      </Dialog>

      <ResourcePickerDialog
        open={resourceDialogOpen}
        onClose={() => {
          setResourceDialogOpen(false);
          setResourceDialogMode(null);
        }}
        onSelect={handleResourceSelected}
      />

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack && (
          <Alert severity={snack.severity} onClose={() => setSnack(null)} sx={{ width: '100%' }}>
            {snack.message}
          </Alert>
        )}
      </Snackbar>
    </>
  );
}
