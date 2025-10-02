import { NextRequest, NextResponse } from 'next/server';
import { getServerAnonClient } from '@/lib/supabaseServer';

type NodeChildRow = {
  parent_id: number;
  child_id: number;
  position: number;
  is_required: boolean;
  label: string | null;
  notes: string | null;
  child: {
    id: number;
    node_type: string;
    title: string;
    slug: string | null;
    state: string;
    owner_id: string | null;
    description: string | null;
    metadata: unknown;
    hero_image: string | null;
    icon: string | null;
    objectives: string | null;
  } | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: { identifier: string } }
) {
  const { identifier } = params;
  console.log('🎓 course detail GET:', identifier);

  try {
    const supa = await getServerAnonClient();
    const isNumeric = /^\d+$/.test(identifier);

    let query = supa
      .from('content_nodes')
      .select('id, node_type, title, slug, description, owner_id, metadata, hero_image, icon, objectives, state, created_at, updated_at')
      .eq('node_type', 'course')
      .eq('state', 'published');

    if (isNumeric) {
      query = query.eq('id', Number.parseInt(identifier, 10));
    } else {
      query = query.eq('slug', identifier);
    }

    const { data: course, error } = await query.maybeSingle();

    if (error) {
      console.error('❌ course detail GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!course) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: childRows, error: childErr } = await supa
      .from('node_children')
      .select(
        `parent_id, child_id, position, is_required, label, notes, child:content_nodes(id, node_type, title, slug, state, owner_id, description, metadata, hero_image, icon, objectives)`
      )
      .eq('parent_id', course.id)
      .order('position');

    if (childErr) {
      console.error('❌ course detail children error:', childErr);
      return NextResponse.json({ error: childErr.message }, { status: 400 });
    }

    const childRowsTyped = (childRows ?? []) as NodeChildRow[];
    const visibleChildren = childRowsTyped.filter((row) => row.child);
    const childIds = Array.from(
      new Set(
        visibleChildren
          .map((row) => row.child?.id)
          .filter((id): id is number => typeof id === 'number')
      )
    );

    let nestedMap = new Map<number, NodeChildRow[]>();
    if (childIds.length) {
      const { data: nestedRows, error: nestedErr } = await supa
        .from('node_children')
        .select(
          `parent_id, child_id, position, is_required, label, notes, child:content_nodes(id, node_type, title, slug, state, owner_id, description, metadata, hero_image, icon, objectives)`
        )
        .in('parent_id', childIds)
        .order('position');

      if (nestedErr) {
        console.error('❌ course detail nested children error:', nestedErr);
        return NextResponse.json({ error: nestedErr.message }, { status: 400 });
      }

      if (nestedRows) {
        const grouped = new Map<number, NodeChildRow[]>();
        for (const row of (nestedRows ?? []) as NodeChildRow[]) {
          if (!row.child) continue;
          const parentId = row.parent_id as number;
          if (!grouped.has(parentId)) grouped.set(parentId, []);
          grouped.get(parentId)!.push(row);
        }
        nestedMap = grouped;
      }
    }

    const tree = visibleChildren.map((row) => ({
      ...row,
      children: nestedMap.get(row.child!.id) ?? [],
    }));

    return NextResponse.json({ item: { ...course, children: tree } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('💥 course detail GET unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
