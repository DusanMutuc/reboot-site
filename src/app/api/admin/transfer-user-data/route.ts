// app/api/admin/transfer-user-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type Body = { source: string; dest: string; options?: Record<string, any> };

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { source, dest, options = {} } = body || {};
  if (!source || !dest || source === dest) {
    return NextResponse.json({ error: 'Invalid source/dest' }, { status: 400 });
  }

  const supa = getAdminClient();

  // Pass through whatever options you pick in the UI; the wrapper will OR-in skip_admin_check.
  const opts = {
    dry_run: true,
    kpi_merge: 'sum',
    smart_doc_conflict: 'keep_latest_submitted',
    progress_json_merge: 'prefer_dest',
    reassign_authorship: false,
    ...options,
  };

  const { data, error } = await supa.rpc('transfer_user_data_admin', {
    _source: source,
    _dest: dest,
    _options: opts,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? { ok: true });
}
