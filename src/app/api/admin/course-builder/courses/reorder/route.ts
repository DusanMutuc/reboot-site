import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/requireAdmin';
import { CourseBuilderError, adminClient, handleCourseBuilderError } from '@/lib/courseBuilder';

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const rawIds: unknown[] | null = Array.isArray(body?.courseIds) ? body.courseIds : null;

    if (!rawIds) {
      throw new CourseBuilderError('courseIds must be an array', 400);
    }

    const courseIds = rawIds
      .map((id: unknown) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (courseIds.length === 0) {
      throw new CourseBuilderError('courseIds must include at least one valid course id', 400);
    }

    const { data: existingCourses, error: existingCoursesError } = await adminClient
      .from('content_nodes')
      .select('id')
      .in('id', courseIds)
      .eq('node_type', 'course');

    if (existingCoursesError) {
      throw new CourseBuilderError('Failed to validate course ids', 500, { details: existingCoursesError.message });
    }

    if ((existingCourses ?? []).length !== courseIds.length) {
      throw new CourseBuilderError('courseIds contains non-course ids', 400);
    }

    const { error } = await adminClient.rpc('set_course_order', { _course_ids: courseIds });
    if (error) {
      throw new CourseBuilderError('Failed to persist course order', 500, { details: error.message });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
