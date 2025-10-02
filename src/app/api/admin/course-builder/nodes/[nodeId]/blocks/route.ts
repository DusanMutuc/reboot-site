import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

function parseId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null;
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { nodeId: string } }
) {
  console.log('📦 admin-node-blocks GET: start', params.nodeId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const nodeId = parseId(params.nodeId);
  if (!nodeId) {
    return NextResponse.json({ error: 'Invalid nodeId' }, { status: 400 });
  }

  const supa = getAdminClient();
  const { data, error } = await supa
    .from('content_blocks')
    .select('*')
    .eq('node_id', nodeId)
    .order('position');

  if (error) {
    console.error('❌ admin-node-blocks GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { nodeId: string } }
) {
  console.log('📦 admin-node-blocks POST: start', params.nodeId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const nodeId = parseId(params.nodeId);
  if (!nodeId) {
    return NextResponse.json({ error: 'Invalid nodeId' }, { status: 400 });
  }

  try {
    const payload = await request.json();
    if (!payload?.block_type) {
      return NextResponse.json({ error: 'block_type is required' }, { status: 400 });
    }

    const insertData = {
      node_id: nodeId,
      position: Number.isFinite(payload.position)
        ? payload.position
        : Number.parseInt(String(payload.position ?? 0), 10) || 0,
      block_type: payload.block_type,
      text_md: payload.text_md ?? null,
      resource_id: payload.resource_id ?? null,
      start_ms: payload.start_ms ?? null,
      end_ms: payload.end_ms ?? null,
      image_url: payload.image_url ?? null,
      alt_text: payload.alt_text ?? null,
      embed_url: payload.embed_url ?? null,
      embed_html: payload.embed_html ?? null,
      link_url: payload.link_url ?? null,
      link_label: payload.link_label ?? null,
      label: payload.label ?? null,
      notes: payload.notes ?? null,
      settings: payload.settings ?? null,
    };

    const supa = getAdminClient();
    const { data, error } = await supa
      .from('content_blocks')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      console.error('❌ admin-node-blocks POST error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log('✅ admin-node-blocks POST: created block', data.id);
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('💥 admin-node-blocks POST unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { nodeId: string } }
) {
  console.log('📦 admin-node-blocks PATCH: start', params.nodeId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const nodeId = parseId(params.nodeId);
  if (!nodeId) {
    return NextResponse.json({ error: 'Invalid nodeId' }, { status: 400 });
  }

  try {
    const payload = await request.json();
    if (!Array.isArray(payload) || !payload.length) {
      return NextResponse.json({ error: 'Array of { id, position } is required' }, { status: 400 });
    }

    const supa = getAdminClient();
    for (const item of payload) {
      const blockId = Number.parseInt(String(item.id), 10);
      const position = Number.parseInt(String(item.position), 10);
      if (!Number.isFinite(blockId) || blockId <= 0) {
        return NextResponse.json({ error: 'Invalid id in payload' }, { status: 400 });
      }
      if (!Number.isFinite(position)) {
        return NextResponse.json({ error: 'Invalid position in payload' }, { status: 400 });
      }

      const { error } = await supa
        .from('content_blocks')
        .update({ position })
        .eq('node_id', nodeId)
        .eq('id', blockId);

      if (error) {
        console.error('❌ admin-node-blocks PATCH error:', error, { blockId, position });
        return NextResponse.json({ error: error.message, id: blockId }, { status: 400 });
      }
    }

    console.log('✅ admin-node-blocks PATCH: reordered', payload.length, 'blocks');
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('💥 admin-node-blocks PATCH unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
