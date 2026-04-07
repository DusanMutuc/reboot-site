import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/requireUser';
import { CourseBuilderError, adminClient, handleCourseBuilderError } from '@/lib/courseBuilder';
import { getAvailableCourseIdsForUser } from '@/lib/courseAccess';

type CourseSummaryRow = {
  id: number;
  title: string | null;
  slug: string | null;
  description: string | null;
  hero_image: string | null;
  icon: string | null;
  objectives: string | null;
  metadata: Record<string, unknown> | null;
  sequential_unlock: boolean | null;
};

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.res;
  }

  const userId = guard.user.id;

  try {
    const courseIds = await getAvailableCourseIdsForUser(userId);
    if (courseIds.length === 0) {
      return NextResponse.json({ courses: [] });
    }

    const { data: courseRows, error: courseError } = await adminClient
      .from('content_nodes')
      .select('id, title, slug, description, hero_image, icon, objectives, metadata, sequential_unlock')
      .eq('node_type', 'course')
      .in('id', courseIds);

    if (courseError) {
      throw new CourseBuilderError('Failed to load courses', 500, { details: courseError.message });
    }

    const courses = (courseRows ?? []) as CourseSummaryRow[];
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
