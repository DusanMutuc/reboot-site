import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  handleCourseBuilderError,
  validateNodeRelationship,
} from '@/lib/courseBuilder';

type CloneOptions = {
  userId: string;
  parentId?: number | null;
  parentEdge?: {
    position?: number | null;
    is_required?: boolean | null;
    label?: string | null;
    notes?: string | null;
  } | null;
  titleOverride?: string | null;
};

async function cloneSubtree(nodeId: number, options: CloneOptions) {
  const sourceSubtree = await fetchNodeSubtree(nodeId);
  const timestamp = new Date().toISOString();

  async function cloneNode(subtree: typeof sourceSubtree, depth = 0): Promise<number> {
    const original = subtree.node;
    const payload: Record<string, unknown> = {
      ...original,
      id: undefined,
      slug: null,
      created_at: timestamp,
      updated_at: timestamp,
      created_by: options.userId,
      updated_by: options.userId,
    };

    if (depth === 0 && options.titleOverride) {
      payload.title = options.titleOverride;
    } else if (depth === 0) {
      payload.title = `${original.title ?? 'Untitled'} (Copy)`;
    }

    const { data: inserted, error: insertError } = await adminClient
      .from('content_nodes')
      .insert(payload)
      .select('*')
      .single();

    if (insertError) {
      throw new CourseBuilderError('Failed to duplicate node', 500, {
        details: insertError.message,
      });
    }

    const newNodeId = inserted.id as number;

    if (subtree.blocks.length > 0) {
      const blockPayload = subtree.blocks.map((block) => ({
        node_id: newNodeId,
        block_type: block.block_type,
        position: block.position,
        text_md: block.text_md ?? null,
        resource_id: block.resource_id ?? null,
        start_ms: block.start_ms ?? null,
        end_ms: block.end_ms ?? null,
        label: block.label ?? null,
        notes: block.notes ?? null,
        settings: block.settings ?? null,
        data: block.data ?? null,
      }));

      const { error: blockError } = await adminClient
        .from('content_blocks')
        .insert(blockPayload);

      if (blockError) {
        throw new CourseBuilderError('Failed to duplicate content blocks', 500, {
          details: blockError.message,
        });
      }
    }

    for (const child of subtree.children) {
      const clonedChildId = await cloneNode(child.subtree, depth + 1);

      const edgePayload = {
        parent_id: newNodeId,
        child_id: clonedChildId,
        position: child.edge.position,
        is_required: child.edge.is_required ?? true,
        label: child.edge.label ?? null,
        notes: child.edge.notes ?? null,
      };

      const { error: edgeError } = await adminClient
        .from('node_children')
        .insert(edgePayload);

      if (edgeError) {
        throw new CourseBuilderError('Failed to duplicate child relationship', 500, {
          details: edgeError.message,
        });
      }
    }

    return newNodeId;
  }

  const newRootId = await cloneNode(sourceSubtree, 0);

  if (options.parentId) {
    const newRootSubtree = await fetchNodeSubtree(newRootId);
    await validateNodeRelationship(options.parentId, String(newRootSubtree.node.node_type));

    let position = options.parentEdge?.position ?? null;
    if (position == null) {
      const { data: siblings, error: siblingsError } = await adminClient
        .from('node_children')
        .select('position')
        .eq('parent_id', options.parentId)
        .order('position', { ascending: false })
        .limit(1);

      if (siblingsError) {
        throw new CourseBuilderError('Failed to determine insertion position', 500, {
          details: siblingsError.message,
        });
      }

      position = siblings?.[0]?.position != null ? siblings[0].position + 1 : 0;
    }

    const edgePayload = {
      parent_id: options.parentId,
      child_id: newRootId,
      position,
      is_required: options.parentEdge?.is_required ?? true,
      label: options.parentEdge?.label ?? null,
      notes: options.parentEdge?.notes ?? null,
    };

    const { error: attachError } = await adminClient
      .from('node_children')
      .insert(edgePayload);

    if (attachError) {
      throw new CourseBuilderError('Failed to attach duplicated node to parent', 500, {
        details: attachError.message,
      });
    }

    return fetchNodeSubtree(options.parentId);
  }

  return fetchNodeSubtree(newRootId);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ nodeId: string }> },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const { nodeId } = await context.params;
    const id = Number(nodeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new CourseBuilderError('Invalid node id', 400, { value: nodeId });
    }

    const body = await request.json().catch(() => ({}));
    const parentInfo = body?.parent ?? null;
    const title = typeof body?.title === 'string' ? body.title : null;

    const subtree = await cloneSubtree(id, {
      userId: guard.user.id,
      parentId: parentInfo?.parent_id ?? null,
      parentEdge: parentInfo ?? null,
      titleOverride: title,
    });

    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
