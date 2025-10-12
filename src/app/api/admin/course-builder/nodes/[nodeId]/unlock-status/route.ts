import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/requireAdmin';
import { getSupabaseServiceClient } from '@/lib/supabaseServiceClient';

type UnlockRow = {
  child_id: number;
  child_position: number;
  is_required: boolean;
  locked: boolean;
  reason: string | null;
};

function parseNodeId(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Invalid nodeId');
  }
  return value;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { nodeId: string } },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const parentId = parseNodeId(params.nodeId);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') ?? undefined;

    const supabase = getSupabaseServiceClient();

    const rpcParams: { _parent_id: number; _user_id?: string } = { _parent_id: parentId };
    if (userId) {
      rpcParams._user_id = userId;
    }

    const { data, error } = await supabase.rpc<UnlockRow>('get_child_unlock_status', rpcParams);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const payload: Record<number, { locked: boolean; is_required: boolean; reason: string | null; child_position: number }> = {};
    for (const row of data ?? []) {
      payload[row.child_id] = {
        locked: Boolean(row.locked),
        is_required: Boolean(row.is_required),
        reason: row.reason ?? null,
        child_position: row.child_position,
      };
    }

    return NextResponse.json(payload, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load unlock status';
    const invalidRequest = error instanceof Error && error.message.includes('Invalid nodeId');
    return NextResponse.json(
      { error: message },
      {
        status: invalidRequest ? 400 : 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
