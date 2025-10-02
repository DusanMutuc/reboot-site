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

type Params = {
  params: Promise<{ courseId?: string | string[] | undefined }>;
};

type RawChildRowChild = {
  id: number | string;
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
};

type RawChildRow = {
  parent_id: number | string | null;
  child_id: number | string | null;
  position: number | string | null;
  is_required: boolean | string | null;
  label: string | null;
  notes: string | null;
  child: RawChildRowChild | RawChildRowChild[] | null | undefined;
};

function normalizeChildRow(row: RawChildRow): NodeChildRow {
  const normalizedChild = Array.isArray(row.child) ? row.child[0] ?? null : row.child ?? null;

  return {
    parent_id: Number(row.parent_id ?? 0),
    child_id: Number(row.child_id ?? 0),
    position: Number(row.position ?? 0),
    is_required: row.is_required === null ? false : row.is_required === true || row.is_required === 'true',
    label: row.label ?? null,
    notes: row.notes ?? null,
    child: normalizedChild
      ? {
          id: Number(normalizedChild.id ?? 0),
          node_type: normalizedChild.node_type,
          title: normalizedChild.title,
          slug: normalizedChild.slug ?? null,
          state: normalizedChild.state,
          owner_id: normalizedChild.owner_id ?? null,
          description: normalizedChild.description ?? null,
          metadata: normalizedChild.metadata ?? null,
          hero_image: normalizedChild.hero_image ?? null,
          icon: normalizedChild.icon ?? null,
          objectives: normalizedChild.objectives ?? null,
        }
      : null,
  } satisfies NodeChildRow;
}

async function resolveCourseIdentifier(context: Params) {
  const rawParams = await context.params;
  const value = Array.isArray(rawParams?.courseId) ? rawParams?.courseId[0] : rawParams?.courseId;
  return typeof value === 'string' ? value : null;
}

export async function GET(request: NextRequest, context: Params) {
  const courseId = await resolveCourseIdentifier(context);
  console.log('🎓 course detail GET:', courseId);

  try {
    const supa = await getServerAnonClient();

    if (!courseId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const isNumeric = /^\d+$/.test(courseId);

    let query = supa
      .from('content_nodes')
      .select('id, node_type, title, slug, description, owner_id, metadata, hero_image, icon, objectives, state, created_at, updated_at')
      .eq('node_type', 'course')
      .eq('state', 'published');

    if (isNumeric) {
      query = query.eq('id', Number.parseInt(courseId, 10));
    } else {
      query = query.eq('slug', courseId);
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

    const childRowsTyped = (childRows ?? []).map(normalizeChildRow);
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
        for (const rawRow of nestedRows ?? []) {
          const row = normalizeChildRow(rawRow);

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
