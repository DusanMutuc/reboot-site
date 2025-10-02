import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';
import {
  NotFoundError,
  ValidationError,
  ensureEdgeAllowed,
  ensureUniqueNodeSlug,
  fetchNormalizedCourse,
  getNodeEdge,
  getNodeWithCourseCheck,
  listDescendantNodeIds,
  deleteNodesCascade,
} from '../../utils';

import type { AnySupabaseClient, NodeChildRecord } from '../../utils';

type RouteContext = { params: Promise<{ courseId?: string | string[] | undefined }> };

type MutableNodeChild = Pick<NodeChildRecord, 'parent_id' | 'position' | 'is_locked' | 'is_optional'>;

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

async function resolveCourseId(context: RouteContext): Promise<string | null> {
  const raw = await context.params;
  const value = Array.isArray(raw?.courseId) ? raw?.courseId[0] : raw?.courseId;
  return typeof value === 'string' ? value : null;
}

async function parseBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function computeDefaultPosition(
  supa: AnySupabaseClient,
  courseId: string,
  parentId: string | null,
): Promise<number> {
  const query = supa
    .from('node_children')
    .select('position, child_id')
    .order('position', { ascending: false })
    .limit(1);

  if (parentId) {
    query.eq('parent_id', parentId);
  } else {
    const { data: nodeRows, error } = await supa
      .from('course_nodes')
      .select('id')
      .eq('course_id', courseId);

    if (error) {
      throw new Error(error.message);
    }

    const ids = (nodeRows ?? []).map((row) => row.id);
    if (ids.length === 0) {
      return Date.now();
    }

    query.in('child_id', ids).is('parent_id', null);
  }

  const { data, error: posErr } = await query;
  if (posErr) {
    throw new Error(posErr.message);
  }

  if (!data || data.length === 0) {
    return Date.now();
  }

  const first = data[0];
  const position = typeof first?.position === 'number' ? first.position : Date.now();
  return position + 1;
}

function buildEdgePayload(
  edge: NodeChildRecord | null,
  overrides: Partial<MutableNodeChild>,
  defaultPosition: number,
) {
  return {
    parent_id: overrides.parent_id ?? edge?.parent_id ?? null,
    child_id: edge?.child_id,
    position: overrides.position ?? edge?.position ?? defaultPosition,
    is_optional: overrides.is_optional ?? edge?.is_optional ?? false,
    is_locked: overrides.is_locked ?? edge?.is_locked ?? false,
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const courseId = await resolveCourseId(context);
  if (!courseId) {
    return jsonError('Invalid course id', 400);
  }

  const supa = getAdminClient();

  try {
    const normalized = await fetchNormalizedCourse(supa, courseId);
    return NextResponse.json({ item: normalized });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return jsonError(err.message, 404);
    }
    return jsonError((err as Error).message, 400);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const courseId = await resolveCourseId(context);
  if (!courseId) {
    return jsonError('Invalid course id', 400);
  }

  const body = await parseBody(request);
  if (!body || typeof body !== 'object') {
    return jsonError('Invalid JSON payload', 400);
  }

  const {
    title,
    type,
    slug,
    description,
    metadata,
    parentId,
    position,
    is_optional,
    is_locked,
  } = body as Partial<Record<string, unknown>> & {
    title?: string;
    type?: string;
    slug?: string;
    parentId?: string | null;
    position?: number;
    is_optional?: boolean;
    is_locked?: boolean;
  };

  if (!title || typeof title !== 'string') {
    return jsonError('Node title is required', 400);
  }
  if (!type || typeof type !== 'string') {
    return jsonError('Node type is required', 400);
  }
  if (!slug || typeof slug !== 'string') {
    return jsonError('Node slug is required', 400);
  }

  const supa = getAdminClient();

  try {
    await ensureUniqueNodeSlug(supa, courseId, slug);
  } catch (err) {
    if (err instanceof ValidationError) {
      return jsonError(err.message, 409, err.details);
    }
    return jsonError((err as Error).message, 400);
  }

  let parentNode: { id: string; type: string } | null = null;
  if (typeof parentId === 'string' && parentId.length > 0) {
    try {
      const node = await getNodeWithCourseCheck(supa, courseId, parentId);
      parentNode = { id: node.id, type: node.type };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return jsonError('Parent node not found', 404);
      }
      if (err instanceof ValidationError) {
        return jsonError(err.message, 400, err.details);
      }
      return jsonError((err as Error).message, 400);
    }
  }

  if (parentNode) {
    try {
      await ensureEdgeAllowed(supa, parentNode.type, type);
    } catch (err) {
      if (err instanceof ValidationError) {
        return jsonError(err.message, 400, err.details);
      }
      return jsonError((err as Error).message, 400);
    }
  }

  const payload: Record<string, unknown> = {
    course_id: courseId,
    title: title.trim(),
    type: type.trim(),
    slug: slug.trim(),
    description: typeof description === 'string' ? description : null,
    metadata: metadata ?? null,
  };

  const { data: node, error: insertErr } = await supa
    .from('course_nodes')
    .insert(payload)
    .select('id')
    .single();

  if (insertErr) {
    return jsonError(insertErr.message, 400);
  }

  const nodeId = node.id as string;

  const parentForEdge = parentNode?.id ?? null;
  let defaultPosition: number;
  try {
    defaultPosition = typeof position === 'number'
      ? position
      : await computeDefaultPosition(supa, courseId, parentForEdge);
  } catch (err) {
    await supa.from('course_nodes').delete().eq('id', nodeId);
    return jsonError((err as Error).message, 400);
  }

  const edgePayload: Record<string, unknown> = {
    parent_id: parentForEdge,
    child_id: nodeId,
    position: defaultPosition,
    is_optional: Boolean(is_optional ?? false),
    is_locked: Boolean(is_locked ?? false),
  };

  const { error: linkErr } = await supa.from('node_children').insert(edgePayload);
  if (linkErr) {
    await supa.from('course_nodes').delete().eq('id', nodeId);
    return jsonError(linkErr.message, 400);
  }

  try {
    const normalized = await fetchNormalizedCourse(supa, courseId);
    return NextResponse.json({ item: normalized }, { status: 201 });
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const courseId = await resolveCourseId(context);
  if (!courseId) {
    return jsonError('Invalid course id', 400);
  }

  const body = await parseBody(request);
  if (!body || typeof body !== 'object') {
    return jsonError('Invalid JSON payload', 400);
  }

  const {
    id,
    title,
    slug,
    description,
    metadata,
    parentId,
    position,
    is_optional,
    is_locked,
  } = body as Partial<Record<string, unknown>> & { id?: string };

  if (!id || typeof id !== 'string') {
    return jsonError('Node id is required', 400);
  }

  const supa = getAdminClient();

  let node;
  try {
    node = await getNodeWithCourseCheck(supa, courseId, id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return jsonError(err.message, 404);
    }
    if (err instanceof ValidationError) {
      return jsonError(err.message, 400, err.details);
    }
    return jsonError((err as Error).message, 400);
  }

  const updates: Record<string, unknown> = {};
  if (typeof title === 'string' && title.trim() !== (node.title ?? '').trim()) {
    updates.title = title.trim();
  }
  if (typeof description === 'string') {
    updates.description = description;
  } else if ('description' in body && description == null) {
    updates.description = null;
  }
  if ('metadata' in body) {
    updates.metadata = metadata ?? null;
  }

  if (typeof slug === 'string' && slug.trim() !== (node.slug ?? '').trim()) {
    try {
      await ensureUniqueNodeSlug(supa, courseId, slug, id);
    } catch (err) {
      if (err instanceof ValidationError) {
        return jsonError(err.message, 409, err.details);
      }
      return jsonError((err as Error).message, 400);
    }
    updates.slug = slug.trim();
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supa
      .from('course_nodes')
      .update(updates)
      .eq('id', id);

    if (updateErr) {
      return jsonError(updateErr.message, 400);
    }
  }

  const edge = await getNodeEdge(supa, id);

  const currentParentId = edge?.parent_id ?? null;
  let nextParentId = currentParentId;
  let parentChanges = false;

  if ('parentId' in body) {
    if (parentId == null || (typeof parentId === 'string' && parentId.length === 0)) {
      nextParentId = null;
      parentChanges = nextParentId !== currentParentId;
    } else if (typeof parentId === 'string') {
      if (parentId === id) {
        return jsonError('Node cannot be its own parent', 400);
      }
      try {
        const parentNode = await getNodeWithCourseCheck(supa, courseId, parentId);
        const descendants = await listDescendantNodeIds(supa, [id]);
        if (descendants.includes(parentId)) {
          return jsonError('Cannot move node under one of its descendants', 400);
        }
        await ensureEdgeAllowed(supa, parentNode.type, node.type);
        nextParentId = parentNode.id;
        parentChanges = nextParentId !== currentParentId;
      } catch (err) {
        if (err instanceof NotFoundError) {
          return jsonError('Parent node not found', 404);
        }
        if (err instanceof ValidationError) {
          return jsonError(err.message, 400, err.details);
        }
        return jsonError((err as Error).message, 400);
      }
    } else {
      return jsonError('Invalid parent id', 400);
    }
  }

  const edgeUpdates: Partial<MutableNodeChild> = {};
  if (typeof position === 'number') {
    edgeUpdates.position = position;
  }
  if (typeof is_optional === 'boolean') {
    edgeUpdates.is_optional = is_optional;
  }
  if (typeof is_locked === 'boolean') {
    edgeUpdates.is_locked = is_locked;
  }

  if (parentChanges || Object.keys(edgeUpdates).length > 0) {
    const defaultPosition = typeof edgeUpdates.position === 'number'
      ? edgeUpdates.position
      : await computeDefaultPosition(supa, courseId, nextParentId);

    if (parentChanges || !edge) {
      if (edge) {
        const { error: deleteErr } = await supa
          .from('node_children')
          .delete()
          .eq('child_id', id);
        if (deleteErr) {
          return jsonError(deleteErr.message, 400);
        }
      }

      const insertPayload = {
        parent_id: nextParentId,
        child_id: id,
        position: defaultPosition,
        is_optional: edgeUpdates.is_optional ?? edge?.is_optional ?? false,
        is_locked: edgeUpdates.is_locked ?? edge?.is_locked ?? false,
      };

      const { error: insertErr } = await supa.from('node_children').insert(insertPayload);
      if (insertErr) {
        return jsonError(insertErr.message, 400);
      }
    } else {
      const updatePayload = buildEdgePayload(edge, edgeUpdates, defaultPosition);
      const { error: edgeErr } = await supa
        .from('node_children')
        .update({
          parent_id: updatePayload.parent_id,
          position: updatePayload.position,
          is_optional: updatePayload.is_optional,
          is_locked: updatePayload.is_locked,
        })
        .eq('child_id', id);

      if (edgeErr) {
        return jsonError(edgeErr.message, 400);
      }
    }
  }

  try {
    const normalized = await fetchNormalizedCourse(supa, courseId);
    return NextResponse.json({ item: normalized });
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const courseId = await resolveCourseId(context);
  if (!courseId) {
    return jsonError('Invalid course id', 400);
  }

  const body = await parseBody(request);
  if (!body || typeof body !== 'object') {
    return jsonError('Invalid JSON payload', 400);
  }

  const { id } = body as { id?: string };
  if (!id || typeof id !== 'string') {
    return jsonError('Node id is required', 400);
  }

  const supa = getAdminClient();

  try {
    await getNodeWithCourseCheck(supa, courseId, id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return jsonError(err.message, 404);
    }
    if (err instanceof ValidationError) {
      return jsonError(err.message, 400, err.details);
    }
    return jsonError((err as Error).message, 400);
  }

  const descendants = await listDescendantNodeIds(supa, [id]);

  try {
    await deleteNodesCascade(supa, descendants);
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }

  try {
    const normalized = await fetchNormalizedCourse(supa, courseId);
    return NextResponse.json({ item: normalized });
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }
}
