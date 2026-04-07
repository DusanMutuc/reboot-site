import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/requireUser';
import { adminClient, fetchNodeSubtree } from '@/lib/courseBuilder';
import { collectSubtreeNodeIds, resolveAccessibleCourseBySlug } from '@/lib/courseAccess';
import type { ChildUnlockStatus } from '@/types/course';

export async function POST(req: NextRequest, context: unknown) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.res;

  const { params } = context as { params: { courseSlug?: string } };
  const courseSlug = params.courseSlug;

  const body = (await req.json().catch(() => null)) as { parentIds?: number[] } | null;
  const parentIds = (body?.parentIds ?? []).filter((value) => Number.isFinite(value)) as number[];
  if (parentIds.length === 0) {
    return NextResponse.json({ unlockStatuses: {} });
  }

  const course = await resolveAccessibleCourseBySlug(guard.user.id, courseSlug ?? '');
  if (!course) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }

  const subtree = await fetchNodeSubtree(course.id, {
    includeBlocks: false,
    allowUnpublished: false,
  });
  const allowedNodeIds = collectSubtreeNodeIds(subtree);
  const allowedParentIds = parentIds.filter((parentId) => allowedNodeIds.has(parentId));
  if (allowedParentIds.length === 0) {
    return NextResponse.json({ unlockStatuses: {} });
  }

  const { data, error } = await adminClient.rpc('get_child_unlock_status_bulk', {
    _parent_ids: allowedParentIds,
    _user_id: guard.user.id,
  });

  if (error) {
    return NextResponse.json(
      { error: 'Unlock refresh failed', details: error.message },
      { status: 500 },
    );
  }

  const unlockStatuses: Record<number, ChildUnlockStatus[]> = {};
  for (const row of (data ?? []) as Array<{
    parent_id: number;
    child_id: number;
    child_position: number;
    is_required: boolean;
    locked: boolean;
    reason: string | null;
  }>) {
    if (!unlockStatuses[row.parent_id]) unlockStatuses[row.parent_id] = [];
    unlockStatuses[row.parent_id].push({
      child_id: row.child_id,
      child_position: row.child_position,
      is_required: row.is_required,
      locked: row.locked,
      reason: row.reason ?? null,
    });
  }

  for (const parentId of Object.keys(unlockStatuses)) {
    unlockStatuses[Number(parentId)].sort((a, b) => a.child_position - b.child_position);
  }

  return NextResponse.json({ unlockStatuses });
}
