import { NextRequest, NextResponse } from 'next/server';
import { parseResourceId, resolveResourceRedirectTarget } from '@/lib/resourceRedirect';
import { adminClient } from '@/lib/courseBuilder';
import { requireUser } from '@/lib/requireUser';

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
  // Extract /r/[id] from the path without using the typed context arg
  const { pathname } = new URL(req.url);
  const match = pathname.match(/\/r\/([^/]+)\/?$/);
  const id = match?.[1];

  const numericId = parseResourceId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const guard = await requireUser(req);
  if (!guard.ok) return guard.res;
  const supa = guard.supabase;
  const staff = guard.roleCodes.some((role) => ['admin', 'coach'].includes(role));
  // Staff previews retain their existing RLS permissions. Member downloads and
  // direct DB reads use the exact same publication and membership predicate.
  if (!staff) {
    const access = await adminClient.rpc('can_access_discovery_resource', {
      _user_id: guard.user.id, _resource_id: numericId,
    });
    if (access.error) return NextResponse.json({ error: 'Access check unavailable' }, { status: 503 });
    if (access.data !== true) return NextResponse.json({ error: 'Not found' }, { status: 404 });
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

  // Validate the stored destination without fetching it.
  if (!r.storage_bucket || !r.storage_path) {
    const target = resolveResourceRedirectTarget(r.url, req.url);
    if (!target) {
      return NextResponse.json({ error: 'Link unavailable' }, { status: 500 });
    }
    return redirectResource(target);
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
