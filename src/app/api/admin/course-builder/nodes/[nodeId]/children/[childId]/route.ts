import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type Params = {
  params: Promise<{
    nodeId?: string | string[] | undefined;
    childId?: string | string[] | undefined;
  }>;
};

async function resolveNumericId(context: Params, key: 'nodeId' | 'childId') {
  const rawParams = await context.params;
  const value = rawParams?.[key];
  const stringValue = Array.isArray(value) ? value[0] : value;
  if (!stringValue) return null;

  const num = Number.parseInt(stringValue, 10);
  return Number.isFinite(num) ? num : null;
}

export async function PATCH(request: NextRequest, context: Params) {
  const nodeId = await resolveNumericId(context, 'nodeId');
  const childId = await resolveNumericId(context, 'childId');

  console.log('🧱 admin-node-child PATCH:', nodeId, childId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  if (!nodeId || !childId) {
    return NextResponse.json({ error: 'Invalid nodeId or childId' }, { status: 400 });
  }

  try {
    const payload = await request.json();
    const updateData: Record<string, unknown> = {};

    for (const key of ['is_required', 'label', 'notes']) {
      if (key in payload) {
        updateData[key] = payload[key];
      }
    }

    if (!Object.keys(updateData).length) {
      return NextResponse.json({ error: 'No fields provided' }, { status: 400 });
    }

    const supa = getAdminClient();
    const { data, error } = await supa
      .from('node_children')
      .update(updateData)
      .eq('parent_id', nodeId)
      .eq('child_id', childId)
      .select(
        `parent_id, child_id, position, is_required, label, notes, child:content_nodes(id, node_type, title, slug, state, owner_id, description, metadata, hero_image, icon, objectives)`
      )
      .single();

    if (error) {
      console.error('❌ admin-node-child PATCH error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log('✅ admin-node-child PATCH: updated link');
    return NextResponse.json({ item: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('💥 admin-node-child PATCH unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: Params) {
  const nodeId = await resolveNumericId(context, 'nodeId');
  const childId = await resolveNumericId(context, 'childId');

  console.log('🧱 admin-node-child DELETE:', nodeId, childId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  if (!nodeId || !childId) {
    return NextResponse.json({ error: 'Invalid nodeId or childId' }, { status: 400 });
  }

  const supa = getAdminClient();
  const { error } = await supa
    .from('node_children')
    .delete()
    .eq('parent_id', nodeId)
    .eq('child_id', childId);

  if (error) {
    console.error('❌ admin-node-child DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.log('🗑️ admin-node-child DELETE: removed link');
  return NextResponse.json({ ok: true });
}
