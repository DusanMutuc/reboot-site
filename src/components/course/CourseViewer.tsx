'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';

import type { ChildUnlockStatus, NodeSubtree } from '@/types/course';
import StudentCourseTree from './StudentCourseTree';
import LessonContent from './LessonContent';

type CourseViewerProps = {
  courseSlug: string;
  lessonSlug?: string;
};

type CourseState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; course: NodeSubtree; lockStatuses: Record<number, ChildUnlockStatus[]> };

type Maps = {
  nodeById: Map<number, NodeSubtree>;
  slugToId: Map<string, number>;
  parentById: Map<number, number | null>;
};

function isContentNodeType(nodeType: string) {
  return nodeType === 'lesson' || nodeType === 'chapter';
}

function formatContentLabel(nodeType: string) {
  if (nodeType === 'chapter') return 'Chapter';
  if (nodeType === 'lesson') return 'Lesson';
  return 'Item';
}

function buildMaps(course: NodeSubtree): Maps {
  const nodeById = new Map<number, NodeSubtree>();
  const slugToId = new Map<string, number>();
  const parentById = new Map<number, number | null>();

  const visit = (subtree: NodeSubtree, parentId: number | null) => {
    nodeById.set(subtree.node.id, subtree);
    parentById.set(subtree.node.id, parentId);
    if (subtree.node.slug) {
      slugToId.set(subtree.node.slug, subtree.node.id);
    }
    for (const child of subtree.children) {
      visit(child.subtree, subtree.node.id);
    }
  };

  visit(course, null);
  return { nodeById, slugToId, parentById };
}

function toNestedLockMap(source: Record<number, ChildUnlockStatus[]>): Record<number, Record<number, ChildUnlockStatus>> {
  const nested: Record<number, Record<number, ChildUnlockStatus>> = {};
  for (const [parentIdString, rows] of Object.entries(source)) {
    const parentId = Number(parentIdString);
    const map: Record<number, ChildUnlockStatus> = {};
    for (const row of rows) {
      map[row.child_id] = row;
    }
    nested[parentId] = map;
  }
  return nested;
}

function collectParentPath(nodeId: number, parentById: Map<number, number | null>) {
  const path: number[] = [];
  let current: number | null | undefined = nodeId;
  while (current != null) {
    const parent: number | null = (parentById.get(current) ?? null) as number | null;
    if (parent != null) path.push(parent);
    current = parent;
  }
  return path;
}

function isNodeLocked(
  nodeId: number,
  lockMap: Record<number, Record<number, ChildUnlockStatus>>,
  parentById: Map<number, number | null>,
) {
  const parentId = parentById.get(nodeId);
  if (parentId == null) return false;
  const parentLocks = lockMap[parentId];
  if (!parentLocks) return false;
  return !!parentLocks[nodeId]?.locked;
}

/** ------- simple per-session cache to avoid white flashes on remounts ------- */
const courseCache = new Map<
  string,
  { course: NodeSubtree; lockStatuses: Record<number, ChildUnlockStatus[]> }
>();

/** ------- merge helper: prefer UNLOCKED when merging snapshots ------- */
function mergeLockStatusesPreferUnlocked(
  current: Record<number, ChildUnlockStatus[]>,
  incoming: Record<number, ChildUnlockStatus[]>
): Record<number, ChildUnlockStatus[]> {
  const out: Record<number, ChildUnlockStatus[]> = { ...current };

  // Build quick lookup for current
  const currByParent: Record<number, Record<number, ChildUnlockStatus>> = {};
  for (const [pidStr, rows] of Object.entries(current)) {
    const pid = Number(pidStr);
    currByParent[pid] = {};
    for (const r of rows) currByParent[pid][r.child_id] = r;
  }

  for (const [pidStr, rows] of Object.entries(incoming)) {
    const pid = Number(pidStr);
    const merged: Record<number, ChildUnlockStatus> = { ...(currByParent[pid] ?? {}) };

    for (const r of rows) {
      const existing = merged[r.child_id];
      if (!existing) {
        merged[r.child_id] = r;
      } else {
        // Prefer UNLOCKED if either says unlocked; keep latest metadata from incoming
        merged[r.child_id] = {
          ...r,
          locked: Boolean(existing.locked && r.locked),
        };
      }
    }

    // Keep deterministic order
    const arr = Object.values(merged).sort((a, b) => a.child_position - b.child_position);
    out[pid] = arr;
  }

  return out;
}

export default function CourseViewer({ courseSlug, lessonSlug }: CourseViewerProps) {
  const router = useRouter();
  const [state, setState] = useState<CourseState>({ status: 'loading' });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [snackbar, setSnackbar] = useState<string | null>(null);

  useEffect(() => {
    setExpanded(new Set());
  }, [courseSlug]);

  // Use cache to prevent full-screen loading flash, and revalidate in background
  useEffect(() => {
    let active = true;

    const cached = courseCache.get(courseSlug);
    if (cached) {
      setState({ status: 'ready', course: cached.course, lockStatuses: cached.lockStatuses });
    } else {
      setState({ status: 'loading' });
    }

    (async () => {
      try {
        const res = await fetch(`/api/courses/${courseSlug}`, { cache: 'no-store' });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? 'Failed to load course');
        }
        const data = (await res.json()) as { course: NodeSubtree; unlockStatuses: Record<number, ChildUnlockStatus[]> };
        if (!active) return;

        // Merge incoming with current (prefer unlocked), and keep cache in sync
        setState((prev) => {
          if (prev.status === 'ready') {
            const merged = mergeLockStatusesPreferUnlocked(prev.lockStatuses, data.unlockStatuses);
            courseCache.set(courseSlug, { course: data.course, lockStatuses: merged });
            return { ...prev, course: data.course, lockStatuses: merged };
          }
          courseCache.set(courseSlug, { course: data.course, lockStatuses: data.unlockStatuses });
          return { status: 'ready', course: data.course, lockStatuses: data.unlockStatuses };
        });
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Failed to load course';
        setState({ status: 'error', message });
      }
    })();

    return () => {
      active = false;
    };
  }, [courseSlug]);

  const maps = useMemo(() => {
    if (state.status !== 'ready') return null;
    return buildMaps(state.course);
  }, [state]);

  const lockMap = useMemo(() => {
    if (state.status !== 'ready') return {} as Record<number, Record<number, ChildUnlockStatus>>;
    return toNestedLockMap(state.lockStatuses);
  }, [state]);

  const nodeById = maps?.nodeById ?? null;
  const slugToId = maps?.slugToId ?? null;
  const parentById = maps?.parentById ?? null;

  const requestedContentId = lessonSlug && slugToId ? slugToId.get(lessonSlug) ?? null : null;
  let selectedContent: NodeSubtree | null = null;
  let contentError: string | null = null;

  if (requestedContentId != null && nodeById && parentById) {
    const candidate = nodeById.get(requestedContentId) ?? null;
    if (!candidate || !isContentNodeType(candidate.node.node_type)) {
      contentError = 'We couldn’t open this item.';
    } else if (isNodeLocked(requestedContentId, lockMap, parentById)) {
      const label = formatContentLabel(candidate.node.node_type).toLowerCase();
      contentError = `This ${label} is locked until you complete the previous required items.`;
    } else {
      selectedContent = candidate;
    }
  }

  if (!selectedContent && lessonSlug && !contentError) {
    contentError = 'We couldn’t find this item.';
  }

  const handleToggle = (nodeId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const handleSelectContent = (node: NodeSubtree, lockStatus: ChildUnlockStatus | undefined) => {
    if (!isContentNodeType(node.node.node_type)) return;

    const label = formatContentLabel(node.node.node_type);

    if (lockStatus?.locked) {
      setSnackbar(lockStatus.reason ?? `Complete the previous ${label.toLowerCase()} to unlock this one.`);
      return;
    }

    if (!node.node.slug) {
      setSnackbar(`This ${label.toLowerCase()} is missing a slug and cannot be opened.`);
      return;
    }

    if (!parentById) {
      setSnackbar('Course outline is still loading. Try again in a moment.');
      return;
    }

    const pathParents = collectParentPath(node.node.id, parentById);
    setExpanded((prev) => new Set([...prev, ...pathParents]));
    router.push(`/courses/${courseSlug}/${node.node.slug}`);
  };

  useEffect(() => {
    if (!selectedContent || !parentById) return;
    const pathParents = collectParentPath(selectedContent.node.id, parentById);
    setExpanded((prev) => new Set([...prev, ...pathParents]));
  }, [parentById, selectedContent]);

  const nestedLockMap = lockMap;
  const treeSelectedId = selectedContent?.node.id ?? (contentError && requestedContentId ? requestedContentId : null);

  useEffect(() => {
    if (!contentError || !requestedContentId || !parentById) return;
    const pathParents = collectParentPath(requestedContentId, parentById);
    if (pathParents.length === 0) return;
    setExpanded((prev) => new Set([...prev, ...pathParents]));
  }, [contentError, parentById, requestedContentId]);

  /** ------- Unlock refresh after completion -------- */
  const refreshUnlocks = async (parentIds: number[]) => {
    if (parentIds.length === 0) return;
    try {
      const res = await fetch(`/api/courses/${courseSlug}/unlocks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentIds }),
      });
      if (!res.ok) return;
      const { unlockStatuses } = (await res.json()) as { unlockStatuses: Record<number, ChildUnlockStatus[]> };

      setState((prev) => {
        if (prev.status !== 'ready') return prev;
        const merged = mergeLockStatusesPreferUnlocked(prev.lockStatuses, unlockStatuses);
        // keep cache synced with merged state
        courseCache.set(courseSlug, { course: prev.course, lockStatuses: merged });
        return { ...prev, lockStatuses: merged };
      });
    } catch {
      // ignore; next navigation will naturally refresh
    }
  };

  const handleLessonCompleted = (nodeId: number) => {
    if (!parentById) return;
    // refresh the immediate parent (this unlocks siblings)
    const parent = parentById.get(nodeId);
    if (parent != null) refreshUnlocks([parent]);
  };

  // ----- inline skeleton instead of white full-page -----
  if (state.status === 'loading') {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: { xs: 'block', md: 'none' } }}>
          <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">Loading outline…</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <Box
            sx={{
              width: { xs: 0, md: 340 },
              display: { xs: 'none', md: 'block' },
              borderRight: '1px solid',
              borderColor: 'divider',
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0, bgcolor: 'background.default' }}>
            <Stack alignItems="center" spacing={2} sx={{ py: 12 }}>
              <CircularProgress />
              <Typography color="text.secondary">Loading course…</Typography>
            </Stack>
          </Box>
        </Box>
      </Box>
    );
  }

  if (state.status === 'error') {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
        <Stack alignItems="center" spacing={2} sx={{ py: 12 }}>
          <Typography variant="h6">We couldn’t load this course.</Typography>
          <Typography color="text.secondary">{state.message}</Typography>
        </Stack>
      </Box>
    );
  }

  if (!maps || !nodeById || !parentById) {
    return null;
  }


  const HEADER_OFFSET = 0; // set to your AppBar height (e.g. 64) if you have a fixed header

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50', display: 'flex', flexDirection: 'column' }}>
      {/* mobile: non-fixed tree */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <StudentCourseTree
          course={state.course}
          expanded={expanded}
          selectedNodeId={treeSelectedId}
          lockStatuses={nestedLockMap}
          onToggle={handleToggle}
          onSelectContent={handleSelectContent}
          onBackToCourses={() => router.push('/courses')}
          fullHeight={false}
          noTransition
        />
      </Box>
  
      {/* desktop/tablet: fixed left rail + spacer */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* spacer keeps content pushed over; visible but empty */}
        <Box sx={{ width: { xs: 0, md: 340 }, display: { xs: 'none', md: 'block' } }} />
  
        {/* the actual fixed sidebar */}
        <Box
          sx={{
            display: { xs: 'none', md: 'block' },
            position: 'fixed',
            left: 0,
            top: HEADER_OFFSET,
            width: 340,
            height: `calc(100vh - ${HEADER_OFFSET}px)`,
            borderRight: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            zIndex: (t) => t.zIndex.appBar - 1, // stay below any header
          }}
        >
          <Box sx={{ height: '100%', overflowY: 'auto' }}>
            <StudentCourseTree
              course={state.course}
              expanded={expanded}
              selectedNodeId={treeSelectedId}
              lockStatuses={nestedLockMap}
              onToggle={handleToggle}
              onSelectContent={handleSelectContent}
              onBackToCourses={() => router.push('/courses')}
              fullHeight
              noTransition
            />
          </Box>
        </Box>
  
        {/* content column */}
        <Box sx={{ flex: 1, minWidth: 0, bgcolor: 'background.default' }}>
          {lessonSlug ? null : (
            <Box sx={{ px: { xs: 2, md: 4 }, py: 6 }}>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {state.course.node.title ?? 'Course'}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Select a chapter or lesson from the outline to start learning.
              </Typography>
              <Divider sx={{ my: 4 }} />
            </Box>
          )}
  
          <LessonContent
            lesson={selectedContent}
            loading={false}
            error={contentError}
            onCompleted={handleLessonCompleted}
          />
        </Box>
      </Box>
  
      <Snackbar
        open={!!snackbar}
        autoHideDuration={6000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="info" onClose={() => setSnackbar(null)} sx={{ width: '100%' }}>
          {snackbar}
        </Alert>
      </Snackbar>
    </Box>
  );
  
}
