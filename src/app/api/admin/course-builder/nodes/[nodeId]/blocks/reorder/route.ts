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
    const nodeId = Number(params.nodeId);
    if (!Number.isFinite(nodeId) || nodeId <= 0) {
      throw new CourseBuilderError('Invalid node id', 400, { value: params.nodeId });
    }

    const body = await request.json();
    const updates = Array.isArray(body?.updates) ? body.updates : body;

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new CourseBuilderError('updates must be a non-empty array', 400);
    }

    const blockIds = new Set<number>();
    const payload: Array<Record<string, unknown>> = [];

    for (const item of updates) {
      const blockId = Number(item?.block_id ?? item?.id);
      const position = Number(item?.position);

      if (!Number.isFinite(blockId) || blockId <= 0) {
        throw new CourseBuilderError('Invalid block_id in updates', 400, { block_id: item?.block_id ?? item?.id });
      }

      if (!Number.isFinite(position)) {
        throw new CourseBuilderError('Invalid position for block', 400, {
          block_id: blockId,
          position: item?.position,
        });
      }

      if (blockIds.has(blockId)) {
        throw new CourseBuilderError('Duplicate block_id detected in updates', 400, { block_id: blockId });
      }

      blockIds.add(blockId);

      const row: Record<string, unknown> = {
        id: blockId,
        node_id: nodeId,
        position,
      };

      if ('label' in item) row.label = item.label;
      if ('notes' in item) row.notes = item.notes;
      if ('settings' in item) row.settings = item.settings;
      if ('data' in item) row.data = item.data;

      payload.push(row);
    }

    const { data: existing, error: existingError } = await adminClient
      .from('content_blocks')
      .select('id')
      .eq('node_id', nodeId);

    if (existingError) {
      throw new CourseBuilderError('Failed to load current blocks', 500, { details: existingError.message });
    }

    const existingIds = new Set(existing?.map((row) => row.id));

    for (const blockId of blockIds) {
      if (!existingIds.has(blockId)) {
        throw new CourseBuilderError('One or more blocks do not belong to this node', 400, {
          block_id: blockId,
        });
      }
    }

    const { error: upsertError } = await adminClient
      .from('content_blocks')
      .upsert(payload, { onConflict: 'id' });

    if (upsertError) {
      throw new CourseBuilderError('Failed to reorder blocks', 500, { details: upsertError.message });
    }

    const subtree = await fetchNodeSubtree(nodeId);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
