import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const { supabase } = guard;
  const body = await request.json().catch(() => null) as
    | { action: 'start' | 'complete'; nodeId: number }
    | null;

  if (!body?.nodeId || !body?.action) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    if (body.action === 'start') {
      const { error } = await supabase.rpc('mark_node_started', { _node_id: body.nodeId });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.rpc('mark_node_completed', { _node_id: body.nodeId });
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: 'Progress update failed', details: msg }, { status: 500 });
  }
}
