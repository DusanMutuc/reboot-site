import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

// GET /api/admin/users?query=&page=1&limit=200
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '200', 10)));
  const query = (searchParams.get('query') || '').trim().toLowerCase();

  const supa = getAdminClient();

  // 0) Resolve the "user" role id (avoids embedded join quirks)
  const { data: roleRow, error: roleLookupErr } = await supa
    .from('roles')
    .select('id')
    .eq('code', 'user')
    .maybeSingle();

  if (roleLookupErr) {
    return NextResponse.json({ error: roleLookupErr.message }, { status: 400 });
  }
  if (!roleRow?.id) {
    // No such role configured — return an empty set rather than 500
    return NextResponse.json({ items: [], total: 0 });
  }

  // 1) Pull user ids that have role "user"
  const { data: urRows, error: urErr } = await supa
    .from('user_roles')
    .select('user_id')
    .eq('role_id', roleRow.id);

  if (urErr) {
    return NextResponse.json({ error: urErr.message }, { status: 400 });
  }

  const ids = Array.from(new Set((urRows ?? []).map((r) => r.user_id)));
  if (!ids.length) {
    return NextResponse.json({ items: [], total: 0 });
  }

  // 2) Page a subset of profiles for those ids (name search in SQL)
  let qb = supa
    .from('profiles')
    .select('id, first_name, last_name, looker_link, ghl_user_id', { count: 'exact' })
    .in('id', ids);

  if (query) {
    // SQL-side name filtering; email filtering is applied after admin auth fetch
    qb = qb.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data: profs, error: profErr, count } = await qb
    .order('last_name', { ascending: true, nullsFirst: true })
    .order('first_name', { ascending: true, nullsFirst: true })
    .range(from, to);

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }

  const profiles = profs ?? [];
  if (profiles.length === 0) {
    return NextResponse.json({ items: [], total: 0 });
  }

  // 3) Fetch email/phone for just this page’s ids using Admin API (v2 typing: data.user)
  const admin = supa.auth.admin;
  const pageIds = profiles.map((p) => p.id);

  // Batch to avoid hammering
  const MAX_CONCURRENCY = 8;
  const chunks: string[][] = [];
  for (let i = 0; i < pageIds.length; i += MAX_CONCURRENCY) {
    chunks.push(pageIds.slice(i, i + MAX_CONCURRENCY));
  }

  const authMap = new Map<string, { email: string; phone: string | null }>();
  for (const batch of chunks) {
    const responses = await Promise.all(batch.map((id) => admin.getUserById(id)));
    batch.forEach((id, idx) => {
      const { data, error } = responses[idx];
      const u = data?.user;
      if (error || !u) {
        authMap.set(id, { email: '', phone: null });
      } else {
        authMap.set(id, {
          email: (u.email || '').toLowerCase(),
          phone: u.phone && u.phone.trim().length > 0 ? u.phone : null,
        });
      }
    });
  }

  // 4) Combine rows
  let items = profiles.map((p) => {
    const auth = authMap.get(p.id) || { email: '', phone: null };
    return {
      id: p.id,
      email: auth.email,
      phone: auth.phone,
      first_name: p.first_name ?? '',
      last_name: p.last_name ?? '',
      looker_link: p.looker_link?.trim() ?? '',
      ghl_user_id: p.ghl_user_id?.trim() ?? '',
    };
  });

  // 5) If query contains an email fragment, post-filter here too
  if (query) {
    const q = query;
    items = items.filter(
      (r) =>
        (r.email && r.email.includes(q)) ||
        (r.first_name && r.first_name.toLowerCase().includes(q)) ||
        (r.last_name && r.last_name.toLowerCase().includes(q))
    );
  }

  // When post-filtering by email reduces rows, items.length reflects this page’s total.
  return NextResponse.json({
    items,
    total: items.length ?? count ?? 0,
  });
}
