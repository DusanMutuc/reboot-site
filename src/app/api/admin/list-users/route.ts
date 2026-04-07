import { NextRequest, NextResponse } from 'next/server';
import { fetchLegendUserIdSet } from '@/lib/legendMembers';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  console.log('📋 list-users: Starting request');

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const supa = getAdminClient();

  // Step 1: get ids for role 'user'
  const { data: roleRows, error: roleErr } = await supa
    .from('user_roles')
    .select('user_id, roles!inner(code)')
    .eq('roles.code', 'user');
  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 400 });

  const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
  if (!ids.length) return NextResponse.json({ items: [] });
  const legendUserIdSet = await fetchLegendUserIdSet(supa, ids);

  // Step 2: profiles
  const { data: profs, error: pErr } = await supa
    .from('profiles')
    .select('id, first_name, last_name, introduced_at')
    .in('id', ids);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
  const profMap = new Map((profs ?? []).map((p) => [p.id, p]));

  // Step 3: emails via Admin API
  const emailMap = new Map<string, string>();
  let page = 1; const perPage = 1000;  // ← prefer-const
  for (;;) {
    const { data: u, error: e } = await supa.auth.admin.listUsers({ page, perPage });
    if (e) return NextResponse.json({ error: e.message }, { status: 400 });
    for (const usr of u.users) {
      if (ids.includes(usr.id)) emailMap.set(usr.id, (usr.email || '').toLowerCase());
    }
    if (u.users.length < perPage) break;
    page++;
  }

  const items = ids.map((id) => {
    const p = profMap.get(id);
    const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();
    return {
      id,
      name,
      email: emailMap.get(id) || '',
      introduced_at: p?.introduced_at ?? null,
      is_legend: legendUserIdSet.has(id),
    };
  });

  console.log('✅ list-users: Returning', items.length, 'users');
  return NextResponse.json({ items });
}
