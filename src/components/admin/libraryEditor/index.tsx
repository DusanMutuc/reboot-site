'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Snackbar,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

import type {
  BlockType,
  ContentBlock,
  ContentNode,
  NodeChild,
  NodeEdgeRule,
  NodeSubtree,
  NodeType,
} from '@/types/course';

import Toolbar from '@/components/admin/courseEditor/Toolbar/Toolbar';
import Canvas from '@/components/admin/courseEditor/Canvas/Canvas'; // NOTE: keep your actual path/casing
import Properties, { type NodeDraft } from '@/components/admin/courseEditor/Sidebar/Properties';
import ResourcePickerDialog from '@/components/admin/courseEditor/Canvas/ResourcePickerDialog';
import HeroImageManagerDialog from '@/components/admin/courseEditor/HeroImageManagerDialog';
import { EditorStoreProvider, useEditorStore } from '@/components/admin/courseEditor/state/editorStore';

import LibraryList from './libraryList';

import {
  attachChild,
  createBlock,
  createNode,
  deleteBlock,
  detachChild,
  duplicateNode,
  fetchCourseTrees,
  fetchEdgeRules,
  reorderBlocks,
  reorderChildren,
  updateBlock,
  updateChild,
  updateNode,
} from '@/components/admin/courseEditor/api/requests';

import type { RenderableResource } from '@/components/course/BlockRenderer';
import { supabase } from '@/lib/supabaseClient';

// ---------- helpers copied from your CourseEditor (trimmed to what we use) ----------
function cloneSubtree(subtree: NodeSubtree): NodeSubtree {
  return {
    node: { ...subtree.node },
    blocks: subtree.blocks.map((b) => ({ ...b })),
    children: subtree.children.map((c) => ({ edge: { ...c.edge }, subtree: cloneSubtree(c.subtree) })),
  };
}
function isNodeSubtree(v: unknown): v is NodeSubtree {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return Array.isArray(obj.blocks) && Array.isArray(obj.children) && typeof obj.node === 'object' && obj.node !== null;
}
function findSubtree(list: NodeSubtree[], nodeId: number): NodeSubtree | null {
  for (const t of list) {
    if (t.node.id === nodeId) return t;
    for (const c of t.children) {
      const f = findSubtree([c.subtree], nodeId);
      if (f) return f;
    }
  }
  return null;
}
function replaceSubtree(tree: NodeSubtree, updated: NodeSubtree): { next: NodeSubtree; replaced: boolean } {
  if (tree.node.id === updated.node.id) return { next: updated, replaced: true };
  let replaced = false;
  const children = tree.children.map((child) => {
    const r = replaceSubtree(child.subtree, updated);
    if (r.replaced) {
      replaced = true;
      return { edge: { ...child.edge }, subtree: r.next };
    }
    return child;
  });
  if (!replaced) return { next: tree, replaced: false };
  return { next: { node: { ...tree.node }, blocks: tree.blocks.map((b) => ({ ...b })), children }, replaced: true };
}
function mergeSubtree(list: NodeSubtree[], updated: NodeSubtree) {
  let found = false;
  const next = list.map((t) => {
    const res = replaceSubtree(t, updated);
    if (res.replaced) {
      found = true;
      return res.next;
    }
    return t;
  });
  if (!found) next.push(updated);
  return next;
}
function updateNodeDraft(subtree: NodeSubtree, nodeId: number, updates: Partial<ContentNode>): NodeSubtree {
  const node = subtree.node.id === nodeId ? { ...subtree.node, ...updates } : { ...subtree.node };
  return {
    node,
    blocks: subtree.blocks.map((b) => ({ ...b })),
    children: subtree.children.map((c) => ({ edge: { ...c.edge }, subtree: updateNodeDraft(c.subtree, nodeId, updates) })),
  };
}
function sortBlocks(blocks: ContentBlock[]) {
  return [...blocks].sort((a, b) => a.position - b.position);
}
const EMPTY_HTML_PLACEHOLDER = '<p></p>';
const ALT_EMPTY_HTML_PLACEHOLDER = '<p><br></p>';
function normalizeHtmlContent(html?: string | null) {
  const trimmed = (html ?? '').trim();
  if (!trimmed || trimmed === EMPTY_HTML_PLACEHOLDER || trimmed === ALT_EMPTY_HTML_PLACEHOLDER) {
    return EMPTY_HTML_PLACEHOLDER;
  }
  return html ?? EMPTY_HTML_PLACEHOLDER;
}
// -----------------------------------------------------------------------------------

type LibraryMode = 'main' | 'assistant';

async function resolveLibraryEditorRootId(mode: LibraryMode): Promise<number> {
  if (mode === 'assistant') {
    const { data: assistantRoot, error } = await supabase
      .from('content_nodes')
      .select('id')
      .eq('slug', 'assistant-library')
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!assistantRoot?.id) {
      throw new Error('Assistant Library collection not found.');
    }

    return assistantRoot.id;
  }

  const { data: librarySlug, error: slugError } = await supabase
    .from('content_nodes')
    .select('id')
    .eq('slug', 'library')
    .maybeSingle();

  if (slugError) {
    throw new Error(slugError.message);
  }

  if (librarySlug?.id) {
    return librarySlug.id;
  }

  const { data: latestCollection, error: latestError } = await supabase
    .from('content_nodes')
    .select('id')
    .eq('node_type', 'collection')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(latestError.message);
  }

  if (!latestCollection?.id) {
    throw new Error('No Library collection found.');
  }

  return latestCollection.id;
}

function LibraryEditorInner() {
  const {
    selectedNodeId,
    selectedBlockId,
    editingBlockId,
    savingState,
    savingMessage,
    setSelectedNodeId,
    setSelectedBlockId,
    setEditingBlockId,
    setSavingState,
    // 🔹 add preview support like course editor
    editorMode,
    setEditorMode,
  } = useEditorStore();

  const [trees, setTrees] = useState<NodeSubtree[]>([]);
  const [rules, setRules] = useState<NodeEdgeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [libraryMode, setLibraryMode] = useState<LibraryMode>('main');

  // library-specific
  const [nodeDraft, setNodeDraft] = useState<NodeDraft | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [resourceCache, setResourceCache] = useState<Record<number, RenderableResource>>({});
  const [snack, setSnack] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  // dialogs
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [resourceDialogMode, setResourceDialogMode] = useState<{ type: 'insert' | 'update'; index?: number; blockId?: number } | null>(null);

  const [heroDialog, setHeroDialog] = useState<{ open: boolean; nodeId: number | null }>({ open: false, nodeId: null });
  const heroNode = heroDialog.nodeId ? findSubtree(trees, heroDialog.nodeId) : null;
  const heroCourseId = heroNode?.node.id ?? null;
  const heroCurrentPath = heroNode?.node.hero_image ?? null;

  // optimistic queues copied from CourseEditor (but trimmed to blocks & nodes we use)
  const blockUpdateQueue = useRef<Map<number, Partial<ContentBlock>>>(new Map());
  const blockDebounceTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const nodeUpdateQueue = useRef<Map<number, Partial<ContentNode>>>(new Map());
  const nodeDebounceTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const optimisticSnapshot = useRef<NodeSubtree[] | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startSaving = useCallback((message?: string) => {
    setSavingState('saving', message ?? 'Saving…');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, [setSavingState]);
  const completeSaving = useCallback((message?: string) => {
    setSavingState('saved', message ?? 'Changes saved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSavingState('idle', 'All changes saved'), 2000);
  }, [setSavingState]);
  const failSaving = useCallback((message?: string) => {
    setSavingState('error', message ?? 'Failed to save changes');
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
  }, [setSavingState]);

  const applyAllPendingDrafts = useCallback(
    (forest: NodeSubtree[]) => {
      let next = forest;
      nodeUpdateQueue.current.forEach((updates, nodeId) => {
        next = next.map((tree) => updateNodeDraft(tree, nodeId, updates));
      });
      // (we only need node drafts eagerly in Library; block optimistic is applied by actual Canvas edits)
      return next;
    },
    [],
  );

  const runMutation = useCallback(
    async (request: () => Promise<NodeSubtree | { subtree?: NodeSubtree; parentSubtree?: NodeSubtree | null }>, options: {
      optimistic?: (prev: NodeSubtree[]) => NodeSubtree[];
      message?: string;
      savingMessage?: string;
      silent?: boolean;
    } = {}) => {
      if (options.optimistic) {
        setTrees((prev) => {
          optimisticSnapshot.current = prev.map((t) => cloneSubtree(t));
          const optimisticResult = options.optimistic ? options.optimistic(prev) : prev;
          return applyAllPendingDrafts(optimisticResult);
        });
      } else {
        optimisticSnapshot.current = null;
      }
      if (!options.silent) startSaving(options.savingMessage);

      try {
        const payload = await request();
        let subtree: NodeSubtree | null = null;
        let parentSubtree: NodeSubtree | null = null;

        if (isNodeSubtree(payload)) {
          subtree = payload;
        } else if (payload && typeof payload === 'object') {
          const r = payload as { subtree?: NodeSubtree | null; parentSubtree?: NodeSubtree | null };
          if (r.subtree && isNodeSubtree(r.subtree)) subtree = r.subtree;
          if (r.parentSubtree && isNodeSubtree(r.parentSubtree)) parentSubtree = r.parentSubtree;
        }

        if (subtree || parentSubtree) {
          setTrees((prev) => {
            let next = prev;
            if (parentSubtree) next = mergeSubtree(next, parentSubtree);
            if (subtree) next = mergeSubtree(next, subtree);
            return applyAllPendingDrafts(next);
          });
        }
        completeSaving(options.message);
        if (options.message) setSnack({ message: options.message, severity: 'success' });
        return payload;
      } catch (err) {
        if (optimisticSnapshot.current) setTrees(applyAllPendingDrafts(optimisticSnapshot.current));
        const message = err instanceof Error ? err.message : 'Failed to save changes';
        failSaving(message);
        setSnack({ message, severity: 'error' });
        throw err;
      } finally {
        optimisticSnapshot.current = null;
      }
    },
    [applyAllPendingDrafts, startSaving, completeSaving, failSaving],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rootId = await resolveLibraryEditorRootId(libraryMode);
      const [subtrees, edgeRules] = await Promise.all([
        fetchCourseTrees('collection', rootId),
        fetchEdgeRules(),
      ]);
      setTrees(subtrees);
      setRules(edgeRules);

      setSelectedNodeId(subtrees[0]?.node?.id ?? null);
      setSelectedBlockId(null);
      setEditingBlockId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load library';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [libraryMode, setEditingBlockId, setSelectedBlockId, setSelectedNodeId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const selectedSubtree = useMemo(() => {
    if (selectedNodeId == null) return null;
    return findSubtree(trees, selectedNodeId);
  }, [trees, selectedNodeId]);

  const sortedBlocks = useMemo(() => {
    if (!selectedSubtree) return [] as ContentBlock[];
    return sortBlocks(selectedSubtree.blocks);
  }, [selectedSubtree]);

  // node draft mirror
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

  // ensure resources cache
  const ensureResource = useCallback(
    async (resourceId: number): Promise<RenderableResource | null> => {
      if (resourceCache[resourceId]) return resourceCache[resourceId];
      const { data, error } = await supabase
        .from('resources')
        .select('id,title,type,state,thumbnail,duration,url')
        .eq('id', resourceId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) {
        const resource = data as RenderableResource;
        setResourceCache((prev) => ({ ...prev, [resourceId]: resource }));
        return resource;
      }
      return null;
    },
    [resourceCache],
  );

  useEffect(() => {
    if (!selectedSubtree) return;
    const resourceIds = selectedSubtree.blocks
      .filter((b) => b.block_type === 'asset' && b.resource_id)
      .map((b) => b.resource_id!)
      .filter((id, i, arr) => arr.indexOf(id) === i);
    resourceIds.forEach((id) => { if (!resourceCache[id]) void ensureResource(id).catch(() => undefined); });
  }, [selectedSubtree, resourceCache, ensureResource]);

  // hero image save
  const queueNodeUpdate = useCallback((nodeId: number, updates: Partial<ContentNode>, options: { debounce?: boolean } = { debounce: true }) => {
    setTrees((prev) => {
      if (!optimisticSnapshot.current) optimisticSnapshot.current = prev.map((t) => cloneSubtree(t));
      return prev.map((t) => updateNodeDraft(t, nodeId, updates));
    });
    const current = nodeUpdateQueue.current.get(nodeId) ?? {};
    nodeUpdateQueue.current.set(nodeId, { ...current, ...updates });

    if (options.debounce) {
      const existing = nodeDebounceTimers.current.get(nodeId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => { void flushNodeUpdate(nodeId); }, 800);
      nodeDebounceTimers.current.set(nodeId, timer);
    } else {
      void flushNodeUpdate(nodeId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // defined here so we can add it to deps where needed

  const handleHeroPathChange = useCallback((newPath: string | null) => {
    if (!heroCourseId) return;
    queueNodeUpdate(heroCourseId, { hero_image: newPath }, { debounce: false });
  }, [heroCourseId, queueNodeUpdate]);

  // --- block/node queue (trimmed) ---
  const flushNodeUpdate = useCallback(async (nodeId: number) => {
    const pending = nodeUpdateQueue.current.get(nodeId);
    if (!pending) return;
    nodeUpdateQueue.current.delete(nodeId);
    const timer = nodeDebounceTimers.current.get(nodeId);
    if (timer) { clearTimeout(timer); nodeDebounceTimers.current.delete(nodeId); }

    await runMutation(async () => {
      const subtree = await updateNode(nodeId, pending);
      return { subtree };
    }, { silent: true });
  }, [runMutation]);

  const flushBlockUpdate = useCallback(async (blockId: number) => {
    const pending = blockUpdateQueue.current.get(blockId);
    if (!pending) return;
    blockUpdateQueue.current.delete(blockId);
    const timer = blockDebounceTimers.current.get(blockId);
    if (timer) { clearTimeout(timer); blockDebounceTimers.current.delete(blockId); }

    await runMutation(async () => {
      const subtree = await updateBlock(blockId, pending);
      return { subtree };
    }, { savingMessage: 'Saving…' });
  }, [runMutation]);

  const queueBlockUpdate = useCallback((blockId: number, updates: Partial<ContentBlock>, options: { debounce?: boolean } = { debounce: true }) => {
    setSavingState('saving', 'Saving…');
    const existing = blockDebounceTimers.current.get(blockId);
    if (existing) clearTimeout(existing);
    if (options.debounce) {
      const timer = setTimeout(() => { void flushBlockUpdate(blockId); }, 800);
      blockDebounceTimers.current.set(blockId, timer);
    } else {
      void flushBlockUpdate(blockId);
    }
    const current = blockUpdateQueue.current.get(blockId) ?? {};
    blockUpdateQueue.current.set(blockId, { ...current, ...updates });
  }, [flushBlockUpdate, setSavingState]);

  // --- Library interactions (mostly pass-through to your existing handlers) ---
  const handleSelectNode = useCallback((nodeId: number) => {
    setSelectedNodeId(nodeId);
    setSelectedBlockId(null);
    setEditingBlockId(null);
  }, [setEditingBlockId, setSelectedBlockId, setSelectedNodeId]);

  const handleNodeFieldChange = useCallback((field: keyof NodeDraft, value: string) => {
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

    const mapped: Partial<ContentNode> = { [field]: value ? value : null } as Partial<ContentNode>;
    queueNodeUpdate(nodeId, mapped);
  }, [queueNodeUpdate, selectedSubtree]);

  // CRUD ops you already have in CourseEditor
  const handleAddChild = useCallback(async (parentId: number | null, payload: { node_type: NodeType; title: string }) => {
    await runMutation(async () => {
      const subtree = await createNode({ node: payload, parent: parentId ? { parent_id: parentId } : null });
      return { subtree };
    }, { message: 'Node created', savingMessage: 'Creating node…' });
  }, [runMutation]);

  const handleUpdateChild = useCallback(async (parentId: number, childId: number, updates: Partial<NodeChild>) => {
    await runMutation(async () => {
      const subtree = await updateChild(parentId, childId, updates);
      return { subtree };
    }, { silent: true });
  }, [runMutation]);

  const handleReorderChild = useCallback(async (parentId: number, childId: number, direction: 'up' | 'down') => {
    const subtree = findSubtree(trees, parentId);
    if (!subtree) return;
    const ordered = [...subtree.children].sort((a, b) => a.edge.position - b.edge.position);
    const index = ordered.findIndex((c) => c.edge.child_id === childId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || targetIndex < 0 || targetIndex >= ordered.length) return;
    const nextOrder = [...ordered];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, moved);
    const updates = nextOrder.map((c, idx) => ({ child_id: c.edge.child_id, position: idx }));
    await runMutation(async () => {
      const subtreeResp = await reorderChildren(parentId, updates);
      return { subtree: subtreeResp };
    }, { silent: true });
  }, [runMutation, trees]);

  const handleAttachChild = useCallback(async (parentId: number, childId: number) => {
    await runMutation(async () => {
      const subtree = await attachChild(parentId, childId);
      return { subtree };
    }, { message: 'Child attached' });
  }, [runMutation]);

  const handleDetachChild = useCallback(async (parentId: number, childId: number) => {
    await runMutation(async () => {
      const subtree = await detachChild(parentId, childId);
      return { subtree };
    }, { message: 'Child detached' });
  }, [runMutation]);

  const handleDuplicateNode = useCallback(async (nodeId: number) => {
    // find parent edge (optional)
    let parentId: number | null = null;
    for (const root of trees) {
      const stack = [root];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const ch of cur.children) {
          if (ch.edge.child_id === nodeId) parentId = ch.edge.parent_id;
          stack.push(ch.subtree);
        }
      }
    }
    await runMutation(async () => {
      const subtree = await duplicateNode(nodeId, parentId);
      return { subtree };
    }, { message: 'Node duplicated' });
  }, [runMutation, trees]);

  const getAvailableChildTypes = useCallback((parentId: number | null) => {
    if (parentId == null) return ['collection'] as NodeType[]; // creating library roots (rare)
    const parent = findSubtree(trees, parentId);
    if (!parent) return [] as NodeType[];
    return rules
      .filter((rule) => rule.parent_type === parent.node.node_type && rule.child_kind === 'node')
      .map((rule) => rule.child_type as NodeType);
  }, [rules, trees]);

  // Canvas hooks (unchanged behavior)
  const handleSelectBlock = useCallback((block: ContentBlock | null) => {
    if (!block) {
      setSelectedBlockId(null);
      setEditingBlockId(null);
      return;
    }
    setSelectedBlockId(block.id);
    setEditingBlockId(null);
  }, [setEditingBlockId, setSelectedBlockId]);

  const handleInsertBlock = useCallback((position: number, type: BlockType) => {
    if (!selectedSubtree) return;
    const nodeId = selectedSubtree.node.id;

    if (type === 'asset') {
      setResourceDialogMode({ type: 'insert', index: position });
      setResourceDialogOpen(true);
      return;
    }
    const payload: Partial<ContentBlock> & { block_type: BlockType } =
      type === 'text'
        ? { block_type: 'text', text_md: normalizeHtmlContent('') }
        : type === 'smart_doc'
        ? { block_type: 'smart_doc', smart_doc_id: null }
        : { block_type: 'divider' };

    void runMutation(async () => {
      const subtree = await createBlock(nodeId, { ...payload, position });
      return { subtree };
    }, { savingMessage: 'Creating block…', message: 'Block created' });
  }, [runMutation, selectedSubtree]);

  const handleReorderBlocks = useCallback((orderedBlocks: ContentBlock[]) => {
    if (!selectedSubtree) return;
    const nodeId = selectedSubtree.node.id;
    const normalized = orderedBlocks.map((b, i) => ({ ...b, position: i }));
    const updates = normalized.map((b) => ({ block_id: b.id, position: b.position }));
    void runMutation(async () => {
      const subtree = await reorderBlocks(nodeId, updates);
      return { subtree };
    }, { silent: true });
  }, [runMutation, selectedSubtree]);

  const handleTextChange = useCallback((blockId: number, html: string, options: { debounce?: boolean } = {}) => {
    const normalized = normalizeHtmlContent(html);
    queueBlockUpdate(blockId, { text_md: normalized }, { debounce: options.debounce ?? true });
  }, [queueBlockUpdate]);

  // Resource dialog
  const handleResourceSelected = useCallback((resource: RenderableResource) => {
    setResourceCache((prev) => ({ ...prev, [resource.id]: resource }));
    if (!resourceDialogMode) return;
    if (resourceDialogMode.type === 'insert') {
      if (!selectedSubtree) return;
      const position = resourceDialogMode.index ?? sortedBlocks.length;
      const nodeId = selectedSubtree.node.id;
      void runMutation(async () => {
        const subtree = await createBlock(nodeId, { block_type: 'asset', position, resource_id: resource.id });
        return { subtree };
      }, { savingMessage: 'Creating block…', message: 'Block created' });
    } else if (resourceDialogMode.type === 'update' && resourceDialogMode.blockId) {
      queueBlockUpdate(resourceDialogMode.blockId, { resource_id: resource.id }, { debounce: false });
    }
    setResourceDialogMode(null);
    setResourceDialogOpen(false);
  }, [queueBlockUpdate, resourceDialogMode, runMutation, selectedSubtree, sortedBlocks.length]);

  // Node state toggle + details button (same as CourseEditor Toolbar contract)
  const handleStateChange = useCallback((state: ContentNode['state']) => {
    if (!selectedSubtree) return;
    queueNodeUpdate(selectedSubtree.node.id, { state }, { debounce: false });
  }, [queueNodeUpdate, selectedSubtree]);

  // 🔹 Clear editing when entering preview (parity with course editor)
  useEffect(() => {
    if (editorMode === 'preview') {
      setSelectedBlockId(null);
      setEditingBlockId(null);
    }
  }, [editorMode, setEditingBlockId, setSelectedBlockId]);

  // We assume single Library root for now (first subtree). If you have more, show them all in LibraryList.
  const libraryRoot = trees[0] ?? null;

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
      >
        <Box>
          <Typography variant="adminSectionTitle" fontWeight={700}>
            Editing Target
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Switch between the public Library tree and the assistant-only Library tree.
          </Typography>
        </Box>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={libraryMode}
          onChange={(_, nextValue: LibraryMode | null) => {
            if (nextValue) setLibraryMode(nextValue);
          }}
        >
          <ToggleButton value="main">Main Library</ToggleButton>
          <ToggleButton value="assistant">Assistant Library</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {loading ? (
        <Box sx={{ p: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Box sx={{ p: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      ) : (
        <Fragment>
      <Stack sx={{ height: '100%', minHeight: '80vh', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Toolbar
          subtree={selectedSubtree}
          nodeDraft={nodeDraft}
          onStateChange={handleStateChange}
          onShowDetails={() => {
            setSelectedBlockId(null);
            setEditingBlockId(null);
            // 🔹 leave preview when details are requested (same UX as course editor)
            if (editorMode === 'preview') {
              setEditorMode('edit');
            }
          }}
        />

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            // 🔹 collapse right Properties panel in preview
            gridTemplateColumns:
              editorMode === 'preview'
                ? { xs: '1fr', md: '360px minmax(0, 1fr)' }
                : { xs: '1fr', md: '360px minmax(0, 1fr) 360px' },
          }}
        >
          {/* Left: Library list (not a tree) */}
          <Box sx={{ borderRight: { md: '1px solid' }, borderColor: 'divider', minHeight: 0 }}>
            <LibraryList
              rootSubtree={libraryRoot}
              selectedNodeId={selectedNodeId}
              onSelectNode={handleSelectNode}
              onCreateNode={handleAddChild}
              onDetachChild={handleDetachChild}
              onDuplicateNode={handleDuplicateNode}
              onReorderChild={handleReorderChild}
              getAvailableChildTypes={getAvailableChildTypes}
              onOpenHeroDialog={(nodeId) => setHeroDialog({ open: true, nodeId })}
            />
          </Box>

          {/* Middle: Canvas */}
          <Box
            sx={{
              borderRight: editorMode === 'preview' ? undefined : { md: '1px solid' },
              borderColor: 'divider',
              minHeight: 0,
            }}
          >
            <Canvas
              subtree={selectedSubtree}
              resources={resourceCache}
              selectedBlockId={selectedBlockId}
              editingBlockId={editingBlockId}
              onSelectBlock={handleSelectBlock}
              onStartEdit={(blockId) => setEditingBlockId(blockId)}
              onExitEdit={() => setEditingBlockId(null)}
              onInsertBlock={handleInsertBlock}
              onReorderBlocks={handleReorderBlocks}
              onChangeText={handleTextChange}
              // 🔹 actually tell Canvas it’s in preview
              previewMode={editorMode === 'preview'}
            />
          </Box>

          {/* Right: Properties — hidden in preview */}
          {editorMode === 'edit' && (
            <Box sx={{ minHeight: 0 }}>
              <Properties
                subtree={selectedSubtree}
                nodeDraft={nodeDraft}
                metadataError={metadataError}
                onNodeFieldChange={handleNodeFieldChange}
                onRequestAddChild={(mode, options) =>
                  selectedSubtree && handleAddChild(selectedSubtree.node.id, {
                    node_type: (options?.type ?? 'lesson') as NodeType,
                    title: 'Untitled',
                  })
                }
                onReorderChild={(childId, direction) =>
                  selectedSubtree && void handleReorderChild(selectedSubtree.node.id, childId, direction)}
                onUpdateChild={(childId, updates) =>
                  selectedSubtree && void handleUpdateChild(selectedSubtree.node.id, childId, updates)}
                onRemoveChild={(childId) =>
                  selectedSubtree && void handleDetachChild(selectedSubtree.node.id, childId)}
                selectedBlock={sortedBlocks.find((b) => b.id === selectedBlockId) ?? null}
                onClearBlockSelection={() => { setSelectedBlockId(null); setEditingBlockId(null); }}
                onUpdateBlock={(blockId, updates, opts) => queueBlockUpdate(blockId, updates, opts)}
                onDeleteBlock={async (blockId) => {
                  await runMutation(async () => {
                    const subtree = await deleteBlock(blockId);
                    return { subtree };
                  }, { message: 'Block deleted' });
                  setSelectedBlockId((prev) => (prev === blockId ? null : prev));
                  setEditingBlockId((prev) => (prev === blockId ? null : prev));
                }}
                onOpenResourcePicker={(mode, blockId) => {
                  setResourceDialogMode({ type: mode, blockId });
                  setResourceDialogOpen(true);
                }}
                onFinalizeSmartDocBlock={async (block, docId) => {
                  if (block.smart_doc_id !== docId) {
                    queueBlockUpdate(block.id, { smart_doc_id: docId }, { debounce: false });
                  }
                }}
                resources={resourceCache}
                savingState={savingState}
                savingMessage={savingMessage}
                availableChildTypes={getAvailableChildTypes(selectedSubtree?.node.id ?? null)}
              />
            </Box>
          )}
        </Box>
      </Stack>

      {/* Resource picker */}
      <ResourcePickerDialog
        open={resourceDialogOpen}
        onClose={() => { setResourceDialogOpen(false); setResourceDialogMode(null); }}
        onSelect={handleResourceSelected}
      />

      {/* Hero picker */}
      <HeroImageManagerDialog
        open={heroDialog.open}
        courseId={heroCourseId}
        currentPath={heroCurrentPath}
        onClose={() => setHeroDialog({ open: false, nodeId: null })}
        onChangePath={handleHeroPathChange}
      />

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)}>
        {snack ? <Alert severity={snack.severity}>{snack.message}</Alert> : undefined}
      </Snackbar>
    </Fragment>
      )}
    </Stack>
  );
}

export default function LibraryEditor() {
  return (
    <EditorStoreProvider>
      <LibraryEditorInner />
    </EditorStoreProvider>
  );
}
