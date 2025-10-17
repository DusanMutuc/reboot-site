import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/requireUser';

type ResponseRow = {
  id: number;
  status: 'draft' | 'submitted';
  submitted_at: string | null;
};

export async function POST(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.res;
  const { supabase, user } = guard;

  const body = await req.json().catch(() => null) as { content_block_id?: number } | null;
  if (!body?.content_block_id) {
    return NextResponse.json({ error: 'content_block_id is required' }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await supabase
    .from('smart_doc_responses')
    .select('id, status, submitted_at')
    .eq('content_block_id', body.content_block_id)
    .eq('user_id', user.id)
    .maybeSingle<ResponseRow>();

  if (existingError) {
    return NextResponse.json({ error: 'Submit failed', details: existingError.message }, { status: 500 });
  }

  let responseRow: ResponseRow | null = existing ?? null;

  if (responseRow?.id) {
    const { data: updated, error: updateError } = await supabase
      .from('smart_doc_responses')
      .update({ status: 'submitted', submitted_at: now })
      .eq('id', responseRow.id)
      .select('id, status, submitted_at')
      .single<ResponseRow>();

    if (updateError) {
      return NextResponse.json({ error: 'Submit failed', details: updateError.message }, { status: 500 });
    }

    responseRow = updated ?? { id: responseRow.id, status: 'submitted', submitted_at: now };
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('smart_doc_responses')
      .insert({
        content_block_id: body.content_block_id,
        user_id: user.id,
        status: 'submitted',
        submitted_at: now,
      })
      .select('id, status, submitted_at')
      .single<ResponseRow>();

    if (insertError) {
      return NextResponse.json({ error: 'Submit failed', details: insertError.message }, { status: 500 });
    }

    responseRow = inserted ?? null;
  }

  const { data: progress, error: progressError } = await supabase.rpc('get_smart_doc_progress', {
    _content_block_id: body.content_block_id,
    _user_id: user.id,
  });

  if (progressError) {
    // Progress metrics are nice-to-have; log and continue with defaults.
    console.error('smartdoc progress fetch failed after submit', progressError);
  }

  const fields_total = typeof progress?.fields_total === 'number' ? progress.fields_total : 0;
  const fields_completed = typeof progress?.fields_completed === 'number' ? progress.fields_completed : 0;

  return NextResponse.json({
    result: {
      fields_total,
      fields_completed,
      status: responseRow?.status ?? 'submitted',
      submitted_at: responseRow?.submitted_at ?? now,
    },
  });
}
