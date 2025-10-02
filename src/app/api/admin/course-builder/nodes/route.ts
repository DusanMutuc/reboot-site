import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  console.log('📚 admin-course-nodes GET: start');

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const supa = getAdminClient();
  const { searchParams } = new URL(request.url);

  let query = supa
    .from('content_nodes')
    .select('*')
    .order('created_at', { ascending: false });

  const nodeType = searchParams.get('node_type');
  if (nodeType) {
    query = query.eq('node_type', nodeType);
  }

  const state = searchParams.get('state');
  if (state) {
    query = query.eq('state', state);
  }

  const ownerId = searchParams.get('owner_id');
  if (ownerId) {
    query = query.eq('owner_id', ownerId);
  }

  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  if (limit && Number.isFinite(limit)) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error('❌ admin-course-nodes GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.log('✅ admin-course-nodes GET: returning', data?.length ?? 0, 'rows');
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: NextRequest) {
  console.log('📚 admin-course-nodes POST: start');

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  try {
    const payload = await request.json();
    const { title, node_type: nodeType, slug, description, state, metadata, owner_id: ownerId, hero_image: heroImage, icon, objectives } =
      payload ?? {};

    if (!title || !nodeType) {
      return NextResponse.json(
        { error: 'title and node_type are required' },
        { status: 400 }
      );
    }

    const supa = getAdminClient();
    const insertData = {
      title,
      node_type: nodeType,
      slug: slug ?? null,
      description: description ?? null,
      state: state ?? 'draft',
      metadata: metadata ?? null,
      owner_id: ownerId ?? null,
      hero_image: heroImage ?? null,
      icon: icon ?? null,
      objectives: objectives ?? null,
      created_by: guard.user.id,
      updated_by: guard.user.id,
    };

    const { data, error } = await supa
      .from('content_nodes')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      console.error('❌ admin-course-nodes POST error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log('✅ admin-course-nodes POST: created node', data.id);
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('💥 admin-course-nodes POST unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
