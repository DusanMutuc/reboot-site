import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';

// If you already have a generated Supabase `Json` type, import it instead.
// e.g. `import type { Json } from '@/types/supabase';`
type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type PostPayload = {
  content_block_id: number;
  prompt_id: number;
  value: Json; // jsonb-serializable
};

export async function POST(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.res;

  const { supabase } = guard;

  const body = (await req.json().catch(() => null)) as PostPayload | null;

  if (
    !body ||
    typeof body.content_block_id !== 'number' ||
    typeof body.prompt_id !== 'number'
  ) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { error, data } = await supabase.rpc('upsert_smart_field_value', {
    _content_block_id: body.content_block_id,
    _prompt_id: body.prompt_id,
    _user_id: null, // RPC uses auth.uid() via RLS; null is fine
    _value: body.value, // now strongly typed as Json
  });

  if (error) {
    return NextResponse.json(
      { error: 'Field save failed', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, progress: data });
}
