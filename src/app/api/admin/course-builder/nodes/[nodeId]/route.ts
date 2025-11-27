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
  context: { params: Promise<{ nodeId: string }> },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const { nodeId: nodeIdParam } = await context.params;
    const nodeId = parseNodeId(nodeIdParam);
    const subtree = await fetchNodeSubtree(nodeId);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ nodeId: string }> },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  type State = 'draft' | 'published' | 'archived';
  type Visibility = 'public' | 'limited';

  type UpdatePayload = Partial<{
    title: string | null;
    slug: string | null;
    state: State;
    description: string | null;
    hero_image: string | null;
    icon: string | null;
    objectives: string | null;
    metadata: unknown;
    owner_id: string | null;
    visibility: Visibility;
  }>;

  const pickUpdatePayload = (input: unknown): UpdatePayload => {
    if (!input || typeof input !== 'object') return {};
    const src = input as Record<string, unknown>;
    const out: UpdatePayload = {};

    if ('title' in src) out.title = typeof src.title === 'string' ? src.title : null;
    if ('slug' in src) out.slug = typeof src.slug === 'string' ? src.slug : null;
    if ('description' in src) out.description = typeof src.description === 'string' ? src.description : null;
    if ('hero_image' in src) out.hero_image = typeof src.hero_image === 'string' ? src.hero_image : null;
    if ('icon' in src) out.icon = typeof src.icon === 'string' ? src.icon : null;
    if ('objectives' in src) out.objectives = typeof src.objectives === 'string' ? src.objectives : null;
    if ('metadata' in src) out.metadata = src.metadata ?? null;
    if ('owner_id' in src) out.owner_id = typeof src.owner_id === 'string' ? src.owner_id : null;

    if ('state' in src) {
      const v = src.state;
      if (v === 'draft' || v === 'published' || v === 'archived') out.state = v;
      else throw new CourseBuilderError('Invalid state', 400, { value: v });
    }

    if ('visibility' in src) {
      const v = src.visibility;
      if (v === 'public' || v === 'limited') out.visibility = v;
      else throw new CourseBuilderError('Invalid visibility', 400, { value: v });
    }

    return out;
  };

  try {
    const { nodeId: nodeIdParam } = await context.params;
    const nodeId = parseNodeId(nodeIdParam);

    const body = await request.json();
    const updates = body?.updates ?? body;
    if (!updates || typeof updates !== 'object') {
      throw new CourseBuilderError('Missing update payload', 400);
    }

    const updatePayload = pickUpdatePayload(updates);

    // No-op instead of error when diff is empty
    if (Object.keys(updatePayload).length === 0) {
      const subtree = await fetchNodeSubtree(nodeId);
      return NextResponse.json({ subtree });
    }

    // Perform the update with server-managed audit fields
    const finalUpdate = {
      ...updatePayload,
      updated_at: new Date().toISOString(),
      updated_by: guard.user.id,
    };

    const { error } = await adminClient
      .from('content_nodes')
      .update(finalUpdate)
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
  context: { params: Promise<{ nodeId: string }> },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const { nodeId: nodeIdParam } = await context.params;
    const nodeId = parseNodeId(nodeIdParam);

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
