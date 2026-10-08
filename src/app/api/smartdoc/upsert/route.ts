import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { validSmartDocId } from '@/lib/smartDocProgress';

export async function POST(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.res;
  const { supabase, user } = guard;

  const body = await req.json().catch(() => null) as {
    content_block_id?: number;
    prompt_id?: number;
    value?: unknown; // will be wrapped in jsonb by the RPC
    expected_user_id?: string;
  } | null;

  if (!validSmartDocId(body?.content_block_id) || !validSmartDocId(body?.prompt_id)
    || typeof body?.value !== 'string') {
    return NextResponse.json({ error: 'content_block_id and prompt_id are required' }, { status: 400 });
  }
  if (body.expected_user_id !== undefined && body.expected_user_id !== user.id) {
    return NextResponse.json({ error: 'Your account changed. Reload before saving.' }, { status: 409 });
  }

  const { data, error } = await supabase.rpc('upsert_smart_field_value', {
    _content_block_id: body.content_block_id,
    _prompt_id: body.prompt_id,
    _user_id: user.id,
    _value: body.value ?? null,
  });

  if (error) {
    const status = error.code === '22023' ? 422 : error.code === '42501' ? 403 : 500;
    return NextResponse.json({ error: 'Upsert failed', details: error.message }, { status });
  }

  // optional: RPC can return updated progress (fields_total, fields_completed)
  return NextResponse.json({ result: data });
}
