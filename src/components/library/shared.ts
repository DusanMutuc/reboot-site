'use client';

import { supabase } from '@/lib/supabaseClient';
import type { ContentBlock } from '@/types/course';
import type { RenderableResource } from '@/components/course/BlockRenderer';

const HERO_BUCKET = 'course-heroes';

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
  children?: LibrarySidebarItem[];
};

export type LibraryDetailNode = {
  id: number;
  slug: string | null;
  title: string | null;
  description?: string | null;
};

type DbNode = {
  id: number;
  slug: string | null;
  title: string | null;
  description: string | null;
  node_type: string | null;
  hero_image: string | null;
  state: 'published' | 'draft' | string | null;
};

export function resolveLibraryHeroSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const { data } = supabase.storage.from(HERO_BUCKET).getPublicUrl(trimmed.replace(/^\/+/, ''));
  return data?.publicUrl ?? null;
}

export async function resolveLibraryRootId(): Promise<number> {
  let rootId: number | null = null;

  const { data: siteSetting } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'library_root_id')
    .maybeSingle();

  if (siteSetting?.value && !Number.isNaN(Number(siteSetting.value))) {
    rootId = Number(siteSetting.value);
  }

  if (!rootId) {
    const { data: librarySlug } = await supabase
      .from('content_nodes')
      .select('id')
      .eq('slug', 'library')
      .maybeSingle();

    if (librarySlug?.id) {
      rootId = librarySlug.id;
    }
  }

  if (!rootId) {
    const { data: latestCollection } = await supabase
      .from('content_nodes')
      .select('id')
      .eq('node_type', 'collection')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestCollection?.id) {
      rootId = latestCollection.id;
    }
  }

  if (!rootId) {
    throw new Error('No Library collection found. Create one or set site_settings.library_root_id.');
  }

  return rootId;
}

export async function fetchLibraryChildren(rootId: number): Promise<LibraryChildRow[]> {
  const { data: links, error: linksError } = await supabase
    .from('node_children')
    .select('child_id, position')
    .eq('parent_id', rootId)
    .order('position', { ascending: true });

  if (linksError) {
    throw linksError;
  }

  const childIds = (links ?? []).map((link) => link.child_id);
  if (childIds.length === 0) {
    return [];
  }

  const { data: nodes, error: nodesError } = await supabase
    .from('content_nodes')
    .select('id, title, description, slug, node_type, hero_image')
    .in('id', childIds);

  if (nodesError) {
    throw nodesError;
  }

  const nodeMap = new Map<number, LibraryNodeRow>();
  (nodes ?? []).forEach((node) => {
    nodeMap.set(node.id as number, {
      id: node.id as number,
      title: node.title ?? null,
      description: node.description ?? null,
      slug: node.slug ?? null,
      node_type: node.node_type ?? 'page',
      hero_image: node.hero_image ?? null,
    });
  });

  return (links ?? [])
    .map((link) => {
      const child = nodeMap.get(link.child_id);
      if (!child) return null;

      return {
        child_id: link.child_id,
        position: link.position,
        child,
      };
    })
    .filter((row): row is LibraryChildRow => row !== null);
}

export async function fetchLibrarySidebarItems(rootId: number): Promise<LibrarySidebarItem[]> {
  const { data: lessonLinks } = await supabase
    .from('node_children')
    .select('child_id, position')
    .eq('parent_id', rootId)
    .order('position', { ascending: true });

  const lessonIds = (lessonLinks ?? []).map((link) => link.child_id);
  if (lessonIds.length === 0) {
    return [];
  }

  const { data: lessonRowsRaw } = await supabase
    .from('content_nodes')
    .select('id, slug, title, description, node_type, hero_image, state')
    .in('id', lessonIds);

  const lessonsMap = new Map<number, LibrarySidebarItem>();
  ((lessonRowsRaw ?? []) as DbNode[]).forEach((node) => {
    lessonsMap.set(node.id, {
      id: node.id,
      slug: node.slug ?? '',
      title: node.title ?? null,
      description: node.description ?? null,
      node_type: node.node_type ?? 'lesson',
      hero_image: resolveLibraryHeroSrc(node.hero_image) ?? undefined,
      state: node.state ?? null,
      children: [],
    });
  });

  const { data: chapterLinks } = await supabase
    .from('node_children')
    .select('parent_id, child_id, position')
    .in('parent_id', lessonIds)
    .order('position', { ascending: true });

  const chapterIds = (chapterLinks ?? []).map((link) => link.child_id);

  let chapterRows: DbNode[] = [];
  if (chapterIds.length > 0) {
    const { data: chapterRowsRaw } = await supabase
      .from('content_nodes')
      .select('id, slug, title, description, node_type, hero_image, state')
      .in('id', chapterIds);

    chapterRows = (chapterRowsRaw ?? []) as DbNode[];
  }

  const chaptersMap = new Map<number, LibrarySidebarItem>();
  chapterRows.forEach((node) => {
    chaptersMap.set(node.id, {
      id: node.id,
      slug: node.slug ?? '',
      title: node.title ?? null,
      description: node.description ?? null,
      node_type: node.node_type ?? 'chapter',
      hero_image: resolveLibraryHeroSrc(node.hero_image) ?? undefined,
      state: node.state ?? null,
    });
  });

  const lessonChildren = new Map<number, LibrarySidebarItem[]>();
  (chapterLinks ?? []).forEach((link) => {
    const children = lessonChildren.get(link.parent_id) ?? [];
    const chapter = chaptersMap.get(link.child_id);
    if (chapter) {
      children.push(chapter);
    }
    lessonChildren.set(link.parent_id, children);
  });

  return (lessonLinks ?? [])
    .map((link) => {
      const lesson = lessonsMap.get(link.child_id);
      if (!lesson) return null;
      lesson.children = lessonChildren.get(lesson.id) ?? [];
      return lesson;
    })
    .filter((row): row is LibrarySidebarItem => row !== null);
}

export async function resolveLibrarySlugFromNodeId(id: number): Promise<string | null> {
  const { data } = await supabase
    .from('content_nodes')
    .select('slug')
    .eq('id', id)
    .maybeSingle();

  return data?.slug ?? null;
}

export async function fetchLibraryDetailData(
  slug: string,
): Promise<{
  node: LibraryDetailNode;
  blocks: ContentBlock[];
  resources: Record<number, RenderableResource>;
}> {
  const { data: nodeRow, error: nodeError } = await supabase
    .from('content_nodes')
    .select('id,slug,title,description')
    .eq('slug', slug)
    .maybeSingle();

  if (nodeError) {
    throw nodeError;
  }

  if (!nodeRow) {
    throw new Error('Not found');
  }

  const nodeId = nodeRow.id as number;
  const { data: blockRows, error: blocksError } = await supabase
    .from('content_blocks')
    .select(
      'id, node_id, position, block_type, text_md, resource_id, smart_doc_id, start_ms, end_ms, label, settings',
    )
    .eq('node_id', nodeId)
    .order('position', { ascending: true });

  if (blocksError) {
    throw blocksError;
  }

  const resourceIds = Array.from(
    new Set((blockRows ?? []).map((block) => block.resource_id).filter(Boolean) as number[]),
  );

  let resources: Record<number, RenderableResource> = {};
  if (resourceIds.length > 0) {
    const { data: resourceRows, error: resourcesError } = await supabase
      .from('resources')
      .select('id,title,type,url,thumbnail,duration')
      .in('id', resourceIds);

    if (resourcesError) {
      throw resourcesError;
    }

    resources = Object.fromEntries(
      (resourceRows ?? []).map((resource) => [
        resource.id,
        resource as unknown as RenderableResource,
      ]),
    );
  }

  return {
    node: nodeRow as LibraryDetailNode,
    blocks: (blockRows ?? []) as ContentBlock[],
    resources,
  };
}
