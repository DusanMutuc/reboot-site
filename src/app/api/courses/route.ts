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

    // The RPC already returns exactly the shape your frontend expects
    // (id, title, slug, description, hero_image, icon, objectives, metadata, sequential_unlock)
    const courses = data ?? [];

    return NextResponse.json({ courses });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
