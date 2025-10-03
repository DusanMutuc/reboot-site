'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, CircularProgress, Menu, MenuItem, Snackbar, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';

import type {
  BlockType,
  ContentBlock,
  ContentNode,
  NodeChild,
  NodeEdgeRule,
  NodeSubtree,
  NodeType,
} from '@/types/course';
import Canvas from './Canvas/Canvas';
import Tree from './Sidebar/Tree';
import Properties, { type NodeDraft, type PropertiesTab } from './Sidebar/Properties';
import Toolbar from './Toolbar/Toolbar';
import {
  attachChild,
  createBlock,
  createNode,
  deleteBlock,
  deleteNode,
  detachChild,
  duplicateNode,
  fetchCourseTrees,
  fetchEdgeRules,
  reorderBlocks,
  reorderChildren,
  searchNodes,
  updateBlock,
  updateChild,
  updateNode,
} from './api/requests';
import { EditorStoreProvider, useEditorStore } from './state/editorStore';
import type { RenderableResource } from '@/components/course/BlockRenderer';
import ResourcePickerDialog from './Canvas/ResourcePickerDialog';
import AddChildDialog from './Sidebar/AddChildDialog';
import DeleteDialog from './Sidebar/DeleteDialog';
import DuplicateDialog from './Sidebar/DuplicateDialog';
import { supabase } from '@/lib/supabaseClient';

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

function sortBlocks(blocks: ContentBlock[]) {
  return [...blocks].sort((a, b) => a.position - b.position);
}

function CourseEditorInner() {
  const {
    selectedNodeId,
    selectedBlockId,
    savingState,
    savingMessage,
    setSelectedNodeId,
    setSelectedBlockId,
    setSavingState,
  } = useEditorStore();

  const [trees, setTrees] = useState<NodeSubtree[]>([]);
  const [rules, setRules] = useState<NodeEdgeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [nodeDraft, setNodeDraft] = useState<NodeDraft | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [propertiesTab, setPropertiesTab] = useState<PropertiesTab>('details');
  const [resourceCache, setResourceCache] = useState<Record<number, RenderableResource>>({});
  const [snack, setSnack] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuNodeId, setMenuNodeId] = useState<number | null>(null);
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [resourceDialogMode, setResourceDialogMode] = useState<{ type: 'insert' | 'update'; index?: number; blockId?: number } | null>(null);
  const [addChildDialog, setAddChildDialog] = useState<{
    open: boolean;
    parentId: number | null;
    mode: 'create' | 'attach';
    type?: NodeType;
  }>({ open: false, parentId: null, mode: 'create' });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; nodeId: number | null }>(
    { open: false, nodeId: null },
  );
  const [duplicateDialog, setDuplicateDialog] = useState<{ open: boolean; nodeId: number | null }>({ open: false, nodeId: null });
  const [searchResults, setSearchResults] = useState<{ loading: boolean; rows: ContentNode[]; error?: string }>({
    loading: false,
    rows: [],
  });
  const [attachQuery, setAttachQuery] = useState('');

  const blockUpdateQueue = useRef<Map<number, Partial<ContentBlock>>>(new Map());
  const blockDebounceTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const nodeUpdateQueue = useRef<Map<number, Partial<ContentNode>>>(new Map());
  const nodeDebounceTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const optimisticSnapshot = useRef<NodeSubtree[] | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subtrees, edgeRules] = await Promise.all([fetchCourseTrees('course'), fetchEdgeRules()]);
      setTrees(subtrees);
      setRules(edgeRules);
      const first = subtrees[0]?.node.id ?? null;
      setSelectedNodeId(first);
      setSelectedBlockId(null);
      setExpanded(new Set(subtrees.map((tree) => tree.node.id)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [setSelectedNodeId, setSelectedBlockId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedSubtree = useMemo(() => {
    if (selectedNodeId == null) return null;
    return findSubtree(trees, selectedNodeId);
  }, [trees, selectedNodeId]);

  const sortedBlocks = useMemo(() => {
    if (!selectedSubtree) return [] as ContentBlock[];
    return sortBlocks(selectedSubtree.blocks);
  }, [selectedSubtree]);

  useEffect(() => {
    if (!selectedSubtree) {
      setNodeDraft(null);
      return;
    }

    setNodeDraft({
      title: selectedSubtree.node.title ?? '',
      slug: selectedSubtree.node.slug ?? '',
      description: selectedSubtree.node.description ?? '',
      hero_image: selectedSubtree.node.hero_image ?? '',
      icon: selectedSubtree.node.icon ?? '',
      objectives: selectedSubtree.node.objectives ?? '',
      metadata: selectedSubtree.node.metadata ? JSON.stringify(selectedSubtree.node.metadata, null, 2) : '',
    });
    setMetadataError(null);
  }, [selectedSubtree]);

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

  const startSaving = useCallback((message?: string) => {
    setSavingState('saving', message ?? 'Saving…');
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
  }, [setSavingState]);

  const completeSaving = useCallback((message?: string) => {
    setSavingState('saved', message ?? 'Changes saved');
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      setSavingState('idle', 'All changes saved');
    }, 2000);
  }, [setSavingState]);

  const failSaving = useCallback((message?: string) => {
    setSavingState('error', message ?? 'Failed to save changes');
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [setSavingState]);

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
      } else {
        optimisticSnapshot.current = null;
      }

      if (!options.silent) {
        startSaving(options.savingMessage);
      }

      try {
        const payload = await request();
        const subtree = 'subtree' in payload ? payload.subtree : (payload as NodeSubtree);
        if (subtree) {
          setTrees((prev) => mergeSubtree(prev, subtree));
        }
        completeSaving(options.message);
        if (options.message) {
          setSnack({ message: options.message, severity: 'success' });
        }
        return payload;
      } catch (err) {
        if (optimisticSnapshot.current) {
          setTrees(optimisticSnapshot.current);
        }
        const message = err instanceof Error ? err.message : 'Failed to save changes';
        failSaving(message);
        setSnack({ message, severity: 'error' });
        throw err;
      } finally {
        optimisticSnapshot.current = null;
      }
    },
    [startSaving, completeSaving, failSaving],
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
          const subtree = await updateBlock(blockId, pending);
          return { subtree };
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
        return prev.map((tree) => updateBlockDraft(tree, blockId, updates));
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
          const subtree = await updateNode(nodeId, pending);
          return { subtree };
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
        return prev.map((tree) => updateNodeDraft(tree, nodeId, updates));
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

  const ensureResource = useCallback(
    async (resourceId: number) => {
      if (resourceCache[resourceId]) {
        return resourceCache[resourceId];
      }
      const { data, error } = await supabase
        .from('resources')
        .select('id,title,type,state,thumbnail,duration,url')
        .eq('id', resourceId)
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      if (data) {
        const resource = data as RenderableResource;
        setResourceCache((prev) => ({ ...prev, [resourceId]: resource }));
        return resource;
      }
      return null;
    },
    [resourceCache, setResourceCache],
  );

  useEffect(() => {
    if (!selectedSubtree) return;
    const resourceIds = selectedSubtree.blocks
      .filter((block) => block.block_type === 'asset' && block.resource_id)
      .map((block) => block.resource_id!)
      .filter((id, index, arr) => arr.indexOf(id) === index);

    resourceIds.forEach((id) => {
      if (!resourceCache[id]) {
        void ensureResource(id).catch(() => undefined);
      }
    });
  }, [selectedSubtree, resourceCache, ensureResource]);

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

      const mapped: Partial<ContentNode> = {
        [field]: value ? value : null,
      } as Partial<ContentNode>;
      queueNodeUpdate(nodeId, mapped);
    },
    [queueNodeUpdate, selectedSubtree],
  );

  const handleCreateBlock = useCallback(
    async (nodeId: number, block: Partial<ContentBlock> & { block_type: BlockType }, position: number) => {
      await runMutation(
        async () => {
          const subtree = await createBlock(nodeId, { ...block, position });
          return { subtree };
        },
        { message: 'Block created', savingMessage: 'Creating block…' },
      );
    },
    [runMutation],
  );

  const handleAddBlock = useCallback(
    (type: BlockType) => {
      if (!selectedSubtree) return;
      const position = sortedBlocks.length;
      if (type === 'asset') {
        setResourceDialogMode({ type: 'insert', index: position });
        setResourceDialogOpen(true);
        return;
      }

      const payload: Partial<ContentBlock> & { block_type: BlockType } =
        type === 'text' ? { block_type: 'text', text_md: 'Start writing here…' } : { block_type: 'divider' };
      void handleCreateBlock(selectedSubtree.node.id, payload, position);
    },
    [handleCreateBlock, selectedSubtree, sortedBlocks],
  );

  const handleDeleteBlock = useCallback(
    async (blockId: number) => {
      await runMutation(
        async () => {
          const subtree = await deleteBlock(blockId);
          return { subtree };
        },
        { message: 'Block deleted' },
      );
      if (selectedBlockId === blockId) {
        setSelectedBlockId(null);
      }
    },
    [runMutation, selectedBlockId, setSelectedBlockId],
  );

  const handleReorderBlock = useCallback(
    async (blockId: number, direction: 'up' | 'down') => {
      if (!selectedSubtree) return;
      const ordered = sortBlocks(selectedSubtree.blocks);
      const currentIndex = ordered.findIndex((block) => block.id === blockId);
      if (currentIndex === -1) return;
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= ordered.length) return;

      const nextOrder = [...ordered];
      const [moved] = nextOrder.splice(currentIndex, 1);
      nextOrder.splice(targetIndex, 0, moved);
      const updates = nextOrder.map((block, index) => ({ block_id: block.id, position: index }));

      await runMutation(
        async () => {
          const subtree = await reorderBlocks(selectedSubtree.node.id, updates);
          return { subtree };
        },
        { silent: true },
      );
    },
    [runMutation, selectedSubtree],
  );

  const handleDeleteNode = useCallback(
    async (nodeId: number) => {
      await runMutation(
        async () => {
          await deleteNode(nodeId);
          return {};
        },
        { message: 'Node deleted' },
      );
      setTrees((prev) => removeSubtree(prev, nodeId));
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
        setSelectedBlockId(null);
      }
    },
    [runMutation, selectedNodeId, setSelectedNodeId, setSelectedBlockId],
  );

  const handleAddChild = useCallback(
    async (parentId: number | null, payload: { node_type: NodeType; title: string }) => {
      await runMutation(
        async () => {
          const subtree = await createNode({ node: payload, parent: parentId ? { parent_id: parentId } : null });
          return { subtree };
        },
        { message: 'Node created', savingMessage: 'Creating node…' },
      );
    },
    [runMutation],
  );

  const handleAttachChild = useCallback(
    async (parentId: number, childId: number) => {
      await runMutation(
        async () => {
          const subtree = await attachChild(parentId, childId);
          return { subtree };
        },
        { message: 'Child attached' },
      );
    },
    [runMutation],
  );

  const handleUpdateChild = useCallback(
    async (parentId: number, childId: number, updates: Partial<NodeChild>) => {
      await runMutation(
        async () => {
          const subtree = await updateChild(parentId, childId, updates);
          return { subtree };
        },
        { silent: true },
      );
    },
    [runMutation],
  );

  const handleDetachChild = useCallback(
    async (parentId: number, childId: number) => {
      await runMutation(
        async () => {
          const subtree = await detachChild(parentId, childId);
          return { subtree };
        },
        { message: 'Child detached' },
      );
    },
    [runMutation],
  );

  const handleReorderChild = useCallback(
    async (parentId: number, childId: number, direction: 'up' | 'down') => {
      const subtree = findSubtree(trees, parentId);
      if (!subtree) return;
      const ordered = [...subtree.children].sort((a, b) => a.edge.position - b.edge.position);
      const index = ordered.findIndex((child) => child.edge.child_id === childId);
      if (index === -1) return;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= ordered.length) return;
      const nextOrder = [...ordered];
      const [moved] = nextOrder.splice(index, 1);
      nextOrder.splice(targetIndex, 0, moved);
      const updates = nextOrder.map((child, idx) => ({ child_id: child.edge.child_id, position: idx }));

      await runMutation(
        async () => {
          const subtreeResponse = await reorderChildren(parentId, updates);
          return { subtree: subtreeResponse };
        },
        { silent: true },
      );
    },
    [runMutation, trees],
  );

  const handleDuplicateNode = useCallback(
    async (nodeId: number) => {
      const parent = findParentEdge(trees, nodeId);
      await runMutation(
        async () => {
          const subtree = await duplicateNode(nodeId, parent ? parent.parent_id : null);
          return { subtree };
        },
        { message: 'Node duplicated' },
      );
    },
    [runMutation, trees],
  );

  const getAvailableChildTypes = useCallback(
    (parentId: number | null) => {
      if (parentId == null) return [] as NodeType[];
      const parent = findSubtree(trees, parentId);
      if (!parent) return [] as NodeType[];
      return rules
        .filter((rule) => rule.parent_type === parent.node.node_type && rule.child_kind === 'node')
        .map((rule) => rule.child_type as NodeType);
    },
    [rules, trees],
  );

  const handleStateChange = useCallback(
    (state: ContentNode['state']) => {
      if (!selectedSubtree) return;
      queueNodeUpdate(selectedSubtree.node.id, { state }, { debounce: false });
    },
    [queueNodeUpdate, selectedSubtree],
  );

  const handleSelectBlock = useCallback(
    (block: ContentBlock) => {
      setSelectedBlockId(block.id);
      setPropertiesTab('blocks');
    },
    [setSelectedBlockId],
  );

  const handleResourceSelected = useCallback(
    (resource: RenderableResource) => {
      setResourceCache((prev) => ({ ...prev, [resource.id]: resource }));
      if (!resourceDialogMode) return;
      if (resourceDialogMode.type === 'insert') {
        if (!selectedSubtree) return;
        void handleCreateBlock(
          selectedSubtree.node.id,
          { block_type: 'asset', resource_id: resource.id },
          resourceDialogMode.index ?? sortedBlocks.length,
        );
      } else if (resourceDialogMode.type === 'update' && resourceDialogMode.blockId) {
        queueBlockUpdate(resourceDialogMode.blockId, { resource_id: resource.id }, { debounce: false });
      }
      setResourceDialogMode(null);
      setResourceDialogOpen(false);
    },
    [handleCreateBlock, queueBlockUpdate, resourceDialogMode, selectedSubtree, sortedBlocks],
  );

  useEffect(() => {
    if (addChildDialog.open && addChildDialog.mode === 'attach' && addChildDialog.parentId != null) {
      setSearchResults({ loading: true, rows: [] });
      const controller = new AbortController();
      const load = async () => {
        try {
          const rows = await searchNodes(attachQuery, addChildDialog.parentId ?? undefined);
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

  if (loading) {
    return (
      <Box sx={{ p: 6, display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 6 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Stack direction="row" spacing={1}>
          <Typography variant="body2">Retry loading the editor.</Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Fragment>
      <Stack sx={{ height: '100%', minHeight: '80vh', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Toolbar
          subtree={selectedSubtree}
          nodeDraft={nodeDraft}
          previewMode={previewMode}
          onPreviewModeChange={(value) => {
            setPreviewMode(value);
            if (value) {
              setSelectedBlockId(null);
            }
          }}
          onStateChange={(state) => handleStateChange(state)}
          onShowDetails={() => setPropertiesTab('details')}
        />
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '3fr 5fr 4fr' },
          }}
        >
          <Box sx={{ borderRight: { md: '1px solid' }, borderColor: 'divider', minHeight: 0 }}>
            <Tree
              trees={trees}
              expanded={expanded}
              search={search}
              selectedNodeId={selectedNodeId}
              onSearchChange={setSearch}
              onToggle={toggleExpand}
              onSelect={(id) => {
                setSelectedNodeId(id);
                setSelectedBlockId(null);
              }}
              onContextMenu={(event, nodeId) => {
                setMenuAnchor(event.currentTarget as HTMLElement);
                setMenuNodeId(nodeId);
              }}
            />
          </Box>
          <Box sx={{ borderRight: { md: '1px solid' }, borderColor: 'divider', minHeight: 0 }}>
            <Canvas
              subtree={selectedSubtree}
              resources={resourceCache}
              selectedBlockId={selectedBlockId}
              onSelectBlock={handleSelectBlock}
              previewMode={previewMode}
            />
          </Box>
          <Box sx={{ minHeight: 0 }}>
            <Properties
              subtree={selectedSubtree}
              nodeDraft={nodeDraft}
              metadataError={metadataError}
              onNodeFieldChange={handleNodeFieldChange}
              onRequestAddChild={(mode, options) =>
                setAddChildDialog({ open: true, parentId: selectedSubtree?.node.id ?? null, mode, type: options?.type })
              }
              onReorderChild={(childId, direction) => selectedSubtree && void handleReorderChild(selectedSubtree.node.id, childId, direction)}
              onUpdateChild={(childId, updates) => selectedSubtree && void handleUpdateChild(selectedSubtree.node.id, childId, updates)}
              onRemoveChild={(childId) => selectedSubtree && void handleDetachChild(selectedSubtree.node.id, childId)}
              selectedBlockId={selectedBlockId}
              onSelectBlock={(blockId) => {
                if (blockId == null) {
                  setSelectedBlockId(null);
                } else {
                  const block = sortedBlocks.find((row) => row.id === blockId);
                  if (block) {
                    handleSelectBlock(block);
                  }
                }
              }}
              onAddBlock={handleAddBlock}
              onQueueBlockUpdate={queueBlockUpdate}
              onDeleteBlock={handleDeleteBlock}
              onReorderBlock={(blockId, direction) => void handleReorderBlock(blockId, direction)}
              onOpenResourcePicker={(mode, blockId) => {
                if (!selectedSubtree) return;
                setResourceDialogMode({ type: mode, blockId });
                setResourceDialogOpen(true);
              }}
              resources={resourceCache}
              savingState={savingState}
              savingMessage={savingMessage}
              tab={propertiesTab}
              onTabChange={(value) => setPropertiesTab(value)}
              availableChildTypes={getAvailableChildTypes(selectedSubtree?.node.id ?? null)}
            />
          </Box>
        </Box>
      </Stack>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            if (!menuNodeId) return;
            setMenuAnchor(null);
            setAddChildDialog({ open: true, parentId: menuNodeId, mode: 'create' });
          }}
        >
          <AddIcon fontSize="small" sx={{ mr: 1 }} /> Add child
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!menuNodeId) return;
            setMenuAnchor(null);
            setAddChildDialog({ open: true, parentId: menuNodeId, mode: 'attach' });
          }}
        >
          <SearchIcon fontSize="small" sx={{ mr: 1 }} /> Attach existing
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!menuNodeId) return;
            setMenuAnchor(null);
            setDuplicateDialog({ open: true, nodeId: menuNodeId });
          }}
        >
          <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} /> Duplicate
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!menuNodeId) return;
            setMenuAnchor(null);
            setDeleteDialog({ open: true, nodeId: menuNodeId });
          }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Delete
        </MenuItem>
      </Menu>

      <ResourcePickerDialog
        open={resourceDialogOpen}
        onClose={() => {
          setResourceDialogOpen(false);
          setResourceDialogMode(null);
        }}
        onSelect={handleResourceSelected}
      />

      <AddChildDialog
        open={addChildDialog.open}
        mode={addChildDialog.mode}
        parentId={addChildDialog.parentId}
        type={addChildDialog.type}
        availableTypes={getAvailableChildTypes(addChildDialog.parentId ?? null)}
        searchResults={searchResults}
        attachQuery={attachQuery}
        onAttachQueryChange={setAttachQuery}
        onClose={() => setAddChildDialog({ open: false, parentId: null, mode: 'create' })}
        onCreate={(title, type) => {
          if (!addChildDialog.parentId) {
            void handleAddChild(null, { node_type: type, title });
          } else {
            void handleAddChild(addChildDialog.parentId, { node_type: type, title });
          }
          setAddChildDialog({ open: false, parentId: null, mode: 'create' });
        }}
        onAttach={(childId) => {
          if (!addChildDialog.parentId) return;
          void handleAttachChild(addChildDialog.parentId, childId);
          setAddChildDialog({ open: false, parentId: null, mode: 'create' });
        }}
      />

      <DeleteDialog
        open={deleteDialog.open}
        subtree={deleteDialog.nodeId ? findSubtree(trees, deleteDialog.nodeId) : null}
        onClose={() => setDeleteDialog({ open: false, nodeId: null })}
        onConfirm={(nodeId) => {
          void handleDeleteNode(nodeId);
          setDeleteDialog({ open: false, nodeId: null });
        }}
      />

      <DuplicateDialog
        open={duplicateDialog.open}
        nodeId={duplicateDialog.nodeId}
        onClose={() => setDuplicateDialog({ open: false, nodeId: null })}
        onConfirm={(nodeId) => {
          void handleDuplicateNode(nodeId);
          setDuplicateDialog({ open: false, nodeId: null });
        }}
      />

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)}>
        {snack ? <Alert severity={snack.severity}>{snack.message}</Alert> : undefined}
      </Snackbar>
    </Fragment>
  );
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

export default function CourseEditor() {
  return (
    <EditorStoreProvider>
      <CourseEditorInner />
    </EditorStoreProvider>
  );
}
