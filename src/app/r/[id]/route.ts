import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/courseBuilder';
import { canUserAccessNodeViaCourse } from '@/lib/courseAccess';
import { getNinetyDayAccessibleNodeIds } from '@/lib/ninetyDayProgramme';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { fetchUserRoleCodes, hasRoleCode, isNinetyDayUserRole } from '@/lib/userRoles';

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

async function canAccessNinetyDayResource(userId: string, resourceId: number): Promise<boolean> {
  const roleCodes = await fetchUserRoleCodes(adminClient, userId);
  if (!isNinetyDayUserRole(roleCodes) || hasRoleCode(roleCodes, 'user')) return true;

  const { data: blockRows, error } = await adminClient
    .from('content_blocks')
    .select('node_id')
    .eq('resource_id', resourceId);
  if (error || !blockRows?.length) return false;

  const libraryIds = await getNinetyDayAccessibleNodeIds(userId);
  const nodeIds = Array.from(new Set(blockRows.map((row) => Number(row.node_id))));
  if (nodeIds.some((nodeId) => libraryIds.has(nodeId))) return true;

  const courseAccess = await Promise.all(
    nodeIds.map((nodeId) => canUserAccessNodeViaCourse(userId, nodeId)),
  );
  return courseAccess.some(Boolean);
}

export async function GET(req: Request) {
  // Extract /r/[id] from the path without using the typed context arg
  const { pathname } = new URL(req.url);
  const match = pathname.match(/\/r\/([^/]+)\/?$/);
  const id = match?.[1];

  const numericId = Number(id);
  if (!id || !Number.isFinite(numericId)) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const supa = getSupabaseServer();
  const userId = await getUserId();
  if (!userId || !await canAccessNinetyDayResource(userId, numericId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const staff = await isStaff(userId);

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
