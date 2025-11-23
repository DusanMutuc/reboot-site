// src/app/api/resources/upload/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { getAdminClient } from '@/lib/supabaseAdmin';

const admin = getAdminClient();

type RoleRow = { code: string };

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error';
}

export async function POST(req: NextRequest) {
  try {
    const userSupabase = getSupabaseServer();
    const form = await req.formData();

    const file = form.get('file') as File | null;
    const title = String(form.get('title') || '').trim();
    const description = String(form.get('description') || '').trim();
    // Parsed but not required for insert yet; keep for future use.
    const tags = JSON.parse(String(form.get('tags') || '[]')) as string[];

    if (!file || !title) {
      return NextResponse.json({ error: 'Missing file or title.' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files allowed.' }, { status: 400 });
    }

    const { data: auth } = await userSupabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: roleRows, error: rolesErr } = await admin
      .from('roles')
      .select('code, user_roles!inner(user_id)')
      .eq('user_roles.user_id', auth.user.id);

    if (rolesErr) {
      return NextResponse.json({ error: rolesErr.message }, { status: 500 });
    }

    const roles = (roleRows ?? []) as RoleRow[];
    const isStaff = roles.some((r) => ['admin', 'superadmin', 'coach'].includes(r.code));
    if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const storageBucket = 'resources';
    const storagePath = `pdf/${randomUUID()}.pdf`;

    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(storageBucket)
      .upload(storagePath, buf, { contentType: 'application/pdf', upsert: false });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: inserted, error: insErr } = await admin
      .from('resources')
      .insert({
        title,
        description,
        type: 'pdf',
        source: 'manual',
        state: 'published',
        created_by: auth.user.id,
        storage_bucket: storageBucket,
        storage_path: storagePath,
      })
      .select('id, title')
      .single();

    if (insErr || !inserted) {
      await admin.storage.from(storageBucket).remove([storagePath]);
      return NextResponse.json({ error: insErr?.message || 'Insert failed' }, { status: 500 });
    }

    const filename = `${(title || 'file').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
    return NextResponse.json({
      id: inserted.id,
      openUrl: `/r/${inserted.id}`,
      downloadUrl: `/r/${inserted.id}?download=${encodeURIComponent(filename)}`,
      // Keep tags around if you later want to persist them; currently unused.
      tags,
    });
  } catch (e: unknown) {
    console.error('Upload route error:', e);
    return NextResponse.json(
      { error: getErrorMessage(e) },
      { status: 500 },
    );
  }
}
