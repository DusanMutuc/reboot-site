import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  BrowseDiscoverySelection,
  ContentCategory,
  ContentItem,
  HomeDiscoveryResultSets,
} from '@/components/home/types';

const HOME_PREVIEW_SIZE = 8;
const RECOMMENDATION_CANDIDATE_SIZE = 24;
const SEARCH_VERSION = 'discovery-context-v3';
const RECOMMENDATION_VERSION = 'sprint-priority-context-v3';
const BROWSE_CATEGORIES: ContentCategory[] = [
  'marketing',
  'systems',
  'hiring',
  'mindset',
];

type DiscoverySearchRow = {
  item_type: 'resource' | 'guide';
  resource_id: number | null;
  content_node_id: number | null;
  title: string;
  media_type: string;
  url: string | null;
  thumbnail: string | null;
  duration: number | null;
  open_path: string | null;
  container_title?: string | null;
  container_path?: string | null;
  categories: string[] | null;
  ranking_tier: 'strict' | 'related';
  score: number | null;
  total_match_count: number;
  eligible_candidate_count: number;
  match_reason_codes: string[] | null;
};

type DiscoveryRecommendationRow = {
  resource_id: number;
  title: string;
  media_type: string;
  url: string | null;
  thumbnail: string | null;
  duration: number | null;
  open_path: string | null;
  container_title?: string | null;
  container_path?: string | null;
  categories: string[] | null;
  score: number | null;
  reason_code: string;
  matched_priority_count: number;
  matched_priority_labels: string[] | null;
  eligible_candidate_count: number;
};

type CoachRecommendationRow = DiscoveryRecommendationRow & {
  coach_id: string;
  coach_name: string;
};

type ResultSetItem = {
  position: number;
  item_type: 'resource' | 'guide';
  resource_id: number | null;
  content_node_id: number | null;
  ranking_tier: 'strict' | 'related' | 'recommendation';
  rank_score: number | null;
  reason_code: string | null;
  reason_context: Record<string, unknown>;
};

type ResultSetInput = {
  context: 'catalogue' | 'category' | 'recommendation';
  contextKey: string | null;
  version: string;
  status: 'generated' | 'empty' | 'insufficient';
  eligibleCandidateCount: number;
  totalMatchCount: number;
  pageSize: number;
  items: ResultSetItem[];
};

type LoadedDiscovery = {
  content: ContentItem[];
  recommended: ContentItem[];
  resultSets: HomeDiscoveryResultSets;
};

function normalizeHref(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^(?:[a-z]+:)?\/\//i.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  return `/${trimmed.replace(/^\/+/, '')}`;
}

function normalizeImage(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  return null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 60) return '';
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    guide: 'Guide',
    course: 'Course',
    video: 'Video',
    podcast: 'Podcast',
    pdf: 'PDF',
    document: 'Document',
    audio: 'Audio',
    image: 'Image',
    link: 'Library',
  };
  return labels[type.toLowerCase()] ?? type;
}

function validCategories(categories: string[] | null): ContentCategory[] {
  return (categories ?? []).filter((category): category is ContentCategory =>
    BROWSE_CATEGORIES.includes(category as ContentCategory),
  );
}

function searchItemId(row: DiscoverySearchRow): string {
  return row.item_type === 'resource'
    ? `resource-${row.resource_id}`
    : `guide-${row.content_node_id}`;
}

function toSearchContentItem(row: DiscoverySearchRow, index: number): ContentItem {
  const fallbackHref =
    row.item_type === 'resource' ? `/r/${row.resource_id}` : `/library/node/${row.content_node_id}`;

  return {
    id: searchItemId(row),
    resourceId: row.resource_id,
    title: row.title,
    containerTitle: row.container_title ?? null,
    containerHref: row.container_path ?? null,
    typeLabel: typeLabel(row.media_type),
    metaLabel: formatDuration(row.duration),
    href: normalizeHref(row.open_path) ?? normalizeHref(row.url) ?? fallbackHref,
    thumbIndex: index + 1,
    thumbnailUrl: normalizeImage(row.thumbnail),
    categories: validCategories(row.categories),
    progressPct: null,
  };
}

function toRecommendationContentItem(
  row: DiscoveryRecommendationRow | CoachRecommendationRow,
  index: number,
): ContentItem {
  return {
    id: `resource-${row.resource_id}`,
    resourceId: row.resource_id,
    title: row.title,
    containerTitle: row.container_title ?? null,
    containerHref: row.container_path ?? null,
    typeLabel: typeLabel(row.media_type),
    metaLabel: formatDuration(row.duration),
    href: normalizeHref(row.open_path) ?? normalizeHref(row.url) ?? `/r/${row.resource_id}`,
    thumbIndex: index + 1,
    thumbnailUrl: normalizeImage(row.thumbnail),
    categories: validCategories(row.categories),
    progressPct: null,
    recommendationSource: 'coach_name' in row ? 'coach' : 'algorithm',
    coachName: 'coach_name' in row ? row.coach_name : null,
  };
}

function searchResultItems(rows: DiscoverySearchRow[]): ResultSetItem[] {
  return rows.map((row, index) => ({
    position: index + 1,
    item_type: row.item_type,
    resource_id: row.resource_id,
    content_node_id: row.content_node_id,
    ranking_tier: row.ranking_tier,
    rank_score: row.score,
    reason_code: row.match_reason_codes?.[0] ?? null,
    reason_context: { matchReasonCodes: row.match_reason_codes ?? [] },
  }));
}

function recommendationResultItems(rows: DiscoveryRecommendationRow[]): ResultSetItem[] {
  return rows.map((row, index) => ({
    position: index + 1,
    item_type: 'resource',
    resource_id: row.resource_id,
    content_node_id: null,
    ranking_tier: 'recommendation',
    rank_score: row.score,
    reason_code: row.reason_code,
    reason_context: {
      matchedPriorityCount: row.matched_priority_count,
      matchedPriorityLabels: row.matched_priority_labels ?? [],
    },
  }));
}

function combinedRecommendationResultItems(
  coachRows: CoachRecommendationRow[],
  algorithmRows: DiscoveryRecommendationRow[],
): ResultSetItem[] {
  return [
    ...coachRows.map((row) => ({
      position: 0,
      item_type: 'resource' as const,
      resource_id: row.resource_id,
      content_node_id: null,
      ranking_tier: 'recommendation' as const,
      rank_score: null,
      reason_code: 'coach_selection',
      reason_context: { coachId: row.coach_id },
    })),
    ...recommendationResultItems(algorithmRows),
  ].map((item, index) => ({ ...item, position: index + 1 }));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function loadCoachRecommendations(
  client: SupabaseClient,
  userId: string,
): Promise<CoachRecommendationRow[]> {
  const suggestions = await client.from('coach_resource_suggestions')
    .select('id,resource_id,coach_id,created_at')
    .eq('user_id', userId).is('removed_at', null).is('member_resolution', null)
    .order('created_at', { ascending: false });
  if (suggestions.error) throw suggestions.error;
  if (!suggestions.data?.length) return [];

  const resourceIds = [...new Set(suggestions.data.map((row) => Number(row.resource_id)))];
  const coachIds = [...new Set(suggestions.data.map((row) => String(row.coach_id)))];
  const [resources, coaches, blocks, decisions, preferences, links] = await Promise.all([
    client.from('resources').select('id,title,type,url,thumbnail,duration,state').in('id', resourceIds),
    client.from('profiles').select('id,first_name,last_name').in('id', coachIds),
    client.from('content_blocks').select('resource_id').eq('block_type', 'asset').in('resource_id', resourceIds),
    client.from('discovery_decisions').select('item_id,answer,evidence').eq('item_kind', 'resource').eq('question', 'placement').in('item_id', resourceIds),
    client.from('user_resource_discovery_preferences').select('resource_id').eq('user_id', userId).in('resource_id', resourceIds),
    client.from('resource_tags').select('resource_id,tag_id').in('resource_id', resourceIds),
  ]);
  const error = resources.error ?? coaches.error ?? blocks.error ?? decisions.error ?? preferences.error ?? links.error;
  if (error) throw error;
  const tagIds = [...new Set((links.data ?? []).map((row) => Number(row.tag_id)))];
  const tags = tagIds.length
    ? await client.from('tags').select('id,browse_category,tag_kind,is_active').in('id', tagIds)
    : { data: [], error: null };
  if (tags.error) throw tags.error;
  const categoryByTag = new Map((tags.data ?? []).filter((tag) => tag.tag_kind === 'topic' && tag.is_active && tag.browse_category)
    .map((tag) => [Number(tag.id), String(tag.browse_category)]));
  const categoriesByResource = new Map<number, string[]>();
  (links.data ?? []).forEach((link) => {
    const category = categoryByTag.get(Number(link.tag_id));
    if (!category) return;
    const values = categoriesByResource.get(Number(link.resource_id)) ?? [];
    if (!values.includes(category)) values.push(category);
    categoriesByResource.set(Number(link.resource_id), values);
  });
  const resourceMap = new Map((resources.data ?? []).map((row) => [Number(row.id), row]));
  const coachMap = new Map((coaches.data ?? []).map((row) => [String(row.id), `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Your coach']));
  const embedded = new Set((blocks.data ?? []).map((row) => Number(row.resource_id)));
  const decisionMap = new Map((decisions.data ?? []).map((row) => [Number(row.item_id), row]));
  const suppressed = new Set((preferences.data ?? []).map((row) => Number(row.resource_id)));
  const contexts = await client.rpc('discovery_resource_contexts', { _user_id: userId, _resource_ids: resourceIds });
  if (contexts.error) throw contexts.error;
  const contextMap = new Map(((contexts.data ?? []) as Array<{ resource_id: number; container_title: string; container_path: string; open_path?: string | null }>)
    .map((row) => [Number(row.resource_id), row]));

  const rows: CoachRecommendationRow[] = [];
  for (const suggestion of suggestions.data) {
    const resourceId = Number(suggestion.resource_id);
    const resource = resourceMap.get(resourceId);
    if (!resource || resource.state !== 'published' || suppressed.has(resourceId)) continue;
    if (embedded.has(resourceId)) {
      const decision = decisionMap.get(resourceId);
      if (!decision || decision.answer !== 'direct') continue;
      const currentEvidence = await client.rpc('discovery_evidence', { _kind: 'resource', _id: resourceId, _question: 'placement' });
      if (currentEvidence.error || stableJson(decision.evidence) !== stableJson(currentEvidence.data)) continue;
    }
    const access = await client.rpc('can_access_discovery_resource', { _user_id: userId, _resource_id: resourceId });
    if (access.error || !access.data) continue;
    const context = contextMap.get(resourceId);
    rows.push({
      resource_id: resourceId, title: String(resource.title), media_type: String(resource.type),
      url: resource.url == null ? null : String(resource.url), thumbnail: resource.thumbnail == null ? null : String(resource.thumbnail),
      duration: resource.duration == null ? null : Number(resource.duration), open_path: context?.open_path ?? null,
      container_title: context?.container_title ?? null, container_path: context?.container_path ?? null,
      categories: categoriesByResource.get(resourceId) ?? [], score: null, reason_code: 'coach_selection',
      matched_priority_count: 0, matched_priority_labels: [], eligible_candidate_count: suggestions.data.length,
      coach_id: String(suggestion.coach_id), coach_name: coachMap.get(String(suggestion.coach_id)) ?? 'Your coach',
    });
  }
  return rows;
}

async function recordResultSet(
  client: SupabaseClient,
  userId: string,
  input: ResultSetInput,
): Promise<string | null> {
  const resultSetId = randomUUID();
  const { error } = await client.rpc('record_discovery_result_set', {
    _result_set_id: resultSetId,
    _user_id: userId,
    _context: input.context,
    _context_key: input.contextKey,
    _surface: 'member_home',
    _result_version: input.version,
    _page_number: 1,
    _page_size: input.pageSize,
    _is_prefetched: true,
    _status: input.status,
    _eligible_candidate_count: input.eligibleCandidateCount,
    _total_match_count: input.totalMatchCount,
    _returned_count: input.items.length,
    _error_code: null,
    _logical_search_id: null,
    _search_execution_id: null,
    _items: input.items,
  });

  if (error) {
    console.warn('[discovery] result-set recording unavailable', {
      context: input.context,
      contextKey: input.contextKey,
      error,
    });
    return null;
  }

  return resultSetId;
}

function resultSetRef(
  id: string | null,
  input: ResultSetInput,
  itemIds: string[],
): HomeDiscoveryResultSets[BrowseDiscoverySelection] {
  return {
    id,
    context: input.context,
    contextKey: input.contextKey,
    itemPositions: Object.fromEntries(itemIds.map((itemId, index) => [itemId, index + 1])),
  };
}

async function searchPreview(
  client: SupabaseClient,
  userId: string,
  category: ContentCategory | null,
): Promise<DiscoverySearchRow[]> {
  const { data, error } = await client.rpc('search_discovery_catalogue', {
    _surface: 'browse',
    _user_id: userId,
    _q: '',
    _browse_category: category,
    _types: null,
    _tag_ids: null,
    _duration: null,
    _date_range: null,
    _sort: 'newest',
    _limit: HOME_PREVIEW_SIZE,
    _offset: 0,
    _include_related: false,
  });

  if (error) throw error;
  return (data ?? []) as DiscoverySearchRow[];
}

export async function loadHomeDiscovery(
  client: SupabaseClient,
  userId: string,
): Promise<LoadedDiscovery | null> {
  try {
    const [allRows, ...categoryRecommendationAndCoach] = await Promise.all([
      searchPreview(client, userId, null),
      ...BROWSE_CATEGORIES.map((category) => searchPreview(client, userId, category)),
      client.rpc('recommend_discovery_resources', {
        _user_id: userId,
        _limit: RECOMMENDATION_CANDIDATE_SIZE,
      }),
      loadCoachRecommendations(client, userId),
    ]);

    const categoryRows = categoryRecommendationAndCoach.slice(0, BROWSE_CATEGORIES.length) as
      | DiscoverySearchRow[][]
      | [];
    const recommendationResult = categoryRecommendationAndCoach[
      BROWSE_CATEGORIES.length
    ] as Awaited<ReturnType<SupabaseClient['rpc']>>;
    const coachRows = categoryRecommendationAndCoach[BROWSE_CATEGORIES.length + 1] as CoachRecommendationRow[];

    if (recommendationResult.error) throw recommendationResult.error;
    const recommendationRows = (recommendationResult.data ?? []) as DiscoveryRecommendationRow[];

    const viewRows = new Map<BrowseDiscoverySelection, DiscoverySearchRow[]>([['all', allRows]]);
    BROWSE_CATEGORIES.forEach((category, index) => {
      viewRows.set(category, categoryRows[index] ?? []);
    });

    const contentById = new Map<string, ContentItem>();
    viewRows.forEach((rows) => {
      rows.forEach((row, index) => {
        const item = toSearchContentItem(row, index);
        if (!contentById.has(item.id)) contentById.set(item.id, item);
      });
    });

    // Recommender retains its RPC contract; hydrate only accessible parent labels.
    const contextResult = recommendationRows.length
      ? await client.rpc('discovery_resource_contexts', {
          _user_id: userId, _resource_ids: recommendationRows.map((row) => row.resource_id),
        })
      : { data: [], error: null };
    if (contextResult.error) throw contextResult.error;
    const contexts = new Map(
      (contextResult.data as { resource_id: number; container_title: string; container_path: string }[] ?? [])
        .map((row) => [row.resource_id, row]),
    );
    const algorithmRows = recommendationRows.length >= 4 ? recommendationRows : [];
    const coachResourceIds = new Set(coachRows.map((row) => row.resource_id));
    const dedupedAlgorithmRows = algorithmRows.filter((row) => !coachResourceIds.has(row.resource_id));
    const combinedRows: Array<DiscoveryRecommendationRow | CoachRecommendationRow> = [...coachRows, ...dedupedAlgorithmRows];
    const recommended = combinedRows.map((row, index) =>
      toRecommendationContentItem({ ...row, ...contexts.get(row.resource_id) }, index),
    );
    const resultSets: HomeDiscoveryResultSets = {};

    await Promise.all([
      ...Array.from(viewRows.entries()).map(async ([selection, rows]) => {
        const context = selection === 'all' ? 'catalogue' : 'category';
        const input: ResultSetInput = {
          context,
          contextKey: selection === 'all' ? 'all' : selection,
          version: SEARCH_VERSION,
          status: rows.length > 0 ? 'generated' : 'empty',
          eligibleCandidateCount: Number(rows[0]?.eligible_candidate_count ?? 0),
          totalMatchCount: Number(rows[0]?.total_match_count ?? 0),
          pageSize: HOME_PREVIEW_SIZE,
          items: searchResultItems(rows),
        };
        const id = await recordResultSet(client, userId, input);
        resultSets[selection] = resultSetRef(id, input, rows.map(searchItemId));
      }),
      (async () => {
        const count = combinedRows.length;
        const recordedRows = count > 0 ? combinedRecommendationResultItems(coachRows, dedupedAlgorithmRows)
          : recommendationRows.length > 0 ? recommendationResultItems(recommendationRows) : [];
        const input: ResultSetInput = {
          context: 'recommendation',
          contextKey: 'current_sprint',
          version: RECOMMENDATION_VERSION,
          status: count > 0 ? 'generated' : recommendationRows.length > 0 ? 'insufficient' : 'empty',
          eligibleCandidateCount: Number(
            recommendationRows[0]?.eligible_candidate_count ?? count,
          ),
          totalMatchCount: Number(recommendationRows[0]?.eligible_candidate_count ?? count),
          pageSize: RECOMMENDATION_CANDIDATE_SIZE,
          items: recordedRows,
        };
        const id = await recordResultSet(client, userId, input);
        resultSets['for-you'] = resultSetRef(
          id,
          input,
          recommended.map((item) => item.id),
        );
      })(),
    ]);

    return {
      content: Array.from(contentById.values()),
      recommended,
      resultSets,
    };
  } catch (error) {
    console.warn('[discovery] home discovery unavailable; withholding unverified catalogue', error);
    return null;
  }
}
