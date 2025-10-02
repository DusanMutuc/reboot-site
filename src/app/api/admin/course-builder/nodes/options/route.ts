import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const supa = getAdminClient();

  const [{ data: stateRows, error: stateError }, { data: typeRows, error: typeError }] = await Promise.all([
    supa
      .from('content_nodes')
      .select('state')
      .not('state', 'is', null),
    supa
      .from('content_nodes')
      .select('node_type')
      .not('node_type', 'is', null),
  ]);

  if (stateError) {
    console.error('❌ admin-course-node options state error:', stateError);
    return NextResponse.json({ error: stateError.message }, { status: 400 });
  }

  if (typeError) {
    console.error('❌ admin-course-node options type error:', typeError);
    return NextResponse.json({ error: typeError.message }, { status: 400 });
  }

  const states = Array.from(
    new Set((stateRows ?? []).map((row) => row.state).filter((value): value is string => typeof value === 'string'))
  ).sort();

  const nodeTypes = Array.from(
    new Set((typeRows ?? []).map((row) => row.node_type).filter((value): value is string => typeof value === 'string'))
  ).sort();

  return NextResponse.json({ states, node_types: nodeTypes });
}
