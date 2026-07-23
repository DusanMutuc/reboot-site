import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { normalizeZoomName } from '@/lib/zoomAttendanceMatching';

const ALIAS_COLUMNS =
  'alias_key, alias, user_id, approved_by, created_at, updated_at';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('zoom_attendance_aliases')
    .select(ALIAS_COLUMNS)
    .order('alias', { ascending: true });

  if (error) {
    console.error('GET /api/admin/zoom-attendance-aliases error:', error);
    return NextResponse.json(
      { error: 'Failed to load Zoom attendance aliases' },
      { status: 500 },
    );
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const body = (await request.json().catch(() => null)) as {
    alias?: unknown;
    user_id?: unknown;
  } | null;

  const alias = typeof body?.alias === 'string' ? body.alias.trim() : '';
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  const aliasKey = normalizeZoomName(alias);

  if (!alias || !aliasKey || !userId) {
    return NextResponse.json(
      { error: 'alias and user_id are required' },
      { status: 400 },
    );
  }

  if (alias.length > 500) {
    return NextResponse.json(
      { error: 'Alias must be 500 characters or fewer' },
      { status: 400 },
    );
  }

  const supabase = getAdminClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('POST /api/admin/zoom-attendance-aliases profile lookup error:', profileError);
    return NextResponse.json({ error: 'Failed to validate user' }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('zoom_attendance_aliases')
    .upsert(
      {
        alias_key: aliasKey,
        alias,
        user_id: userId,
        approved_by: guard.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'alias_key' },
    )
    .select(ALIAS_COLUMNS)
    .single();

  if (error) {
    console.error('POST /api/admin/zoom-attendance-aliases error:', error);
    return NextResponse.json(
      { error: 'Failed to save Zoom attendance alias' },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const aliasValue = new URL(request.url).searchParams.get('alias') ?? '';
  const aliasKey = normalizeZoomName(aliasValue);
  if (!aliasKey) {
    return NextResponse.json({ error: 'alias is required' }, { status: 400 });
  }

  const supabase = getAdminClient();
  const { error } = await supabase
    .from('zoom_attendance_aliases')
    .delete()
    .eq('alias_key', aliasKey);

  if (error) {
    console.error('DELETE /api/admin/zoom-attendance-aliases error:', error);
    return NextResponse.json(
      { error: 'Failed to delete Zoom attendance alias' },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
