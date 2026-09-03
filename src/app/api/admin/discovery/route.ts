import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { discoveryIds, discoveryNames } from '@/lib/discoveryAdminTypes';

async function guardAdmin(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard;
  if (!guard.roleCodes.some((code) => ['admin', 'superadmin'].includes(code))) {
    return { ok: false as const, res: NextResponse.json({ error: 'Admin privileges required' }, { status: 403 }) };
  }
  return guard;
}

function reply(data: unknown) {
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

function rpcError(error: { code?: string; message: string }) {
  const expected = ['22023', '23503', '23505', '23514', '42501'].includes(error.code ?? '');
  if (!expected) console.error('[discovery-admin]', error);
  return NextResponse.json({ error: expected ? error.message : 'Discovery administration is temporarily unavailable.' },
    { status: error.code === '42501' ? 403 : expected ? 400 : 503 });
}

export async function GET(request: NextRequest) {
  const guard = await guardAdmin(request);
  if (!guard.ok) return guard.res;
  const admin = getAdminClient();
  const params = request.nextUrl.searchParams;
  if (params.get('view') === 'vocabulary') {
    const result = await admin.rpc('admin_discovery_vocabulary', { _actor_id: guard.user.id });
    if (result.error) return rpcError(result.error);
    const dismissed = await admin.from('discovery_duplicate_dismissals').select('signature').eq('user_id', guard.user.id);
    return dismissed.error ? rpcError(dismissed.error) : reply({ tags: result.data, dismissedDuplicates: dismissed.data.map(row => row.signature) });
  }
  const kind = params.get('kind') ?? 'resource';
  if (kind !== 'resource' && kind !== 'guide') return NextResponse.json({ error: 'Invalid item kind' }, { status: 400 });
  if (params.has('id')) {
    const id = Number(params.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 });
    const resource = kind === 'resource';
    const result = await admin.from(resource ? 'resources' : 'content_nodes')
      .select(resource
        ? 'id,title,type,state,is_discoverable,is_browsable,discovery_open_mode,search_names,discovery_reviewed_at,discovery_reviewed_by'
        : 'id,title,node_type,state,is_discoverable,search_names')
      .eq('id', id).maybeSingle();
    if (result.error) return rpcError(result.error);
    if (!result.data) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    const links = await admin.from(resource ? 'resource_tags' : 'content_node_tags').select('tag_id')
      .eq(resource ? 'resource_id' : 'node_id', id);
    if (links.error) return rpcError(links.error);
    // The containing guide is what makes a tool-vs-lesson judgement possible, so it travels
    // with the item rather than forcing the curator to go looking for it.
    const placement = resource
      ? await admin.from('resource_block_locations').select('node_id,node_title,node_type,node_state,block_position')
        .eq('resource_id', id).order('node_id').order('block_position')
      : { data: [], error: null };
    if (placement.error) return rpcError(placement.error);
    const placements = placement.data ?? [];
    // Supabase's dynamic table selection cannot infer the conditional projection.
    const row = result.data as unknown as Record<string, unknown>;
    return reply({ item: { ...row, kind, media_type: row.type ?? row.node_type,
      is_browsable: row.is_browsable ?? false, discovery_open_mode: row.discovery_open_mode ?? 'context',
      tag_ids: (links.data ?? []).map((link) => link.tag_id), embedded: !!placements.length,
      placement_title: placements[0]?.node_title ?? null,
      placement_type: placements[0]?.node_type ?? null,
      placement_count: placements.length, placements } });
  }
  const page = Number(params.get('page') ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
  const result = await admin.rpc('admin_discovery_catalogue', {
    _actor_id: guard.user.id, _kind: kind, _q: (params.get('q') ?? '').trim(),
    _media_type: params.get('type') || null, _filter: params.get('filter') ?? 'all', _limit: 50, _offset: (page - 1) * 50,
  });
  return result.error ? rpcError(result.error) : reply(result.data);
}

function option(value: unknown, choices: string[], fallback: string | null = null): string | null {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !choices.includes(value)) throw new Error('Invalid discovery option.');
  return value;
}

export async function POST(request: NextRequest) {
  const guard = await guardAdmin(request);
  if (!guard.ok) return guard.res;
  const admin = getAdminClient();
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request.');
    let result;
    if (body.operation === 'save_tag') {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120 || typeof body.active !== 'boolean') {
        throw new Error('A tag needs a name and an explicit active state.');
      }
      result = await admin.rpc('admin_save_discovery_tag', {
        _actor_id: guard.user.id, _id: body.id == null ? null : discoveryIds([body.id])[0], _name: body.name.trim(),
        // Only subjects and their synonyms are authored. Browse categories are seeded, and
        // format/audience/legacy were confirmed unnecessary.
        _kind: option(body.kind, ['topic', 'alias'], 'topic'),
        _browse_category: option(body.category, ['marketing', 'systems', 'hiring', 'mindset']),
        _canonical_id: body.canonicalId == null ? null : discoveryIds([body.canonicalId])[0], _active: body.active,
      });
    } else if (body.operation === 'merge_tags') {
      result = await admin.rpc('admin_merge_discovery_tags', { _actor_id: guard.user.id,
        _source_id: discoveryIds([body.sourceId])[0], _target_id: discoveryIds([body.targetId])[0] });
    } else if (body.operation === 'update_items') {
      result = await admin.rpc('admin_update_discovery_items', {
        _actor_id: guard.user.id, _resource_ids: discoveryIds(body.resourceIds ?? []), _node_ids: discoveryIds(body.nodeIds ?? []),
        _tag_ids: body.tagIds == null ? null : discoveryIds(body.tagIds),
        _tag_action: option(body.tagAction, ['add', 'remove', 'replace'], 'add'),
        _visibility: option(body.visibility, ['hidden', 'search_only', 'browse']),
        _open_mode: option(body.openMode, ['context', 'direct']),
        _search_names: body.searchNames == null ? null : discoveryNames(body.searchNames),
        // _review_status was removed with 20260901030000: placement is recorded only through
        // admin_record_discovery_decision, which writes the setting and the decision together.
        // Passing it here made every update_items call fail, including Resource Library tagging.
      });
    } else if (body.operation === 'dismiss_duplicate' || body.operation === 'restore_duplicates') {
      if (body.operation === 'restore_duplicates') {
        result = await admin.from('discovery_duplicate_dismissals').delete().eq('user_id', guard.user.id);
      } else {
        if (typeof body.signature !== 'string' || !body.signature || body.signature.length > 8000) throw new Error('Invalid suggestion.');
        result = await admin.from('discovery_duplicate_dismissals').upsert({ user_id: guard.user.id, signature: body.signature });
      }
    } else throw new Error('Unknown discovery operation.');
    return result.error ? rpcError(result.error) : reply({ ok: true, result: result.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request.' }, { status: 400 });
  }
}
