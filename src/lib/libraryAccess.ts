import 'server-only';

import type { RenderableResource } from '@/components/course/BlockRenderer';
import { adminClient } from '@/lib/courseBuilder';
import type { ContentBlock } from '@/types/course';
import type {
  LibraryChildRow,
  LibraryDetailNode,
  LibraryDetailResponse,
  LibraryNodeRow,
  LibraryScope,
  LibrarySidebarItem,
} from '@/types/library';

const MAIN_LIBRARY_SLUG = 'library';
const ASSISTANT_LIBRARY_SLUG = 'assistant-library';

type DbNode = {
  id: number;
  slug: string | null;
  title: string | null;
  description: string | null;
  node_type: string | null;
  hero_image: string | null;
  state: 'published' | 'draft' | string | null;
};

type DbNodeChild = {
  parent_id: number;
  child_id: number;
  position: number;
};

export class LibraryAccessError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'LibraryAccessError';
    this.status = status;
  }
}

export function parseLibraryScope(value: string | null | undefined): LibraryScope {
  if (!value || value === 'main') {
    return 'main';
  }

  if (value === 'assistant') {
    return 'assistant';
  }

  throw new LibraryAccessError('Invalid library scope', 400);
}

async function getUserRoleCodes(userId: string): Promise<string[]> {
  const { data, error } = await adminClient
    .from('user_roles')
    .select('roles ( code )')
    .eq('user_id', userId);

  if (error) {
    throw new LibraryAccessError(`Failed to load user roles: ${error.message}`, 500);
  }

  return (data ?? [])
    .flatMap((row) => {
      const roleRows = row.roles;
      return Array.isArray(roleRows) ? roleRows : roleRows ? [roleRows] : [];
    })
    .map((roleRow) => roleRow?.code)
    .filter((code): code is string => typeof code === 'string');
}

async function assertAssistantAccess(userId: string) {
  const codes = await getUserRoleCodes(userId);
  if (!codes.includes('assistant')) {
    throw new LibraryAccessError('Assistant access required', 403);
  }
}

async function resolveMainLibraryRootId(): Promise<number> {
  const { data: librarySlug, error: slugError } = await adminClient
    .from('content_nodes')
    .select('id')
    .eq('slug', MAIN_LIBRARY_SLUG)
    .maybeSingle();

  if (slugError) {
    throw new LibraryAccessError(`Failed to resolve library root: ${slugError.message}`, 500);
  }

  if (librarySlug?.id) {
    return librarySlug.id;
  }

  const { data: latestCollection, error: latestError } = await adminClient
    .from('content_nodes')
    .select('id')
    .eq('node_type', 'collection')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new LibraryAccessError(`Failed to resolve fallback library root: ${latestError.message}`, 500);
  }

  if (!latestCollection?.id) {
    throw new LibraryAccessError('No Library collection found.', 404);
  }

  return latestCollection.id;
}

async function resolveAssistantLibraryRootId(): Promise<number> {
  const { data: assistantSlug, error } = await adminClient
    .from('content_nodes')
    .select('id')
    .eq('slug', ASSISTANT_LIBRARY_SLUG)
    .maybeSingle();

  if (error) {
    throw new LibraryAccessError(`Failed to resolve assistant library root: ${error.message}`, 500);
  }

  if (!assistantSlug?.id) {
    throw new LibraryAccessError('Assistant Library collection not found.', 404);
  }

  return assistantSlug.id;
}

export async function resolveLibraryRootIdsForScope(userId: string, scope: LibraryScope): Promise<number[]> {
  const mainRootId = await resolveMainLibraryRootId();

  if (scope === 'main') {
    return [mainRootId];
  }

  await assertAssistantAccess(userId);
  const assistantRootId = await resolveAssistantLibraryRootId();

  return Array.from(new Set([mainRootId, assistantRootId]));
}

async function fetchRootChildLinks(rootId: number): Promise<DbNodeChild[]> {
  const { data, error } = await adminClient
    .from('node_children')
    .select('parent_id, child_id, position')
    .eq('parent_id', rootId)
    .order('position', { ascending: true });

  if (error) {
    throw new LibraryAccessError(`Failed to load library children: ${error.message}`, 500);
  }

  return (data ?? []) as DbNodeChild[];
}

async function fetchNodesByIds(ids: number[]): Promise<Map<number, DbNode>> {
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await adminClient
    .from('content_nodes')
    .select('id, slug, title, description, node_type, hero_image, state')
    .in('id', ids);

  if (error) {
    throw new LibraryAccessError(`Failed to load library nodes: ${error.message}`, 500);
  }

  return new Map(((data ?? []) as DbNode[]).map((node) => [node.id, node]));
}

function toLibraryNodeRow(node: DbNode): LibraryNodeRow {
  return {
    id: node.id,
    title: node.title ?? null,
    description: node.description ?? null,
    slug: node.slug ?? null,
    node_type: node.node_type ?? 'page',
    hero_image: node.hero_image ?? null,
  };
}

export async function fetchLibraryCollectionItemsForScope(
  userId: string,
  scope: LibraryScope,
): Promise<LibraryChildRow[]> {
  const rootIds = await resolveLibraryRootIdsForScope(userId, scope);
  const seen = new Set<number>();
  const items: LibraryChildRow[] = [];

  for (const rootId of rootIds) {
    const links = await fetchRootChildLinks(rootId);
    const nodes = await fetchNodesByIds(links.map((link) => link.child_id));

    for (const link of links) {
      if (seen.has(link.child_id)) continue;
      const child = nodes.get(link.child_id);
      if (!child) continue;
      seen.add(link.child_id);
      items.push({
        child_id: link.child_id,
        position: link.position,
        child: toLibraryNodeRow(child),
      });
    }
  }

  return items;
}

export async function fetchLibrarySidebarItemsForScope(
  userId: string,
  scope: LibraryScope,
): Promise<LibrarySidebarItem[]> {
  const rootIds = await resolveLibraryRootIdsForScope(userId, scope);
  const orderedLessonIds: number[] = [];
  const seenLessonIds = new Set<number>();

  for (const rootId of rootIds) {
    const links = await fetchRootChildLinks(rootId);
    for (const link of links) {
      if (seenLessonIds.has(link.child_id)) continue;
      seenLessonIds.add(link.child_id);
      orderedLessonIds.push(link.child_id);
    }
  }

  if (orderedLessonIds.length === 0) {
    return [];
  }

  const lessonNodes = await fetchNodesByIds(orderedLessonIds);
  const { data: chapterLinksRaw, error: chapterLinksError } = await adminClient
    .from('node_children')
    .select('parent_id, child_id, position')
    .in('parent_id', orderedLessonIds)
    .order('position', { ascending: true });

  if (chapterLinksError) {
    throw new LibraryAccessError(`Failed to load library chapters: ${chapterLinksError.message}`, 500);
  }

  const chapterLinks = (chapterLinksRaw ?? []) as DbNodeChild[];
  const chapterNodes = await fetchNodesByIds(chapterLinks.map((link) => link.child_id));
  const chapterMap = new Map<number, LibrarySidebarItem>();

  chapterNodes.forEach((node) => {
    chapterMap.set(node.id, {
      id: node.id,
      slug: node.slug ?? '',
      title: node.title ?? null,
      description: node.description ?? null,
      node_type: node.node_type ?? 'chapter',
      hero_image: node.hero_image ?? null,
      state: node.state ?? null,
    });
  });

  const lessonChildren = new Map<number, LibrarySidebarItem[]>();
  chapterLinks.forEach((link) => {
    const chapter = chapterMap.get(link.child_id);
    if (!chapter) return;
    const children = lessonChildren.get(link.parent_id) ?? [];
    children.push(chapter);
    lessonChildren.set(link.parent_id, children);
  });

  return orderedLessonIds
    .map<LibrarySidebarItem | null>((lessonId) => {
      const lesson = lessonNodes.get(lessonId);
      if (!lesson) return null;
      return {
        id: lesson.id,
        slug: lesson.slug ?? '',
        title: lesson.title ?? null,
        description: lesson.description ?? null,
        node_type: lesson.node_type ?? 'lesson',
        hero_image: lesson.hero_image ?? null,
        state: lesson.state ?? null,
        children: lessonChildren.get(lesson.id) ?? [],
      };
    })
    .filter((row): row is LibrarySidebarItem => row !== null);
}

async function isNodeAccessibleFromRoots(nodeId: number, rootIds: number[]): Promise<boolean> {
  const allowedRoots = new Set(rootIds);
  if (allowedRoots.has(nodeId)) {
    return true;
  }

  const visited = new Set<number>([nodeId]);
  let frontier = [nodeId];

  while (frontier.length > 0) {
    const { data, error } = await adminClient
      .from('node_children')
      .select('parent_id, child_id')
      .in('child_id', frontier);

    if (error) {
      throw new LibraryAccessError(`Failed to validate library access: ${error.message}`, 500);
    }

    const nextFrontier: number[] = [];
    for (const row of data ?? []) {
      if (allowedRoots.has(row.parent_id)) {
        return true;
      }

      if (!visited.has(row.parent_id)) {
        visited.add(row.parent_id);
        nextFrontier.push(row.parent_id);
      }
    }

    frontier = nextFrontier;
  }

  return false;
}

async function fetchAccessibleNodeBySlug(
  userId: string,
  scope: LibraryScope,
  slug: string,
): Promise<DbNode> {
  const { data: nodeRows, error: nodeError } = await adminClient
    .from('content_nodes')
    .select('id, slug, title, description, node_type, hero_image, state')
    .eq('slug', slug)
    .order('id', { ascending: true });

  if (nodeError) {
    throw new LibraryAccessError(`Failed to load library detail: ${nodeError.message}`, 500);
  }

  const candidates = (nodeRows ?? []) as DbNode[];
  if (candidates.length === 0) {
    throw new LibraryAccessError('Not found', 404);
  }

  const rootIds = await resolveLibraryRootIdsForScope(userId, scope);
  for (const nodeRow of candidates) {
    const accessible = await isNodeAccessibleFromRoots(nodeRow.id, rootIds);
    if (accessible) {
      return nodeRow;
    }
  }

  throw new LibraryAccessError('Not found', 404);
}

async function fetchAccessibleNodeById(
  userId: string,
  scope: LibraryScope,
  id: number,
): Promise<DbNode> {
  const { data: nodeRow, error: nodeError } = await adminClient
    .from('content_nodes')
    .select('id, slug, title, description, node_type, hero_image, state')
    .eq('id', id)
    .maybeSingle();

  if (nodeError) {
    throw new LibraryAccessError(`Failed to load library detail: ${nodeError.message}`, 500);
  }

  if (!nodeRow) {
    throw new LibraryAccessError('Not found', 404);
  }

  const rootIds = await resolveLibraryRootIdsForScope(userId, scope);
  const accessible = await isNodeAccessibleFromRoots(nodeRow.id, rootIds);
  if (!accessible) {
    throw new LibraryAccessError('Not found', 404);
  }

  return nodeRow as DbNode;
}

export async function resolveAccessibleLibrarySlugFromNodeId(
  userId: string,
  scope: LibraryScope,
  id: number,
): Promise<string | null> {
  const { data, error } = await adminClient
    .from('content_nodes')
    .select('id, slug')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new LibraryAccessError(`Failed to resolve library slug: ${error.message}`, 500);
  }

  if (!data?.id) {
    return null;
  }

  const rootIds = await resolveLibraryRootIdsForScope(userId, scope);
  const accessible = await isNodeAccessibleFromRoots(data.id, rootIds);
  if (!accessible) {
    return null;
  }

  return data.slug ?? null;
}

export async function fetchLibraryDetailDataForScope(
  userId: string,
  scope: LibraryScope,
  identifier: { slug?: string; id?: number },
): Promise<LibraryDetailResponse> {
  const nodeRow =
    identifier.id != null
      ? await fetchAccessibleNodeById(userId, scope, identifier.id)
      : await fetchAccessibleNodeBySlug(userId, scope, identifier.slug ?? '');
  const nodeId = nodeRow.id;

  const { data: blockRows, error: blocksError } = await adminClient
    .from('content_blocks')
    .select(
      'id, node_id, position, block_type, text_md, resource_id, smart_doc_id, start_ms, end_ms, label, settings',
    )
    .eq('node_id', nodeId)
    .order('position', { ascending: true });

  if (blocksError) {
    throw new LibraryAccessError(`Failed to load library blocks: ${blocksError.message}`, 500);
  }

  const resourceIds = Array.from(
    new Set((blockRows ?? []).map((block) => block.resource_id).filter(Boolean) as number[]),
  );

  let resources: Record<number, RenderableResource> = {};
  if (resourceIds.length > 0) {
    const { data: resourceRows, error: resourcesError } = await adminClient
      .from('resources')
      .select('id, title, type, url, thumbnail, duration, state')
      .in('id', resourceIds);

    if (resourcesError) {
      throw new LibraryAccessError(`Failed to load library resources: ${resourcesError.message}`, 500);
    }

    resources = Object.fromEntries(
      (resourceRows ?? []).map((resource) => [resource.id, resource as RenderableResource]),
    );
  }

  const node: LibraryDetailNode = {
    id: nodeRow.id,
    slug: nodeRow.slug ?? null,
    title: nodeRow.title ?? null,
    description: nodeRow.description ?? null,
  };

  return {
    node,
    blocks: (blockRows ?? []) as ContentBlock[],
    resources,
  };
}
