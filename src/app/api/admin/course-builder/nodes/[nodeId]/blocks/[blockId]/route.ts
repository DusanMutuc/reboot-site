import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type Params = {
  params: Promise<{
    nodeId?: string | string[] | undefined;
    blockId?: string | string[] | undefined;
  }>;
};

async function resolveNumericId(context: Params, key: 'nodeId' | 'blockId') {
  const rawParams = await context.params;
  const value = rawParams?.[key];
  const stringValue = Array.isArray(value) ? value[0] : value;
  if (!stringValue) return null;

  const num = Number.parseInt(stringValue, 10);
  return Number.isFinite(num) ? num : null;
}

export async function PATCH(request: NextRequest, context: Params) {
  const nodeId = await resolveNumericId(context, 'nodeId');
  const blockId = await resolveNumericId(context, 'blockId');

  console.log('📦 admin-node-block PATCH:', nodeId, blockId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

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

export async function DELETE(request: NextRequest, context: Params) {
  const nodeId = await resolveNumericId(context, 'nodeId');
  const blockId = await resolveNumericId(context, 'blockId');

  console.log('📦 admin-node-block DELETE:', nodeId, blockId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

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
