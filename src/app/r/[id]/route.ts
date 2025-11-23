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

type ContentNodeRef = { id: number; is_public: boolean };
type BindingRowRaw = {
  node_id: number;
  content_nodes: ContentNodeRef | ContentNodeRef[] | null;
};

type BindingRow = {
  node_id: number;
  content_nodes: { id: number; is_public: boolean } | null;
};

type RoleRow = { code: string };
type VisibilityRow = { course_node_id: number };

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

  const codes = ((data ?? []) as RoleRow[]).map((r) => r.code);
  return codes.some((c) => ['admin', 'superadmin', 'coach'].includes(c));
}

async function authorizeViewer(r: ResourceRow): Promise<boolean> {
  const userId = await getUserId();
  const staff = await isStaff(userId);

  if (r.state !== 'published') return staff;

  const supa = getSupabaseServer();
  const { data: bindings } = await supa
    .from('content_blocks')
    .select('node_id, content_nodes!inner(id, is_public)')
    .eq('resource_id', r.id);

  const rowsRaw = (bindings ?? []) as BindingRowRaw[];

  const rows: BindingRow[] = rowsRaw.map((b) => {
    let cn: { id: number; is_public: boolean } | null = null;
    const ref = b.content_nodes;

    if (Array.isArray(ref)) {
      const first = ref[0];
      if (first) cn = { id: Number(first.id), is_public: Boolean(first.is_public) };
    } else if (ref) {
      cn = { id: Number(ref.id), is_public: Boolean(ref.is_public) };
    }

    return {
      node_id: Number(b.node_id),
      content_nodes: cn,
    };
  });

  if (rows.length === 0) return true;

  const hasNonPublic = rows.some((b) => b.content_nodes?.is_public === false);
  if (!hasNonPublic) return true;

  if (staff) return true;
  if (!userId) return false;

  const nodeIds = rows.map((b) => b.node_id);
  const { data: vis } = await supa
    .from('user_course_visibility')
    .select('course_node_id')
    .in('course_node_id', nodeIds)
    .eq('user_id', userId);

  const visRows: VisibilityRow[] = (vis ?? []) as VisibilityRow[];
  return visRows.length > 0;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supa = getSupabaseServer();
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.redirect(new URL('/', req.url));

  const { data: r, error } = await supa
    .from('resources')
    .select('id, title, url, state, storage_bucket, storage_path')
    .eq('id', id)
    .single<ResourceRow>();

  if (error || !r) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const allowed = await authorizeViewer(r);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // External → redirect as-is
  if (!r.storage_bucket || !r.storage_path) {
    const target = r.url ?? '/';
    const resolved = target.startsWith('http') ? target : new URL(target, req.url).toString();
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
