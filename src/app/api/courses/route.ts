import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/requireUser';
import { CourseBuilderError, adminClient, handleCourseBuilderError } from '@/lib/courseBuilder';

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.res;
  }

  // Adjust this line if requireUser exposes the user differently
  const userId = guard.user.id; // or guard.session.user.id, etc.

  try {
    const { data, error } = await adminClient.rpc(
      'get_available_courses_for_user',
      { _user_id: userId }
    );

    if (error) {
      throw new CourseBuilderError('Failed to load courses', 500, { details: error.message });
    }

    const courses = (data ?? []) as Array<{ id: number; title?: string | null }>;

    if (courses.length === 0) {
      return NextResponse.json({ courses });
    }

    const courseIds = courses.map((course) => course.id);
    const { data: sortRows, error: sortError } = await adminClient
      .from('course_sort_orders')
      .select('course_node_id, sort_order')
      .in('course_node_id', courseIds);

    if (sortError) {
      throw new CourseBuilderError('Failed to load course ordering', 500, { details: sortError.message });
    }

    const orderMap = new Map<number, number>((sortRows ?? []).map((row) => [row.course_node_id, row.sort_order]));
    const sortedCourses = [...courses].sort((a, b) => {
      const aOrder = orderMap.get(a.id);
      const bOrder = orderMap.get(b.id);

      if (aOrder != null && bOrder != null && aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      if (aOrder != null && bOrder == null) return -1;
      if (aOrder == null && bOrder != null) return 1;

      return (a.title ?? '').localeCompare(b.title ?? '');
    });

    return NextResponse.json({ courses: sortedCourses });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
