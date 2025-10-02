import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  handleCourseBuilderError,
  validateNodeRelationship,
} from '@/lib/courseBuilder';

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const body = await request.json();
    const { node, parent } = body ?? {};

    if (!node || typeof node !== 'object') {
      throw new CourseBuilderError('Missing node payload', 400);
    }

    if (!node.node_type || typeof node.node_type !== 'string') {
      throw new CourseBuilderError('node.node_type is required', 400);
    }

    if (!node.title || typeof node.title !== 'string') {
      throw new CourseBuilderError('node.title is required', 400);
    }

    const timestamp = new Date().toISOString();

    const insertPayload = {
      state: 'draft',
      ...node,
      created_at: timestamp,
      updated_at: timestamp,
      created_by: guard.user.id,
      updated_by: guard.user.id,
    };

    const { data: createdNode, error: insertError } = await adminClient
      .from('content_nodes')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError) {
      throw new CourseBuilderError('Failed to create node', 500, { details: insertError.message });
    }

    if (parent?.parent_id) {
      await validateNodeRelationship(parent.parent_id, createdNode.node_type);

      let position = parent.position;
      if (position == null) {
        const { data: siblings, error: siblingsError } = await adminClient
          .from('node_children')
          .select('position')
          .eq('parent_id', parent.parent_id)
          .order('position', { ascending: false })
          .limit(1);

        if (siblingsError) {
          throw new CourseBuilderError('Failed to determine child position', 500, {
            details: siblingsError.message,
          });
        }

        position = siblings?.[0]?.position != null ? siblings[0].position + 1 : 0;
      }

      const edgePayload = {
        parent_id: parent.parent_id,
        child_id: createdNode.id,
        position,
        is_required: parent.is_required ?? true,
        label: parent.label ?? null,
        notes: parent.notes ?? null,
      };

      const { error: edgeError } = await adminClient.from('node_children').insert(edgePayload);

      if (edgeError) {
        throw new CourseBuilderError('Failed to attach node to parent', 500, { details: edgeError.message });
      }

      const subtree = await fetchNodeSubtree(parent.parent_id);
      return NextResponse.json({ subtree });
    }

    const subtree = await fetchNodeSubtree(createdNode.id);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
