import type { SupabaseClient } from '@supabase/supabase-js';

export type AnySupabaseClient = SupabaseClient<any, 'public', any>;

export type CourseRecord = {
  id: number | string;
  slug: string | null;
  name: string | null;
  description: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type NodeRecord = {
  id: string;
  course_id: number | string;
  type: string;
  slug: string | null;
  title: string | null;
  description: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type NodeChildRecord = {
  parent_id: string | null;
  child_id: string;
  position: number | null;
  is_optional?: boolean | null;
  is_locked?: boolean | null;
  [key: string]: unknown;
};

export type BlockRecord = {
  id: string;
  node_id: string;
  type: string;
  data: unknown;
  position: number | null;
  is_required?: boolean | null;
  [key: string]: unknown;
};

export type NormalizedNode = NodeRecord & {
  parentId: string | null;
  position: number;
  isOptional: boolean;
  isLocked: boolean;
  childIds: string[];
  blockIds: string[];
};

export type NormalizedBlock = BlockRecord & {
  nodeId: string;
  position: number;
};

export type NormalizedCourse = {
  course: CourseRecord;
  nodes: Record<string, NormalizedNode>;
  blocks: Record<string, NormalizedBlock>;
  rootNodeIds: string[];
};

export class NotFoundError extends Error {}

export class ValidationError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = 'ValidationError';
  }
}

export async function fetchCourseOrThrow(
  supa: AnySupabaseClient,
  courseId: string | number,
): Promise<CourseRecord> {
  const { data, error } = await supa
    .from('courses')
    .select('id, slug, name, description, metadata, created_at, updated_at')
    .eq('id', courseId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new NotFoundError(`Course ${courseId} was not found`);
  }

  return data as CourseRecord;
}

export async function fetchNormalizedCourse(
  supa: AnySupabaseClient,
  courseId: string | number,
  existingCourse?: CourseRecord,
): Promise<NormalizedCourse> {
  const course = existingCourse ?? (await fetchCourseOrThrow(supa, courseId));

  const { data: nodeRows, error: nodeErr } = await supa
    .from('course_nodes')
    .select('*')
    .eq('course_id', course.id);

  if (nodeErr) {
    throw new Error(nodeErr.message);
  }

  const nodes = (nodeRows ?? []) as NodeRecord[];
  const nodeIds = nodes.map((node) => node.id);

  const { data: edgeRows, error: edgeErr } = nodeIds.length
    ? await supa.from('node_children').select('*').in('child_id', nodeIds)
    : { data: [], error: null };

  if (edgeErr) {
    throw new Error(edgeErr.message);
  }

  const edges = (edgeRows ?? []) as NodeChildRecord[];

  const { data: blockRows, error: blockErr } = nodeIds.length
    ? await supa.from('course_blocks').select('*').in('node_id', nodeIds)
    : { data: [], error: null };

  if (blockErr) {
    throw new Error(blockErr.message);
  }

  const blocks = (blockRows ?? []) as BlockRecord[];

  const edgesByChild = new Map<string, NodeChildRecord>();
  const childrenByParent = new Map<string, NodeChildRecord[]>();

  for (const edge of edges) {
    edgesByChild.set(edge.child_id, edge);
    if (edge.parent_id) {
      const list = childrenByParent.get(edge.parent_id) ?? [];
      list.push(edge);
      childrenByParent.set(edge.parent_id, list);
    }
  }

  const nodesById: Record<string, NormalizedNode> = {};

  for (const node of nodes) {
    const edge = edgesByChild.get(node.id);
    nodesById[node.id] = {
      ...node,
      parentId: edge?.parent_id ?? null,
      position: edge?.position ?? 0,
      isOptional: Boolean(edge?.is_optional ?? false),
      isLocked: Boolean(edge?.is_locked ?? false),
      childIds: [],
      blockIds: [],
    };
  }

  for (const [parentId, edgeList] of childrenByParent.entries()) {
    const parent = nodesById[parentId];
    if (!parent) continue;
    const sorted = [...edgeList].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    parent.childIds = sorted.map((edge) => edge.child_id).filter((id) => id in nodesById);
  }

  const blocksById: Record<string, NormalizedBlock> = {};
  for (const block of blocks) {
    const normalized: NormalizedBlock = {
      ...block,
      nodeId: block.node_id,
      position: block.position ?? 0,
    };
    blocksById[block.id] = normalized;
    const node = nodesById[block.node_id];
    if (node) {
      node.blockIds.push(block.id);
    }
  }

  for (const node of Object.values(nodesById)) {
    node.blockIds.sort((a, b) => (blocksById[a]?.position ?? 0) - (blocksById[b]?.position ?? 0));
  }

  const rootNodeIds = Object.values(nodesById)
    .filter((node) => !node.parentId)
    .sort((a, b) => a.position - b.position)
    .map((node) => node.id);

  return {
    course,
    nodes: nodesById,
    blocks: blocksById,
    rootNodeIds,
  };
}

export async function ensureUniqueCourseSlug(
  supa: AnySupabaseClient,
  slug: string,
  excludeId?: string | number,
): Promise<void> {
  const trimmed = slug.trim();
  if (!trimmed) {
    throw new ValidationError('Course slug is required');
  }

  const query = supa
    .from('courses')
    .select('id', { count: 'exact', head: true })
    .eq('slug', trimmed);

  if (excludeId !== undefined) {
    query.neq('id', excludeId);
  }

  const { error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  if ((count ?? 0) > 0) {
    throw new ValidationError(`Slug \"${trimmed}\" is already in use`);
  }
}

export async function ensureUniqueNodeSlug(
  supa: AnySupabaseClient,
  courseId: string | number,
  slug: string,
  excludeId?: string,
): Promise<void> {
  const trimmed = slug.trim();
  if (!trimmed) {
    throw new ValidationError('Node slug is required');
  }

  const query = supa
    .from('course_nodes')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('slug', trimmed);

  if (excludeId) {
    query.neq('id', excludeId);
  }

  const { error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  if ((count ?? 0) > 0) {
    throw new ValidationError(`Node slug \"${trimmed}\" is already in use for this course`);
  }
}

export async function ensureEdgeAllowed(
  supa: AnySupabaseClient,
  parentType: string | null,
  childType: string,
): Promise<void> {
  if (!parentType) return;

  const { data, error } = await supa
    .from('node_edge_rules')
    .select('id, is_allowed, is_enabled, allow')
    .eq('parent_type', parentType)
    .eq('child_type', childType)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const allowed = Boolean(data && (data.is_allowed ?? data.is_enabled ?? data.allow ?? true));

  if (!data || !allowed) {
    throw new ValidationError(`Cannot attach ${childType} to parent type ${parentType}`);
  }
}

export async function getNodeWithCourseCheck(
  supa: AnySupabaseClient,
  courseId: string | number,
  nodeId: string,
): Promise<NodeRecord> {
  const { data, error } = await supa
    .from('course_nodes')
    .select('*')
    .eq('id', nodeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new NotFoundError(`Node ${nodeId} was not found`);
  }

  if (`${data.course_id}` !== `${courseId}`) {
    throw new ValidationError('Node does not belong to the specified course');
  }

  return data as NodeRecord;
}

export async function getNodeEdge(
  supa: AnySupabaseClient,
  nodeId: string,
): Promise<NodeChildRecord | null> {
  const { data, error } = await supa
    .from('node_children')
    .select('*')
    .eq('child_id', nodeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as NodeChildRecord | null) ?? null;
}

export async function listDescendantNodeIds(
  supa: AnySupabaseClient,
  nodeIds: string[],
): Promise<string[]> {
  const toProcess = [...nodeIds];
  const visited = new Set<string>(toProcess);

  while (toProcess.length > 0) {
    const chunk = toProcess.splice(0, 50);
    const { data, error } = await supa
      .from('node_children')
      .select('child_id')
      .in('parent_id', chunk);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data ?? []) {
      const childId = row?.child_id;
      if (childId && !visited.has(childId)) {
        visited.add(childId);
        toProcess.push(childId);
      }
    }
  }

  return Array.from(visited);
}

export async function deleteNodesCascade(
  supa: AnySupabaseClient,
  nodeIds: string[],
): Promise<void> {
  if (nodeIds.length === 0) return;

  const ids = Array.from(new Set(nodeIds));

  const { error: blockErr } = await supa
    .from('course_blocks')
    .delete()
    .in('node_id', ids);

  if (blockErr) {
    throw new Error(blockErr.message);
  }

  const { error: childErr } = await supa
    .from('node_children')
    .delete()
    .in('child_id', ids);

  if (childErr) {
    throw new Error(childErr.message);
  }

  const { error: parentErr } = await supa
    .from('node_children')
    .delete()
    .in('parent_id', ids);

  if (parentErr) {
    throw new Error(parentErr.message);
  }

  const { error: nodeErr } = await supa
    .from('course_nodes')
    .delete()
    .in('id', ids);

  if (nodeErr) {
    throw new Error(nodeErr.message);
  }
}
