import 'server-only';

import { CourseBuilderError, adminClient, type NodeSubtree } from '@/lib/courseBuilder';

type CourseIdRow = {
  course_node_id: number;
};

type CourseSlugRow = {
  id: number;
  node_type: string;
  slug: string | null;
};

function toCourseBuilderError(message: string, details: Record<string, unknown>) {
  return new CourseBuilderError(message, 500, details);
}

export async function getAvailableCourseIdsForUser(userId: string): Promise<number[]> {
  const { data, error } = await adminClient.rpc('get_available_course_ids_for_user', {
    p_user_id: userId,
  });

  if (error) {
    throw toCourseBuilderError('Failed to resolve available courses', {
      details: error.message,
      userId,
    });
  }

  return ((data ?? []) as CourseIdRow[])
    .map((row) => Number(row.course_node_id))
    .filter((value) => Number.isFinite(value));
}

export async function canUserAccessCourse(userId: string, courseId: number): Promise<boolean> {
  const { data, error } = await adminClient.rpc('can_user_access_course', {
    p_user_id: userId,
    p_course_node_id: courseId,
  });

  if (error) {
    throw toCourseBuilderError('Failed to verify course access', {
      details: error.message,
      userId,
      courseId,
    });
  }

  return data === true;
}

export async function canUserAccessNodeViaCourse(userId: string, nodeId: number): Promise<boolean> {
  const { data, error } = await adminClient.rpc('can_user_access_node_via_course', {
    p_user_id: userId,
    p_node_id: nodeId,
  });

  if (error) {
    throw toCourseBuilderError('Failed to verify node access', {
      details: error.message,
      userId,
      nodeId,
    });
  }

  return data === true;
}

export async function resolveAccessibleCourseBySlug(userId: string, courseSlug: string) {
  const { data, error } = await adminClient
    .from('content_nodes')
    .select('id, node_type, slug')
    .eq('node_type', 'course')
    .eq('slug', courseSlug)
    .maybeSingle();

  if (error) {
    throw toCourseBuilderError('Failed to resolve course', {
      details: error.message,
      userId,
      courseSlug,
    });
  }

  const course = data as CourseSlugRow | null;
  if (!course || course.node_type !== 'course') {
    return null;
  }

  const allowed = await canUserAccessCourse(userId, course.id);
  if (!allowed) {
    return null;
  }

  return course;
}

export function collectSubtreeNodeIds(subtree: NodeSubtree) {
  const ids = new Set<number>();

  const visit = (current: NodeSubtree) => {
    ids.add(current.node.id);
    for (const child of current.children) {
      visit(child.subtree);
    }
  };

  visit(subtree);
  return ids;
}
