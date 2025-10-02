import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';
import {
  ValidationError,
  NotFoundError,
  fetchCourseOrThrow,
  fetchNormalizedCourse,
  ensureUniqueCourseSlug,
  deleteNodesCascade,
} from './utils';

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const supa = getAdminClient();

  const { data: courses, error } = await supa
    .from('courses')
    .select('id, slug, name, description, metadata, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) {
    return jsonError(error.message, 400);
  }

  const items = [];
  for (const course of courses ?? []) {
    try {
      const normalized = await fetchNormalizedCourse(supa, course.id, course);
      items.push(normalized);
    } catch (err) {
      return jsonError((err as Error).message, 400);
    }
  }

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const body = await request.json();
  const { name, slug, description, metadata } = body ?? {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return jsonError('Course name is required', 400);
  }

  if (!slug || typeof slug !== 'string') {
    return jsonError('Course slug is required', 400);
  }

  const supa = getAdminClient();

  try {
    await ensureUniqueCourseSlug(supa, slug);
  } catch (err) {
    if (err instanceof ValidationError) {
      return jsonError(err.message, 409, err.details);
    }
    return jsonError((err as Error).message, 400);
  }

  const payload: Record<string, unknown> = {
    name: name.trim(),
    slug: slug.trim(),
    description: typeof description === 'string' ? description : null,
    metadata: metadata ?? null,
  };

  const { data, error } = await supa
    .from('courses')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    return jsonError(error.message, 400);
  }

  try {
    const normalized = await fetchNormalizedCourse(supa, data.id);
    return NextResponse.json({ item: normalized }, { status: 201 });
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const body = await request.json();
  const { id, name, slug, description, metadata } = body ?? {};

  if (!id) {
    return jsonError('Course id is required', 400);
  }

  const supa = getAdminClient();

  let course;
  try {
    course = await fetchCourseOrThrow(supa, id);
  } catch (err) {
    if (err instanceof ValidationError) {
      return jsonError(err.message, 400, err.details);
    }
    if (err instanceof NotFoundError) {
      return jsonError(err.message, 404);
    }
    return jsonError((err as Error).message, 400);
  }

  if (slug && typeof slug === 'string' && slug.trim() !== (course.slug ?? '').trim()) {
    try {
      await ensureUniqueCourseSlug(supa, slug, course.id);
    } catch (err) {
      if (err instanceof ValidationError) {
        return jsonError(err.message, 409, err.details);
      }
      return jsonError((err as Error).message, 400);
    }
  }

  const updates: Record<string, unknown> = {};
  if (typeof name === 'string') updates.name = name.trim();
  if (typeof slug === 'string') updates.slug = slug.trim();
  if ('description' in body) updates.description = typeof description === 'string' ? description : null;
  if ('metadata' in body) updates.metadata = metadata ?? null;

  if (Object.keys(updates).length === 0) {
    return jsonError('No changes provided', 400);
  }

  const { error } = await supa
    .from('courses')
    .update(updates)
    .eq('id', id);

  if (error) {
    return jsonError(error.message, 400);
  }

  try {
    const normalized = await fetchNormalizedCourse(supa, id);
    return NextResponse.json({ item: normalized });
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const body = await request.json();
  const { id } = body ?? {};

  if (!id) {
    return jsonError('Course id is required', 400);
  }

  const supa = getAdminClient();

  try {
    await fetchCourseOrThrow(supa, id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return jsonError(err.message, 404);
    }
    return jsonError((err as Error).message, 400);
  }

  const { data: nodeRows, error: nodeErr } = await supa
    .from('course_nodes')
    .select('id')
    .eq('course_id', id);

  if (nodeErr) {
    return jsonError(nodeErr.message, 400);
  }

  const nodeIds = (nodeRows ?? []).map((row) => row.id).filter((value): value is string => typeof value === 'string');

  try {
    await deleteNodesCascade(supa, nodeIds);
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }

  const { error: deleteErr } = await supa
    .from('courses')
    .delete()
    .eq('id', id);

  if (deleteErr) {
    return jsonError(deleteErr.message, 400);
  }

  return NextResponse.json({ deletedId: id });
}
