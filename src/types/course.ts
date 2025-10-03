export type NodeType = 'course' | 'lesson' | 'chapter' | 'collection' | 'playlist';
export type NodeState = 'draft' | 'published' | 'archived';
export type BlockType = 'text' | 'asset' | 'divider';

export type ContentNode = {
  id: number;
  node_type: NodeType;
  title: string;
  slug: string | null;
  state: NodeState;
  description: string | null;
  hero_image: string | null;
  icon: string | null;
  objectives: string | null;
  metadata: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type NodeChild = {
  parent_id: number;
  child_id: number;
  position: number;
  is_required: boolean | null;
  label: string | null;
  notes: string | null;
};

export type ContentBlock = {
  id: number;
  node_id: number;
  block_type: BlockType;
  position: number;
  text_md: string | null;
  resource_id: number | null;
  start_ms: number | null;
  end_ms: number | null;
  label: string | null;
  notes: string | null;
  settings: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
};

export type NodeSubtree = {
  node: ContentNode;
  blocks: ContentBlock[];
  children: Array<{
    edge: NodeChild;
    subtree: NodeSubtree;
  }>;
};

export type NodeEdgeRule = {
  parent_type: string;
  child_kind: string;
  child_type: string;
};
