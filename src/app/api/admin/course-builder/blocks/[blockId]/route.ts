import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchBlockById,
  fetchNodeSubtree,
  handleCourseBuilderError,
  validateBlockPayload,
} from '@/lib/courseBuilder';

type RouteContext = {
  params: { blockId: string };
};

function parseBlockId(value: string) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new CourseBuilderError('Invalid block id', 400, { value });
  }
  return id;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const blockId = parseBlockId(context.params.blockId);
    const existing = await fetchBlockById(blockId);
    const body = await request.json();
    const updates = body?.updates ?? body;

    if (!updates || typeof updates !== 'object') {
      throw new CourseBuilderError('Missing update payload', 400);
    }

    const merged = { ...existing, ...updates } as typeof existing;

    if ('position' in merged && merged.position != null) {
      const positionValue = Number(merged.position);
      if (!Number.isFinite(positionValue) || positionValue < 0) {
        throw new CourseBuilderError('position must be a non-negative number', 400, {
          position: merged.position,
        });
      }
      merged.position = positionValue;
    }

    if (merged.resource_id != null) {
      const resourceId = Number(merged.resource_id);
      if (!Number.isFinite(resourceId)) {
        throw new CourseBuilderError('resource_id must be a number', 400, {
          resource_id: merged.resource_id,
        });
      }
      merged.resource_id = resourceId;
    }

    if (merged.start_ms != null) {
      const startMs = Number(merged.start_ms);
      if (!Number.isFinite(startMs) || startMs < 0) {
        throw new CourseBuilderError('start_ms must be a non-negative number', 400, {
          start_ms: merged.start_ms,
        });
      }
      merged.start_ms = startMs;
    }

    if (merged.end_ms != null) {
      const endMs = Number(merged.end_ms);
      if (!Number.isFinite(endMs) || endMs < 0) {
        throw new CourseBuilderError('end_ms must be a non-negative number', 400, {
          end_ms: merged.end_ms,
        });
      }
      merged.end_ms = endMs;
    }

    validateBlockPayload(merged);

    const allowedFields = [
      'block_type',
      'position',
      'text_md',
      'resource_id',
      'start_ms',
      'end_ms',
      'label',
      'notes',
      'settings',
      'data',
    ];

    const updatePayload: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in updates) {
        let value = updates[field];
        if (field === 'position' && value != null) {
          const positionValue = Number(value);
          if (!Number.isFinite(positionValue) || positionValue < 0) {
            throw new CourseBuilderError('position must be a non-negative number', 400, { position: value });
          }
          value = positionValue;
        }

        if ((field === 'resource_id' || field === 'start_ms' || field === 'end_ms') && value != null) {
          const numericValue = Number(value);
          if (!Number.isFinite(numericValue) || (field !== 'resource_id' && numericValue < 0)) {
            throw new CourseBuilderError(`${field} must be a valid number`, 400, { [field]: value });
          }
          value = numericValue;
        }

        updatePayload[field] = value;
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ subtree: await fetchNodeSubtree(existing.node_id) });
    }

    updatePayload.updated_at = new Date().toISOString();

    const { error } = await adminClient
      .from('content_blocks')
      .update(updatePayload)
      .eq('id', blockId);

    if (error) {
      throw new CourseBuilderError('Failed to update content block', 500, { details: error.message });
    }

    const subtree = await fetchNodeSubtree(existing.node_id);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const blockId = parseBlockId(context.params.blockId);
    const existing = await fetchBlockById(blockId);

    const { error } = await adminClient
      .from('content_blocks')
      .delete()
      .eq('id', blockId);

    if (error) {
      throw new CourseBuilderError('Failed to delete content block', 500, { details: error.message });
    }

    const subtree = await fetchNodeSubtree(existing.node_id);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
