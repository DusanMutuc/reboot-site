import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { adminClient } from '@/lib/courseBuilder';
import type { ChildUnlockStatus } from '@/types/course';

// Assumes DB RPC: get_child_unlock_status_bulk(_parent_ids bigint[], _user_id uuid)
export async function POST(req: NextRequest, context: unknown) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.res;

  // we don’t actually use the slug in this handler right now,
  // but it’s there in the route, so let’s just read it safely:
  const { params } = context as { params: { courseSlug?: string } };
  const _courseSlug = params.courseSlug; // available if you need later

  const body = (await req.json().catch(() => null)) as { parentIds?: number[] } | null;
  const parentIds = (body?.parentIds ?? []).filter((n) => Number.isFinite(n)) as number[];
  if (parentIds.length === 0) {
    return NextResponse.json({ unlockStatuses: {} });
  }

  const { data, error } = await adminClient.rpc('get_child_unlock_status_bulk', {
    _parent_ids: parentIds,
    _user_id: guard.user.id,
  });

  if (error) {
    return NextResponse.json(
      { error: 'Unlock refresh failed', details: error.message },
      { status: 500 }
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

  // Keep children ordered for the UI
  for (const pid of Object.keys(unlockStatuses)) {
    unlockStatuses[+pid].sort((a, b) => a.child_position - b.child_position);
  }

  return NextResponse.json({ unlockStatuses });
}
