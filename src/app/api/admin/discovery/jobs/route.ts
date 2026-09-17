import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import type { DiscoveryBeforeImage, DiscoveryItemRef } from '@/lib/discoveryJobTypes';

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
  if (!expected) console.error('[discovery-jobs]', error);
  return NextResponse.json({ error: expected ? error.message : 'Discovery administration is temporarily unavailable.' },
    { status: error.code === '42501' ? 403 : expected ? 400 : 503 });
}

const QUESTIONS = ['topics', 'placement', 'visibility'] as const;

/** A discovery item is (kind, id). A bare id names two different items and is never accepted. */
function itemRef(value: unknown): DiscoveryItemRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('An item reference is required.');
  const { kind, id } = value as Record<string, unknown>;
  if (kind !== 'resource' && kind !== 'node') throw new Error('An item reference needs kind "resource" or "node".');
  if (!Number.isSafeInteger(id) || (id as number) <= 0) throw new Error('An item reference needs a positive id.');
  return { kind, id: id as number };
}

function itemRefs(value: unknown, max = 100): DiscoveryItemRef[] {
  if (!Array.isArray(value) || !value.length || value.length > max) {
    throw new Error(`Choose between 1 and ${max} items.`);
  }
  const refs = value.map(itemRef);
  const seen = new Set<string>();
  refs.forEach((ref) => {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) throw new Error('The same item was listed twice.');
    seen.add(key);
  });
  return refs;
}

function topicIds(value: unknown, max = 50): number[] {
  if (!Array.isArray(value) || !value.length || value.length > max
    || value.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error(`Choose between 1 and ${max} existing topics.`);
  }
  return [...new Set(value as number[])];
}

function question(value: unknown): (typeof QUESTIONS)[number] {
  if (typeof value !== 'string' || !QUESTIONS.includes(value as never)) throw new Error('Unknown discovery question.');
  return value as (typeof QUESTIONS)[number];
}

export async function GET(request: NextRequest) {
  const guard = await guardAdmin(request);
  if (!guard.ok) return guard.res;
  const admin = getAdminClient();
  const params = request.nextUrl.searchParams;
  const view = params.get('view') ?? 'counts';
  const q = (params.get('q') ?? '').trim().slice(0, 120);

  if (view === 'counts') {
    const result = await admin.rpc('admin_discovery_job_counts', { _actor_id: guard.user.id });
    return result.error ? rpcError(result.error) : reply(result.data);
  }

  if (view === 'queue') {
    const limit = Number(params.get('limit') ?? 400);
    const offset = Number(params.get('offset') ?? 0);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 400
      || !Number.isSafeInteger(offset) || offset < 0) {
      return NextResponse.json({ error: 'Invalid paging' }, { status: 400 });
    }
    let asked: string;
    try { asked = question(params.get('question')); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
    const result = await admin.rpc('admin_discovery_queue', {
      _actor_id: guard.user.id, _question: asked, _q: q,
      _media_type: params.get('format') || null, _limit: limit, _offset: offset,
    });
    return result.error ? rpcError(result.error) : reply(result.data);
  }

  // The standalone-use inbox, grouped by the guide that holds the resources.
  if (view === 'placement-groups') {
    const result = await admin.rpc('admin_discovery_placement_groups', { _actor_id: guard.user.id });
    return result.error ? rpcError(result.error) : reply(result.data);
  }

  // One item's decision state, for the control inside the builder's properties panel.
  if (view === 'item-decision') {
    const id = Number(params.get('id'));
    const kind = params.get('kind');
    if (!Number.isSafeInteger(id) || id <= 0 || (kind !== 'resource' && kind !== 'node')) {
      return NextResponse.json({ error: 'Invalid item reference' }, { status: 400 });
    }
    let asked: string;
    try { asked = question(params.get('question')); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
    const result = await admin.rpc('admin_discovery_item_decision', {
      _actor_id: guard.user.id, _kind: kind, _id: id, _question: asked,
    });
    return result.error ? rpcError(result.error) : reply(result.data);
  }

  if (view === 'placement') {
    const id = Number(params.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid resource id' }, { status: 400 });
    const result = await admin.rpc('admin_discovery_placement_context', { _actor_id: guard.user.id, _resource_id: id });
    return result.error ? rpcError(result.error) : reply(result.data);
  }

  if (view === 'representatives') {
    const result = await admin.rpc('admin_discovery_representatives', { _actor_id: guard.user.id, _q: q, _limit: 40 });
    return result.error ? rpcError(result.error) : reply({ items: result.data ?? [] });
  }

  if (view === 'browse') {
    const result = await admin.rpc('admin_discovery_browse', { _actor_id: guard.user.id, _q: q, _limit: 200 });
    return result.error ? rpcError(result.error) : reply(result.data);
  }

  if (view === 'candidates') {
    const section = params.get('section') === 'blocked' ? 'blocked' : 'ready';
    const sort = params.get('sort') === 'title' ? 'title' : 'newest';
    const result = await admin.rpc('admin_discovery_browse_candidates', {
      _actor_id: guard.user.id, _view: section, _q: q, _limit: 60, _offset: 0, _sort: sort,
    });
    return result.error ? rpcError(result.error) : reply(result.data);
  }

  return NextResponse.json({ error: 'Unknown discovery view' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const guard = await guardAdmin(request);
  if (!guard.ok) return guard.res;
  const admin = getAdminClient();
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request.');

    if (body.operation === 'decide') {
      const ref = itemRef(body.item);
      const asked = question(body.question);
      if (typeof body.answer !== 'string') throw new Error('An answer is required.');
      // Evidence, actor and label all come from the server. Only the answer, the chosen topics
      // and the token the client loaded are accepted from the request.
      const result = await admin.rpc('admin_record_discovery_decision', {
        _actor_id: guard.user.id, _kind: ref.kind, _id: ref.id, _question: asked, _answer: body.answer,
        _tag_ids: body.tagIds == null ? null : topicIds(body.tagIds),
        _token: typeof body.token === 'string' && body.token ? body.token : null,
        _force: body.force === true,
      });
      return result.error ? rpcError(result.error) : reply(result.data);
    }

    if (body.operation === 'bulk_topics') {
      const refs = itemRefs(body.items);
      const tags = topicIds(body.tagIds);
      // Tokens travel with each target so a stale client cannot overwrite someone else's decision.
      const tokens = new Map<string, string | null>();
      if (Array.isArray(body.tokens)) {
        (body.tokens as { kind: string; id: number; token: string | null }[]).forEach((entry) => {
          if (entry && (entry.kind === 'resource' || entry.kind === 'node')) {
            tokens.set(`${entry.kind}:${entry.id}`, entry.token ?? null);
          }
        });
      }
      const result = await admin.rpc('admin_bulk_discovery_topics', {
        _actor_id: guard.user.id,
        _targets: refs.map((ref) => ({ kind: ref.kind, id: ref.id, token: tokens.get(`${ref.kind}:${ref.id}`) ?? null })),
        _tag_ids: tags,
      });
      return result.error ? rpcError(result.error) : reply(result.data);
    }

    if (body.operation === 'undo') {
      if (!Array.isArray(body.entries) || !body.entries.length || body.entries.length > 200) {
        throw new Error('Undo needs between 1 and 200 entries.');
      }
      const entries = (body.entries as DiscoveryBeforeImage[]).map((entry) => {
        const ref = itemRef(entry);
        return {
          kind: ref.kind, id: ref.id, question: question(entry.question),
          answer: entry.answer ?? null,
          tagIds: Array.isArray(entry.tagIds) ? entry.tagIds.filter((id) => Number.isSafeInteger(id) && id > 0) : null,
          token: typeof entry.token === 'string' && entry.token ? entry.token : null,
        };
      });
      const result = await admin.rpc('admin_undo_discovery_decisions', { _actor_id: guard.user.id, _entries: entries });
      return result.error ? rpcError(result.error) : reply(result.data);
    }

    if (body.operation === 'set_browse') {
      const ref = itemRef(body.item);
      if (ref.kind !== 'resource') throw new Error('Guides never enter homepage browse.');
      if (typeof body.approved !== 'boolean') throw new Error('An explicit approved state is required.');
      const result = await admin.rpc('admin_set_discovery_browse', {
        _actor_id: guard.user.id, _resource_id: ref.id, _approved: body.approved,
      });
      return result.error ? rpcError(result.error) : reply(result.data);
    }

    throw new Error('Unknown discovery operation.');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request.' }, { status: 400 });
  }
}
