import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type Body = {
  user_id?: string;
  content_block_id?: number;
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.user_id || !body?.content_block_id) {
    return NextResponse.json({ error: 'user_id and content_block_id are required' }, { status: 400 });
  }

  const adminClient = getAdminClient();
  const { data, error } = await adminClient.rpc('get_user_smartdoc_answers', {
    _user_id: body.user_id,
    _content_block_id: body.content_block_id,
  });

  if (error) {
    return NextResponse.json({ error: 'Admin answers fetch failed', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
