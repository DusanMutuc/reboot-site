import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { CourseBuilderError, adminClient, handleCourseBuilderError } from '@/lib/courseBuilder';

export async function GET(request: NextRequest, { params }: { params: { nodeId: string } }) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const nodeIdNum = Number(params.nodeId);
  if (!Number.isFinite(nodeIdNum)) {
    return NextResponse.json({ error: 'Invalid node id' }, { status: 400 });
  }

  try {
    const { data, error } = await adminClient
      .from('content_blocks')
      .select('id, node_id, block_type, position, text_md, resource_id, smart_doc_id, start_ms, end_ms, label')
      .eq('node_id', nodeIdNum)
      .order('position', { ascending: true });

    if (error) {
      throw new CourseBuilderError('Failed to load content blocks', 500, { details: error.message, nodeId: nodeIdNum });
    }

    return NextResponse.json({ blocks: data ?? [] });
  } catch (err) {
    return handleCourseBuilderError(err);
  }
}
