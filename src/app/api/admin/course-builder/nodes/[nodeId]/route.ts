import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type Params = {
  params: Promise<{ nodeId?: string | string[] | undefined }>;
};

async function resolveNodeId(context: Params) {
  const rawParams = await context.params;
  const value = Array.isArray(rawParams?.nodeId) ? rawParams?.nodeId[0] : rawParams?.nodeId;
  if (!value) return null;
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : null;
}

export async function GET(request: NextRequest, context: Params) {
  const nodeId = await resolveNodeId(context);

  console.log('📚 admin-course-node detail GET: start', nodeId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  if (!nodeId) {
    return NextResponse.json({ error: 'Invalid nodeId' }, { status: 400 });
  }

  const supa = getAdminClient();
  const { searchParams } = new URL(request.url);
  const includeChildren = searchParams.get('includeChildren') === 'true';

  const { data: node, error } = await supa
    .from('content_nodes')
    .select('*')
    .eq('id', nodeId)
    .maybeSingle();

  if (error) {
    console.error('❌ admin-course-node detail GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!node) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!includeChildren) {
    return NextResponse.json({ item: node });
  }

  const { data: children, error: childErr } = await supa
    .from('node_children')
    .select(
      `child_id, position, is_required, label, notes, child:content_nodes(id, node_type, title, slug, state, owner_id, description, metadata, hero_image, icon, objectives)`
    )
    .eq('parent_id', nodeId)
    .order('position');

  if (childErr) {
    console.error('❌ admin-course-node children fetch error:', childErr);
    return NextResponse.json({ error: childErr.message }, { status: 400 });
  }

  return NextResponse.json({ item: { ...node, children: children ?? [] } });
}

export async function PATCH(request: NextRequest, context: Params) {
  const nodeId = await resolveNodeId(context);

  console.log('📚 admin-course-node PATCH: start', nodeId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  if (!nodeId) {
    return NextResponse.json({ error: 'Invalid nodeId' }, { status: 400 });
  }

  try {
    const payload = await request.json();
    const updateData: Record<string, unknown> = {};

    for (const key of [
      'title',
      'slug',
      'description',
      'state',
      'metadata',
      'owner_id',
      'hero_image',
      'icon',
      'objectives',
      'node_type',
    ]) {
      if (key in payload) {
        updateData[key] = payload[key];
      }
    }

    if (!Object.keys(updateData).length) {
      return NextResponse.json({ error: 'No fields provided' }, { status: 400 });
    }

    updateData.updated_by = guard.user.id;

    const supa = getAdminClient();
    const { data, error } = await supa
      .from('content_nodes')
      .update(updateData)
      .eq('id', nodeId)
      .select('*')
      .single();

    if (error) {
      console.error('❌ admin-course-node PATCH error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log('✅ admin-course-node PATCH: updated', nodeId);
    return NextResponse.json({ item: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('💥 admin-course-node PATCH unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: Params) {
  const nodeId = await resolveNodeId(context);

  console.log('📚 admin-course-node DELETE: start', nodeId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  if (!nodeId) {
    return NextResponse.json({ error: 'Invalid nodeId' }, { status: 400 });
  }

  const supa = getAdminClient();
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === 'true';

  if (force) {
    const { error } = await supa.from('content_nodes').delete().eq('id', nodeId);
    if (error) {
      console.error('❌ admin-course-node DELETE force error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.log('🗑️ admin-course-node DELETE: permanently removed', nodeId);
    return NextResponse.json({ ok: true });
  }

  const { data, error } = await supa
    .from('content_nodes')
    .update({ state: 'archived', updated_by: guard.user.id })
    .eq('id', nodeId)
    .select('*')
    .single();

  if (error) {
    console.error('❌ admin-course-node DELETE soft error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.log('📦 admin-course-node DELETE: archived', nodeId);
  return NextResponse.json({ item: data });
}
