import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { CourseBuilderError, adminClient, handleCourseBuilderError } from '@/lib/courseBuilder';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const { data, error } = await adminClient
      .from('node_edge_rules')
      .select('parent_type, child_kind, child_type')
      .order('parent_type', { ascending: true })
      .order('child_kind', { ascending: true })
      .order('child_type', { ascending: true });

    if (error) {
      throw new CourseBuilderError('Failed to load node edge rules', 500, {
        details: error.message,
      });
    }

    return NextResponse.json({ rules: data ?? [] });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
