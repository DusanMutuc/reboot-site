import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';

export async function POST(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.res;
  const { supabase, user } = guard;

  const body = await req.json().catch(() => null) as { content_block_id?: number } | null;
  if (!body?.content_block_id) {
    return NextResponse.json({ error: 'content_block_id is required' }, { status: 400 });
  }

  // One row per (content_block_id, user_id) by design
  const { data, error } = await supabase
    .from('smart_doc_responses')
    .select('status, submitted_at')
    .eq('content_block_id', body.content_block_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Status fetch failed', details: error.message }, { status: 500 });
  }

  return NextResponse.json({
    status: data?.status ?? 'draft',
    submitted_at: data?.submitted_at ?? null,
  });
}
