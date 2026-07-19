import { NextRequest, NextResponse } from 'next/server';

import { adminClient } from '@/lib/courseBuilder';
import { requireAdmin } from '@/lib/requireAdmin';

type Placement = {
  inLibrary: boolean;
  inCourse: boolean;
  librarySources: string[];
  courseSources: string[];
};

type ContentBlockPlacementRow = {
  resource_id: number;
  node_id: number;
};

type NodeEdgeRow = {
  parent_id: number;
  child_id: number;
};

type PlacementNodeRow = {
  id: number;
  node_type: string;
  slug: string | null;
  title: string | null;
};

const MAX_RESOURCE_IDS = 200;

function emptyPlacement(): Placement {
  return { inLibrary: false, inCourse: false, librarySources: [], courseSources: [] };
}

function fallbackNodeTitle(node: PlacementNodeRow | undefined) {
  if (!node) return 'Unknown unit';
  if (node.node_type === 'course') return 'Untitled course';
  if (node.node_type === 'collection' || node.node_type === 'playlist') return 'Untitled library';
  return `Untitled ${node.node_type}`;
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  try {
    const body = (await request.json()) as { resourceIds?: unknown };
    if (!Array.isArray(body.resourceIds)) {
      return NextResponse.json({ error: 'resourceIds must be an array' }, { status: 400 });
    }

    const resourceIds = Array.from(
      new Set(body.resourceIds.filter((id): id is number => Number.isInteger(id) && id > 0)),
    );

    if (resourceIds.length > MAX_RESOURCE_IDS) {
      return NextResponse.json(
        { error: `A maximum of ${MAX_RESOURCE_IDS} resource IDs can be checked at once` },
        { status: 400 },
      );
    }

    const placements: Record<number, Placement> = Object.fromEntries(
      resourceIds.map((id) => [id, emptyPlacement()]),
    );

    if (resourceIds.length === 0) {
      return NextResponse.json({ placements });
    }

    const { data: blockData, error: blockError } = await adminClient
      .from('content_blocks')
      .select('resource_id, node_id')
      .in('resource_id', resourceIds);

    if (blockError) {
      throw new Error(`Failed to load resource placements: ${blockError.message}`);
    }

    const blocks = (blockData ?? []) as ContentBlockPlacementRow[];
    const linkedNodesByResource = new Map<number, Set<number>>();
    for (const block of blocks) {
      const nodeIds = linkedNodesByResource.get(block.resource_id) ?? new Set<number>();
      nodeIds.add(block.node_id);
      linkedNodesByResource.set(block.resource_id, nodeIds);
    }

    const allNodeIds = new Set<number>();
    let frontier = Array.from(new Set(blocks.map((block) => block.node_id)));
    const parentsByChild = new Map<number, Set<number>>();

    while (frontier.length > 0) {
      frontier.forEach((id) => allNodeIds.add(id));

      const { data: edgeData, error: edgeError } = await adminClient
        .from('node_children')
        .select('parent_id, child_id')
        .in('child_id', frontier);

      if (edgeError) {
        throw new Error(`Failed to load resource ancestry: ${edgeError.message}`);
      }

      const next = new Set<number>();
      for (const edge of (edgeData ?? []) as NodeEdgeRow[]) {
        const parents = parentsByChild.get(edge.child_id) ?? new Set<number>();
        parents.add(edge.parent_id);
        parentsByChild.set(edge.child_id, parents);

        if (!allNodeIds.has(edge.parent_id)) next.add(edge.parent_id);
      }
      frontier = Array.from(next);
    }

    if (allNodeIds.size === 0) {
      return NextResponse.json({ placements });
    }

    const { data: nodeData, error: nodeError } = await adminClient
      .from('content_nodes')
      .select('id, node_type, slug, title')
      .in('id', Array.from(allNodeIds));

    if (nodeError) {
      throw new Error(`Failed to load placement nodes: ${nodeError.message}`);
    }

    const nodesById = new Map<number, PlacementNodeRow>(
      ((nodeData ?? []) as PlacementNodeRow[]).map((node) => [node.id, node]),
    );

    for (const resourceId of resourceIds) {
      const linkedNodeIds = linkedNodesByResource.get(resourceId);
      if (!linkedNodeIds) continue;

      const placement = placements[resourceId];
      const librarySources = new Set<string>();
      const courseSources = new Set<string>();

      const formatPath = (leafToRootPath: number[]) =>
        [...leafToRootPath]
          .reverse()
          .map((id) => {
            const node = nodesById.get(id);
            return node?.title?.trim() || fallbackNodeTitle(node);
          })
          .join(' › ');

      const walkToRoot = (nodeId: number, leafToRootPath: number[], visited: Set<number>) => {
        if (visited.has(nodeId)) return;

        const nextVisited = new Set(visited);
        nextVisited.add(nodeId);
        const nextPath = [...leafToRootPath, nodeId];
        const node = nodesById.get(nodeId);
        const parents = parentsByChild.get(nodeId);
        const isRoot = !parents || parents.size === 0;

        if (node?.node_type === 'course') {
          placement.inCourse = true;
          courseSources.add(formatPath(nextPath));
        }

        if (
          node?.slug === 'library' ||
          node?.slug === 'assistant-library' ||
          (isRoot && (node?.node_type === 'collection' || node?.node_type === 'playlist'))
        ) {
          placement.inLibrary = true;
          librarySources.add(formatPath(nextPath));
        }

        parents?.forEach((parentId) => walkToRoot(parentId, nextPath, nextVisited));
      };

      linkedNodeIds.forEach((nodeId) => walkToRoot(nodeId, [], new Set<number>()));

      placement.librarySources = Array.from(librarySources).sort((a, b) => a.localeCompare(b));
      placement.courseSources = Array.from(courseSources).sort((a, b) => a.localeCompare(b));
    }

    return NextResponse.json({ placements });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to resolve resource placements';
    console.error('Resource placement lookup failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
