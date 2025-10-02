import { NextRequest, NextResponse } from 'next/server';
import { getServerAnonClient } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  console.log('🎓 courses GET: start');

  try {
    const supa = await getServerAnonClient();
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get('owner_id');
    const tagId = searchParams.get('tag_id');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

    let select = 'id, title, slug, description, owner_id, metadata, hero_image, icon, objectives, state, created_at, updated_at';
    if (tagId) {
      select += ', content_node_tags!inner(tag_id)';
    }

    let query = supa
      .from('content_nodes')
      .select(select)
      .eq('node_type', 'course')
      .eq('state', 'published')
      .order('created_at', { ascending: false });

    if (ownerId) {
      query = query.eq('owner_id', ownerId);
    }

    if (tagId) {
      query = query.eq('content_node_tags.tag_id', tagId);
    }

    if (limit && Number.isFinite(limit)) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) {
      console.error('❌ courses GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log('✅ courses GET: returning', data?.length ?? 0, 'courses');
    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('💥 courses GET unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
