import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  handleCourseBuilderError,
} from '@/lib/courseBuilder';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ nodeId: string; childId: string }> },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const { nodeId, childId } = await context.params;
    const parentId = Number(nodeId);
    const childNodeId = Number(childId);

    if (!Number.isFinite(parentId) || parentId <= 0) {
      throw new CourseBuilderError('Invalid node id', 400, { value: nodeId });
    }

    if (!Number.isFinite(childNodeId) || childNodeId <= 0) {
      throw new CourseBuilderError('Invalid child id', 400, { value: childId });
    }

    const { error } = await adminClient
      .from('node_children')
      .delete()
      .eq('parent_id', parentId)
      .eq('child_id', childNodeId);

    if (error) {
      throw new CourseBuilderError('Failed to remove child', 500, {
        details: error.message,
      });
    }

    const subtree = await fetchNodeSubtree(parentId);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
