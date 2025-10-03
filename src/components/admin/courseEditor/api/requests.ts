import type { ContentBlock, ContentNode, NodeChild, NodeEdgeRule, NodeSubtree } from '@/types/course';

async function parseJson<T>(res: Response, fallback: string): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const message = (json as { error?: string }).error ?? fallback;
    throw new Error(message);
  }
  return json;
}

export async function fetchCourseTrees(rootType: string = 'course') {
  const res = await fetch(`/api/admin/course-builder/nodes?rootType=${encodeURIComponent(rootType)}`);
  const data = await parseJson<{ subtrees: NodeSubtree[] }>(res, 'Failed to load course tree');
  return data.subtrees ?? [];
}

export async function fetchEdgeRules() {
  const res = await fetch('/api/admin/course-builder/rules');
  const data = await parseJson<{ rules: NodeEdgeRule[] }>(res, 'Failed to load edge rules');
  return data.rules ?? [];
}

export async function searchNodes(query: string, excludeParent?: number | null) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('search', query.trim());
  if (excludeParent != null) params.set('excludeParent', String(excludeParent));
  const res = await fetch(`/api/admin/course-builder/nodes?${params.toString()}`);
  const data = await parseJson<{ subtrees: NodeSubtree[] }>(res, 'Failed to search nodes');
  return (data.subtrees ?? []).map((subtree) => subtree.node);
}

export async function createNode(payload: {
  node: Pick<ContentNode, 'node_type' | 'title'> & Partial<ContentNode>;
  parent?: { parent_id: number } | null;
}) {
  const res = await fetch('/api/admin/course-builder/nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node: payload.node, parent: payload.parent ?? null }),
  });
  const data = await parseJson<{ subtree: NodeSubtree }>(res, 'Failed to create node');
  return data.subtree;
}

export async function updateNode(nodeId: number, updates: Partial<ContentNode>) {
  const res = await fetch(`/api/admin/course-builder/nodes/${nodeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  const data = await parseJson<{ subtree: NodeSubtree }>(res, 'Failed to update node');
  return data.subtree;
}

export async function deleteNode(nodeId: number) {
  const res = await fetch(`/api/admin/course-builder/nodes/${nodeId}`, { method: 'DELETE' });
  const data = await parseJson<{ subtree?: NodeSubtree }>(res, 'Failed to delete node');
  return data.subtree ?? null;
}

export async function duplicateNode(nodeId: number, parent: number | null) {
  const res = await fetch(`/api/admin/course-builder/nodes/${nodeId}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent_id: parent }),
  });
  const data = await parseJson<{ subtree: NodeSubtree }>(res, 'Failed to duplicate node');
  return data.subtree;
}

export async function attachChild(parentId: number, childId: number) {
  const res = await fetch(`/api/admin/course-builder/nodes/${parentId}/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ child_id: childId }),
  });
  const data = await parseJson<{ subtree: NodeSubtree }>(res, 'Failed to attach child');
  return data.subtree;
}

export async function updateChild(parentId: number, childId: number, updates: Partial<NodeChild>) {
  const res = await fetch(`/api/admin/course-builder/nodes/${parentId}/children/${childId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  const data = await parseJson<{ subtree: NodeSubtree }>(res, 'Failed to update child');
  return data.subtree;
}

export async function detachChild(parentId: number, childId: number) {
  const res = await fetch(`/api/admin/course-builder/nodes/${parentId}/children/${childId}`, {
    method: 'DELETE',
  });
  const data = await parseJson<{ subtree: NodeSubtree }>(res, 'Failed to detach child');
  return data.subtree;
}

export async function reorderChildren(parentId: number, updates: Array<{ child_id: number; position: number }>) {
  const res = await fetch(`/api/admin/course-builder/nodes/${parentId}/children/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  const data = await parseJson<{ subtree: NodeSubtree }>(res, 'Failed to reorder children');
  return data.subtree;
}

export async function createBlock(nodeId: number, block: Partial<ContentBlock> & { block_type: ContentBlock['block_type']; position: number }) {
  const res = await fetch(`/api/admin/course-builder/nodes/${nodeId}/blocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ block }),
  });
  const data = await parseJson<{ subtree: NodeSubtree }>(res, 'Failed to create block');
  return data.subtree;
}

export async function updateBlock(blockId: number, updates: Partial<ContentBlock>) {
  const res = await fetch(`/api/admin/course-builder/blocks/${blockId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  const data = await parseJson<{ subtree: NodeSubtree }>(res, 'Failed to update block');
  return data.subtree;
}

export async function deleteBlock(blockId: number) {
  const res = await fetch(`/api/admin/course-builder/blocks/${blockId}`, { method: 'DELETE' });
  const data = await parseJson<{ subtree: NodeSubtree }>(res, 'Failed to delete block');
  return data.subtree;
}

export async function reorderBlocks(nodeId: number, updates: Array<{ block_id: number; position: number }>) {
  const res = await fetch(`/api/admin/course-builder/nodes/${nodeId}/blocks/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  const data = await parseJson<{ subtree: NodeSubtree }>(res, 'Failed to reorder blocks');
  return data.subtree;
}
