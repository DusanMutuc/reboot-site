import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeById,
  fetchNodeSubtree,
  getParentEdge,
  handleCourseBuilderError,
  validateNodeRelationship,
} from '@/lib/courseBuilder';

type RouteContext = {
  params: { nodeId: string };
};

function parseId(value: unknown, field: string) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new CourseBuilderError(`Invalid ${field}`, 400, { value });
  }
  return id;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const parentId = parseId(context.params.nodeId, 'parent_id');
    const body = await request.json();

    const childId = parseId(body?.child_id, 'child_id');

    if (childId === parentId) {
      throw new CourseBuilderError('A node cannot be its own child', 400);
    }

    const childNode = await fetchNodeById(childId);
    await validateNodeRelationship(parentId, String(childNode.node_type));

    const existingParent = await getParentEdge(childId);
    if (existingParent && existingParent.parent_id !== parentId) {
      throw new CourseBuilderError('Child is already attached to a different parent', 409, {
        currentParentId: existingParent.parent_id,
      });
    }

    let position = body?.position;
    if (position == null) {
      const { data: siblings, error } = await adminClient
        .from('node_children')
        .select('position')
        .eq('parent_id', parentId)
        .order('position', { ascending: false })
        .limit(1);

      if (error) {
        throw new CourseBuilderError('Failed to determine child position', 500, { details: error.message });
      }

      position = siblings?.[0]?.position != null ? siblings[0].position + 1 : 0;
    }

    const edgePayload = {
      parent_id: parentId,
      child_id: childId,
      position,
      is_required: body?.is_required ?? existingParent?.is_required ?? true,
      label: body?.label ?? existingParent?.label ?? null,
      notes: body?.notes ?? existingParent?.notes ?? null,
    };

    const { error: upsertError } = await adminClient
      .from('node_children')
      .upsert(edgePayload, { onConflict: 'parent_id,child_id' });

    if (upsertError) {
      throw new CourseBuilderError('Failed to attach child node', 500, { details: upsertError.message });
    }

    const subtree = await fetchNodeSubtree(parentId);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
