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

type EverUnlockedMap = Record<number, Set<number>>;

type CourseState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      course: NodeSubtree;
      lockStatuses: Record<number, ChildUnlockStatus[]>;
      everUnlocked: EverUnlockedMap;
    };

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
  { course: NodeSubtree; lockStatuses: Record<number, ChildUnlockStatus[]>; everUnlocked: EverUnlockedMap }
>();

function cloneEverUnlocked(source: EverUnlockedMap): EverUnlockedMap {
  const copy: EverUnlockedMap = {};
  for (const [parentIdStr, set] of Object.entries(source)) {
    const parentId = Number(parentIdStr);
    copy[parentId] = new Set(set);
  }
  return copy;
}

function seedEverUnlocked(unlocks: Record<number, ChildUnlockStatus[]>): EverUnlockedMap {
  const seeded: EverUnlockedMap = {};
  for (const [parentIdStr, rows] of Object.entries(unlocks)) {
    const parentId = Number(parentIdStr);
    for (const row of rows) {
      if (!row.locked) {
        if (!seeded[parentId]) seeded[parentId] = new Set();
        seeded[parentId].add(row.child_id);
      }
    }
  }
  return seeded;
}

function applyMonotonicUnlocks(
  unlocks: Record<number, ChildUnlockStatus[]>,
  everUnlocked: EverUnlockedMap,
): Record<number, ChildUnlockStatus[]> {
  const result: Record<number, ChildUnlockStatus[]> = {};
  for (const [parentIdStr, rows] of Object.entries(unlocks)) {
    const parentId = Number(parentIdStr);
    const seen = everUnlocked[parentId] ?? new Set<number>();
    const adjusted = rows.map((row) => {
      if (!row.locked) {
        seen.add(row.child_id);
        return row;
      }
      if (seen.has(row.child_id)) {
        return { ...row, locked: false, reason: null };
      }
      return row;
    });
    if (!everUnlocked[parentId] && seen.size > 0) {
      everUnlocked[parentId] = seen;
    }
    result[parentId] = adjusted;
  }
  return result;
}

function debugLogUnlockStatuses(
  label: string,
  unlocks: Record<number, ChildUnlockStatus[]>,
  course: NodeSubtree,
) {
  if (process.env.NODE_ENV === 'production') return;

  try {
    const { nodeById } = buildMaps(course);
    const rows: Array<{
      parentId: number;
      parentTitle: string;
      parentSlug: string | null;
      childId: number;
      childTitle: string;
      childSlug: string | null;
      locked: boolean;
      required: boolean;
      reason: string | null;
    }> = [];

    for (const [parentIdStr, children] of Object.entries(unlocks)) {
      const parentId = Number(parentIdStr);
      const parentNode = nodeById.get(parentId)?.node;
      for (const child of children) {
        const childNode = nodeById.get(child.child_id)?.node;
        rows.push({
          parentId,
          parentTitle: parentNode?.title ?? '(unknown parent)',
          parentSlug: parentNode?.slug ?? null,
          childId: child.child_id,
          childTitle: childNode?.title ?? '(unknown child)',
          childSlug: childNode?.slug ?? null,
          locked: child.locked,
          required: child.is_required,
          reason: child.reason,
        });
      }
    }

    if (rows.length === 0) {
      console.groupCollapsed(`[unlock-debug] ${label}`);
      console.log('No unlock rows available');
      console.groupEnd();
      return;
    }

    console.groupCollapsed(`[unlock-debug] ${label}`);
    console.table(rows);
    console.groupEnd();
  } catch (error) {
    console.warn('[unlock-debug] failed to log unlock statuses', error);
  }
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
      setState({
        status: 'ready',
        course: cached.course,
        lockStatuses: cached.lockStatuses,
        everUnlocked: cloneEverUnlocked(cached.everUnlocked),
      });
      if (process.env.NODE_ENV !== 'production') {
        debugLogUnlockStatuses('hydrate-from-cache', cached.lockStatuses, cached.course);
      }
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

        // AFTER
// prefer existing everUnlocked (from cache or current state) so unlocks are truly monotonic across reloads
const priorEver =
(courseCache.get(courseSlug)?.everUnlocked && cloneEverUnlocked(courseCache.get(courseSlug)!.everUnlocked)) ||
(state.status === 'ready' && cloneEverUnlocked(state.everUnlocked)) ||
null;

const everUnlocked = priorEver ?? seedEverUnlocked(data.unlockStatuses);
const lockStatuses = applyMonotonicUnlocks(data.unlockStatuses, everUnlocked);

courseCache.set(courseSlug, {
course: data.course,
lockStatuses,
everUnlocked: cloneEverUnlocked(everUnlocked),
});
setState({ status: 'ready', course: data.course, lockStatuses, everUnlocked });

        if (process.env.NODE_ENV !== 'production') {
          debugLogUnlockStatuses('initial-load', lockStatuses, data.course);
        }
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

  const nestedLockMap = lockMap;

  const handleSelectContent = (node: NodeSubtree, lockStatus: ChildUnlockStatus | undefined) => {
    if (!isContentNodeType(node.node.node_type)) return;

    const label = formatContentLabel(node.node.node_type);

    if (lockStatus?.locked) {
      setSnackbar(lockStatus.reason ?? `Complete the previous ${label.toLowerCase()} to unlock this one.`);
      return;
    }

    if (!parentById) {
      setSnackbar('Course outline is still loading. Try again in a moment.');
      return;
    }

    const navigateToNode = (target: NodeSubtree) => {
      const targetLabel = formatContentLabel(target.node.node_type).toLowerCase();
      if (!target.node.slug) {
        setSnackbar(`This ${targetLabel} is missing a slug and cannot be opened.`);
        return;
      }

      const pathParents = collectParentPath(target.node.id, parentById);
      setExpanded((prev) => new Set([...prev, ...pathParents]));
      router.push(`/courses/${courseSlug}/${target.node.slug}`);
    };

    if (node.node.node_type === 'lesson' && node.children.length > 0) {
      const childLocks = nestedLockMap[node.node.id] ?? {};
      const firstUnlockedChild = node.children.find((child) => {
        const childNode = child.subtree.node;
        if (!isContentNodeType(childNode.node_type)) return false;
        return !(childLocks[childNode.id]?.locked ?? false);
      });

      if (firstUnlockedChild) {
        navigateToNode(firstUnlockedChild.subtree);
        return;
      }
    }

    navigateToNode(node);
  };

  useEffect(() => {
    if (!selectedContent || !parentById) return;
    const pathParents = collectParentPath(selectedContent.node.id, parentById);
    setExpanded((prev) => new Set([...prev, ...pathParents]));
  }, [parentById, selectedContent]);

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
      if (process.env.NODE_ENV !== 'production') {
        console.groupCollapsed('[unlock-debug] refresh-unlocks request');
        console.log('parentIds', parentIds);
        console.groupEnd();
      }
      const res = await fetch(`/api/courses/${courseSlug}/unlocks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentIds }),
      });
      if (!res.ok) return;
      const { unlockStatuses } = (await res.json()) as { unlockStatuses: Record<number, ChildUnlockStatus[]> };

      setState((prev) => {
        if (prev.status !== 'ready') return prev;
        const nextLockStatuses: Record<number, ChildUnlockStatus[]> = { ...prev.lockStatuses };
        const nextEverUnlocked = cloneEverUnlocked(prev.everUnlocked);

        for (const [pidStr, rows] of Object.entries(unlockStatuses)) {
          const pid = Number(pidStr);
          const seen = nextEverUnlocked[pid] ?? new Set<number>();
          const adjusted = rows.map((row) => {
            if (!row.locked) {
              seen.add(row.child_id);
              return row;
            }
            if (seen.has(row.child_id)) {
              return { ...row, locked: false, reason: null };
            }
            return row;
          });
          nextEverUnlocked[pid] = seen;
          nextLockStatuses[pid] = adjusted;
        }

        courseCache.set(courseSlug, {
          course: prev.course,
          lockStatuses: nextLockStatuses,
          everUnlocked: cloneEverUnlocked(nextEverUnlocked),
        });
        if (process.env.NODE_ENV !== 'production') {
          debugLogUnlockStatuses('refresh-unlocks', nextLockStatuses, prev.course);
        }
        return { ...prev, lockStatuses: nextLockStatuses, everUnlocked: nextEverUnlocked };
      });
    } catch {
      // ignore; next navigation will naturally refresh
    }
  };

  const handleLessonCompleted = (nodeId: number) => {
    if (!parentById) return;
    // refresh the immediate parent (this unlocks siblings)
    const parent = parentById.get(nodeId);
    if (parent != null) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[unlock-debug] handleLessonCompleted', { nodeId, parentId: parent });
      }
      refreshUnlocks([parent]);
    }
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
