import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import type {
  FindContentDecision,
  FindContentDetail,
  FindContentPlacement,
  FindContentResult,
} from '@/lib/discoveryRemainingTypes';
import type { DiscoveryItemKind, DiscoveryQuestion } from '@/lib/discoveryJobTypes';

export const dynamic = 'force-dynamic';

type ResourceRow = {
  id: number; title: string; description: string | null; type: string; state: string;
  search_names: string[] | null; is_discoverable: boolean; is_browsable: boolean;
  discovery_open_mode: string;
};
type NodeRow = {
  id: number; title: string; description: string | null; node_type: string; state: string;
  slug: string | null; search_names: string[] | null; is_discoverable: boolean;
};
type PlacementRow = { id: number; resource_id: number; node_id: number; position: number };

async function guardAdmin(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard;
  if (!guard.roleCodes.some((code) => code === 'admin' || code === 'superadmin')) {
    return { ok: false as const, res: NextResponse.json({ error: 'Admin privileges required.' }, { status: 403 }) };
  }
  return guard;
}

function reply(data: unknown) {
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function inDiscoveryScope(node: NodeRow, libraryChildren: Set<number>) {
  return node.node_type === 'course' || (node.node_type === 'lesson' && libraryChildren.has(node.id));
}

function nodeReason(node: NodeRow, libraryChildren: Set<number>): string | null {
  if (inDiscoveryScope(node, libraryChildren)) return null;
  if (node.node_type === 'lesson') return 'This lesson is not a top-level Library guide.';
  if (node.node_type === 'chapter') return 'Chapters need their surrounding course or guide.';
  if (node.node_type === 'collection') return 'Collections organise the Library; they are not search results.';
  if (node.node_type === 'playlist') return 'Playlists are structural and are not independent discovery items.';
  return `This ${node.node_type} is outside the discovery catalogue.`;
}

async function loadInventory() {
  const admin = getAdminClient();
  const [resourcesResult, nodesResult, blocksResult, edgesResult] = await Promise.all([
    admin.from('resources').select('id,title,description,type,state,search_names,is_discoverable,is_browsable,discovery_open_mode').order('id'),
    admin.from('content_nodes').select('id,title,description,node_type,state,slug,search_names,is_discoverable').order('id'),
    admin.from('content_blocks').select('id,resource_id,node_id,position').eq('block_type', 'asset').not('resource_id', 'is', null),
    admin.from('node_children').select('parent_id,child_id'),
  ]);
  const error = resourcesResult.error ?? nodesResult.error ?? blocksResult.error ?? edgesResult.error;
  if (error) throw error;
  const resources = (resourcesResult.data ?? []) as ResourceRow[];
  const nodes = (nodesResult.data ?? []) as NodeRow[];
  const blocks = (blocksResult.data ?? []) as PlacementRow[];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const libraryIds = new Set(nodes.filter((node) => node.node_type === 'collection' && node.slug === 'library').map((node) => node.id));
  const libraryChildren = new Set<number>();
  (edgesResult.data ?? []).forEach((edge) => {
    if (libraryIds.has(Number(edge.parent_id))) libraryChildren.add(Number(edge.child_id));
  });
  const placementsByResource = new Map<number, PlacementRow[]>();
  blocks.forEach((block) => {
    const rows = placementsByResource.get(block.resource_id) ?? [];
    rows.push(block);
    placementsByResource.set(block.resource_id, rows);
  });
  return { resources, nodes, blocks, nodeById, libraryChildren, placementsByResource };
}

function resultForResource(
  row: ResourceRow,
  placementsByResource: Map<number, PlacementRow[]>,
  nodeById: Map<number, NodeRow>,
  exactIdMatch: boolean,
): FindContentResult {
  const placements = placementsByResource.get(row.id) ?? [];
  return {
    kind: 'resource', id: row.id, title: row.title, description: row.description ?? '', mediaType: row.type,
    state: row.state, searchNames: row.search_names ?? [], embedded: placements.length > 0,
    placementTitles: [...new Set(placements.map((entry) => nodeById.get(entry.node_id)?.title).filter((value): value is string => Boolean(value)))],
    inDiscoveryScope: true, ineligibleReason: null, exactIdMatch,
  };
}

function resultForNode(row: NodeRow, libraryChildren: Set<number>, exactIdMatch: boolean): FindContentResult {
  return {
    kind: 'node', id: row.id, title: row.title, description: row.description ?? '', mediaType: row.node_type,
    state: row.state, searchNames: row.search_names ?? [], embedded: false, placementTitles: [],
    inDiscoveryScope: inDiscoveryScope(row, libraryChildren), ineligibleReason: nodeReason(row, libraryChildren), exactIdMatch,
  };
}

async function find(q: string) {
  const inventory = await loadInventory();
  const normalized = q.trim().toLocaleLowerCase();
  if (!normalized) return { items: [] as FindContentResult[] };
  const numericId = /^\d+$/.test(normalized) ? Number(normalized) : null;
  const composite = /^(resource|node):(\d+)$/.exec(normalized);
  const matches: FindContentResult[] = [];

  inventory.resources.forEach((row) => {
    const exact = (numericId != null && row.id === numericId)
      || (composite?.[1] === 'resource' && row.id === Number(composite[2]));
    const placements = inventory.placementsByResource.get(row.id) ?? [];
    const haystack = [row.title, ...(row.search_names ?? []), ...placements.map((entry) => inventory.nodeById.get(entry.node_id)?.title ?? '')]
      .join(' ').toLocaleLowerCase();
    if (exact || haystack.includes(normalized)) matches.push(resultForResource(row, inventory.placementsByResource, inventory.nodeById, exact));
  });
  inventory.nodes.forEach((row) => {
    const exact = (numericId != null && row.id === numericId)
      || (composite?.[1] === 'node' && row.id === Number(composite[2]));
    const haystack = [row.title, ...(row.search_names ?? [])].join(' ').toLocaleLowerCase();
    if (exact || haystack.includes(normalized)) matches.push(resultForNode(row, inventory.libraryChildren, exact));
  });

  matches.sort((left, right) => Number(right.exactIdMatch) - Number(left.exactIdMatch)
    || left.title.localeCompare(right.title) || left.kind.localeCompare(right.kind) || left.id - right.id);
  return { items: matches.slice(0, 80) };
}

async function loadTopics(kind: DiscoveryItemKind, id: number) {
  const admin = getAdminClient();
  const linkTable = kind === 'resource' ? 'resource_tags' : 'content_node_tags';
  const idColumn = kind === 'resource' ? 'resource_id' : 'node_id';
  const links = await admin.from(linkTable).select('tag_id').eq(idColumn, id);
  if (links.error) throw links.error;
  const ids = (links.data ?? []).map((row) => Number(row.tag_id));
  if (!ids.length) return [];
  const tags = await admin.from('tags').select('id,name,browse_category,tag_kind,is_active').in('id', ids);
  if (tags.error) throw tags.error;
  return (tags.data ?? []).filter((tag) => tag.tag_kind === 'topic' && tag.is_active).map((tag) => ({
    id: Number(tag.id), name: String(tag.name), category: tag.browse_category == null ? null : String(tag.browse_category),
  })).sort((left, right) => left.name.localeCompare(right.name));
}

async function loadDecisions(
  kind: DiscoveryItemKind,
  id: number,
  defaults: Record<DiscoveryQuestion, string>,
): Promise<FindContentDecision[]> {
  const admin = getAdminClient();
  const loaded = await admin.from('discovery_decisions')
    .select('question,answer,token,decided_at,decided_label,evidence')
    .eq('item_kind', kind).eq('item_id', id);
  if (loaded.error) throw loaded.error;
  const byQuestion = new Map((loaded.data ?? []).map((row) => [String(row.question), row]));
  return Promise.all((['topics', 'placement', 'visibility'] as DiscoveryQuestion[]).map(async (question) => {
    const decision = byQuestion.get(question);
    let stale = false;
    if (decision) {
      const evidence = await admin.rpc('discovery_evidence', { _kind: kind, _id: id, _question: question });
      if (evidence.error) throw evidence.error;
      stale = stableJson(decision.evidence) !== stableJson(evidence.data);
    }
    return {
      question, answer: decision ? String(decision.answer) : defaults[question], decided: Boolean(decision),
      decidedAt: decision?.decided_at == null ? null : String(decision.decided_at),
      decidedLabel: decision?.decided_label == null ? null : String(decision.decided_label),
      token: decision?.token == null ? null : String(decision.token), stale,
    };
  }));
}

async function detail(kind: DiscoveryItemKind, id: number): Promise<FindContentDetail | null> {
  const inventory = await loadInventory();
  const resource = kind === 'resource' ? inventory.resources.find((row) => row.id === id) : null;
  const node = kind === 'node' ? inventory.nodes.find((row) => row.id === id) : null;
  if (!resource && !node) return null;
  const base = resource
    ? resultForResource(resource, inventory.placementsByResource, inventory.nodeById, false)
    : resultForNode(node!, inventory.libraryChildren, false);
  const topics = await loadTopics(kind, id);
  const defaults: Record<DiscoveryQuestion, string> = {
    topics: topics.length ? 'assigned' : 'none_needed',
    placement: resource?.discovery_open_mode === 'direct' ? 'direct' : 'context',
    visibility: (resource?.is_discoverable ?? node?.is_discoverable) ? 'allowed' : 'excluded',
  };
  const decisions = await loadDecisions(kind, id, defaults);
  const placements: FindContentPlacement[] = [];
  if (resource) {
    for (const block of inventory.placementsByResource.get(id) ?? []) {
      const home = await getAdminClient().rpc('discovery_container_home', { _node_id: block.node_id });
      if (home.error) throw home.error;
      const value = (home.data ?? {}) as { editor?: string; rootId?: number | null };
      placements.push({
        blockId: block.id, nodeId: block.node_id, nodeTitle: inventory.nodeById.get(block.node_id)?.title ?? `Node ${block.node_id}`,
        nodeType: inventory.nodeById.get(block.node_id)?.node_type ?? 'node', position: block.position,
        editor: value.editor === 'library' ? 'library' : 'course', rootId: value.rootId ?? null,
      });
    }
  }
  const categories = [...new Set(topics.map((topic) => topic.category).filter((value): value is string => Boolean(value)))];
  const publishedHref = kind === 'resource' ? '/admin/resource-library'
    : node?.node_type === 'course' ? `/admin/course-builder?node=${id}` : `/admin/library-editor?node=${id}`;
  return {
    ...base, topics, decisions, placements, isBrowsable: resource?.is_browsable ?? false,
    isDiscoverable: resource?.is_discoverable ?? node?.is_discoverable ?? false, categories, publishedHref,
  };
}

export async function GET(request: NextRequest) {
  const guard = await guardAdmin(request);
  if (!guard.ok) return guard.res;
  try {
    const params = request.nextUrl.searchParams;
    if (params.get('view') === 'detail') {
      const kind = params.get('kind');
      const id = Number(params.get('id'));
      if ((kind !== 'resource' && kind !== 'node') || !Number.isSafeInteger(id) || id <= 0) {
        return NextResponse.json({ error: 'A valid kind:id is required.' }, { status: 400 });
      }
      const item = await detail(kind, id);
      return item ? reply({ item }) : NextResponse.json({ error: 'Content not found.' }, { status: 404 });
    }
    const q = (params.get('q') ?? '').trim().slice(0, 120);
    return reply(await find(q));
  } catch (error) {
    console.error('[discovery-find]', error);
    return NextResponse.json({ error: 'Could not look up discovery content.' }, { status: 503 });
  }
}
