import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  flattenSubtreeIds,
  getParentEdge,
  handleCourseBuilderError,
  validateNodeRelationship,
} from '@/lib/courseBuilder';

type RouteContext = {
  params: { nodeId: string };
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const nodeId = Number(context.params.nodeId);
    if (!Number.isFinite(nodeId) || nodeId <= 0) {
      throw new CourseBuilderError('Invalid node id', 400, { value: context.params.nodeId });
    }

    const body = await request.json();
    const newParentIdValue = body?.new_parent_id ?? body?.parent_id ?? null;
    const positionValue = body?.position;

    const currentEdge = await getParentEdge(nodeId);

    if (newParentIdValue == null) {
      if (!currentEdge) {
        return NextResponse.json({ subtree: await fetchNodeSubtree(nodeId), previousParentSubtree: null });
      }

      const { error: deleteEdgeError } = await adminClient
        .from('node_children')
        .delete()
        .eq('parent_id', currentEdge.parent_id)
        .eq('child_id', nodeId);

      if (deleteEdgeError) {
        throw new CourseBuilderError('Failed to detach node', 500, { details: deleteEdgeError.message });
      }

      const nodeSubtree = await fetchNodeSubtree(nodeId);
      let previousParentSubtree = null;
      if (currentEdge) {
        previousParentSubtree = await fetchNodeSubtree(currentEdge.parent_id);
      }

      return NextResponse.json({ subtree: nodeSubtree, previousParentSubtree });
    }

    const newParentId = Number(newParentIdValue);
    if (!Number.isFinite(newParentId) || newParentId <= 0) {
      throw new CourseBuilderError('Invalid new_parent_id', 400, { value: newParentIdValue });
    }

    if (newParentId === nodeId) {
      throw new CourseBuilderError('A node cannot become its own parent', 400);
    }

    const nodeSubtree = await fetchNodeSubtree(nodeId);
    const descendantIds = new Set(flattenSubtreeIds(nodeSubtree));

    if (descendantIds.has(newParentId)) {
      throw new CourseBuilderError('Cannot move node beneath one of its descendants', 400, {
        newParentId,
      });
    }

    const parent = await validateNodeRelationship(newParentId, String(nodeSubtree.node.node_type));

    let position = positionValue;
    if (position == null) {
      const { data: siblings, error } = await adminClient
        .from('node_children')
        .select('position')
        .eq('parent_id', newParentId)
        .order('position', { ascending: false })
        .limit(1);

      if (error) {
        throw new CourseBuilderError('Failed to determine new position', 500, { details: error.message });
      }

      position = siblings?.[0]?.position != null ? siblings[0].position + 1 : 0;
    }

    const edgePayload = {
      parent_id: parent.id,
      child_id: nodeId,
      position,
      is_required: body?.is_required ?? currentEdge?.is_required ?? true,
      label: body?.label ?? currentEdge?.label ?? null,
      notes: body?.notes ?? currentEdge?.notes ?? null,
    };

    const { error: upsertError } = await adminClient
      .from('node_children')
      .upsert(edgePayload, { onConflict: 'parent_id,child_id' });

    if (upsertError) {
      throw new CourseBuilderError('Failed to attach node to new parent', 500, { details: upsertError.message });
    }

    if (currentEdge && currentEdge.parent_id !== parent.id) {
      const { error: deleteOldEdgeError } = await adminClient
        .from('node_children')
        .delete()
        .eq('parent_id', currentEdge.parent_id)
        .eq('child_id', nodeId);

      if (deleteOldEdgeError) {
        throw new CourseBuilderError('Failed to remove node from previous parent', 500, {
          details: deleteOldEdgeError.message,
        });
      }
    }

    const newParentSubtree = await fetchNodeSubtree(parent.id);
    let previousParentSubtree = null;
    if (currentEdge && currentEdge.parent_id !== parent.id) {
      previousParentSubtree = await fetchNodeSubtree(currentEdge.parent_id);
    }

    return NextResponse.json({ subtree: newParentSubtree, previousParentSubtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
