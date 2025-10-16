'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Divider, Stack } from '@mui/material';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { LessonContent } from './LessonContent';
import { StudentCourseTree } from './StudentCourseTree';

import type { ChildUnlockStatus, NodeSubtree } from '@/types/course';

const LESSON_PARAM = 'lessonSlug';

type CourseViewerProps = {
  course: NodeSubtree;
  unlockStatus?: ChildUnlockStatus[];
};

type UnlockMap = Map<number, ChildUnlockStatus>;

type FlattenedNodeIndex = {
  byId: Map<number, NodeSubtree>;
  bySlug: Map<string, NodeSubtree>;
};

function slugForNode(node: NodeSubtree) {
  return node.node.slug ?? `node-${node.node.id}`;
}

function isLeafNode(node: NodeSubtree) {
  return node.children.length === 0;
}

function buildUnlockMap(status?: ChildUnlockStatus[]): UnlockMap {
  const map = new Map<number, ChildUnlockStatus>();
  if (!status) {
    return map;
  }

  for (const item of status) {
    map.set(item.child_id, item);
  }

  return map;
}

function buildIndexes(root: NodeSubtree): FlattenedNodeIndex {
  const byId = new Map<number, NodeSubtree>();
  const bySlug = new Map<string, NodeSubtree>();

  const visit = (node: NodeSubtree) => {
    byId.set(node.node.id, node);
    const slug = slugForNode(node);
    bySlug.set(slug, node);

    for (const child of node.children) {
      visit(child.subtree);
    }
  };

  visit(root);

  return { byId, bySlug };
}

function findFirstUnlockedLesson(root: NodeSubtree, unlocks: UnlockMap): NodeSubtree | null {
  const queue: NodeSubtree[] = [root];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const unlock = unlocks.get(current.node.id);
    const locked = unlock?.locked ?? false;

    if (locked) {
      continue;
    }

    if (isLeafNode(current)) {
      return current;
    }

    queue.push(...current.children.map((child) => child.subtree));
  }

  return null;
}

function findNodeBySlug(slug: string | null, index: FlattenedNodeIndex) {
  if (!slug) {
    return null;
  }

  return index.bySlug.get(slug) ?? null;
}

export function CourseViewer({ course, unlockStatus }: CourseViewerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const indexes = useMemo(() => buildIndexes(course), [course]);
  const unlocks = useMemo(() => buildUnlockMap(unlockStatus), [unlockStatus]);
  const [selectedNode, setSelectedNode] = useState<NodeSubtree | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(searchKey);
    const slug = params.get(LESSON_PARAM);
    const node = findNodeBySlug(slug, indexes);
    if (node) {
      setSelectedNode(node);
      return;
    }

    const fallback = findFirstUnlockedLesson(course, unlocks);
    setSelectedNode(fallback);
  }, [course, indexes, searchKey, unlocks]);

  const handleSelectLesson = useCallback(
    (node: NodeSubtree) => {
      if (!node) {
        return;
      }

      const unlock = unlocks.get(node.node.id);
      if (unlock?.locked) {
        return;
      }

      if (!isLeafNode(node)) {
        return;
      }

      setSelectedNode(node);

      const slug = slugForNode(node);
      const currentSlug = selectedNode ? slugForNode(selectedNode) : null;
      if (slug === currentSlug) {
        return;
      }
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(searchKey);
        params.set(LESSON_PARAM, slug);
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }
    },
    [pathname, router, searchKey, selectedNode, unlocks],
  );

  const lockInfo = selectedNode ? unlocks.get(selectedNode.node.id) ?? null : null;

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} alignItems="flex-start">
      <Box sx={{ flex: '0 0 320px', width: '100%' }}>
        <StudentCourseTree
          tree={course}
          selectedNodeId={selectedNode?.node.id ?? null}
          onSelectLesson={handleSelectLesson}
          unlockStatus={unlocks}
        />
      </Box>

      <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />

      <Box sx={{ flex: 1, width: '100%' }}>
        <LessonContent lesson={selectedNode} locked={lockInfo?.locked ?? false} lockReason={lockInfo?.reason ?? null} />
      </Box>
    </Stack>
  );
}

export default CourseViewer;
