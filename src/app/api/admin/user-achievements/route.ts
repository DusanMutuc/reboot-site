// src/app/api/admin/user-achievements/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

// ---- Types ----

type RelAchievement = {
  id: number;
  code: string;
  title: string;
  icon_url: string | null;
};

type RelProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export type UA = {
  id: number;
  user_id: string;
  achievement_id: number;
  achieved_at: string;
  awarded_via: 'auto' | 'manual' | 'import' | 'reconcile';
  achievements?: RelAchievement | null;
  profiles?: RelProfile | null;
};

// Supabase may return embedded joins as an object OR as a single-element array.
// RawUA captures both so we can normalize safely.
type RawUA = {
  id: number;
  user_id: string;
  achievement_id: number;
  achieved_at: string;
  awarded_via: 'auto' | 'manual' | 'import' | 'reconcile';
  achievements?: RelAchievement | RelAchievement[] | null;
  profiles?: RelProfile | RelProfile[] | null;
};

// Normalize "object or [object]" -> object (or null)
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

// Build a UA from a RawUA with normalized relations
function normalize(row: RawUA): UA {
  return {
    id: row.id,
    user_id: row.user_id,
    achievement_id: row.achievement_id,
    achieved_at: row.achieved_at,
    awarded_via: row.awarded_via,
    achievements: one(row.achievements),
    profiles: one(row.profiles),
  };
}

// ---- Handlers ----

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id') ?? undefined;
  const achievementId = Number(searchParams.get('achievement_id') || '') || undefined;

  const supa = getAdminClient();

  // Note: we intentionally don't rely on FK-qualified joins here.
  // We select the relations plainly and normalize whatever shape we get back.
  let q = supa
    .from('user_achievements')
    .select(`
      id, user_id, achievement_id, achieved_at, awarded_via,
      achievements ( id, code, title, icon_url ),
      profiles ( id, first_name, last_name )
    `)
    .order('achieved_at', { ascending: false });

  if (userId) q = q.eq('user_id', userId);
  if (achievementId) q = q.eq('achievement_id', achievementId);

  const { data, error } = await q;
  if (error) {
    console.error('GET /api/admin/user-achievements error:', error);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }

  const rows: UA[] = ((data ?? []) as RawUA[]).map(normalize);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const body = (await req.json().catch(() => null)) as {
    user_id?: string;
    achievement_id?: number;
    achieved_at?: string | null; // ISO string, optional
    overwrite?: boolean; // if true and row exists, flip to manual/update date
  } | null;

  if (!body?.user_id || !body?.achievement_id) {
    return NextResponse.json({ error: 'user_id and achievement_id are required' }, { status: 400 });
  }

  const supa = getAdminClient();
  const achievedAt = body.achieved_at ?? new Date().toISOString();

  // Check existing (idempotency / optional overwrite)
  const { data: existing, error: existErr } = await supa
    .from('user_achievements')
    .select('id, awarded_via')
    .eq('user_id', body.user_id)
    .eq('achievement_id', body.achievement_id)
    .maybeSingle();

  if (existErr) {
    console.error('POST /api/admin/user-achievements lookup error:', existErr);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }

  if (existing) {
    if (body.overwrite) {
      const { error: updErr } = await supa
        .from('user_achievements')
        .update({ achieved_at: achievedAt, awarded_via: 'manual' })
        .eq('id', existing.id);
      if (updErr) {
        console.error('POST /api/admin/user-achievements update error:', updErr);
        return NextResponse.json({ error: 'Failed to update existing award' }, { status: 500 });
      }
    }

    const { data: row, error: loadErr } = await supa
      .from('user_achievements')
      .select(`
        id, user_id, achievement_id, achieved_at, awarded_via,
        achievements ( id, code, title, icon_url ),
        profiles ( id, first_name, last_name )
      `)
      .eq('user_id', body.user_id)
      .eq('achievement_id', body.achievement_id)
      .single();

    if (loadErr || !row) {
      console.error('POST /api/admin/user-achievements reload error:', loadErr);
      return NextResponse.json({ error: 'Failed to reload award' }, { status: 500 });
    }

    const normalized = normalize(row as unknown as RawUA);
    return NextResponse.json(normalized, { status: 200 });
  }

  // Insert manual award
  const { data: inserted, error: insErr } = await supa
    .from('user_achievements')
    .insert({
      user_id: body.user_id,
      achievement_id: body.achievement_id,
      achieved_at: achievedAt,
      awarded_via: 'manual',
    })
    .select(`
      id, user_id, achievement_id, achieved_at, awarded_via,
      achievements ( id, code, title, icon_url ),
      profiles ( id, first_name, last_name )
    `)
    .single();

  if (insErr || !inserted) {
    console.error('POST /api/admin/user-achievements insert error:', insErr);

    // If it was a unique violation race, fetch the row and return it.
    const { data: row } = await supa
      .from('user_achievements')
      .select(`
        id, user_id, achievement_id, achieved_at, awarded_via,
        achievements ( id, code, title, icon_url ),
        profiles ( id, first_name, last_name )
      `)
      .eq('user_id', body.user_id)
      .eq('achievement_id', body.achievement_id)
      .maybeSingle();

    if (row) {
      const normalized = normalize(row as unknown as RawUA);
      return NextResponse.json(normalized, { status: 200 });
    }

    return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
  }

  const normalized = normalize(inserted as unknown as RawUA);
  return NextResponse.json(normalized, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id') || '');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const supa = getAdminClient();

  // Only allow deleting manual awards from here (automation + reconcile stay auditable)
  const { data: row, error: loadErr } = await supa
    .from('user_achievements')
    .select('awarded_via')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) {
    console.error('DELETE /api/admin/user-achievements load error:', loadErr);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.awarded_via !== 'manual') {
    return NextResponse.json({ error: 'Only manual awards can be revoked here' }, { status: 409 });
  }

  const { error } = await supa.from('user_achievements').delete().eq('id', id);
  if (error) {
    console.error('DELETE /api/admin/user-achievements delete error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
