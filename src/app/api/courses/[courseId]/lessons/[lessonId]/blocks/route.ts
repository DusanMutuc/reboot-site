import { NextRequest, NextResponse } from 'next/server';
import { getServerAnonClient } from '@/lib/supabaseServer';

function parseId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null;
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string; lessonId: string } }
) {
  console.log('🎓 lesson blocks GET:', params.courseId, params.lessonId);

  try {
    const courseId = parseId(params.courseId);
    const lessonId = parseId(params.lessonId);
    if (!courseId || !lessonId) {
      return NextResponse.json({ error: 'Invalid courseId or lessonId' }, { status: 400 });
    }

    const supa = await getServerAnonClient();

    const { data: course, error: courseErr } = await supa
      .from('content_nodes')
      .select('id')
      .eq('id', courseId)
      .eq('node_type', 'course')
      .eq('state', 'published')
      .maybeSingle();

    if (courseErr) {
      console.error('❌ lesson blocks course lookup error:', courseErr);
      return NextResponse.json({ error: courseErr.message }, { status: 400 });
    }

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const { data: link, error: linkErr } = await supa
      .from('node_children')
      .select('child_id')
      .eq('parent_id', courseId)
      .eq('child_id', lessonId)
      .maybeSingle();

    if (linkErr) {
      console.error('❌ lesson blocks link lookup error:', linkErr);
      return NextResponse.json({ error: linkErr.message }, { status: 400 });
    }

    if (!link) {
      return NextResponse.json({ error: 'Lesson not found in course' }, { status: 404 });
    }

    const { data: lesson, error: lessonErr } = await supa
      .from('content_nodes')
      .select('id, node_type, title, slug, state, description, metadata, hero_image, icon, objectives')
      .eq('id', lessonId)
      .maybeSingle();

    if (lessonErr) {
      console.error('❌ lesson blocks lesson lookup error:', lessonErr);
      return NextResponse.json({ error: lessonErr.message }, { status: 400 });
    }

    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const { data: blocks, error: blockErr } = await supa
      .from('content_blocks')
      .select('*')
      .eq('node_id', lessonId)
      .order('position');

    if (blockErr) {
      console.error('❌ lesson blocks fetch error:', blockErr);
      return NextResponse.json({ error: blockErr.message }, { status: 400 });
    }

    return NextResponse.json({ lesson, blocks: blocks ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('💥 lesson blocks GET unexpected error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
