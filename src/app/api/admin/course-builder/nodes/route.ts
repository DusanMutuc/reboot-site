import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  handleCourseBuilderError,
  validateNodeRelationship,
} from '@/lib/courseBuilder';

async function fetchRootNodeIds(nodeType?: string) {
  let query = adminClient
    .from('content_nodes')
    .select('id, node_type, title')
    .order('title', { ascending: true });

  if (nodeType) {
    query = query.eq('node_type', nodeType);
  }

  const { data, error } = await query;

  if (error) {
    throw new CourseBuilderError('Failed to load content nodes', 500, {
      details: error.message,
    });
  }

  const nodes = (data ?? []) as { id: number; node_type: string; title: string }[];
  if (nodeType !== 'course' || nodes.length === 0) {
    return nodes;
  }

  const courseIds = nodes.map((node) => node.id);
  const { data: sortRows, error: sortError } = await adminClient
    .from('course_sort_orders')
    .select('course_node_id, sort_order')
    .in('course_node_id', courseIds);

  if (sortError) {
    throw new CourseBuilderError('Failed to load course sort order', 500, {
      details: sortError.message,
    });
  }

  const orderMap = new Map<number, number>((sortRows ?? []).map((row) => [row.course_node_id, row.sort_order]));
  return [...nodes].sort((a, b) => {
    const aOrder = orderMap.get(a.id);
    const bOrder = orderMap.get(b.id);

    if (aOrder != null && bOrder != null && aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    if (aOrder != null && bOrder == null) return -1;
    if (aOrder == null && bOrder != null) return 1;

    return a.title.localeCompare(b.title);
  });
}

async function searchNodes(term: string | null) {
  const trimmed = term?.trim();
  let query = adminClient
    .from('content_nodes')
    .select('id,title,node_type,state,slug')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (trimmed && trimmed.length > 0) {
    query = query.ilike('title', `%${trimmed}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new CourseBuilderError('Failed to search nodes', 500, {
      details: error.message,
    });
  }

  return (data ?? []) as Array<{
    id: number;
    title: string;
    node_type: string;
    state: string | null;
    slug: string | null;
  }>;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode');

    if (mode === 'search') {
      const nodes = await searchNodes(url.searchParams.get('q'));
      return NextResponse.json({ nodes });
    }

    const rootType = url.searchParams.get('rootType') ?? undefined;
    const rootIdValue = url.searchParams.get('rootId');
    const rootId = rootIdValue ? Number(rootIdValue) : null;

    if (rootIdValue) {
      if (!Number.isFinite(rootId) || (rootId as number) <= 0) {
        throw new CourseBuilderError('Invalid rootId', 400, { value: rootIdValue });
      }

      const subtree = await fetchNodeSubtree(rootId as number);
      return NextResponse.json({ subtrees: [subtree] });
    }

    const ids = await fetchRootNodeIds(rootType);

    const subtrees = [] as Awaited<ReturnType<typeof fetchNodeSubtree>>[];
    for (const row of ids) {
      const subtree = await fetchNodeSubtree(row.id);
      subtrees.push(subtree);
    }

    return NextResponse.json({ subtrees });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const body = await request.json();
    const { node, parent } = body ?? {};

    if (!node || typeof node !== 'object') {
      throw new CourseBuilderError('Missing node payload', 400);
    }

    if (!node.node_type || typeof node.node_type !== 'string') {
      throw new CourseBuilderError('node.node_type is required', 400);
    }

    if (!node.title || typeof node.title !== 'string') {
      throw new CourseBuilderError('node.title is required', 400);
    }

    const timestamp = new Date().toISOString();

    const insertPayload = {
      state: 'draft',
      ...node,
      created_at: timestamp,
      updated_at: timestamp,
      created_by: guard.user.id,
      updated_by: guard.user.id,
    };

    const { data: createdNode, error: insertError } = await adminClient
      .from('content_nodes')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError) {
      throw new CourseBuilderError('Failed to create node', 500, { details: insertError.message });
    }

    if (parent?.parent_id) {
      await validateNodeRelationship(parent.parent_id, createdNode.node_type);

      let position = parent.position;
      if (position == null) {
        const { data: siblings, error: siblingsError } = await adminClient
          .from('node_children')
          .select('position')
          .eq('parent_id', parent.parent_id)
          .order('position', { ascending: false })
          .limit(1);

        if (siblingsError) {
          throw new CourseBuilderError('Failed to determine child position', 500, {
            details: siblingsError.message,
          });
        }

        position = siblings?.[0]?.position != null ? siblings[0].position + 1 : 0;
      }

      const edgePayload = {
        parent_id: parent.parent_id,
        child_id: createdNode.id,
        position,
        is_required: parent.is_required ?? true,
        label: parent.label ?? null,
        notes: parent.notes ?? null,
      };

      const { error: edgeError } = await adminClient.from('node_children').insert(edgePayload);

      if (edgeError) {
        throw new CourseBuilderError('Failed to attach node to parent', 500, { details: edgeError.message });
      }

      const subtree = await fetchNodeSubtree(parent.parent_id);
      return NextResponse.json({ subtree });
    }

    const subtree = await fetchNodeSubtree(createdNode.id);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
