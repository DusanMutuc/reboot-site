import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';

export async function POST(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.res;
  const { supabase, user } = guard;

  const body = await req.json().catch(() => null) as {
    content_block_id?: number;
    prompt_id?: number;
    value?: unknown; // will be wrapped in jsonb by the RPC
  } | null;

  if (!body?.content_block_id || !body?.prompt_id) {
    return NextResponse.json({ error: 'content_block_id and prompt_id are required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('upsert_smart_field_value', {
    _content_block_id: body.content_block_id,
    _prompt_id: body.prompt_id,
    _user_id: user.id,
    _value: body.value ?? null,
  });

  if (error) {
    return NextResponse.json({ error: 'Upsert failed', details: error.message }, { status: 500 });
  }

  // optional: RPC can return updated progress (fields_total, fields_completed)
  return NextResponse.json({ result: data });
}
