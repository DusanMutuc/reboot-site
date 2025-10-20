import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { CourseBuilderError, adminClient, handleCourseBuilderError } from '@/lib/courseBuilder';

export const revalidate = 0; // let the browser handle conditional caching

export async function GET(request: NextRequest, { params }: { params: { nodeId: string } }) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const nodeIdNum = Number(params.nodeId);
  if (!Number.isFinite(nodeIdNum)) {
    return NextResponse.json({ error: 'Invalid node id' }, { status: 400 });
  }

  try {
    // Load blocks (include updated_at so we can build a stable version/ETag)
    const { data, error } = await adminClient
      .from('content_blocks')
      .select(
        'id, node_id, block_type, position, text_md, resource_id, smart_doc_id, start_ms, end_ms, label, settings, updated_at',
      )
      .eq('node_id', nodeIdNum)
      .order('position', { ascending: true });

    if (error) {
      throw new CourseBuilderError('Failed to load content blocks', 500, { details: error.message, nodeId: nodeIdNum });
    }

    const blocks = data ?? [];
    // Compute a version from count + max(updated_at); covers add/remove/reorder/edits
    const count = blocks.length;
    const maxUpdatedMs = blocks.reduce((max, b) => {
      const t = b?.updated_at ? new Date(b.updated_at as unknown as string).getTime() : 0;
      return t > max ? t : max;
    }, 0);
    const etag = `W/"node-${nodeIdNum}-${count}-${maxUpdatedMs}"`;

    // If client already has this version, return 304 (no body)
    const inm = request.headers.get('if-none-match');
    if (inm && inm === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          // Always revalidate; if unchanged, browser will use its cached JSON
          'Cache-Control': 'public, max-age=0, must-revalidate, stale-while-revalidate=86400',
        },
      });
    }

    // Strip updated_at from the payload we return
    const payload = blocks.map(({ updated_at, ...rest }) => rest);

    return NextResponse.json(
      { blocks: payload },
      {
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=0, must-revalidate, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    return handleCourseBuilderError(err);
  }
}
