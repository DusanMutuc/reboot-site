import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { fetchLegendUserIdSet } from '@/lib/legendMembers';
import { getAdminClient } from '@/lib/supabaseAdmin';

const COURSE_ID = 2;

type RosterUser = { user_id: string; name: string; email: string; is_legend: boolean };
type Roster = {
  coach_id: string;
  coach_name: string;
  coach_email: string;
  users: RosterUser[];
  effective_count: number;
  legend_count: number;
};

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const supa = getAdminClient();

  // active assignments
  const { data: rows, error } = await supa
    .from('user_coaches')
    .select('user_id, coach_id')
    .eq('course_id', COURSE_ID)
    .eq('is_active', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const assignments = rows ?? [];
  if (assignments.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const coachIds = Array.from(new Set(assignments.map((r) => r.coach_id)));
  const userIds  = Array.from(new Set(assignments.map((r) => r.user_id)));
  const allIds   = Array.from(new Set([...coachIds, ...userIds]));
  const legendUserIdSet = await fetchLegendUserIdSet(supa, userIds);

  // active partnerships by user (for roster effective counts)
  const { data: partnershipRows, error: partnershipErr } = await supa
    .from('partnership_users')
    .select('partnership_id, user_id, partnerships!inner(is_active)')
    .in('user_id', userIds)
    .eq('partnerships.is_active', true);
  if (partnershipErr) {
    return NextResponse.json({ error: partnershipErr.message }, { status: 400 });
  }

  const partnershipByUserId = new Map<string, string>();
  for (const row of partnershipRows ?? []) {
    // uniqueness is enforced by trg_enforce_single_active_partnership_per_domain
    partnershipByUserId.set(row.user_id, row.partnership_id);
  }

  // profiles
  const { data: profs, error: pErr } = await supa
    .from('profiles').select('id, first_name, last_name').in('id', allIds);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
  const profById = new Map((profs ?? []).map((p) => [p.id, p]));

  // emails
  const emailMap = new Map<string, string>();
  let page = 1; const perPage = 1000;  // ← prefer-const
  for (;;) {
    const { data: u, error: e } = await supa.auth.admin.listUsers({ page, perPage });
    if (e) return NextResponse.json({ error: e.message }, { status: 400 });
    for (const usr of u.users) {
      if (allIds.includes(usr.id)) emailMap.set(usr.id, (usr.email || '').toLowerCase());
    }
    if (u.users.length < perPage) break;
    page++;
  }

  const group: Map<string, Roster> = new Map();

  for (const r of assignments) {
    const cp = profById.get(r.coach_id);
    const up = profById.get(r.user_id);
    const coach_name  = `${cp?.first_name ?? ''} ${cp?.last_name ?? ''}`.trim();
    const coach_email = emailMap.get(r.coach_id) || '';
    const user_name   = `${up?.first_name ?? ''} ${up?.last_name ?? ''}`.trim();
    const user_email  = emailMap.get(r.user_id) || '';

    let g = group.get(r.coach_id);
    if (!g) {
      g = {
        coach_id: r.coach_id,
        coach_name,
        coach_email,
        users: [],
        effective_count: 0,
        legend_count: 0,
      };
      group.set(r.coach_id, g);
    }
    g.users.push({
      user_id: r.user_id,
      name: user_name,
      email: user_email,
      is_legend: legendUserIdSet.has(r.user_id),
    });
  }

  for (const roster of group.values()) {
    roster.users.sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      if (byName !== 0) return byName;
      return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
    });

    const uniqueUnits = new Set<string>();
    for (const user of roster.users) {
      const partnershipId = partnershipByUserId.get(user.user_id);
      uniqueUnits.add(partnershipId ? `p:${partnershipId}` : `u:${user.user_id}`);
    }
    roster.effective_count = uniqueUnits.size;
    roster.legend_count = roster.users.filter((user) => user.is_legend).length;
  }

  return NextResponse.json({ items: Array.from(group.values()) });
}
