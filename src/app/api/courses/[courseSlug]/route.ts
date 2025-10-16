import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/requireUser';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  handleCourseBuilderError,
  type NodeSubtree as BuilderNodeSubtree,
} from '@/lib/courseBuilder';
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

export async function GET(request: NextRequest, { params }: { params: { courseSlug: string } }) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.res;
  }

  const courseSlug = params.courseSlug;

  try {
    const { data: courseRow, error: courseError } = await adminClient
      .from('content_nodes')
      .select('id, node_type, state')
      .eq('slug', courseSlug)
      .maybeSingle();

    if (courseError) {
      throw new CourseBuilderError('Failed to load course', 500, { details: courseError.message, slug: courseSlug });
    }

    if (!courseRow || courseRow.node_type !== 'course' || courseRow.state !== 'published') {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const rawTree = await fetchNodeSubtree(courseRow.id);
    const sanitized = sanitizeSubtree(rawTree);

    if (!sanitized) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const parentIds = new Set<number>();
    collectParentIds(sanitized, parentIds);

    const unlockEntries = await Promise.all(
      Array.from(parentIds).map(async (parentId) => {
        const { data, error } = await adminClient.rpc('get_child_unlock_status', {
          _parent_id: parentId,
          _user_id: guard.user.id,
        });

        if (error) {
          throw new CourseBuilderError('Failed to load unlock status', 500, {
            details: error.message,
            parentId,
            slug: courseSlug,
          });
        }

        return [parentId, (data ?? []) as ChildUnlockStatus[]] as const;
      }),
    );

    const unlockStatuses: Record<number, ChildUnlockStatus[]> = {};
    for (const [parentId, rows] of unlockEntries) {
      unlockStatuses[parentId] = rows;
    }

    return NextResponse.json({ course: sanitized, unlockStatuses });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
