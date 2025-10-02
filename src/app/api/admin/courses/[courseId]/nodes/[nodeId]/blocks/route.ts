import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';
import {
  NotFoundError,
  ValidationError,
  fetchNormalizedCourse,
  getNodeWithCourseCheck,
} from '../../../../utils';

import type { AnySupabaseClient } from '../../../../utils';

type RouteContext = {
  params: Promise<{
    courseId?: string | string[] | undefined;
    nodeId?: string | string[] | undefined;
  }>;
};

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

async function resolveParams(context: RouteContext) {
  const raw = await context.params;
  const courseId = Array.isArray(raw?.courseId) ? raw?.courseId[0] : raw?.courseId;
  const nodeId = Array.isArray(raw?.nodeId) ? raw?.nodeId[0] : raw?.nodeId;
  return {
    courseId: typeof courseId === 'string' ? courseId : null,
    nodeId: typeof nodeId === 'string' ? nodeId : null,
  };
}

async function parseBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function computeNextPosition(
  supa: AnySupabaseClient,
  nodeId: string,
): Promise<number> {
  const { data, error } = await supa
    .from('course_blocks')
    .select('position')
    .eq('node_id', nodeId)
    .order('position', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    return Date.now();
  }

  const value = data[0]?.position;
  const base = typeof value === 'number' ? value : Date.now();
  return base + 1;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const { courseId, nodeId } = await resolveParams(context);
  if (!courseId || !nodeId) {
    return jsonError('Invalid course or node id', 400);
  }

  const supa = getAdminClient();

  try {
    await getNodeWithCourseCheck(supa, courseId, nodeId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return jsonError(err.message, 404);
    }
    if (err instanceof ValidationError) {
      return jsonError(err.message, 400, err.details);
    }
    return jsonError((err as Error).message, 400);
  }

  try {
    const normalized = await fetchNormalizedCourse(supa, courseId);
    return NextResponse.json({ item: normalized });
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const { courseId, nodeId } = await resolveParams(context);
  if (!courseId || !nodeId) {
    return jsonError('Invalid course or node id', 400);
  }

  const body = await parseBody(request);
  if (!body || typeof body !== 'object') {
    return jsonError('Invalid JSON payload', 400);
  }

  const { type, data, position, is_required } = body as Partial<Record<string, unknown>> & {
    type?: string;
    position?: number;
    is_required?: boolean;
  };

  if (!type || typeof type !== 'string') {
    return jsonError('Block type is required', 400);
  }

  const supa = getAdminClient();

  try {
    await getNodeWithCourseCheck(supa, courseId, nodeId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return jsonError(err.message, 404);
    }
    if (err instanceof ValidationError) {
      return jsonError(err.message, 400, err.details);
    }
    return jsonError((err as Error).message, 400);
  }

  let defaultPosition: number;
  try {
    defaultPosition = typeof position === 'number'
      ? position
      : await computeNextPosition(supa, nodeId);
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }

  const payload: Record<string, unknown> = {
    node_id: nodeId,
    type: type.trim(),
    data: data ?? {},
    position: defaultPosition,
    is_required: is_required ?? true,
  };

  const { error: insertErr } = await supa
    .from('course_blocks')
    .insert(payload);

  if (insertErr) {
    return jsonError(insertErr.message, 400);
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

  const { courseId, nodeId } = await resolveParams(context);
  if (!courseId || !nodeId) {
    return jsonError('Invalid course or node id', 400);
  }

  const body = await parseBody(request);
  if (!body || typeof body !== 'object') {
    return jsonError('Invalid JSON payload', 400);
  }

  const { id, type, data, position, is_required } = body as Partial<Record<string, unknown>> & {
    id?: string;
    position?: number;
    is_required?: boolean;
  };

  if (!id || typeof id !== 'string') {
    return jsonError('Block id is required', 400);
  }

  const supa = getAdminClient();

  try {
    await getNodeWithCourseCheck(supa, courseId, nodeId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return jsonError(err.message, 404);
    }
    if (err instanceof ValidationError) {
      return jsonError(err.message, 400, err.details);
    }
    return jsonError((err as Error).message, 400);
  }

  const { data: blockRows, error: blockErr } = await supa
    .from('course_blocks')
    .select('id, node_id')
    .eq('id', id)
    .maybeSingle();

  if (blockErr) {
    return jsonError(blockErr.message, 400);
  }

  if (!blockRows) {
    return jsonError('Block not found', 404);
  }

  if (`${blockRows.node_id}` !== `${nodeId}`) {
    return jsonError('Block does not belong to the specified node', 400);
  }

  const updates: Record<string, unknown> = {};
  if (typeof type === 'string') {
    updates.type = type.trim();
  }
  if ('data' in body) {
    updates.data = data ?? {};
  }
  if (typeof position === 'number') {
    updates.position = position;
  }
  if (typeof is_required === 'boolean') {
    updates.is_required = is_required;
  }

  if (Object.keys(updates).length === 0) {
    return jsonError('No changes provided', 400);
  }

  const { error: updateErr } = await supa
    .from('course_blocks')
    .update(updates)
    .eq('id', id);

  if (updateErr) {
    return jsonError(updateErr.message, 400);
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

  const { courseId, nodeId } = await resolveParams(context);
  if (!courseId || !nodeId) {
    return jsonError('Invalid course or node id', 400);
  }

  const body = await parseBody(request);
  if (!body || typeof body !== 'object') {
    return jsonError('Invalid JSON payload', 400);
  }

  const { id } = body as { id?: string };
  if (!id || typeof id !== 'string') {
    return jsonError('Block id is required', 400);
  }

  const supa = getAdminClient();

  try {
    await getNodeWithCourseCheck(supa, courseId, nodeId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return jsonError(err.message, 404);
    }
    if (err instanceof ValidationError) {
      return jsonError(err.message, 400, err.details);
    }
    return jsonError((err as Error).message, 400);
  }

  const { data: blockRows, error: blockErr } = await supa
    .from('course_blocks')
    .select('id, node_id')
    .eq('id', id)
    .maybeSingle();

  if (blockErr) {
    return jsonError(blockErr.message, 400);
  }

  if (!blockRows) {
    return jsonError('Block not found', 404);
  }

  if (`${blockRows.node_id}` !== `${nodeId}`) {
    return jsonError('Block does not belong to the specified node', 400);
  }

  const { error: deleteErr } = await supa
    .from('course_blocks')
    .delete()
    .eq('id', id);

  if (deleteErr) {
    return jsonError(deleteErr.message, 400);
  }

  try {
    const normalized = await fetchNormalizedCourse(supa, courseId);
    return NextResponse.json({ item: normalized });
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }
}
