import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { smartDocProgressRow, validSmartDocId } from '@/lib/smartDocProgress';

export async function POST(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.res;
  const { supabase, user } = guard;
  const body = await req.json().catch(() => null);
  if (!validSmartDocId(body?.content_block_id)) {
    return NextResponse.json({ error: 'A valid content_block_id is required' }, { status: 400 });
  }
  if (body.expected_user_id !== undefined && body.expected_user_id !== user.id) {
    return NextResponse.json({ error: 'Your account changed. Reload before submitting.' }, { status: 409 });
  }
  // Validation and status change share one transaction and response lock.
  const { data, error } = await supabase.rpc('submit_smart_doc', {
    _content_block_id: body.content_block_id, _user_id: user.id,
  });
  if (error) {
    const status = error.code === '22023' ? 422 : error.code === '42501' ? 403 : 500;
    return NextResponse.json({ error: 'Submit failed', details: error.message }, { status });
  }
  const row = Array.isArray(data) ? data[0] : data;
  const progress = smartDocProgressRow(row);
  if (!progress || row?.status !== 'submitted' || typeof row.submitted_at !== 'string') {
    return NextResponse.json({ error: 'The submission could not be confirmed. Please retry.' }, { status: 502 });
  }
  return NextResponse.json({ result: { ...progress, status: row.status, submitted_at: row.submitted_at } });
}
