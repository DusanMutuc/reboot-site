import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

function toAchievementCode(title: string): string {
  return title
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Helper: load a single achievement with its node ids
async function fetchAchievementWithNodeIds(id: number) {
  const supa = getAdminClient();

  const { data, error } = await supa
    .from('achievements')
    .select(
      `
      id,
      code,
      title,
      description,
      icon_url,
      is_active,
      created_at,
      updated_at,
      achievement_node_map ( node_id )
    `
    )
    .eq('id', id)
    .single();

  if (error || !data) {
    throw error ?? new Error('Achievement not found');
  }

  const library_node_ids = (data.achievement_node_map ?? []).map(
    (row: { node_id: number }) => row.node_id
  );

  const { achievement_node_map, ...rest } = data as any;
  return { ...rest, library_node_ids };
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';

  const supa = getAdminClient();

  let query = supa
    .from('achievements')
    .select(
      `
      id,
      code,
      title,
      description,
      icon_url,
      is_active,
      created_at,
      updated_at,
      achievement_node_map ( node_id )
    `
    )
    .order('created_at', { ascending: false });

  if (q) {
    query = query.or(`title.ilike.%${q}%,code.ilike.%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('GET /api/admin/achievements error:', error);
    return NextResponse.json({ error: 'Failed to fetch achievements' }, { status: 500 });
  }

  const shaped =
    (data ?? []).map((row: any) => {
      const library_node_ids = (row.achievement_node_map ?? []).map(
        (r: { node_id: number }) => r.node_id
      );
      const { achievement_node_map, ...rest } = row;
      return { ...rest, library_node_ids };
    }) ?? [];

  return NextResponse.json(shaped);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    description?: string | null;
    icon_url?: string | null;
    is_active?: boolean;
    library_node_ids?: number[];
  } | null;

  if (!body?.title || !body.title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const supa = getAdminClient();
  const code = toAchievementCode(body.title);

  // Insert the achievement itself
  const { data: inserted, error: insertErr } = await supa
    .from('achievements')
    .insert({
      title: body.title.trim(),
      description: body.description ?? null,
      icon_url: body.icon_url ?? null,
      is_active: body.is_active ?? true,
      code,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('POST /api/admin/achievements insert error:', insertErr);
    return NextResponse.json({ error: 'Failed to create achievement' }, { status: 500 });
  }

  const achievementId = inserted.id as number;

  // Insert mappings into achievement_node_map
  if (Array.isArray(body.library_node_ids) && body.library_node_ids.length > 0) {
    const rows = body.library_node_ids.map((nodeId) => ({
      achievement_id: achievementId,
      node_id: nodeId,
    }));
    const { error: mapErr } = await supa.from('achievement_node_map').insert(rows);
    if (mapErr) {
      console.error('POST /api/admin/achievements mapping error:', mapErr);
      // non-fatal – the achievement still exists
    }
  }

  try {
    const shaped = await fetchAchievementWithNodeIds(achievementId);
    return NextResponse.json(shaped, { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/achievements fetch error:', err);
    return NextResponse.json(
      { error: 'Created, but failed to reload record' },
      { status: 201 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const body = (await request.json().catch(() => null)) as {
    id?: number;
    title?: string;
    description?: string | null;
    icon_url?: string | null;
    is_active?: boolean;
    library_node_ids?: number[];
  } | null;

  if (!body?.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const supa = getAdminClient();

  const update: Record<string, unknown> = {
    description: body.description ?? null,
    icon_url: body.icon_url ?? null,
  };

  if (typeof body.is_active === 'boolean') {
    update.is_active = body.is_active;
  }

  if (body.title && body.title.trim()) {
    update.title = body.title.trim();
    update.code = toAchievementCode(body.title);
  }

  const { error: updErr } = await supa
    .from('achievements')
    .update(update)
    .eq('id', body.id);

  if (updErr) {
    console.error('PATCH /api/admin/achievements update error:', updErr);
    return NextResponse.json({ error: 'Failed to update achievement' }, { status: 500 });
  }

  // Replace node mappings if library_node_ids is provided
  if (Array.isArray(body.library_node_ids)) {
    const achievementId = body.id;

    // Delete old mappings
    const { error: delErr } = await supa
      .from('achievement_node_map')
      .delete()
      .eq('achievement_id', achievementId);
    if (delErr) {
      console.error('PATCH /api/admin/achievements mapping delete error:', delErr);
    }

    // Insert new mappings
    if (body.library_node_ids.length > 0) {
      const rows = body.library_node_ids.map((nodeId) => ({
        achievement_id: achievementId,
        node_id: nodeId,
      }));
      const { error: insErr } = await supa.from('achievement_node_map').insert(rows);
      if (insErr) {
        console.error('PATCH /api/admin/achievements mapping insert error:', insErr);
      }
    }
  }

  try {
    const shaped = await fetchAchievementWithNodeIds(body.id);
    return NextResponse.json(shaped);
  } catch (err) {
    console.error('PATCH /api/admin/achievements fetch error:', err);
    return NextResponse.json(
      { error: 'Updated, but failed to reload record' },
      { status: 200 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id') || '');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const supa = getAdminClient();

  const { error } = await supa.from('achievements').delete().eq('id', id);

  if (error) {
    console.error('DELETE /api/admin/achievements error:', error);
    return NextResponse.json({ error: 'Failed to delete achievement' }, { status: 500 });
  }

  // achievement_node_map rows are deleted via ON DELETE CASCADE
  return NextResponse.json({ success: true });
}
