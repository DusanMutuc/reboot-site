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
  context: { params: Promise<{ nodeId: string }> },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const { nodeId } = await context.params;
    const nodeIdNumber = Number(nodeId);
    if (!Number.isFinite(nodeIdNumber) || nodeIdNumber <= 0) {
      throw new CourseBuilderError('Invalid node id', 400, { value: nodeId });
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
        node_id: nodeIdNumber,
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
      .select(
        'id, node_id, block_type, text_md, resource_id, start_ms, end_ms, label, notes, settings, data',
      )
      .eq('node_id', nodeIdNumber);

    if (existingError) {
      throw new CourseBuilderError('Failed to load current blocks', 500, { details: existingError.message });
    }

    const existingMap = new Map<number, NonNullable<typeof existing>[number]>();
    for (const row of existing ?? []) {
      existingMap.set(row.id, row);
    }

    for (const blockId of blockIds) {
      if (!existingMap.has(blockId)) {
        throw new CourseBuilderError('One or more blocks do not belong to this node', 400, {
          block_id: blockId,
        });
      }
    }

    const mergedPayload = payload.map((row) => {
      const base = existingMap.get(row.id as number);
      if (!base) {
        return row;
      }
      const merged = {
        id: row.id,
        node_id: row.node_id,
        block_type: base.block_type,
        text_md: base.text_md,
        resource_id: base.resource_id,
        start_ms: base.start_ms,
        end_ms: base.end_ms,
        label: base.label,
        notes: base.notes,
        settings: base.settings,
        data: base.data,
        position: row.position,
      } as Record<string, unknown>;

      if ('label' in row) merged.label = row.label;
      if ('notes' in row) merged.notes = row.notes;
      if ('settings' in row) merged.settings = row.settings;
      if ('data' in row) merged.data = row.data;

      return merged;
    });

    const { error: upsertError } = await adminClient
      .from('content_blocks')
      .upsert(mergedPayload, { onConflict: 'id' });

    if (upsertError) {
      throw new CourseBuilderError('Failed to reorder blocks', 500, { details: upsertError.message });
    }

    const subtree = await fetchNodeSubtree(nodeIdNumber);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
