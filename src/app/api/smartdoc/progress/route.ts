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

  const { data, error } = await supabase.rpc('get_smart_doc_progress', {
    _content_block_id: body.content_block_id,
    _user_id: user.id,
  });

  if (error) {
    return NextResponse.json({ error: 'Progress fetch failed', details: error.message }, { status: 500 });
  }

  // data is expected to be { fields_total, fields_completed }
  return NextResponse.json({ progress: data ?? { fields_total: 0, fields_completed: 0 } });
}
