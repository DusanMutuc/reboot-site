import type { RenderableResource } from '@/components/course/BlockRenderer';
import type { ContentBlock } from '@/types/course';

export type LibraryScope = 'main' | 'assistant' | 'legend';

export type LibraryNodeRow = {
  id: number;
  title: string | null;
  description?: string | null;
  slug?: string | null;
  node_type: string;
  hero_image?: string | null;
};

export type LibraryChildRow = {
  child_id: number;
  position: number;
  source_scope: LibraryScope;
  child: LibraryNodeRow;
};

export type LibrarySidebarItem = {
  id: number;
  slug: string;
  title: string | null;
  description?: string | null;
  hero_image?: string | null;
  node_type: 'lesson' | 'chapter' | string;
  state?: 'published' | 'draft' | string | null;
  source_scope?: LibraryScope;
  children?: LibrarySidebarItem[];
};

export type LibraryDetailNode = {
  id: number;
  slug: string | null;
  title: string | null;
  description?: string | null;
};

export type LibraryDetailResponse = {
  node: LibraryDetailNode;
  blocks: ContentBlock[];
  resources: Record<number, RenderableResource>;
};
