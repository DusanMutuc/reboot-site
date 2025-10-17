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

  const { data, error } = await supabase.rpc('submit_smart_doc', {
    _content_block_id: body.content_block_id,
    _user_id: user.id,
  });

  if (error) {
    return NextResponse.json({ error: 'Submit failed', details: error.message }, { status: 500 });
  }

  // data should include { fields_total, fields_completed, status, submitted_at }
  return NextResponse.json({ result: data });
}
