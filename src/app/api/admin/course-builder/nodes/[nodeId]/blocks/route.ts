import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  handleCourseBuilderError,
  validateBlockPayload,
} from '@/lib/courseBuilder';

type RouteContext = {
  params: { nodeId: string };
};

export async function POST(request: NextRequest, context: RouteContext) {
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
    const block = body?.block ?? body;

    if (!block || typeof block !== 'object') {
      throw new CourseBuilderError('Missing block payload', 400);
    }

    const positionValue = block.position != null ? Number(block.position) : null;
    if (positionValue != null && (!Number.isFinite(positionValue) || positionValue < 0)) {
      throw new CourseBuilderError('position must be a non-negative number', 400, {
        position: block.position,
      });
    }

    const resourceId = block.resource_id != null ? Number(block.resource_id) : null;
    if (resourceId != null && !Number.isFinite(resourceId)) {
      throw new CourseBuilderError('resource_id must be a number', 400, {
        resource_id: block.resource_id,
      });
    }

    const startMs = block.start_ms != null ? Number(block.start_ms) : null;
    if (startMs != null && (!Number.isFinite(startMs) || startMs < 0)) {
      throw new CourseBuilderError('start_ms must be a non-negative number', 400, {
        start_ms: block.start_ms,
      });
    }

    const endMs = block.end_ms != null ? Number(block.end_ms) : null;
    if (endMs != null && (!Number.isFinite(endMs) || endMs < 0)) {
      throw new CourseBuilderError('end_ms must be a non-negative number', 400, {
        end_ms: block.end_ms,
      });
    }

    const sanitizedBlock = {
      ...block,
      position: positionValue ?? undefined,
      resource_id: resourceId ?? undefined,
      start_ms: startMs ?? undefined,
      end_ms: endMs ?? undefined,
    };

    validateBlockPayload(sanitizedBlock);

    let position = positionValue;
    if (position == null) {
      const { data: existing, error } = await adminClient
        .from('content_blocks')
        .select('position')
        .eq('node_id', nodeId)
        .order('position', { ascending: false })
        .limit(1);

      if (error) {
        throw new CourseBuilderError('Failed to determine block position', 500, { details: error.message });
      }

      position = existing?.[0]?.position != null ? existing[0].position + 1 : 0;
    }

    const insertPayload = {
      node_id: nodeId,
      block_type: block.block_type,
      position,
      text_md: block.text_md ?? null,
      resource_id: resourceId,
      start_ms: startMs,
      end_ms: endMs,
      label: block.label ?? null,
      notes: block.notes ?? null,
      settings: block.settings ?? null,
      data: block.data ?? null,
    };

    const { error: insertError } = await adminClient
      .from('content_blocks')
      .insert(insertPayload);

    if (insertError) {
      throw new CourseBuilderError('Failed to create content block', 500, { details: insertError.message });
    }

    const subtree = await fetchNodeSubtree(nodeId);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
