import { NextResponse } from 'next/server';
import { getAdminClient } from './supabaseAdmin';

export class CourseBuilderError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'CourseBuilderError';
    this.status = status;
    this.details = details;
  }
}

export const adminClient = getAdminClient();

export type ContentNodeRow = {
  id: number;
  node_type: string;
  visibility?: string | null;
  [key: string]: unknown;
};

export type NodeChildRow = {
  parent_id: number;
  child_id: number;
  position: number;
  is_required: boolean | null;
  label: string | null;
  notes: string | null;
};

export type ContentBlockRow = {
  id: number;
  node_id: number;
  block_type: 'text' | 'asset' | 'divider' | 'smart_doc';
  position: number;
  text_md: string | null;
  resource_id: number | null;
  smart_doc_id: number | null;
  start_ms: number | null;
  end_ms: number | null;
  label: string | null;
  notes: string | null;
  settings: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type NodeSubtree = {
  node: ContentNodeRow;
  blocks: ContentBlockRow[];
  children: Array<{
    edge: NodeChildRow;
    subtree: NodeSubtree;
  }>;
};

export async function fetchNodeById(nodeId: number) {
  const { data, error } = await adminClient
    .from('content_nodes')
    .select('id, node_type, title, slug, description, state, sequential_unlock, visibility')
    .eq('id', nodeId)
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError('Failed to load node', 500, { details: error.message, nodeId });
  }
  if (!data) {
    throw new CourseBuilderError('Node not found', 404, { nodeId });
  }

  return data as ContentNodeRow;
}


async function fetchNodeChildren(parentId: number) {
  const { data, error } = await adminClient
    .from('node_children')
    .select('parent_id, child_id, position, is_required, label, notes')
    .eq('parent_id', parentId)
    .order('position', { ascending: true });

  if (error) {
    throw new CourseBuilderError('Failed to load node children', 500, { details: error.message, parentId });
  }

  return (data ?? []) as NodeChildRow[];
}


async function fetchNodeBlocks(nodeId: number) {
  const { data, error } = await adminClient
    .from('content_blocks')
    .select('*')
    .eq('node_id', nodeId)
    .order('position', { ascending: true });

  if (error) {
    throw new CourseBuilderError('Failed to load content blocks', 500, { details: error.message, nodeId });
  }

  return (data ?? []) as ContentBlockRow[];
}

export async function fetchBlockById(blockId: number) {
  const { data, error } = await adminClient
    .from('content_blocks')
    .select('*')
    .eq('id', blockId)
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError('Failed to load content block', 500, { details: error.message, blockId });
  }

  if (!data) {
    throw new CourseBuilderError('Content block not found', 404, { blockId });
  }

  return data as ContentBlockRow;
}
export async function fetchNodeSubtree(
  nodeId: number,
  opts: { includeBlocks?: boolean; allowUnpublished?: boolean } = {},
  visited = new Set<number>()
): Promise<NodeSubtree> {
  const includeBlocks = opts.includeBlocks ?? true;        // Builder default: include blocks
  const allowUnpublished = opts.allowUnpublished ?? true;  // Builder default: show drafts

  if (visited.has(nodeId)) {
    throw new CourseBuilderError('Cycle detected in node hierarchy', 500, { nodeId });
  }
  visited.add(nodeId);

  // 1) Fetch node (minimal columns are fine)
  const node = await fetchNodeById(nodeId);

  // 2) For student view we may hide unpublished; builder keeps them
  if (!allowUnpublished && node.state !== 'published') {
    visited.delete(nodeId);
    return { node, blocks: [], children: [] };
  }

  // 3) Children (always needed for the tree)
  const children = await fetchNodeChildren(nodeId);

  // 4) Recurse with same options
  const childSubtrees = await Promise.all(
    children.map(async (child) => {
      const subtree = await fetchNodeSubtree(child.child_id, opts, visited);
      return { edge: child, subtree };
    })
  );

  visited.delete(nodeId);

  // 5) Include blocks only when requested (builder) — student view passes includeBlocks:false
  const blocks = includeBlocks ? await fetchNodeBlocks(nodeId) : [];

  return { node, blocks, children: childSubtrees };
}



export async function validateNodeRelationship(parentId: number, childNodeType: string) {
  const parent = await fetchNodeById(parentId);

  const { data, error } = await adminClient
    .from('node_edge_rules')
    .select('parent_type, child_kind, child_type')
    .eq('parent_type', parent.node_type)
    .eq('child_kind', 'node')
    .eq('child_type', childNodeType)
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError('Failed to validate node relationship', 500, {
      details: error.message,
      parentId,
      childNodeType,
    });
  }

  if (!data) {
    throw new CourseBuilderError('Invalid parent-child relationship', 400, {
      parentType: parent.node_type,
      attemptedChildType: childNodeType,
    });
  }

  return parent;
}

export function validateBlockPayload(block: Partial<ContentBlockRow>) {
  const blockType = block.block_type;

  if (!blockType) {
    throw new CourseBuilderError('Block type is required', 400);
  }

  if (!['text', 'asset', 'divider', 'smart_doc'].includes(blockType)) {
    throw new CourseBuilderError('Invalid block type', 400, { blockType });
  }

  if (blockType === 'text') {
    if (!block.text_md || block.text_md.trim().length === 0) {
      throw new CourseBuilderError('text blocks require non-empty text_md', 400);
    }

    if (block.resource_id != null) {
      throw new CourseBuilderError('text blocks cannot reference resources', 400);
    }

    if (block.start_ms != null || block.end_ms != null) {
      throw new CourseBuilderError('text blocks cannot include media trim settings', 400);
    }
  }

  if (blockType === 'asset') {
    if (!block.resource_id) {
      throw new CourseBuilderError('asset blocks require resource_id', 400);
    }

    if (block.text_md != null && block.text_md.trim().length > 0) {
      throw new CourseBuilderError('asset blocks cannot include text_md', 400);
    }
  }

  if (blockType === 'divider') {
    const hasContent =
      (block.text_md != null && block.text_md.trim().length > 0) ||
      block.resource_id != null ||
      block.start_ms != null ||
      block.end_ms != null;

    if (hasContent) {
      throw new CourseBuilderError('divider blocks cannot include content fields', 400);
    }
  }

  if (blockType === 'smart_doc') {
    if (!block.smart_doc_id) {
      throw new CourseBuilderError('smart_doc blocks require smart_doc_id', 400);
    }

    const hasContent =
      (block.text_md != null && block.text_md.trim().length > 0) ||
      block.resource_id != null ||
      block.start_ms != null ||
      block.end_ms != null;

    if (hasContent) {
      throw new CourseBuilderError('smart_doc blocks cannot include text or media fields', 400);
    }
  }
}

export function collectSubtreeStats(subtree: NodeSubtree) {
  const nodeCounts = new Map<string, number>();
  const blockCounts = new Map<string, number>();

  const walk = (node: NodeSubtree) => {
    const nodeType = node.node.node_type ?? 'unknown';
    nodeCounts.set(nodeType, (nodeCounts.get(nodeType) ?? 0) + 1);

    for (const block of node.blocks) {
      const blockType = block.block_type ?? 'unknown';
      blockCounts.set(blockType, (blockCounts.get(blockType) ?? 0) + 1);
    }

    for (const child of node.children) {
      walk(child.subtree);
    }
  };

  walk(subtree);

  return {
    nodeCounts: Object.fromEntries(nodeCounts),
    blockCounts: Object.fromEntries(blockCounts),
  };
}

export function flattenSubtreeIds(subtree: NodeSubtree) {
  const ids = new Set<number>();

  const walk = (node: NodeSubtree) => {
    ids.add(node.node.id);
    for (const child of node.children) {
      walk(child.subtree);
    }
  };

  walk(subtree);

  return Array.from(ids);
}

export async function getParentEdge(childId: number) {
  const { data, error } = await adminClient
    .from('node_children')
    .select('*')
    .eq('child_id', childId)
    .maybeSingle();

  if (error) {
    throw new CourseBuilderError('Failed to lookup parent edge', 500, { details: error.message, childId });
  }

  return (data ?? null) as NodeChildRow | null;
}

export function handleCourseBuilderError(error: unknown) {
  if (error instanceof CourseBuilderError) {
    return NextResponse.json(
      {
        error: error.message,
        details: error.details ?? null,
      },
      { status: error.status }
    );
  }

  console.error('Unexpected course builder error:', error);
  const message = error instanceof Error ? error.message : 'Unknown error';

  return NextResponse.json(
    {
      error: 'Server error',
      details: message,
    },
    { status: 500 }
  );
}
