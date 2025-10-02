import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  handleCourseBuilderError,
} from '@/lib/courseBuilder';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { nodeId: string } },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const parentId = Number(params.nodeId);
    if (!Number.isFinite(parentId) || parentId <= 0) {
      throw new CourseBuilderError('Invalid node id', 400, { value: params.nodeId });
    }

    const body = await request.json();
    const updates = Array.isArray(body?.updates) ? body.updates : body;

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new CourseBuilderError('updates must be a non-empty array', 400);
    }

    const childIds = new Set<number>();
    const payload: Array<Record<string, unknown>> = [];

    for (const item of updates) {
      const childId = Number(item?.child_id);
      const position = Number(item?.position);

      if (!Number.isFinite(childId) || childId <= 0) {
        throw new CourseBuilderError('Invalid child_id in updates', 400, { child_id: item?.child_id });
      }

      if (!Number.isFinite(position)) {
        throw new CourseBuilderError('Invalid position for child', 400, { child_id: childId, position: item?.position });
      }

      if (childIds.has(childId)) {
        throw new CourseBuilderError('Duplicate child_id detected in updates', 400, { child_id: childId });
      }

      childIds.add(childId);

      const edge: Record<string, unknown> = {
        parent_id: parentId,
        child_id: childId,
        position,
      };

      if ('is_required' in item) edge.is_required = item.is_required;
      if ('label' in item) edge.label = item.label;
      if ('notes' in item) edge.notes = item.notes;

      payload.push(edge);
    }

    const { data: existing, error: existingError } = await adminClient
      .from('node_children')
      .select('child_id')
      .eq('parent_id', parentId);

    if (existingError) {
      throw new CourseBuilderError('Failed to load current children', 500, { details: existingError.message });
    }

    const existingIds = new Set(existing?.map((row) => row.child_id));

    for (const childId of childIds) {
      if (!existingIds.has(childId)) {
        throw new CourseBuilderError('One or more children do not belong to this parent', 400, {
          child_id: childId,
        });
      }
    }

    const { error: upsertError } = await adminClient
      .from('node_children')
      .upsert(payload, { onConflict: 'parent_id,child_id' });

    if (upsertError) {
      throw new CourseBuilderError('Failed to reorder children', 500, { details: upsertError.message });
    }

    const subtree = await fetchNodeSubtree(parentId);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
