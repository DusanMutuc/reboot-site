export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { discoveryIds, discoveryNames } from '@/lib/discoveryAdminTypes';

export async function POST(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.res;
  if (!guard.roleCodes.some((code) => ['admin', 'superadmin', 'coach'].includes(code))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const admin = getAdminClient();
  try {
    const form = await req.formData();
    const file = form.get('file');
    const type = String(form.get('type') || 'pdf').trim().toLowerCase();
    const title = String(form.get('title') || '').trim();
    const description = String(form.get('description') || '').trim();
    const state = String(form.get('state') || 'draft');
    const openMode = String(form.get('discovery_open_mode') || 'context');
    const discoverable = String(form.get('is_discoverable') || 'false') === 'true';
    const browsable = String(form.get('is_browsable') || 'false') === 'true';
    if (!(file instanceof File) || !title || title.length > 500) throw new Error('A file and title are required.');
    if (!['draft', 'published', 'archived'].includes(state) || !['context', 'direct'].includes(openMode)) {
      throw new Error('Invalid publication or presentation setting.');
    }
    if (browsable && !discoverable) throw new Error('Homepage browse requires search eligibility.');
    if (!['pdf', 'image'].includes(type)) throw new Error('Unsupported resource type.');
    if (type === 'pdf' ? file.type !== 'application/pdf' : !file.type.startsWith('image/')) {
      throw new Error('The file must match the selected PDF or image type.');
    }
    // Names formerly sent by an old client must fail visibly, never be discarded.
    const tagIds = discoveryIds(JSON.parse(String(form.get('tag_ids') ?? form.get('tags') ?? '[]')));
    const searchNames = discoveryNames(JSON.parse(String(form.get('search_names') ?? '[]')));
    if (tagIds.length) {
      const tags = await admin.from('tags').select('id').in('id', tagIds).eq('is_active', true).eq('tag_kind', 'topic');
      if (tags.error) return NextResponse.json({ error: 'Tag validation is unavailable.' }, { status: 503 });
      if (tags.data.length !== tagIds.length) throw new Error('Choose existing active canonical tags.');
    }

    const extensionCandidate = (file.name.split('.').pop() || 'img').toLowerCase();
    const extension = type === 'pdf' ? 'pdf' : /^[a-z0-9]{1,8}$/.test(extensionCandidate) ? extensionCandidate : 'img';
    const storagePath = `${type}/${randomUUID()}.${extension}`;
    const storageBucket = 'resources';
    const uploaded = await admin.storage.from(storageBucket)
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (uploaded.error) return NextResponse.json({ error: 'File upload failed.' }, { status: 500 });

    const inserted = await admin.rpc('create_tagged_resource_upload', {
      _actor_id: guard.user.id, _title: title, _description: description, _type: type, _state: state,
      _discoverable: discoverable, _browsable: browsable, _open_mode: openMode,
      _bucket: storageBucket, _path: storagePath, _tag_ids: tagIds, _search_names: searchNames,
    });
    if (inserted.error || !inserted.data) {
      // A known database rejection rolls back the resource AND tags. On an
      // ambiguous network failure, retain the file instead of risking a broken
      // committed resource; do not report successful tagging.
      if (inserted.error?.code && /^[0-9][0-9A-Z]{4}$/.test(inserted.error.code)) {
        const cleanup = await admin.storage.from(storageBucket).remove([storagePath]);
        if (cleanup.error) console.error('[resource-upload] orphan cleanup required', { storagePath });
      } else {
        console.error('[resource-upload] upload outcome requires inspection', { storagePath });
      }
      return NextResponse.json({ error: 'Could not confirm the resource and tags were saved. Check the resource library before retrying.' }, { status: 500 });
    }

    const id = inserted.data as number;
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${extension}`;
    return NextResponse.json({ id, openUrl: `/r/${id}`,
      downloadUrl: `/r/${id}?download=${encodeURIComponent(filename)}`, tagIds });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid upload.' }, { status: 400 });
  }
}
