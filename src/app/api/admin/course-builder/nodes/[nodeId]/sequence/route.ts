import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  handleCourseBuilderError,
  type NodeSubtree,
} from '@/lib/courseBuilder';

function parseNodeId(value: string) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new CourseBuilderError('Invalid node id', 400, { value });
  }
  return id;
}

function parseEnabledFlag(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new CourseBuilderError('Missing toggle payload', 400);
  }

  const candidate = body as Record<string, unknown>;

  if (typeof candidate.enabled === 'boolean') {
    return candidate.enabled;
  }

  if (typeof candidate.on === 'boolean') {
    return candidate.on;
  }

  if (typeof candidate.value === 'boolean') {
    return candidate.value;
  }

  throw new CourseBuilderError('enabled flag must be provided as a boolean', 400);
}

type SequenceTargets = {
  sequentialNodeIds: number[];
  courseNodeIds: number[];
  edgeMap: Map<number, Set<number>>;
};

function collectSequenceTargets(subtree: NodeSubtree): SequenceTargets {
  const sequentialNodeIds = new Set<number>();
  const courseNodeIds = new Set<number>();
  const edgeMap = new Map<number, Set<number>>();

  const walk = (node: NodeSubtree) => {
    const nodeId = node.node.id;
    const nodeType = `${node.node.node_type ?? ''}`.toLowerCase();

    if (nodeType === 'course' || nodeType === 'lesson') {
      sequentialNodeIds.add(nodeId);
      if (nodeType === 'course') {
        courseNodeIds.add(nodeId);
      }
    }

    for (const child of node.children) {
      const parentId = nodeId;
      const childId = child.edge.child_id;

      if (!edgeMap.has(parentId)) {
        edgeMap.set(parentId, new Set<number>());
      }

      edgeMap.get(parentId)!.add(childId);
      walk(child.subtree);
    }
  };

  walk(subtree);

  return {
    sequentialNodeIds: Array.from(sequentialNodeIds),
    courseNodeIds: Array.from(courseNodeIds),
    edgeMap,
  };
}

async function updateNodeRequirements(edgeMap: Map<number, Set<number>>, enabled: boolean) {
  for (const [parentId, childIds] of edgeMap.entries()) {
    if (childIds.size === 0) {
      continue;
    }

    const { error } = await adminClient
      .from('node_children')
      .update({ is_required: enabled })
      .eq('parent_id', parentId)
      .in('child_id', Array.from(childIds));

    if (error) {
      throw new CourseBuilderError('Failed to update node requirements', 500, {
        details: error.message,
        parentId,
      });
    }
  }
}

async function updateSequentialUnlockFlags(nodeIds: number[], enabled: boolean, userId: string) {
  if (nodeIds.length === 0) {
    return;
  }

  const timestamp = new Date().toISOString();
  const { error } = await adminClient
    .from('content_nodes')
    .update({
      sequential_unlock: enabled,
      updated_at: timestamp,
      updated_by: userId,
    })
    .in('id', nodeIds);

  if (error) {
    throw new CourseBuilderError('Failed to update sequential unlock', 500, {
      details: error.message,
    });
  }
}

async function updateCourseSequentialUnlock(courseIds: number[], enabled: boolean) {
  if (courseIds.length === 0) {
    return;
  }

  const { error } = await adminClient
    .from('courses')
    .update({ sequential_unlock: enabled })
    .in('id', courseIds);

  if (error) {
    throw new CourseBuilderError('Failed to update course sequential unlock', 500, {
      details: error.message,
    });
  }
}

export async function PATCH(
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
    const body = await request.json().catch(() => ({}));
    const enabled = parseEnabledFlag(body);

    const initialSubtree = await fetchNodeSubtree(nodeId);
    const targets = collectSequenceTargets(initialSubtree);

    await updateNodeRequirements(targets.edgeMap, enabled);
    await updateSequentialUnlockFlags(targets.sequentialNodeIds, enabled, guard.user.id);
    await updateCourseSequentialUnlock(targets.courseNodeIds, enabled);

    const subtree = await fetchNodeSubtree(nodeId);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
