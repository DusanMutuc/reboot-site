import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/requireUser';
import { CourseBuilderError, adminClient, handleCourseBuilderError } from '@/lib/courseBuilder';

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const { data, error } = await adminClient
      .from('content_nodes')
      .select(
        `id, title, slug, description, hero_image, icon, objectives, metadata, sequential_unlock, state`,
      )
      .eq('node_type', 'course')
      .eq('state', 'published')
      .order('title', { ascending: true });

    if (error) {
      throw new CourseBuilderError('Failed to load courses', 500, { details: error.message });
    }

    const courses = (data ?? []).map((course) => ({
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description,
      hero_image: course.hero_image,
      icon: course.icon,
      objectives: course.objectives,
      metadata: course.metadata,
      sequential_unlock: course.sequential_unlock,
    }));

    return NextResponse.json({ courses });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
