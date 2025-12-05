import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';

type ResourceRow = {
  id: number;
  title: string | null;
  url: string | null;
  state: 'draft' | 'published' | 'archived';
  storage_bucket: string | null;
  storage_path: string | null;
};

type RoleWithUsers = { code: string; user_roles: { user_id: string }[] };

async function getUserId(): Promise<string | null> {
  const supa = getSupabaseServer();
  const { data } = await supa.auth.getUser();
  return data?.user?.id ?? null;
}

async function isStaff(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const supa = getSupabaseServer();
  const { data } = await supa
    .from('roles')
    .select('code, user_roles!inner(user_id)')
    .eq('user_roles.user_id', userId);

  const codes = (data ?? ([] as RoleWithUsers[])).map((r) => r.code);
  return codes.some((c) => ['admin', 'superadmin', 'coach'].includes(c));
}

// IMPORTANT: inline type for the context, no alias.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const supa = getSupabaseServer();
  const staff = await isStaff(await getUserId());

  let query = supa
    .from('resources')
    .select('id, title, url, state, storage_bucket, storage_path')
    .eq('id', numericId);

  if (!staff) query = query.eq('state', 'published');

  const { data: r, error } = await query.single<ResourceRow>();
  if (error || !r) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // External → redirect as-is
  if (!r.storage_bucket || !r.storage_path) {
    const target = r.url ?? '/';
    const resolved = target.startsWith('http')
      ? target
      : new URL(target, req.url).toString();
    return NextResponse.redirect(resolved, { status: 302 });
  }

  // Storage-backed → sign & redirect
  const urlObj = new URL(req.url);
  const downloadParam = urlObj.searchParams.get('download'); // "1" or "filename.pdf"
  const download: boolean | string | undefined =
    downloadParam === '1' ? true : downloadParam || undefined;

  const { data: signed, error: signErr } = await supa.storage
    .from(r.storage_bucket)
    .createSignedUrl(r.storage_path, 120, { download });

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Link unavailable' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
