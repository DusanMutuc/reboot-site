import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/requireUser';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  handleCourseBuilderError,
  type NodeSubtree as BuilderNodeSubtree,
} from '@/lib/courseBuilder';
import { resolveAccessibleCourseBySlug } from '@/lib/courseAccess';
import type { ChildUnlockStatus, NodeSubtree } from '@/types/course';

function sanitizeSubtree(subtree: BuilderNodeSubtree): NodeSubtree | null {
  const nodeState = (subtree.node.state ?? 'draft') as string;
  if (nodeState !== 'published') {
    return null;
  }

  const children: NodeSubtree['children'] = [];
  for (const child of subtree.children) {
    const sanitizedChild = sanitizeSubtree(child.subtree);
    if (!sanitizedChild) continue;
    children.push({
      edge: { ...child.edge },
      subtree: sanitizedChild,
    });
  }

  return {
    node: { ...subtree.node } as NodeSubtree['node'],
    blocks: subtree.blocks.map((block) => ({ ...block })),
    children,
  };
}

function collectParentIds(subtree: NodeSubtree, acc: Set<number>) {
  if (subtree.children.length > 0) {
    acc.add(subtree.node.id);
  }
  for (const child of subtree.children) {
    collectParentIds(child.subtree, acc);
  }
}

export async function GET(req: NextRequest, context: unknown) {
  const guard = await requireUser(req);
  if (!guard.ok) {
    return guard.res;
  }

  const { params } = context as { params: { courseSlug?: string } };
  const courseSlug = params.courseSlug;

  try {
    const courseRow = await resolveAccessibleCourseBySlug(guard.user.id, courseSlug ?? '');
    if (!courseRow) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    // 1) build sanitized tree (published-only, no blocks)
    const rawTree = await fetchNodeSubtree(courseRow.id, {
      includeBlocks: false, // we lazy-load per selected node
      allowUnpublished: false, // students see only published content
    });
    const sanitized = sanitizeSubtree(rawTree);

    if (!sanitized) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    // 2) collect all parent node IDs (nodes that have children)
    const parentIdsSet = new Set<number>();
    collectParentIds(sanitized, parentIdsSet);
    const parentIds = Array.from(parentIdsSet);

    // if no parents, nothing to lock
    if (parentIds.length === 0) {
      return NextResponse.json({ course: sanitized, unlockStatuses: {} });
    }

    // 3) bulk RPC to get unlock statuses for this user
    const { data: bulkRows, error: bulkError } = await adminClient.rpc('get_child_unlock_status_bulk', {
      _parent_ids: parentIds,
      _user_id: guard.user.id,
    });

    if (bulkError) {
      throw new CourseBuilderError('Failed to load unlock status', 500, {
        details: bulkError.message,
        slug: courseSlug,
      });
    }

    // 4) group rows by parent
    const unlockStatuses: Record<number, ChildUnlockStatus[]> = {};
    for (const row of (bulkRows ?? []) as Array<{
      parent_id: number;
      child_id: number;
      child_position: number;
      is_required: boolean;
      locked: boolean;
      reason: string | null;
    }>) {
      if (!unlockStatuses[row.parent_id]) unlockStatuses[row.parent_id] = [];
      unlockStatuses[row.parent_id].push({
        child_id: row.child_id,
        child_position: row.child_position,
        is_required: row.is_required,
        locked: row.locked,
        reason: row.reason ?? null,
      });
    }

    // keep deterministic order for UI
    for (const pid of Object.keys(unlockStatuses)) {
      unlockStatuses[Number(pid)].sort((a, b) => a.child_position - b.child_position);
    }

    return NextResponse.json({ course: sanitized, unlockStatuses });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
