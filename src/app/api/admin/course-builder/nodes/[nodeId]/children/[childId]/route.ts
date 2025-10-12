import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  handleCourseBuilderError,
} from '@/lib/courseBuilder';

function parseId(value: string, label: 'node' | 'child') {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new CourseBuilderError(`Invalid ${label} id`, 400, { value });
  }
  return id;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ nodeId: string; childId: string }> },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const { nodeId, childId } = await context.params;
    const parentId = parseId(nodeId, 'node');
    const childNodeId = parseId(childId, 'child');

    const body = await request.json().catch(() => ({}));
    const updates = body?.updates ?? body;

    if (!updates || typeof updates !== 'object') {
      throw new CourseBuilderError('Missing update payload', 400);
    }

    const allowedFields = new Set(['is_required', 'label', 'notes']);
    const payload: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.has(key)) {
        payload[key] = value;
      }
    }

    if (Object.keys(payload).length === 0) {
      throw new CourseBuilderError('No valid fields provided for update', 400);
    }

    const { error } = await adminClient
      .from('node_children')
      .update(payload)
      .eq('parent_id', parentId)
      .eq('child_id', childNodeId);

    if (error) {
      throw new CourseBuilderError('Failed to update child', 500, {
        details: error.message,
      });
    }

    const subtree = await fetchNodeSubtree(parentId);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}

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
    const parentId = parseId(nodeId, 'node');
    const childNodeId = parseId(childId, 'child');

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
