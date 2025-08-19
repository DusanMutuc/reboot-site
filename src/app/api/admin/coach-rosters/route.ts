import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

const COURSE_ID = 2;

type RosterUser = { user_id: string; name: string; email: string };
type Roster = { coach_id: string; coach_name: string; coach_email: string; users: RosterUser[] };

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

  const coachIds = Array.from(new Set(rows.map((r) => r.coach_id)));
  const userIds  = Array.from(new Set(rows.map((r) => r.user_id)));
  const allIds   = Array.from(new Set([...coachIds, ...userIds]));

  // profiles
  const { data: profs, error: pErr } = await supa
    .from('profiles').select('id, first_name, last_name').in('id', allIds);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
  const profById = new Map(profs.map((p) => [p.id, p]));

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

  for (const r of rows) {
    const cp = profById.get(r.coach_id);
    const up = profById.get(r.user_id);
    const coach_name  = `${cp?.first_name ?? ''} ${cp?.last_name ?? ''}`.trim();
    const coach_email = emailMap.get(r.coach_id) || '';
    const user_name   = `${up?.first_name ?? ''} ${up?.last_name ?? ''}`.trim();
    const user_email  = emailMap.get(r.user_id) || '';

    let g = group.get(r.coach_id);
    if (!g) {
      g = { coach_id: r.coach_id, coach_name, coach_email, users: [] };
      group.set(r.coach_id, g);
    }
    g.users.push({ user_id: r.user_id, name: user_name, email: user_email });
  }

  return NextResponse.json({ items: Array.from(group.values()) });
}
