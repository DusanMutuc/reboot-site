import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  handleCourseBuilderError,
} from '@/lib/courseBuilder';

function parseNodeId(value: string | undefined) {
  if (!value) {
    throw new CourseBuilderError('Invalid node id', 400);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new CourseBuilderError('Invalid node id', 400);
  }
  return parsed;
}

export async function POST(
  request: NextRequest,
  context: unknown
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  // ✅ narrow here
  const { params } = context as { params: { nodeId?: string } };

  try {
    const nodeId = parseNodeId(params?.nodeId);
    const body = (await request.json().catch(() => ({}))) as { on?: unknown };

    if (typeof body.on !== 'boolean') {
      throw new CourseBuilderError('Body must include boolean "on"', 400);
    }

    const { error } = await adminClient.rpc('enforce_strict_sequence', {
      _root_id: nodeId,
      _on: body.on,
    });

    if (error) {
      throw new CourseBuilderError('Failed to update sequential unlock', 500, {
        details: error.message,
        nodeId,
        on: body.on,
      });
    }

    const subtree = await fetchNodeSubtree(nodeId);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
