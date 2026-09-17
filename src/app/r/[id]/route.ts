import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

type ResourceRow = {
  id: number;
  title: string | null;
  url: string | null;
  state: 'draft' | 'published' | 'archived';
  storage_bucket: string | null;
  storage_path: string | null;
};

function redirectResource(target: string) {
  const response = NextResponse.redirect(target, { status: 302 });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function GET(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.res;
  // Extract /r/[id] from the path without using the typed context arg
  const { pathname } = new URL(req.url);
  const match = pathname.match(/\/r\/([^/]+)\/?$/);
  const id = match?.[1];

  const numericId = Number(id);
  if (!id || !Number.isSafeInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const supa = getAdminClient();
  const staff = guard.roleCodes.some((code) => ['admin', 'superadmin', 'coach'].includes(code));
  if (!staff) {
    const access = await supa.rpc('can_access_discovery_resource', {
      _user_id: guard.user.id,
      _resource_id: numericId,
    });
    if (access.error) {
      return NextResponse.json({ error: 'Resource access is temporarily unavailable' }, { status: 503 });
    }
    if (access.data !== true) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  let query = supa
    .from('resources')
    .select('id, title, url, state, storage_bucket, storage_path')
    .eq('id', numericId);

  if (!staff) query = query.eq('state', 'published');

  const { data: r, error } = await query.single<ResourceRow>();
  if (error || !r) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // A reviewed direct result still passes access checks on every open.
  if (!r.storage_bucket || !r.storage_path) {
    try {
      const target = new URL(r.url ?? '', req.url);
      if (!r.url || !['http:', 'https:'].includes(target.protocol) || target.href === req.url) {
        return NextResponse.json({ error: 'Link unavailable' }, { status: 500 });
      }
      return redirectResource(target.toString());
    } catch {
      return NextResponse.json({ error: 'Link unavailable' }, { status: 500 });
    }
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

  return redirectResource(signed.signedUrl);
}
