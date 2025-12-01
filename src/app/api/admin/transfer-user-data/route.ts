// app/api/admin/transfer-user-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type TransferOptions = {
  dry_run?: boolean;
  // Backend semantics:
  //  - 'skip'          => KPI tables untouched
  //  - 'prefer_source' => overwrite dest KPI with source KPI (source intact)
  kpi_merge?: 'skip' | 'prefer_source';
  smart_doc_conflict?: 'keep_latest_submitted' | 'keep_dest' | 'keep_source';
  reassign_authorship?: boolean;
};

type Body = {
  source: string;
  dest: string;
  options?: TransferOptions;
};

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { source, dest, options } = body || {};
  if (!source || !dest || source === dest) {
    return NextResponse.json({ error: 'Invalid source/dest' }, { status: 400 });
  }

  const supa = getAdminClient();

  // Apply safe defaults; backend wrapper will OR-in skip_admin_check itself.
  const opts: TransferOptions = {
    dry_run: true,
    kpi_merge: 'prefer_source',
    smart_doc_conflict: 'keep_latest_submitted',
    reassign_authorship: false,
    ...(options ?? {}),
  };

  const { data, error } = await supa.rpc('transfer_user_data_admin', {
    _source: source,
    _dest: dest,
    _options: opts,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? { ok: true });
}
