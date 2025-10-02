'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

interface ContentNode {
  id: number;
  title: string;
  node_type: string;
  slug: string | null;
  description: string | null;
  state: string;
  hero_image: string | null;
  icon: string | null;
  objectives: string | null;
  metadata?: Record<string, unknown> | null;
}

interface NodeResponse {
  item: ContentNode;
}

interface NodeListResponse {
  items: ContentNode[];
}

interface ContentBlock {
  id: number;
  node_id: number;
  position: number;
  block_type: string;
  label: string | null;
  text_md: string | null;
  link_url: string | null;
  link_label: string | null;
  notes: string | null;
  resource_id?: number | null;
}

interface BlocksResponse {
  items: ContentBlock[];
}

type SnackbarState = {
  message: string;
  severity: 'success' | 'error' | 'info';
} | null;

const NODE_STATES = ['draft', 'published', 'archived'] as const;

type NodeFormState = {
  title: string;
  node_type: string;
  slug: string;
  description: string;
  state: (typeof NODE_STATES)[number];
  hero_image: string;
  icon: string;
  objectives: string;
};

type BlockFormState = {
  id?: number;
  block_type: string;
  label: string;
  text_md: string;
  link_url: string;
  link_label: string;
  notes: string;
};

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data && data.error) || res.statusText;
    throw new Error(typeof message === 'string' ? message : 'Unexpected error');
  }

  return data as T;
}

function mapNodeToForm(node: ContentNode): NodeFormState {
  return {
    title: node.title ?? '',
    node_type: node.node_type ?? '',
    slug: node.slug ?? '',
    description: node.description ?? '',
    state: (NODE_STATES.includes(node.state as (typeof NODE_STATES)[number])
      ? (node.state as (typeof NODE_STATES)[number])
      : 'draft'),
    hero_image: node.hero_image ?? '',
    icon: node.icon ?? '',
    objectives: node.objectives ?? '',
  };
}

const emptyNodeForm: NodeFormState = {
  title: '',
  node_type: '',
  slug: '',
  description: '',
  state: 'draft',
  hero_image: '',
  icon: '',
  objectives: '',
};

const emptyBlockForm: BlockFormState = {
  block_type: '',
  label: '',
  text_md: '',
  link_url: '',
  link_label: '',
  notes: '',
};

export default function CourseNodeManager() {
  const [nodes, setNodes] = useState<ContentNode[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<ContentNode | null>(null);
  const [nodeForm, setNodeForm] = useState<NodeFormState>(emptyNodeForm);
  const [nodeLoading, setNodeLoading] = useState(false);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | (typeof NODE_STATES)[number]>('all');
  const [snackbar, setSnackbar] = useState<SnackbarState>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newNodeForm, setNewNodeForm] = useState<NodeFormState>({ ...emptyNodeForm });
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockForm, setBlockForm] = useState<BlockFormState>({ ...emptyBlockForm });
  const [blockDialogMode, setBlockDialogMode] = useState<'create' | 'edit'>('create');

  const sortedBlocks = useMemo(() => {
    return [...blocks].sort((a, b) => a.position - b.position);
  }, [blocks]);

  const filteredNodes = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return nodes.filter((node) => {
      if (stateFilter !== 'all' && node.state !== stateFilter) return false;
      if (!term) return true;
      return [node.title, node.slug, node.node_type]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [nodes, filter, stateFilter]);

  const loadNodes = useCallback(async () => {
    setLoadingNodes(true);
    setError(null);
    try {
      const data = await requestJson<NodeListResponse>('/api/admin/course-builder/nodes');
      setNodes(data.items ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load nodes';
      setError(message);
    } finally {
      setLoadingNodes(false);
    }
  }, []);

  const loadNodeDetail = useCallback(
    async (nodeId: number) => {
      setNodeLoading(true);
      setError(null);
      try {
        const data = await requestJson<NodeResponse>(`/api/admin/course-builder/nodes/${nodeId}`);
        setSelectedNode(data.item);
        setNodeForm(mapNodeToForm(data.item));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load node';
        setError(message);
      } finally {
        setNodeLoading(false);
      }
    },
    []
  );

  const loadBlocks = useCallback(
    async (nodeId: number) => {
      setBlocksLoading(true);
      setError(null);
      try {
        const data = await requestJson<BlocksResponse>(`/api/admin/course-builder/nodes/${nodeId}/blocks`);
        setBlocks(data.items ?? []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load blocks';
        setError(message);
      } finally {
        setBlocksLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  useEffect(() => {
    if (!selectedNodeId) {
      setSelectedNode(null);
      setNodeForm({ ...emptyNodeForm });
      setBlocks([]);
      return;
    }

    loadNodeDetail(selectedNodeId).then(() => {
      void loadBlocks(selectedNodeId);
    });
  }, [selectedNodeId, loadNodeDetail, loadBlocks]);

  const handleNodeFieldChange = (field: keyof NodeFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setNodeForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleNodeStateChange = (
    event: React.ChangeEvent<{ value: unknown }> | React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) => {
    const value = event.target.value as NodeFormState['state'];
    setNodeForm((prev) => ({ ...prev, state: value }));
  };

  const saveNodeChanges = async () => {
    if (!selectedNodeId) return;
    try {
      const payload = {
        title: nodeForm.title.trim(),
        node_type: nodeForm.node_type.trim(),
        slug: nodeForm.slug.trim() || null,
        description: nodeForm.description.trim() || null,
        state: nodeForm.state,
        hero_image: nodeForm.hero_image.trim() || null,
        icon: nodeForm.icon.trim() || null,
        objectives: nodeForm.objectives.trim() || null,
      };

      if (!payload.title || !payload.node_type) {
        setSnackbar({ message: 'Title and node type are required.', severity: 'error' });
        return;
      }

      const data = await requestJson<NodeResponse>(`/api/admin/course-builder/nodes/${selectedNodeId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setSelectedNode(data.item);
      setNodes((prev) => prev.map((node) => (node.id === data.item.id ? data.item : node)));
      setSnackbar({ message: 'Node updated successfully.', severity: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save node';
      setSnackbar({ message, severity: 'error' });
    }
  };

  const archiveNode = async () => {
    if (!selectedNodeId) return;
    if (!window.confirm('Archive this node?')) return;
    try {
      await requestJson(`/api/admin/course-builder/nodes/${selectedNodeId}`, {
        method: 'DELETE',
      });
      setSnackbar({ message: 'Node archived.', severity: 'success' });
      setSelectedNodeId(null);
      void loadNodes();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive node';
      setSnackbar({ message, severity: 'error' });
    }
  };

  const openCreateDialog = () => {
    setNewNodeForm({ ...emptyNodeForm });
    setCreateOpen(true);
  };

  const handleCreateFieldChange = (field: keyof NodeFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setNewNodeForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleCreateStateChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    const value = event.target.value as NodeFormState['state'];
    setNewNodeForm((prev) => ({ ...prev, state: value }));
  };

  const createNode = async () => {
    const payload = {
      title: newNodeForm.title.trim(),
      node_type: newNodeForm.node_type.trim(),
      slug: newNodeForm.slug.trim() || null,
      description: newNodeForm.description.trim() || null,
      state: newNodeForm.state,
      hero_image: newNodeForm.hero_image.trim() || null,
      icon: newNodeForm.icon.trim() || null,
      objectives: newNodeForm.objectives.trim() || null,
    };

    if (!payload.title || !payload.node_type) {
      setSnackbar({ message: 'Title and node type are required.', severity: 'error' });
      return;
    }

    try {
      const data = await requestJson<NodeResponse>('/api/admin/course-builder/nodes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setNodes((prev) => [data.item, ...prev]);
      setCreateOpen(false);
      setSnackbar({ message: 'Node created.', severity: 'success' });
      setSelectedNodeId(data.item.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create node';
      setSnackbar({ message, severity: 'error' });
    }
  };

  const openBlockDialog = (mode: 'create' | 'edit', block?: ContentBlock) => {
    if (mode === 'edit' && block) {
      setBlockForm({
        id: block.id,
        block_type: block.block_type ?? '',
        label: block.label ?? '',
        text_md: block.text_md ?? '',
        link_url: block.link_url ?? '',
        link_label: block.link_label ?? '',
        notes: block.notes ?? '',
      });
    } else {
      setBlockForm({ ...emptyBlockForm });
    }
    setBlockDialogMode(mode);
    setBlockDialogOpen(true);
  };

  const closeBlockDialog = () => {
    setBlockDialogOpen(false);
  };

  const handleBlockFieldChange = (field: keyof BlockFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setBlockForm((prev) => ({ ...prev, [field]: value }));
    };

  const submitBlockForm = async () => {
    if (!selectedNodeId) return;
    const payload = {
      block_type: blockForm.block_type.trim(),
      label: blockForm.label.trim() || null,
      text_md: blockForm.text_md.trim() || null,
      link_url: blockForm.link_url.trim() || null,
      link_label: blockForm.link_label.trim() || null,
      notes: blockForm.notes.trim() || null,
    };

    if (!payload.block_type) {
      setSnackbar({ message: 'Block type is required.', severity: 'error' });
      return;
    }

    try {
      if (blockDialogMode === 'create') {
        const maxPosition = sortedBlocks.reduce((max, block) => Math.max(max, block.position), 0);
        await requestJson(`/api/admin/course-builder/nodes/${selectedNodeId}/blocks`, {
          method: 'POST',
          body: JSON.stringify({ ...payload, position: maxPosition + 1 }),
        });
        setSnackbar({ message: 'Block created.', severity: 'success' });
      } else if (blockDialogMode === 'edit' && blockForm.id) {
        await requestJson(`/api/admin/course-builder/nodes/${selectedNodeId}/blocks/${blockForm.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setSnackbar({ message: 'Block updated.', severity: 'success' });
      }
      setBlockDialogOpen(false);
      await loadBlocks(selectedNodeId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save block';
      setSnackbar({ message, severity: 'error' });
    }
  };

  const deleteBlock = async (block: ContentBlock) => {
    if (!selectedNodeId) return;
    if (!window.confirm('Delete this block?')) return;
    try {
      await requestJson(`/api/admin/course-builder/nodes/${selectedNodeId}/blocks/${block.id}`, {
        method: 'DELETE',
      });
      setSnackbar({ message: 'Block deleted.', severity: 'success' });
      await loadBlocks(selectedNodeId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete block';
      setSnackbar({ message, severity: 'error' });
    }
  };

  const reorderBlock = async (blockId: number, delta: number) => {
    if (!selectedNodeId) return;
    const currentOrder = sortedBlocks;
    const index = currentOrder.findIndex((block) => block.id === blockId);
    if (index === -1) return;
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, moved);

    setBlocks(nextOrder.map((block, positionIndex) => ({ ...block, position: positionIndex + 1 })));

    try {
      const payload = nextOrder.map((block, positionIndex) => ({
        id: block.id,
        position: positionIndex + 1,
      }));
      await requestJson(`/api/admin/course-builder/nodes/${selectedNodeId}/blocks`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await loadBlocks(selectedNodeId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reorder blocks';
      setSnackbar({ message, severity: 'error' });
      await loadBlocks(selectedNodeId);
    }
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
        <Box flex={1} minWidth={280}>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <TextField
              label="Search"
              size="small"
              fullWidth
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="node-state-filter-label">State</InputLabel>
              <Select
                labelId="node-state-filter-label"
                label="State"
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)}
              >
                <MenuItem value="all">All</MenuItem>
                {NODE_STATES.map((state) => (
                  <MenuItem key={state} value={state}>
                    {state}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <IconButton onClick={() => loadNodes()} aria-label="Refresh nodes" size="small">
              <RefreshIcon fontSize="small" />
            </IconButton>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
              New
            </Button>
          </Stack>
          <Paper variant="outlined" sx={{ maxHeight: 520, overflowY: 'auto' }}>
            {loadingNodes ? (
              <Box py={6} display="flex" justifyContent="center">
                <CircularProgress size={32} />
              </Box>
            ) : (
              <List disablePadding>
                {filteredNodes.length === 0 ? (
                  <ListItem>
                    <ListItemText primary="No nodes found." />
                  </ListItem>
                ) : (
                  filteredNodes.map((node) => (
                    <ListItem key={node.id} disablePadding>
                      <ListItemButton
                        selected={node.id === selectedNodeId}
                        onClick={() => setSelectedNodeId(node.id)}
                      >
                        <ListItemText
                          primary={
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="subtitle2">{node.title || 'Untitled node'}</Typography>
                              <Chip label={node.state} size="small" />
                            </Stack>
                          }
                          secondary={
                            <Typography variant="caption" color="text.secondary">
                              {node.node_type}
                              {node.slug ? ` • ${node.slug}` : ''}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  ))
                )}
              </List>
            )}
          </Paper>
        </Box>

        <Box flex={2}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {!selectedNodeId && (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                Select a node to manage
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Choose a node from the list or create a new one to manage its content and blocks.
              </Typography>
            </Paper>
          )}

          {selectedNodeId && (
            <Stack spacing={3}>
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6">Node Details</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={archiveNode}>
                      Archive
                    </Button>
                    <Button variant="contained" onClick={saveNodeChanges}>
                      Save Changes
                    </Button>
                  </Stack>
                </Stack>
                {nodeLoading ? (
                  <Box py={4} display="flex" justifyContent="center">
                    <CircularProgress />
                  </Box>
                ) : (
                  <Stack spacing={2}>
                    <TextField
                      label="Title"
                      value={nodeForm.title}
                      onChange={handleNodeFieldChange('title')}
                      fullWidth
                      required
                    />
                    <TextField
                      label="Node Type"
                      value={nodeForm.node_type}
                      onChange={handleNodeFieldChange('node_type')}
                      fullWidth
                      required
                    />
                    <TextField
                      label="Slug"
                      value={nodeForm.slug}
                      onChange={handleNodeFieldChange('slug')}
                      fullWidth
                    />
                    <FormControl fullWidth>
                      <InputLabel id="node-state-label">State</InputLabel>
                      <Select
                        labelId="node-state-label"
                        label="State"
                        value={nodeForm.state}
                        onChange={handleNodeStateChange}
                      >
                        {NODE_STATES.map((state) => (
                          <MenuItem key={state} value={state}>
                            {state}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField
                      label="Description"
                      value={nodeForm.description}
                      onChange={handleNodeFieldChange('description')}
                      fullWidth
                      multiline
                      minRows={3}
                    />
                    <TextField
                      label="Objectives"
                      value={nodeForm.objectives}
                      onChange={handleNodeFieldChange('objectives')}
                      fullWidth
                      multiline
                      minRows={2}
                    />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField
                        label="Hero Image URL"
                        value={nodeForm.hero_image}
                        onChange={handleNodeFieldChange('hero_image')}
                        fullWidth
                      />
                      <TextField
                        label="Icon"
                        value={nodeForm.icon}
                        onChange={handleNodeFieldChange('icon')}
                        fullWidth
                      />
                    </Stack>
                    {selectedNode && selectedNode.metadata && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Metadata keys: {Object.keys(selectedNode.metadata).join(', ')}
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                )}
              </Paper>

              <Paper variant="outlined" sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6">Content Blocks</Typography>
                  <Button variant="outlined" startIcon={<AddIcon />} onClick={() => openBlockDialog('create')}>
                    Add Block
                  </Button>
                </Stack>
                {blocksLoading ? (
                  <Box py={4} display="flex" justifyContent="center">
                    <CircularProgress />
                  </Box>
                ) : sortedBlocks.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No blocks yet. Add one to begin building this node.
                  </Typography>
                ) : (
                  <Stack spacing={2}>
                    {sortedBlocks.map((block, index) => (
                      <Paper key={block.id} variant="outlined" sx={{ p: 2 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                          <Box flex={1}>
                            <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                              <Chip label={`#${block.position}`} size="small" />
                              <Typography variant="subtitle2">{block.block_type}</Typography>
                              {block.label && (
                                <Chip label={block.label} size="small" color="primary" variant="outlined" />
                              )}
                            </Stack>
                            {block.text_md && (
                              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                                {block.text_md.length > 220
                                  ? `${block.text_md.slice(0, 220)}…`
                                  : block.text_md}
                              </Typography>
                            )}
                            {(block.link_url || block.notes) && (
                              <Stack spacing={0.5} mt={1}>
                                {block.link_url && (
                                  <Typography variant="body2" color="text.secondary">
                                    Link: {block.link_label || block.link_url}
                                  </Typography>
                                )}
                                {block.notes && (
                                  <Typography variant="body2" color="text.secondary">
                                    Notes: {block.notes}
                                  </Typography>
                                )}
                              </Stack>
                            )}
                          </Box>
                          <Stack spacing={1} alignItems="flex-end">
                            <Stack direction="row" spacing={1}>
                              <IconButton
                                aria-label="Move block up"
                                size="small"
                                disabled={index === 0}
                                onClick={() => reorderBlock(block.id, -1)}
                              >
                                <ArrowUpwardIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                aria-label="Move block down"
                                size="small"
                                disabled={index === sortedBlocks.length - 1}
                                onClick={() => reorderBlock(block.id, 1)}
                              >
                                <ArrowDownwardIcon fontSize="small" />
                              </IconButton>
                            </Stack>
                            <Divider flexItem orientation="horizontal" sx={{ my: 1 }} />
                            <Stack direction="row" spacing={1}>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<EditIcon />}
                                onClick={() => openBlockDialog('edit', block)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                startIcon={<DeleteIcon />}
                                onClick={() => deleteBlock(block)}
                              >
                                Delete
                              </Button>
                            </Stack>
                          </Stack>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Stack>
          )}
        </Box>
      </Stack>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create Node</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              value={newNodeForm.title}
              onChange={handleCreateFieldChange('title')}
              required
              fullWidth
            />
            <TextField
              label="Node Type"
              value={newNodeForm.node_type}
              onChange={handleCreateFieldChange('node_type')}
              required
              fullWidth
            />
            <TextField
              label="Slug"
              value={newNodeForm.slug}
              onChange={handleCreateFieldChange('slug')}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="new-node-state-label">State</InputLabel>
              <Select
                labelId="new-node-state-label"
                label="State"
                value={newNodeForm.state}
                onChange={handleCreateStateChange}
              >
                {NODE_STATES.map((state) => (
                  <MenuItem key={state} value={state}>
                    {state}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Description"
              value={newNodeForm.description}
              onChange={handleCreateFieldChange('description')}
              fullWidth
              multiline
              minRows={2}
            />
            <TextField
              label="Objectives"
              value={newNodeForm.objectives}
              onChange={handleCreateFieldChange('objectives')}
              fullWidth
              multiline
              minRows={2}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Hero Image URL"
                value={newNodeForm.hero_image}
                onChange={handleCreateFieldChange('hero_image')}
                fullWidth
              />
              <TextField
                label="Icon"
                value={newNodeForm.icon}
                onChange={handleCreateFieldChange('icon')}
                fullWidth
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button onClick={createNode} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={blockDialogOpen} onClose={closeBlockDialog} fullWidth maxWidth="sm">
        <DialogTitle>{blockDialogMode === 'create' ? 'Add Block' : 'Edit Block'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Block Type"
              value={blockForm.block_type}
              onChange={handleBlockFieldChange('block_type')}
              required
              fullWidth
            />
            <TextField
              label="Label"
              value={blockForm.label}
              onChange={handleBlockFieldChange('label')}
              fullWidth
            />
            <TextField
              label="Markdown / Text"
              value={blockForm.text_md}
              onChange={handleBlockFieldChange('text_md')}
              fullWidth
              multiline
              minRows={3}
            />
            <TextField
              label="Link URL"
              value={blockForm.link_url}
              onChange={handleBlockFieldChange('link_url')}
              fullWidth
            />
            <TextField
              label="Link Label"
              value={blockForm.link_label}
              onChange={handleBlockFieldChange('link_label')}
              fullWidth
            />
            <TextField
              label="Notes"
              value={blockForm.notes}
              onChange={handleBlockFieldChange('notes')}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeBlockDialog}>Cancel</Button>
          <Button onClick={submitBlockForm} variant="contained">
            {blockDialogMode === 'create' ? 'Add Block' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {snackbar && (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}
