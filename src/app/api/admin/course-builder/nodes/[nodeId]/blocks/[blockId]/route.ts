import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

function parseId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null;
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { nodeId: string; blockId: string } }
) {
  console.log('📦 admin-node-block PATCH:', params.nodeId, params.blockId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const nodeId = parseId(params.nodeId);
  const blockId = parseId(params.blockId);

  if (!nodeId || !blockId) {
    return NextResponse.json({ error: 'Invalid nodeId or blockId' }, { status: 400 });
  }

  try {
    const payload = await request.json();
    const updateData: Record<string, unknown> = {};

    for (const key of [
      'position',
      'block_type',
      'text_md',
      'resource_id',
      'start_ms',
      'end_ms',
      'image_url',
      'alt_text',
      'embed_url',
      'embed_html',
      'link_url',
      'link_label',
      'label',
      'notes',
      'settings',
    ]) {
      if (key in payload) {
        updateData[key] = payload[key];
      }
    }

    if (!Object.keys(updateData).length) {
      return NextResponse.json({ error: 'No fields provided' }, { status: 400 });
    }

    const supa = getAdminClient();
    const { data, error } = await supa
      .from('content_blocks')
      .update(updateData)
      .eq('node_id', nodeId)
      .eq('id', blockId)
      .select('*')
      .single();

    if (error) {
      console.error('❌ admin-node-block PATCH error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log('✅ admin-node-block PATCH: updated block');
    return NextResponse.json({ item: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('💥 admin-node-block PATCH unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { nodeId: string; blockId: string } }
) {
  console.log('📦 admin-node-block DELETE:', params.nodeId, params.blockId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const nodeId = parseId(params.nodeId);
  const blockId = parseId(params.blockId);

  if (!nodeId || !blockId) {
    return NextResponse.json({ error: 'Invalid nodeId or blockId' }, { status: 400 });
  }

  const supa = getAdminClient();
  const { error } = await supa
    .from('content_blocks')
    .delete()
    .eq('node_id', nodeId)
    .eq('id', blockId);

  if (error) {
    console.error('❌ admin-node-block DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.log('🗑️ admin-node-block DELETE: removed block');
  return NextResponse.json({ ok: true });
}
