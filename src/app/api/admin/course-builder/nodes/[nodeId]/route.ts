import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  collectSubtreeStats,
  fetchNodeSubtree,
  flattenSubtreeIds,
  getParentEdge,
  handleCourseBuilderError,
} from '@/lib/courseBuilder';

function parseNodeId(value: string) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new CourseBuilderError('Invalid node id', 400, { value });
  }
  return id;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { nodeId: string } },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const nodeId = parseNodeId(params.nodeId);
    const subtree = await fetchNodeSubtree(nodeId);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { nodeId: string } },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const nodeId = parseNodeId(params.nodeId);
    const body = await request.json();
    const updates = body?.updates ?? body;

    if (!updates || typeof updates !== 'object') {
      throw new CourseBuilderError('Missing update payload', 400);
    }

    const allowedFields = [
      'title',
      'slug',
      'state',
      'description',
      'hero_image',
      'icon',
      'objectives',
      'metadata',
      'owner_id',
    ];

    const updatePayload: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) {
        updatePayload[key] = updates[key];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new CourseBuilderError('No valid fields provided for update', 400);
    }

    updatePayload.updated_at = new Date().toISOString();
    updatePayload.updated_by = guard.user.id;

    const { error } = await adminClient
      .from('content_nodes')
      .update(updatePayload)
      .eq('id', nodeId);

    if (error) {
      throw new CourseBuilderError('Failed to update node', 500, { details: error.message });
    }

    const subtree = await fetchNodeSubtree(nodeId);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { nodeId: string } },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const nodeId = parseNodeId(params.nodeId);

    const subtree = await fetchNodeSubtree(nodeId);
    const stats = collectSubtreeStats(subtree);
    const nodeIds = flattenSubtreeIds(subtree);
    const parentEdge = await getParentEdge(nodeId);

    const { error: deleteError } = await adminClient
      .from('content_nodes')
      .delete()
      .in('id', nodeIds);

    if (deleteError) {
      throw new CourseBuilderError('Failed to delete node subtree', 500, { details: deleteError.message });
    }

    let parentSubtree = null;
    if (parentEdge) {
      parentSubtree = await fetchNodeSubtree(parentEdge.parent_id);
    }

    const totalNodes = Object.values(stats.nodeCounts).reduce((sum, value) => sum + Number(value), 0);
    const totalBlocks = Object.values(stats.blockCounts).reduce((sum, value) => sum + Number(value), 0);

    return NextResponse.json({
      deleted: {
        nodes: {
          total: totalNodes,
          byType: stats.nodeCounts,
        },
        blocks: {
          total: totalBlocks,
          byType: stats.blockCounts,
        },
      },
      parentSubtree,
    });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
