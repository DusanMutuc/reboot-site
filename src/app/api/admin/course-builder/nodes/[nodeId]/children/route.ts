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
  console.log('🧱 admin-node-children GET: start', params.nodeId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const nodeId = parseId(params.nodeId);
  if (!nodeId) {
    return NextResponse.json({ error: 'Invalid nodeId' }, { status: 400 });
  }

  const supa = getAdminClient();
  const { data, error } = await supa
    .from('node_children')
    .select(
      `child_id, position, is_required, label, notes, child:content_nodes(id, node_type, title, slug, state, owner_id, description, metadata, hero_image, icon, objectives)`
    )
    .eq('parent_id', nodeId)
    .order('position');

  if (error) {
    console.error('❌ admin-node-children GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { nodeId: string } }
) {
  console.log('🧱 admin-node-children POST: start', params.nodeId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const nodeId = parseId(params.nodeId);
  if (!nodeId) {
    return NextResponse.json({ error: 'Invalid nodeId' }, { status: 400 });
  }

  try {
    const payload = await request.json();
    const supa = getAdminClient();

    let childId: number | null = null;
    if (payload?.child_id) {
      childId = Number.parseInt(String(payload.child_id), 10);
    }

    if (!childId && payload?.create) {
      const newNodePayload = payload.create as Record<string, unknown>;
      const title = newNodePayload?.title as string | undefined;
      const nodeType = newNodePayload?.node_type as string | undefined;
      if (!title || !nodeType) {
        return NextResponse.json({ error: 'create.title and create.node_type are required' }, { status: 400 });
      }

      const insertData = {
        title,
        node_type: nodeType,
        slug: (newNodePayload?.slug as string | undefined) ?? null,
        description: (newNodePayload?.description as string | undefined) ?? null,
        state: (newNodePayload?.state as string | undefined) ?? 'draft',
        metadata: newNodePayload?.metadata ?? null,
        owner_id: (newNodePayload?.owner_id as string | undefined) ?? null,
        hero_image: (newNodePayload?.hero_image as string | undefined) ?? null,
        icon: (newNodePayload?.icon as string | undefined) ?? null,
        objectives: (newNodePayload?.objectives as string | undefined) ?? null,
        created_by: guard.user.id,
        updated_by: guard.user.id,
      };

      const { data: newNode, error } = await supa
        .from('content_nodes')
        .insert(insertData)
        .select('*')
        .single();

      if (error) {
        console.error('❌ admin-node-children POST create node error:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      childId = newNode.id;
    }

    if (!childId) {
      return NextResponse.json({ error: 'child_id is required' }, { status: 400 });
    }

    if (childId === nodeId) {
      return NextResponse.json({ error: 'A node cannot be its own child' }, { status: 400 });
    }

    const insertChild = {
      parent_id: nodeId,
      child_id: childId,
      position: Number.isFinite(payload?.position) ? payload.position : Number.parseInt(String(payload?.position ?? 0), 10) || 0,
      is_required: payload?.is_required ?? false,
      label: payload?.label ?? null,
      notes: payload?.notes ?? null,
    };

    const { data, error } = await supa
      .from('node_children')
      .insert(insertChild)
      .select(
        `parent_id, child_id, position, is_required, label, notes, child:content_nodes(id, node_type, title, slug, state, owner_id, description, metadata, hero_image, icon, objectives)`
      )
      .single();

    if (error) {
      console.error('❌ admin-node-children POST link error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log('✅ admin-node-children POST: linked child', childId, 'to', nodeId);
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('💥 admin-node-children POST unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { nodeId: string } }
) {
  console.log('🧱 admin-node-children PATCH: start', params.nodeId);

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const nodeId = parseId(params.nodeId);
  if (!nodeId) {
    return NextResponse.json({ error: 'Invalid nodeId' }, { status: 400 });
  }

  try {
    const payload = await request.json();
    if (!Array.isArray(payload) || !payload.length) {
      return NextResponse.json({ error: 'Array of { child_id, position } is required' }, { status: 400 });
    }

    const supa = getAdminClient();
    for (const item of payload) {
      const childId = Number.parseInt(String(item.child_id), 10);
      const position = Number.parseInt(String(item.position), 10);
      if (!Number.isFinite(childId) || childId <= 0) {
        return NextResponse.json({ error: 'Invalid child_id in payload' }, { status: 400 });
      }
      if (!Number.isFinite(position)) {
        return NextResponse.json({ error: 'Invalid position in payload' }, { status: 400 });
      }

      const { error } = await supa
        .from('node_children')
        .update({ position })
        .eq('parent_id', nodeId)
        .eq('child_id', childId);

      if (error) {
        console.error('❌ admin-node-children PATCH error:', error, { childId, position });
        return NextResponse.json({ error: error.message, child_id: childId }, { status: 400 });
      }
    }

    console.log('✅ admin-node-children PATCH: updated ordering for', payload.length, 'items');
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('💥 admin-node-children PATCH unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
