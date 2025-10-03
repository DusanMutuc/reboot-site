'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactElement } from 'react';
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
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  Checkbox,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArticleIcon from '@mui/icons-material/Article';
import LayersIcon from '@mui/icons-material/Layers';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import PreviewIcon from '@mui/icons-material/Preview';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StorageIcon from '@mui/icons-material/Storage';
import { supabase } from '@/lib/supabaseClient';

type NodeType = 'course' | 'lesson' | 'chapter' | 'collection' | 'playlist';
type NodeState = 'draft' | 'published' | 'archived';
type BlockType = 'text' | 'asset' | 'divider';

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
};

const NODE_ICONS: Partial<Record<NodeType, ReactElement>> = {
  course: <MenuBookIcon fontSize="small" />,
  lesson: <ArticleIcon fontSize="small" />,
  chapter: <LayersIcon fontSize="small" />,
  collection: <CollectionsBookmarkIcon fontSize="small" />,
  playlist: <PlaylistPlayIcon fontSize="small" />,
};

const BLOCK_ICONS: Record<BlockType, ReactElement> = {
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

function replaceSubtree(
  tree: NodeSubtree,
  updated: NodeSubtree,
): { next: NodeSubtree; replaced: boolean } {
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
          .select('id,title,type,state,thumbnail,duration')
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
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography variant="body2">Loading resources…</Typography>
            </Stack>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <List dense>
            {rows.map((row) => (
              <ListItem
                key={row.id}
                secondaryAction={
                  <IconButton edge="end" onClick={() => window.open(`/resources/${row.id}`, '_blank')}>
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                }
                onClick={() => {
                  onSelect(row);
                  onClose();
                }}
              >
                <ListItemText
                  primary={row.title}
                  secondary={[row.type, row.state].filter(Boolean).join(' · ')}
                />
              </ListItem>
            ))}
          </List>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

type BlockEditorState = {
  mode: 'create' | 'edit';
  block: ContentBlock | null;
  type: BlockType;
  text_md: string;
  resource: ResourceRow | null;
  label: string;
  start_ms: string;
  end_ms: string;
  notes: string;
  preview: boolean;
};

const EMPTY_BLOCK: BlockEditorState = {
  mode: 'create',
  block: null,
  type: 'text',
  text_md: '',
  resource: null,
  label: '',
  start_ms: '',
  end_ms: '',
  notes: '',
  preview: false,
};

type BlockEditorProps = {
  open: boolean;
  onClose: () => void;
  state: BlockEditorState;
  onChange: (next: BlockEditorState) => void;
  onSelectResource: () => void;
  onSubmit: () => void;
};

function BlockEditorDialog({ open, onClose, state, onChange, onSelectResource, onSubmit }: BlockEditorProps) {
  const canSave =
    state.type === 'divider' ||
    (state.type === 'text' && state.text_md.trim().length > 0) ||
    (state.type === 'asset' && state.resource);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{state.mode === 'create' ? 'Add block' : 'Edit block'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          <FormControl fullWidth>
            <InputLabel id="block-type">Block type</InputLabel>
            <Select
              labelId="block-type"
              label="Block type"
              value={state.type}
              onChange={(event) =>
                onChange({ ...state, type: event.target.value as BlockType, resource: null })
              }
            >
              <MenuItem value="text">Text</MenuItem>
              <MenuItem value="asset">Resource</MenuItem>
              <MenuItem value="divider">Divider</MenuItem>
            </Select>
          </FormControl>

          {state.type === 'text' && (
            <Stack spacing={1}>
              <TextField
                multiline
                minRows={6}
                label="Markdown"
                value={state.text_md}
                onChange={(event) => onChange({ ...state, text_md: event.target.value })}
              />
              <Button startIcon={<PreviewIcon />} onClick={() => onChange({ ...state, preview: !state.preview })}>
                {state.preview ? 'Hide preview' : 'Show preview'}
              </Button>
              {state.preview && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>{state.text_md || 'Nothing to preview yet.'}</Typography>
                </Paper>
              )}
            </Stack>
          )}

          {state.type === 'asset' && (
            <Stack spacing={2}>
              <Button variant="outlined" startIcon={<SearchIcon />} onClick={onSelectResource}>
                {state.resource ? 'Change resource' : 'Select resource'}
              </Button>
              {state.resource && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1">{state.resource.title}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {[state.resource.type, state.resource.state].filter(Boolean).join(' · ')}
                  </Typography>
                </Paper>
              )}
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Start (ms)"
                  value={state.start_ms}
                  onChange={(event) => onChange({ ...state, start_ms: event.target.value })}
                />
                <TextField
                  label="End (ms)"
                  value={state.end_ms}
                  onChange={(event) => onChange({ ...state, end_ms: event.target.value })}
                />
              </Stack>
              <TextField
                label="Label"
                value={state.label}
                onChange={(event) => onChange({ ...state, label: event.target.value })}
              />
              <TextField
                label="Notes"
                value={state.notes}
                onChange={(event) => onChange({ ...state, notes: event.target.value })}
              />
            </Stack>
          )}

          {state.type === 'divider' && (
            <Alert severity="info" icon={<HorizontalRuleIcon fontSize="small" />}>
              Divider blocks do not include additional content.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<CloseIcon />} onClick={onClose}>
          Cancel
        </Button>
        <Button startIcon={<SaveIcon />} variant="contained" disabled={!canSave} onClick={onSubmit}>
          Save
        </Button>
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

export default function CourseBuilderAdmin() {
  const [trees, setTrees] = useState<NodeSubtree[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<NodeEdgeRule[]>([]);
  const [panelTab, setPanelTab] = useState(0);
  const [snack, setSnack] = useState<SnackbarState>(null);
  const [detailsForm, setDetailsForm] = useState({
    title: '',
    slug: '',
    description: '',
    state: 'draft' as NodeState,
    hero_image: '',
    icon: '',
    objectives: '',
    metadata: '',
  });
  const [blockEditor, setBlockEditor] = useState<BlockEditorState>(EMPTY_BLOCK);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({ open: false, nodeId: null, subtree: null });
  const [addChildDialog, setAddChildDialog] = useState<AddChildDialogState>({ open: false, parentId: null, mode: 'create' });
  const [duplicateDialog, setDuplicateDialog] = useState<DuplicateDialogState>({ open: false, nodeId: null });
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuNodeId, setMenuNodeId] = useState<number | null>(null);
  const optimisticSnapshot = useRef<NodeSubtree[] | null>(null);

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

  useEffect(() => {
    if (!selectedSubtree) return;
    setDetailsForm({
      title: selectedSubtree.node.title ?? '',
      slug: selectedSubtree.node.slug ?? '',
      description: selectedSubtree.node.description ?? '',
      state: (selectedSubtree.node.state ?? 'draft') as NodeState,
      hero_image: selectedSubtree.node.hero_image ?? '',
      icon: selectedSubtree.node.icon ?? '',
      objectives: selectedSubtree.node.objectives ?? '',
      metadata: selectedSubtree.node.metadata ? JSON.stringify(selectedSubtree.node.metadata, null, 2) : '',
    });
    setPanelTab(0);
  }, [selectedSubtree]);

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
      options: { message?: string; optimistic?: (prev: NodeSubtree[]) => NodeSubtree[] } = {},
    ) => {
      if (options.optimistic) {
        setTrees((prev) => {
          optimisticSnapshot.current = prev.map((tree) => cloneSubtree(tree));
          return options.optimistic ? options.optimistic(prev) : prev;
        });
      }

      try {
        const payload = await request();
        setTrees((prev) => {
          let next = prev;
          if ('subtree' in payload && payload.subtree) {
            next = mergeSubtree(next, payload.subtree);
          } else if ('node' in payload) {
            next = mergeSubtree(next, payload as NodeSubtree);
          }
          if ('parentSubtree' in payload && payload.parentSubtree) {
            next = mergeSubtree(next, payload.parentSubtree);
          }
          return next;
        });
        if (options.message) setSnack({ message: options.message, severity: 'success' });
      } catch (err) {
        if (optimisticSnapshot.current) {
          setTrees(optimisticSnapshot.current);
        }
        optimisticSnapshot.current = null;
        const message = err instanceof Error ? err.message : 'Action failed';
        setSnack({ message, severity: 'error' });
        throw err;
      } finally {
        optimisticSnapshot.current = null;
      }
    },
    [],
  );

  const [newChildType, setNewChildType] = useState<string>('lesson');
  const [newChildTitle, setNewChildTitle] = useState('');

  const allowedChildTypes = useMemo(() => {
    if (!selectedSubtree) return [] as string[];
    return Array.from(
      new Set(
        rules
          .filter((rule) => rule.parent_type === selectedSubtree.node.node_type && rule.child_kind === 'node')
          .map((rule) => rule.child_type),
      ),
    );
  }, [rules, selectedSubtree]);

  const availableChildTypes = useMemo(
    () => (addChildDialog.parentId ? allowedChildTypes : ['course']),
    [addChildDialog.parentId, allowedChildTypes],
  );

  const [searchResults, setSearchResults] = useState<{ loading: boolean; rows: ContentNode[] }>({
    loading: false,
    rows: [],
  });

  const fetchSearch = useCallback(async (term: string) => {
    setSearchResults({ loading: true, rows: [] });
    try {
      const res = await fetch(`/api/admin/course-builder/nodes?mode=search&q=${encodeURIComponent(term)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed to search nodes' }));
        throw new Error(body.error ?? 'Failed to search nodes');
      }
      const payload = (await res.json()) as { nodes: ContentNode[] };
      setSearchResults({ loading: false, rows: payload.nodes ?? [] });
    } catch (err) {
      console.error(err);
      setSearchResults({ loading: false, rows: [] });
    }
  }, []);

  useEffect(() => {
    if (addChildDialog.open && addChildDialog.mode === 'create') {
      setNewChildType(availableChildTypes[0] ?? 'course');
      setNewChildTitle('');
    }
    if (!addChildDialog.open) {
      setSearchResults({ loading: false, rows: [] });
    }
  }, [addChildDialog, availableChildTypes]);

  const deleteStats = useMemo(() => {
    return deleteDialog.subtree ? collectStats(deleteDialog.subtree) : null;
  }, [deleteDialog.subtree]);

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

  return (
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3}>
      <Paper sx={{ flexBasis: 320, flexShrink: 0, p: 2 }} variant="outlined">
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
          <Box sx={{ maxHeight: 600, overflowY: 'auto', pr: 1 }}>
            {trees.map((tree) => (
              <TreeNode
                key={tree.node.id}
                subtree={tree}
                level={0}
                expanded={expanded}
                toggle={toggleExpand}
                onSelect={setSelectedId}
                selectedId={selectedId}
                search={search}
                onMenu={handleMenu}
              />
            ))}
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ flex: 1, p: 3 }} variant="outlined">
        {selectedSubtree ? (
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">{selectedSubtree.node.title ?? 'Untitled node'}</Typography>
              <Tabs value={panelTab} onChange={(_, value) => setPanelTab(value)}>
                <Tab label="Details" />
                <Tab label="Children" />
                <Tab label="Content Blocks" />
              </Tabs>
            </Stack>

            {panelTab === 0 && (
              <Stack spacing={2}>
                <TextField
                  label="Title"
                  value={detailsForm.title}
                  onChange={(event) => setDetailsForm((prev) => ({ ...prev, title: event.target.value }))}
                />
                <TextField
                  label="Slug"
                  value={detailsForm.slug}
                  onChange={(event) => setDetailsForm((prev) => ({ ...prev, slug: event.target.value }))}
                />
                <TextField
                  label="Description"
                  multiline
                  minRows={3}
                  value={detailsForm.description}
                  onChange={(event) => setDetailsForm((prev) => ({ ...prev, description: event.target.value }))}
                />
                <FormControl fullWidth>
                  <InputLabel id="state-select">State</InputLabel>
                  <Select
                    labelId="state-select"
                    label="State"
                    value={detailsForm.state}
                    onChange={(event) =>
                      setDetailsForm((prev) => ({ ...prev, state: event.target.value as NodeState }))
                    }
                  >
                    <MenuItem value="draft">Draft</MenuItem>
                    <MenuItem value="published">Published</MenuItem>
                    <MenuItem value="archived">Archived</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Hero image URL"
                  value={detailsForm.hero_image}
                  onChange={(event) => setDetailsForm((prev) => ({ ...prev, hero_image: event.target.value }))}
                />
                <TextField
                  label="Icon"
                  value={detailsForm.icon}
                  onChange={(event) => setDetailsForm((prev) => ({ ...prev, icon: event.target.value }))}
                />
                <TextField
                  label="Objectives"
                  multiline
                  minRows={3}
                  value={detailsForm.objectives}
                  onChange={(event) => setDetailsForm((prev) => ({ ...prev, objectives: event.target.value }))}
                />
                <TextField
                  label="Metadata (JSON)"
                  multiline
                  minRows={4}
                  value={detailsForm.metadata}
                  onChange={(event) => setDetailsForm((prev) => ({ ...prev, metadata: event.target.value }))}
                />
                <Button startIcon={<SaveIcon />} variant="contained" onClick={async () => {
                  if (!selectedSubtree) return;
                  if (detailsForm.state === 'published') {
                    const unmet = selectedSubtree.children.filter(
                      (child) => (child.edge.is_required ?? true) && child.subtree.node.state !== 'published',
                    );
                    if (unmet.length > 0) {
                      setSnack({
                        message: 'Publish required children before publishing this node.',
                        severity: 'error',
                      });
                      return;
                    }
                  }

                  let metadata: Record<string, unknown> | null = null;
                  if (detailsForm.metadata.trim()) {
                    try {
                      metadata = JSON.parse(detailsForm.metadata);
                    } catch {
                      setSnack({ message: 'Metadata must be valid JSON', severity: 'error' });
                      return;
                    }
                  }

                  const payload: Record<string, unknown> = {
                    title: detailsForm.title,
                    slug: detailsForm.slug || null,
                    description: detailsForm.description || null,
                    state: detailsForm.state,
                    hero_image: detailsForm.hero_image || null,
                    icon: detailsForm.icon || null,
                    objectives: detailsForm.objectives || null,
                    metadata,
                  };

                  try {
                    await runMutation(async () => {
                      const res = await fetch(`/api/admin/course-builder/nodes/${selectedSubtree.node.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ updates: payload }),
                      });
                      if (!res.ok) {
                        const body = await res.json().catch(() => ({ error: 'Failed to update node' }));
                        throw new Error(body.error ?? 'Failed to update node');
                      }
                      return (await res.json()) as { subtree: NodeSubtree };
                    }, { message: 'Node updated' });
                  } catch (err) {
                    console.error(err);
                  }
                }}>
                  Save changes
                </Button>
              </Stack>
            )}

            {panelTab === 1 && (
              <Stack spacing={2}>
                <Stack direction="row" spacing={1}>
                  <Button
                    startIcon={<AddIcon />}
                    onClick={() => setAddChildDialog({ open: true, parentId: selectedSubtree.node.id, mode: 'create' })}
                  >
                    Create child
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => setAddChildDialog({ open: true, parentId: selectedSubtree.node.id, mode: 'attach' })}
                  >
                    Add existing
                  </Button>
                </Stack>
                <List>
                  {selectedSubtree.children
                    .slice()
                    .sort((a, b) => a.edge.position - b.edge.position)
                    .map((child, index, arr) => (
                      <ListItem
                        key={child.subtree.node.id}
                        secondaryAction={
                          <Stack direction="row" spacing={1}>
                            <Tooltip title="Move up">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={index === 0}
                                  onClick={() =>
                                    handleReorderChild(selectedSubtree.node.id, child.edge.child_id, 'up')
                                  }
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
                                  onClick={() =>
                                    handleReorderChild(selectedSubtree.node.id, child.edge.child_id, 'down')
                                  }
                                >
                                  <ArrowDownwardIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Remove child">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRemoveChild(selectedSubtree.node.id, child.edge.child_id)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        }
                      >
                        <ListItemIcon>
                          {NODE_ICONS[child.subtree.node.node_type] ?? <StorageIcon fontSize="small" />}
                        </ListItemIcon>
                        <ListItemText
                          primary={child.subtree.node.title ?? 'Untitled'}
                          secondary={`${child.subtree.node.node_type} · position ${child.edge.position}`}
                        />
                        <Checkbox
                          checked={child.edge.is_required ?? true}
                          onChange={(event) =>
                            handleUpdateChild(selectedSubtree.node.id, child, {
                              is_required: event.target.checked,
                            })
                          }
                          inputProps={{ 'aria-label': 'Required child toggle' }}
                        />
                      </ListItem>
                    ))}
                </List>
              </Stack>
            )}

            {panelTab === 2 && (
              <Stack spacing={2}>
                {selectedSubtree.children.length > 0 ? (
                  <Alert severity="info">
                    Content blocks are available only for nodes without child nodes.
                  </Alert>
                ) : (
                  <>
                    <Stack direction="row" spacing={1}>
                      <Button
                        startIcon={<TextFieldsIcon />}
                        onClick={() => {
                          setBlockEditor({ ...EMPTY_BLOCK, type: 'text' });
                          setBlockDialogOpen(true);
                        }}
                      >
                        Add Text
                      </Button>
                      <Button
                        startIcon={<VideoLibraryIcon />}
                        onClick={() => {
                          setBlockEditor({ ...EMPTY_BLOCK, type: 'asset' });
                          setBlockDialogOpen(true);
                        }}
                      >
                        Add Resource
                      </Button>
                      <Button
                        startIcon={<HorizontalRuleIcon />}
                        onClick={() => {
                          setBlockEditor({ ...EMPTY_BLOCK, type: 'divider' });
                          setBlockDialogOpen(true);
                        }}
                      >
                        Add Divider
                      </Button>
                    </Stack>
                    <List>
                      {selectedSubtree.blocks
                        .slice()
                        .sort((a, b) => a.position - b.position)
                        .map((block, index, arr) => (
                          <ListItem
                            key={block.id}
                            secondaryAction={
                              <Stack direction="row" spacing={1}>
                                <Tooltip title="Move up">
                                  <span>
                                    <IconButton
                                      size="small"
                                      disabled={index === 0}
                                      onClick={() =>
                                        handleReorderBlocks(selectedSubtree.node.id, selectedSubtree.blocks, block.id, 'up')
                                      }
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
                                      onClick={() =>
                                        handleReorderBlocks(
                                          selectedSubtree.node.id,
                                          selectedSubtree.blocks,
                                          block.id,
                                          'down',
                                        )
                                      }
                                    >
                                      <ArrowDownwardIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Tooltip title="Edit block">
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      setBlockEditor({
                                        mode: 'edit',
                                        block,
                                        type: block.block_type,
                                        text_md: block.text_md ?? '',
                                        resource: block.resource_id
                                          ? {
                                              id: block.resource_id,
                                              title: `Resource #${block.resource_id}`,
                                              type: null,
                                              state: null,
                                              thumbnail: null,
                                              duration: null,
                                            }
                                          : null,
                                        label: block.label ?? '',
                                        start_ms: block.start_ms != null ? String(block.start_ms) : '',
                                        end_ms: block.end_ms != null ? String(block.end_ms) : '',
                                        notes: block.notes ?? '',
                                        preview: false,
                                      });
                                      setBlockDialogOpen(true);
                                    }}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete block">
                                  <IconButton size="small" color="error" onClick={() => handleDeleteBlock(block.id)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            }
                          >
                            <ListItemIcon>{BLOCK_ICONS[block.block_type]}</ListItemIcon>
                            <ListItemText
                              primary={`${block.block_type} #${block.position}`}
                              secondary={
                                block.block_type === 'text'
                                  ? (block.text_md ?? '').slice(0, 80)
                                  : block.block_type === 'asset'
                                  ? `Resource ${block.resource_id ?? 'unknown'}`
                                  : 'Divider'
                              }
                            />
                          </ListItem>
                        ))}
                    </List>
                  </>
                )}
              </Stack>
            )}
          </Stack>
        ) : (
          <Typography color="text.secondary">Select a node from the tree to start editing.</Typography>
        )}
      </Paper>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            if (!menuNodeId) return;
            const node = findSubtree(trees, menuNodeId);
            closeMenu();
            setAddChildDialog({ open: true, parentId: menuNodeId, mode: 'create' });
            if (node) {
              setSelectedId(node.node.id);
            }
          }}
        >
          <AddIcon fontSize="small" sx={{ mr: 1 }} /> Add child
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
        <Divider />
        {(['draft', 'published', 'archived'] as NodeState[]).map((state) => (
          <MenuItem
            key={state}
            onClick={async () => {
              if (!menuNodeId) return;
              closeMenu();
              try {
                await runMutation(async () => {
                  const res = await fetch(`/api/admin/course-builder/nodes/${menuNodeId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates: { state } }),
                  });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({ error: 'Failed to update state' }));
                    throw new Error(body.error ?? 'Failed to update state');
                  }
                  return (await res.json()) as { subtree: NodeSubtree };
                }, { message: 'State updated' });
              } catch (err) {
                console.error(err);
              }
            }}
          >
            Set {state}
          </MenuItem>
        ))}
      </Menu>

      <Dialog
        open={deleteDialog.open && !!deleteDialog.subtree}
        onClose={() => setDeleteDialog({ open: false, nodeId: null, subtree: null })}
      >
        <DialogTitle>Delete node</DialogTitle>
        <DialogContent dividers>
          {deleteStats ? (
            <Stack spacing={2}>
              <Alert severity="warning">
                Deleting <strong>{deleteDialog.subtree!.node.title ?? 'this node'}</strong> will also remove the
                following:
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
            <CircularProgress size={20} />
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
                label="Search by title"
                onChange={(event) => void fetchSearch(event.target.value)}
                InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1 }} /> }}
              />
              {searchResults.loading && <CircularProgress size={20} />}
              <List>
                {searchResults.rows.map((row) => (
                  <ListItem
                    key={row.id}
                    onClick={() => {
                      if (!addChildDialog.parentId) return;
                      void handleAttachExisting(addChildDialog.parentId, row.id);
                      setAddChildDialog({ open: false, parentId: null, mode: 'create' });
                    }}
                  >
                    <ListItemText primary={row.title} secondary={`${row.node_type} · ${row.state}`} />
                  </ListItem>
                ))}
              </List>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddChildDialog({ open: false, parentId: null, mode: 'create' })}>Cancel</Button>
          {addChildDialog.mode === 'create' && (
            <Button
              variant="contained"
              disabled={!newChildTitle.trim() || availableChildTypes.length === 0}
              onClick={() => {
                const parentId = addChildDialog.parentId;
                if (!newChildTitle.trim()) {
                  setSnack({ message: 'Provide a title for the new node.', severity: 'error' });
                  return;
                }
                void handleAddChild(parentId, { node_type: newChildType, title: newChildTitle.trim() });
                setAddChildDialog({ open: false, parentId: null, mode: 'create' });
              }}
            >
              Create
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={duplicateDialog.open}
        onClose={() => setDuplicateDialog({ open: false, nodeId: null })}
      >
        <DialogTitle>Duplicate node</DialogTitle>
        <DialogContent dividers>
          <Typography>
            Duplicate this node and optionally attach it to the same parent. The copy will inherit the entire
            subtree.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateDialog({ open: false, nodeId: null })}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!duplicateDialog.nodeId) return;
              const parentEdge = findParentEdge(trees, duplicateDialog.nodeId);
              void handleDuplicate(duplicateDialog.nodeId, parentEdge?.parent_id ?? null);
              setDuplicateDialog({ open: false, nodeId: null });
            }}
          >
            Duplicate
          </Button>
        </DialogActions>
      </Dialog>

      <ResourcePickerDialog
        open={resourceDialogOpen}
        onClose={() => setResourceDialogOpen(false)}
        onSelect={(resource) =>
          setBlockEditor((prev) => ({
            ...prev,
            resource,
          }))
        }
      />

      <BlockEditorDialog
        open={blockDialogOpen}
        onClose={() => setBlockDialogOpen(false)}
        state={blockEditor}
        onChange={setBlockEditor}
        onSelectResource={() => setResourceDialogOpen(true)}
        onSubmit={() => {
          if (!selectedSubtree) return;
          if (blockEditor.mode === 'create') {
            const base: Partial<ContentBlock> & { block_type: BlockType } = {
              block_type: blockEditor.type,
              text_md: blockEditor.type === 'text' ? blockEditor.text_md : undefined,
              resource_id: blockEditor.type === 'asset' ? blockEditor.resource?.id ?? null : null,
              label: blockEditor.label || null,
              start_ms: blockEditor.start_ms ? Number(blockEditor.start_ms) : null,
              end_ms: blockEditor.end_ms ? Number(blockEditor.end_ms) : null,
              notes: blockEditor.notes || null,
            };
            void handleCreateBlock(selectedSubtree.node.id, base);
          } else if (blockEditor.block) {
            const updates: Partial<ContentBlock> = {
              block_type: blockEditor.type,
              text_md: blockEditor.type === 'text' ? blockEditor.text_md : null,
              resource_id: blockEditor.type === 'asset' ? blockEditor.resource?.id ?? null : null,
              label: blockEditor.label || null,
              start_ms: blockEditor.start_ms ? Number(blockEditor.start_ms) : null,
              end_ms: blockEditor.end_ms ? Number(blockEditor.end_ms) : null,
              notes: blockEditor.notes || null,
            };
            void handleUpdateBlock(blockEditor.block.id, updates);
          }
          setBlockDialogOpen(false);
        }}
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
    </Stack>
  );

  async function handleAddChild(parentId: number | null, payload: { node_type: string; title: string }) {
    try {
      await runMutation(async () => {
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
      }, { message: 'Node created' });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleAttachExisting(parentId: number, childId: number) {
    try {
      await runMutation(async () => {
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
      }, { message: 'Child attached' });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDuplicate(nodeId: number, parentId: number | null) {
    try {
      await runMutation(async () => {
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
      }, { message: 'Node duplicated' });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRemoveChild(parentId: number, childId: number) {
    try {
      await runMutation(async () => {
        const res = await fetch(`/api/admin/course-builder/nodes/${parentId}/children/${childId}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Failed to remove child' }));
          throw new Error(body.error ?? 'Failed to remove child');
        }
        return (await res.json()) as { subtree: NodeSubtree };
      }, { message: 'Child removed' });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteNode(nodeId: number) {
    const parentEdge = findParentEdge(trees, nodeId);
    try {
      await runMutation(
        async () => {
          const res = await fetch(`/api/admin/course-builder/nodes/${nodeId}`, { method: 'DELETE' });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to delete node' }));
            throw new Error(body.error ?? 'Failed to delete node');
          }
          const payload = (await res.json()) as { parentSubtree: NodeSubtree | null };
          if (!payload.parentSubtree) {
            setTrees((prev) => removeSubtree(prev, nodeId));
          }
          return payload;
        },
        { message: 'Node deleted', optimistic: (prev) => removeSubtree(prev, nodeId) },
      );
      setSelectedId(parentEdge ? parentEdge.parent_id : null);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleReorderChild(parentId: number, childId: number, direction: 'up' | 'down') {
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

    try {
      await runMutation(async () => {
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
      }, {
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
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleUpdateChild(parentId: number, child: NodeSubtree['children'][number], updates: Partial<NodeChild>) {
    try {
      await runMutation(async () => {
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
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateBlock(nodeId: number, block: Partial<ContentBlock> & { block_type: BlockType }) {
    try {
      await runMutation(async () => {
        const res = await fetch(`/api/admin/course-builder/nodes/${nodeId}/blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ block }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Failed to create block' }));
          throw new Error(body.error ?? 'Failed to create block');
        }
        return (await res.json()) as { subtree: NodeSubtree };
      }, { message: 'Block created' });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleUpdateBlock(blockId: number, updates: Partial<ContentBlock>) {
    try {
      await runMutation(async () => {
        const res = await fetch(`/api/admin/course-builder/blocks/${blockId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Failed to update block' }));
          throw new Error(body.error ?? 'Failed to update block');
        }
        return (await res.json()) as { subtree: NodeSubtree };
      }, { message: 'Block updated' });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteBlock(blockId: number) {
    try {
      await runMutation(async () => {
        const res = await fetch(`/api/admin/course-builder/blocks/${blockId}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Failed to delete block' }));
          throw new Error(body.error ?? 'Failed to delete block');
        }
        return (await res.json()) as { subtree: NodeSubtree };
      }, { message: 'Block deleted' });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleReorderBlocks(
    nodeId: number,
    blocks: ContentBlock[],
    blockId: number,
    direction: 'up' | 'down',
  ) {
    const sorted = [...blocks].sort((a, b) => a.position - b.position);
    const index = sorted.findIndex((block) => block.id === blockId);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= sorted.length) return;

    const reordered = [...sorted];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(swapWith, 0, moved);

    const updates = reordered.map((block, idx) => ({ block_id: block.id, position: idx }));

    try {
      await runMutation(async () => {
        const res = await fetch(`/api/admin/course-builder/nodes/${nodeId}/blocks/reorder`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Failed to reorder blocks' }));
          throw new Error(body.error ?? 'Failed to reorder blocks');
        }
        return (await res.json()) as { subtree: NodeSubtree };
      });
    } catch (err) {
      console.error(err);
    }
  }
}
