import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { adminClient } from '@/lib/courseBuilder';
import type { ChildUnlockStatus } from '@/types/course';

// Assumes DB RPC: get_child_unlock_status_bulk(_parent_ids bigint[], _user_id uuid)
export async function POST(request: NextRequest, { params }: { params: { courseSlug: string } }) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const body = await request.json().catch(() => null) as { parentIds?: number[] } | null;
  const parentIds = (body?.parentIds ?? []).filter((n) => Number.isFinite(n)) as number[];
  if (parentIds.length === 0) {
    return NextResponse.json({ unlockStatuses: {} });
  }

  const { data, error } = await adminClient.rpc('get_child_unlock_status_bulk', {
    _parent_ids: parentIds,
    _user_id: guard.user.id,
  });

  if (error) {
    return NextResponse.json({ error: 'Unlock refresh failed', details: error.message }, { status: 500 });
  }

  const unlockStatuses: Record<number, ChildUnlockStatus[]> = {};
  for (const row of (data ?? []) as Array<{
    parent_id: number; child_id: number; child_position: number; is_required: boolean; locked: boolean; reason: string | null;
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
