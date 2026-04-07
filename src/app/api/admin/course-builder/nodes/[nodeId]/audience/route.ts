import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  handleCourseBuilderError,
} from '@/lib/courseBuilder';

type AudienceMode = 'public' | 'legend' | 'specific_users';

type AllowedUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type CourseRow = {
  id: number;
  node_type: string;
  visibility: 'public' | 'limited' | null;
};

type RoleJoinRow = {
  role_id: number;
  roles: { code?: string | null } | Array<{ code?: string | null }> | null;
};

type AllowedUserRow = {
  user_id: string;
  profile: { id: string; first_name: string | null; last_name: string | null } | Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  }> | null;
};

function parseNodeId(value: string) {
  const nodeId = Number(value);
  if (!Number.isFinite(nodeId) || nodeId <= 0) {
    throw new CourseBuilderError('Invalid node id', 400, { value });
  }

  return nodeId;
}

function toSingle<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function normalizeMode(value: unknown): AudienceMode {
  if (value === 'public' || value === 'legend' || value === 'specific_users') {
    return value;
  }

  throw new CourseBuilderError('Invalid audience mode', 400, { value });
}

async function getLegendRoleId() {
  const { data, error } = await adminClient
    .from('roles')
    .select('id')
    .eq('code', 'legend')
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError('Failed to resolve legend role', 500, { details: error.message });
  }

  if (!data?.id) {
    throw new CourseBuilderError('Legend role not found', 400);
  }

  return data.id;
}

async function loadCourse(nodeId: number): Promise<CourseRow> {
  const { data, error } = await adminClient
    .from('content_nodes')
    .select('id, node_type, visibility')
    .eq('id', nodeId)
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError('Failed to load course audience', 500, {
      details: error.message,
      nodeId,
    });
  }

  const course = data as CourseRow | null;
  if (!course || course.node_type !== 'course') {
    throw new CourseBuilderError('Course not found', 404, { nodeId });
  }

  return course;
}

async function loadAllowedUsers(nodeId: number): Promise<AllowedUser[]> {
  const { data, error } = await adminClient
    .from('user_course_visibility')
    .select(`
      user_id,
      profile:profiles (
        id,
        first_name,
        last_name
      )
    `)
    .eq('course_node_id', nodeId);

  if (error) {
    throw new CourseBuilderError('Failed to load course audience users', 500, {
      details: error.message,
      nodeId,
    });
  }

  return ((data ?? []) as AllowedUserRow[]).map((row) => {
    const profile = toSingle(row.profile);
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || null;

    return {
      id: profile?.id ?? row.user_id,
      full_name: fullName,
      email: null,
    };
  });
}

async function loadAudience(nodeId: number) {
  const [course, roleRows, allowedUsers] = await Promise.all([
    loadCourse(nodeId),
    adminClient
      .from('content_node_roles')
      .select('role_id, roles!inner(code)')
      .eq('node_id', nodeId),
    loadAllowedUsers(nodeId),
  ]);

  if (roleRows.error) {
    throw new CourseBuilderError('Failed to load course audience roles', 500, {
      details: roleRows.error.message,
      nodeId,
    });
  }

  const hasLegendRole = ((roleRows.data ?? []) as RoleJoinRow[]).some((row) => {
    const role = toSingle(row.roles);
    return role?.code === 'legend';
  });

  const mode: AudienceMode =
    course.visibility === 'public'
      ? 'public'
      : hasLegendRole
        ? 'legend'
        : 'specific_users';

  return {
    mode,
    allowedUsers,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ nodeId: string }> },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const { nodeId: nodeIdParam } = await context.params;
    const nodeId = parseNodeId(nodeIdParam);

    const audience = await loadAudience(nodeId);
    return NextResponse.json(audience);
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ nodeId: string }> },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const { nodeId: nodeIdParam } = await context.params;
    const nodeId = parseNodeId(nodeIdParam);
    await loadCourse(nodeId);

    const body = (await request.json().catch(() => null)) as {
      mode?: AudienceMode;
      userIds?: string[];
    } | null;
    const mode = normalizeMode(body?.mode);
    const userIds = Array.from(new Set((body?.userIds ?? []).filter((value) => typeof value === 'string')));

    const nextVisibility = mode === 'public' ? 'public' : 'limited';
    const { error: updateError } = await adminClient
      .from('content_nodes')
      .update({
        visibility: nextVisibility,
        updated_at: new Date().toISOString(),
        updated_by: guard.user.id,
      })
      .eq('id', nodeId);

    if (updateError) {
      throw new CourseBuilderError('Failed to update course audience', 500, {
        details: updateError.message,
        nodeId,
      });
    }

    const { error: deleteRoleError } = await adminClient
      .from('content_node_roles')
      .delete()
      .eq('node_id', nodeId);

    if (deleteRoleError) {
      throw new CourseBuilderError('Failed to clear course audience roles', 500, {
        details: deleteRoleError.message,
        nodeId,
      });
    }

    const { error: deleteUserError } = await adminClient
      .from('user_course_visibility')
      .delete()
      .eq('course_node_id', nodeId);

    if (deleteUserError) {
      throw new CourseBuilderError('Failed to clear course audience users', 500, {
        details: deleteUserError.message,
        nodeId,
      });
    }

    if (mode === 'legend') {
      const legendRoleId = await getLegendRoleId();
      const { error: insertRoleError } = await adminClient
        .from('content_node_roles')
        .insert({
          node_id: nodeId,
          role_id: legendRoleId,
          created_by: guard.user.id,
        });

      if (insertRoleError) {
        throw new CourseBuilderError('Failed to assign legend audience', 500, {
          details: insertRoleError.message,
          nodeId,
        });
      }
    }

    if (mode === 'specific_users' && userIds.length > 0) {
      const { error: insertUsersError } = await adminClient
        .from('user_course_visibility')
        .insert(userIds.map((userId) => ({ user_id: userId, course_node_id: nodeId })));

      if (insertUsersError) {
        throw new CourseBuilderError('Failed to assign course audience users', 500, {
          details: insertUsersError.message,
          nodeId,
        });
      }
    }

    const audience = await loadAudience(nodeId);
    return NextResponse.json(audience);
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
