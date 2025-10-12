import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  handleCourseBuilderError,
} from '@/lib/courseBuilder';

function parseParentId(value: string | null) {
  if (!value) {
    throw new CourseBuilderError('parentId query parameter is required', 400);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new CourseBuilderError('parentId must be a number', 400);
  }
  return parsed;
}

function parseUserId(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }
  const uuidRegex =
    /^(\{)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}(\})?$/;
  if (!uuidRegex.test(value)) {
    throw new CourseBuilderError('userId must be a valid UUID', 400);
  }
  return value;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const url = new URL(request.url);
    const parentId = parseParentId(url.searchParams.get('parentId'));
    const userId = parseUserId(url.searchParams.get('userId'), guard.user.id);

    const { data, error } = await adminClient.rpc('get_child_unlock_status', {
      _parent_id: parentId,
      _user_id: userId,
    });

    if (error) {
      throw new CourseBuilderError('Failed to load unlock status', 500, {
        details: error.message,
        parentId,
        userId,
      });
    }

    return NextResponse.json({ unlockStatus: data ?? [] });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
