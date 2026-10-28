'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';

import type { ChildUnlockStatus, NodeSubtree } from '@/types/course';
import StudentCourseTree from './StudentCourseTree';
import LessonContent from './LessonContent';
import { flushPendingSmartDocSaves } from '@/lib/smartDocSaves';
import { courseLessons, courseContinuation, nextCourseLesson, progressByNode, explainCourseLocks, friendlyLockReason, type CourseNodeProgress } from '@/lib/courseContinuation';

type CourseViewerProps = {
  courseSlug: string;
  slugParts?: string[];
};

type CourseState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      course: NodeSubtree;
      lockStatuses: Record<number, ChildUnlockStatus[]>;
    };

type Maps = {
  nodeById: Map<number, NodeSubtree>;
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
  const parentById = new Map<number, number | null>();

  const visit = (subtree: NodeSubtree, parentId: number | null) => {
    nodeById.set(subtree.node.id, subtree);
    parentById.set(subtree.node.id, parentId);
    for (const child of subtree.children) {
      visit(child.subtree, subtree.node.id);
    }
  };

  visit(course, null);
  return { nodeById, parentById };
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

function sameSlugPath(left: string[], right: string[]) {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function buildContentSlugPath(
  nodeId: number,
  nodeById: Map<number, NodeSubtree>,
  parentById: Map<number, number | null>,
) {
  const path: string[] = [];
  let current: number | null | undefined = nodeId;

  while (current != null) {
    const subtree = nodeById.get(current);
    if (!subtree) return null;

    if (subtree.node.node_type !== 'course') {
      if (!subtree.node.slug) return null;
      path.push(subtree.node.slug);
    }

    current = parentById.get(current) ?? null;
  }

  return path.reverse();
}

function buildCourseContentHref(
  courseSlug: string,
  nodeId: number,
  nodeById: Map<number, NodeSubtree>,
  parentById: Map<number, number | null>,
) {
  const path = buildContentSlugPath(nodeId, nodeById, parentById);
  if (!path || path.length === 0) return null;
  const encodedPath = path.map((part) => encodeURIComponent(part)).join('/');
  return `/courses/${encodeURIComponent(courseSlug)}/${encodedPath}`;
}

function findContentNodeBySlug(course: NodeSubtree, slug: string) {
  let matchId: number | null = null;
  let matchCount = 0;

  const visit = (subtree: NodeSubtree) => {
    if (subtree.node.slug === slug && isContentNodeType(subtree.node.node_type)) {
      matchId = subtree.node.id;
      matchCount += 1;
    }
    for (const child of subtree.children) {
      visit(child.subtree);
    }
  };

  visit(course);
  return { matchId, matchCount };
}

function findContentNodeBySlugPath(
  slugParts: string[],
  nodeById: Map<number, NodeSubtree>,
  parentById: Map<number, number | null>,
) {
  let matchId: number | null = null;
  let matchCount = 0;

  nodeById.forEach((subtree) => {
    if (!isContentNodeType(subtree.node.node_type)) return;
    const path = buildContentSlugPath(subtree.node.id, nodeById, parentById);
    if (!path || !sameSlugPath(path, slugParts)) return;
    matchId = subtree.node.id;
    matchCount += 1;
  });

  return { matchId, matchCount };
}

function isNodeLocked(
  nodeId: number,
  lockMap: Record<number, Record<number, ChildUnlockStatus>>,
  parentById: Map<number, number | null>,
) {
  let current = nodeId;
  const visited = new Set<number>();
  while (!visited.has(current)) {
    visited.add(current);
    const parentId = parentById.get(current);
    if (parentId == null) return false;
    if (lockMap[parentId]?.[current]?.locked) return true;
    current = parentId;
  }
  return true;
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

export default function CourseViewer({ courseSlug, slugParts = [] }: CourseViewerProps) {
  const router = useRouter();
  const [state, setState] = useState<CourseState>({ status: 'loading' });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [progressState, setProgressState] = useState<{ slug: string; rows: CourseNodeProgress[] } | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const activeCourse = useRef(courseSlug);
  const refreshSequence = useRef(0);
  activeCourse.current = courseSlug;
  const progress = progressState?.slug === courseSlug ? progressState.rows : null;

  useEffect(() => {
    setExpanded(new Set());
  }, [courseSlug]);

  // Do not hydrate user-specific outlines or unlocks from a module-wide cache.
  useEffect(() => {
    let active = true;
    setProgressState(null);
    setRefreshError(false);
    setRefreshing(false);
    refreshSequence.current += 1;

    setState({ status: 'loading' });

    (async () => {
      try {
        const res = await fetch(`/api/courses/${courseSlug}`, { cache: 'no-store' });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? 'Failed to load course');
        }
        const data = (await res.json()) as { course: NodeSubtree; unlockStatuses: Record<number, ChildUnlockStatus[]>; progress: CourseNodeProgress[] };
        if (!active) return;

        // Server authorization is authoritative when reopening a course.
        const lockStatuses = data.unlockStatuses;
        setState({ status: 'ready', course: data.course, lockStatuses });
        setProgressState({ slug: courseSlug, rows: data.progress ?? [] });

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

  const explainedLocks = useMemo(() => state.status === 'ready'
    ? explainCourseLocks(state.course, state.lockStatuses, progress ?? []) : {}, [state, progress]);
  const lockMap = useMemo(() => toNestedLockMap(explainedLocks), [explainedLocks]);

  const nodeById = maps?.nodeById ?? null;
  const parentById = maps?.parentById ?? null;
  const lessons = useMemo(() => state.status === 'ready' ? courseLessons(state.course, explainedLocks) : [], [state, explainedLocks]);
  const continuation = courseContinuation(lessons, progress ?? []);
  const nodeProgress = progressByNode(progress ?? [], state.status === 'ready' ? state.course : undefined);

  const requestedSlugParts = slugParts.filter(Boolean);
  const fullPathLookup =
    requestedSlugParts.length > 0 && nodeById && parentById
      ? findContentNodeBySlugPath(requestedSlugParts, nodeById, parentById)
      : null;
  const flatFallbackLookup =
    requestedSlugParts.length === 1 && fullPathLookup?.matchCount === 0 && state.status === 'ready'
      ? findContentNodeBySlug(state.course, requestedSlugParts[0])
      : null;
  const requestedContentLookup =
    fullPathLookup && fullPathLookup.matchCount > 0 ? fullPathLookup : (flatFallbackLookup ?? fullPathLookup);
  const requestedContentId = requestedContentLookup?.matchId ?? null;
  const requestedIsFlatFallback =
    requestedSlugParts.length === 1 &&
    (fullPathLookup?.matchCount ?? 0) === 0 &&
    (flatFallbackLookup?.matchCount ?? 0) === 1;
  let selectedContent: NodeSubtree | null = null;
  let contentError: string | null = null;

  if (requestedContentLookup && requestedContentLookup.matchCount > 1) {
    contentError =
      'Multiple items share this slug in this course. Please ask an admin to make the slugs unique.';
  }

  if (!contentError && requestedContentId != null && nodeById && parentById) {
    const candidate = nodeById.get(requestedContentId) ?? null;
    if (!candidate || !isContentNodeType(candidate.node.node_type)) {
      contentError = 'We couldn’t open this item.';
    } else if (isNodeLocked(requestedContentId, lockMap, parentById)) {
      const label = formatContentLabel(candidate.node.node_type).toLowerCase();
      contentError = lessons.find((item) => item.nodeId === requestedContentId)?.lockReason
        ?? `This ${label} is locked until you complete the earlier required lessons.`;
    } else {
      selectedContent = candidate;
    }
  }

  if (!selectedContent && requestedSlugParts.length > 0 && !contentError) {
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

  const navigateAfterSaving = async (href: string) => {
    try {
      await flushPendingSmartDocSaves();
      router.push(href);
    } catch (error) {
      setSnackbar(error instanceof Error ? error.message : 'Your answers could not be saved. Please retry before leaving.');
    }
  };

  const handleSelectContent = (node: NodeSubtree, lockStatus: ChildUnlockStatus | undefined) => {
    if (!isContentNodeType(node.node.node_type)) return;

    if (lockStatus?.locked) {
      setSnackbar(friendlyLockReason(lockStatus.reason));
      return;
    }

    if (!nodeById || !parentById) {
      setSnackbar('Course outline is still loading. Try again in a moment.');
      return;
    }

    const navigateToNode = (target: NodeSubtree) => {
      const targetLabel = formatContentLabel(target.node.node_type).toLowerCase();
      const href = buildCourseContentHref(courseSlug, target.node.id, nodeById, parentById);
      if (!href) {
        setSnackbar(`This ${targetLabel} is missing a slug and cannot be opened.`);
        return;
      }

      const pathParents = collectParentPath(target.node.id, parentById);
      setExpanded((prev) => new Set([...prev, ...pathParents]));
      void navigateAfterSaving(href);
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

  useEffect(() => {
    if (!requestedIsFlatFallback || !selectedContent || !nodeById || !parentById) return;
    const href = buildCourseContentHref(courseSlug, selectedContent.node.id, nodeById, parentById);
    if (href) {
      router.replace(href);
    }
  }, [courseSlug, nodeById, parentById, requestedIsFlatFallback, router, selectedContent]);

  /** Resume only after this account's current progress and access have loaded. */
  const continuationHref = continuation.target?.href;
  useEffect(() => {
    if (state.status !== 'ready' || progress === null) return;
    if (requestedSlugParts.length > 0) return; // user explicitly asked for a specific item
    if (continuationHref) router.replace(continuationHref);
  }, [state.status, progress, requestedSlugParts.length, continuationHref, router]);

  /** ------- Unlock refresh after completion -------- */
  const refreshUnlocks = async (parentIds: number[]) => {
    if (parentIds.length === 0 || activeCourse.current !== courseSlug) return;
    const requestedCourse = courseSlug;
    const requestSequence = ++refreshSequence.current;
    const isCurrent = () => activeCourse.current === requestedCourse && refreshSequence.current === requestSequence;
    setRefreshing(true);
    setRefreshError(false);
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
      if (!res.ok) throw new Error('Could not refresh course progress');
      const { unlockStatuses, progress: refreshedProgress } = (await res.json()) as {
        unlockStatuses: Record<number, ChildUnlockStatus[]>; progress: CourseNodeProgress[];
      };
      if (!isCurrent()) return;
      setProgressState({ slug: requestedCourse, rows: refreshedProgress });

      setState((prev) => {
        if (prev.status !== 'ready') return prev;
        const nextLockStatuses: Record<number, ChildUnlockStatus[]> = { ...prev.lockStatuses };
        for (const [pidStr, rows] of Object.entries(unlockStatuses)) {
          const pid = Number(pidStr);
          nextLockStatuses[pid] = rows;
        }
        if (process.env.NODE_ENV !== 'production') {
          debugLogUnlockStatuses('refresh-unlocks', nextLockStatuses, prev.course);
        }
        return { ...prev, lockStatuses: nextLockStatuses };
      });
    } catch {
      if (isCurrent()) setRefreshError(true);
    } finally {
      if (isCurrent()) setRefreshing(false);
    }
  };

  const handleLessonCompleted = (nodeId: number) => {
    if (!parentById || activeCourse.current !== courseSlug) return;
    setProgressState((previous) => previous?.slug === courseSlug ? { ...previous,
      rows: [...previous.rows.filter((row) => row.node_id !== nodeId), { node_id: nodeId, status: 'completed', updated_at: new Date().toISOString() }],
    } : previous);
    const toRefresh = collectParentPath(nodeId, parentById);
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[unlock-debug] handleLessonCompleted', { nodeId, toRefresh });
    }
    refreshUnlocks(toRefresh);
  };

  const handleLessonStarted = useCallback((nodeId: number) => {
    if (activeCourse.current !== courseSlug) return;
    setProgressState((previous) => {
      if (previous?.slug !== courseSlug || previous.rows.some((row) => row.node_id === nodeId && row.status === 'completed')) return previous;
      return { ...previous, rows: [...previous.rows.filter((row) => row.node_id !== nodeId),
        { node_id: nodeId, status: 'in_progress', updated_at: new Date().toISOString() }] };
    });
  }, [courseSlug]);

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
  const selectedComplete = selectedContent ? nodeProgress[selectedContent.node.id] === 'completed' : false;
  const nextLesson = selectedContent && selectedComplete ? nextCourseLesson(lessons, progress ?? [], selectedContent.node.id) : null;
  const currentHref = `/courses/${encodeURIComponent(courseSlug)}${requestedSlugParts.length ? `/${requestedSlugParts.map(encodeURIComponent).join('/')}` : ''}`;
  const getHelp = () => { void navigateAfterSaving(`/support?from=${encodeURIComponent(currentHref)}`); };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50', display: 'flex', flexDirection: 'column' }}>
      {/* mobile: non-fixed tree */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <StudentCourseTree
          course={state.course}
          expanded={expanded}
          selectedNodeId={treeSelectedId}
          lockStatuses={nestedLockMap}
          progress={nodeProgress}
          onToggle={handleToggle}
          onSelectContent={handleSelectContent}
          onBackToCourses={() => { void navigateAfterSaving('/courses'); }}
          onGetHelp={getHelp}
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
              progress={nodeProgress}
              onToggle={handleToggle}
              onSelectContent={handleSelectContent}
              onBackToCourses={() => { void navigateAfterSaving('/courses'); }}
              onGetHelp={getHelp}
              fullHeight
              noTransition
            />
          </Box>
        </Box>

        {/* content column */}
        <Box sx={{ flex: 1, minWidth: 0, bgcolor: 'background.default' }}>
          {requestedSlugParts.length > 0 ? null : (
            <Box sx={{ px: { xs: 2, md: 4 }, py: 6 }}>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {state.course.node.title ?? 'Course'}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                {continuation.complete ? 'Course completed. Choose any lesson from the outline to review it.'
                  : progress === null ? 'Loading your progress…'
                    : continuation.total === 0 ? 'There are no lessons available in this course yet.'
                      : 'Choose an available lesson from the outline.'}
              </Typography>
              <Divider sx={{ my: 4 }} />
            </Box>
          )}

          {requestedSlugParts.length > 0 && <LessonContent
            lesson={progress === null ? null : selectedContent}
            loading={progress === null}
            error={contentError}
            onCompleted={handleLessonCompleted}
            onStarted={handleLessonStarted}
            completed={selectedComplete}
          />}
          {contentError && continuation.target && (
            <Box sx={{ maxWidth: 860, mx: 'auto', px: { xs: 2, md: 4 }, pb: 4 }}>
              <Button variant="contained" onClick={() => { void navigateAfterSaving(continuation.target!.href); }}>
                Continue: {continuation.target.title}
              </Button>
            </Box>
          )}
          {selectedComplete && (
            <Stack spacing={2} sx={{ maxWidth: 860, mx: 'auto', px: { xs: 2, md: 4 }, pb: 6 }}>
              {refreshError && <Alert severity="warning" action={<Button onClick={() => {
                if (selectedContent) void refreshUnlocks(collectParentPath(selectedContent.node.id, parentById));
              }}>Retry</Button>}>Your completion is saved. Refresh the course to load the next lesson.</Alert>}
              <Typography color="text.secondary">{continuation.completed} of {continuation.total} lessons completed</Typography>
              {nextLesson ? (
                <Button variant="contained" disabled={refreshing || refreshError} onClick={() => { void navigateAfterSaving(nextLesson.href); }}>
                  Next lesson: {nextLesson.title}
                </Button>
              ) : continuation.complete ? (
                <Button variant="contained" disabled={refreshing || refreshError} onClick={() => { void navigateAfterSaving(`/courses/${encodeURIComponent(courseSlug)}`); }}>
                  Review course
                </Button>
              ) : <Typography color="text.secondary">{refreshing ? 'Loading the next lesson…' : 'Complete the earlier required lessons to continue.'}</Typography>}
            </Stack>
          )}
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
