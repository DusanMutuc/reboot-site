import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { isMemberDiscoveryEnabled } from '@/lib/discoveryFlags';
import { withAllLibraryView } from '@/lib/libraryContentHref';

const PAGE_SIZE = 24;
const SEARCH_VERSION = 'discovery-context-v3';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set(['marketing', 'systems', 'hiring', 'mindset']);
const TYPES = new Set(['video', 'podcast', 'pdf', 'document', 'audio', 'image', 'link', 'guide']);
const DURATIONS = new Set(['all', 'short', 'medium', 'long']);
const DATE_RANGES = new Set(['all', '30', '90']);
const SORTS = new Set([
  'relevance',
  'newest',
  'oldest',
  'title_asc',
  'title_desc',
  'duration_asc',
  'duration_desc',
]);
const CHANGE_REASONS = new Set(['query', 'category', 'filter', 'sort']);

type CatalogueRequest = {
  query?: unknown;
  category?: unknown;
  types?: unknown;
  duration?: unknown;
  dateRange?: unknown;
  sort?: unknown;
  includeRelated?: unknown;
  page?: unknown;
  tracking?: {
    clientSessionId?: unknown;
    tabSessionId?: unknown;
    journeyId?: unknown;
    logicalSearchId?: unknown;
    parentLogicalSearchId?: unknown;
    changeReason?: unknown;
    executionNumber?: unknown;
  };
};

type DiscoveryRow = {
  item_type: 'resource' | 'guide';
  resource_id: number | null;
  content_node_id: number | null;
  title: string;
  description: string | null;
  media_type: string;
  url: string | null;
  thumbnail: string | null;
  duration: number | null;
  created_at: string;
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

function uuidOrNull(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function sessionIdOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 200 ? trimmed : null;
}

function stringOption(value: unknown, options: Set<string>, fallback: string): string {
  return typeof value === 'string' && options.has(value) ? value : fallback;
}

function normalizeHref(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^(?:[a-z]+:)?\/\//i.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  return `/${trimmed.replace(/^\/+/, '')}`;
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    guide: 'Guide',
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

export async function POST(request: NextRequest) {
  if (!isMemberDiscoveryEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  let body: CatalogueRequest;
  try {
    body = (await request.json()) as CatalogueRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid catalogue request.' }, { status: 400 });
  }

  const rawQuery = typeof body.query === 'string' ? body.query.trim() : '';
  if (rawQuery.length > 100) {
    return NextResponse.json({ error: 'Search query is too long.' }, { status: 400 });
  }
  const query = rawQuery.length >= 2 ? rawQuery : '';
  const category =
    typeof body.category === 'string' && CATEGORIES.has(body.category) ? body.category : null;
  const types = Array.isArray(body.types)
    ? Array.from(
        new Set(
          body.types.filter((type): type is string => typeof type === 'string' && TYPES.has(type)),
        ),
      ).slice(0, TYPES.size)
    : [];
  const duration = stringOption(body.duration, DURATIONS, 'all');
  const dateRange = stringOption(body.dateRange, DATE_RANGES, 'all');
  const sort = stringOption(body.sort, SORTS, query ? 'relevance' : 'newest');
  const includeRelated = body.includeRelated === true;
  const page =
    typeof body.page === 'number' && Number.isSafeInteger(body.page) && body.page > 0
      ? Math.min(body.page, 10_000)
      : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const admin = getAdminClient();
  const requestedAt = new Date();
  const startedAt = performance.now();

  const rpcArgs = {
    _surface: query ? 'search' : 'browse',
    _user_id: guard.user.id,
    _q: query,
    _browse_category: category,
    _types: types.length > 0 ? types : null,
    _tag_ids: null,
    _duration: duration,
    _date_range: dateRange,
    _sort: sort,
    _limit: PAGE_SIZE,
    _offset: offset,
    _include_related: includeRelated,
  };
  const { data, error } = await admin.rpc('search_discovery_catalogue', rpcArgs);
  if (error) {
    console.error('[discovery-catalogue] search failed', error);
    return NextResponse.json({ error: 'Discovery is unavailable right now.' }, { status: 503 });
  }

  const rows = (data ?? []) as DiscoveryRow[];
  let eligibleCandidateCount = Number(rows[0]?.eligible_candidate_count ?? 0);
  let totalMatchCount = Number(rows[0]?.total_match_count ?? 0);

  if (rows.length === 0) {
    const matchProbe = await admin.rpc('search_discovery_catalogue', {
      ...rpcArgs,
      _limit: 1,
      _offset: 0,
    });
    const matchedProbeRows = (matchProbe.data ?? []) as DiscoveryRow[];
    if (!matchProbe.error && matchedProbeRows[0]) {
      eligibleCandidateCount = Number(matchedProbeRows[0].eligible_candidate_count ?? 0);
      totalMatchCount = Number(matchedProbeRows[0].total_match_count ?? 0);
    } else {
      const candidateProbe = await admin.rpc('search_discovery_catalogue', {
        ...rpcArgs,
        _q: '',
        _sort: 'relevance',
        _limit: 1,
        _offset: 0,
        _include_related: false,
      });
      if (!candidateProbe.error) {
        const candidateRows = (candidateProbe.data ?? []) as DiscoveryRow[];
        eligibleCandidateCount = Number(candidateRows[0]?.eligible_candidate_count ?? 0);
      }
      totalMatchCount = 0;
    }
  }

  const tracking = body.tracking ?? {};
  const clientSessionId = sessionIdOrNull(tracking.clientSessionId);
  const tabSessionId = uuidOrNull(tracking.tabSessionId);
  const journeyId = uuidOrNull(tracking.journeyId) ?? randomUUID();
  const logicalSearchId = uuidOrNull(tracking.logicalSearchId) ?? randomUUID();
  const parentLogicalSearchId = uuidOrNull(tracking.parentLogicalSearchId);
  const requestedChangeReason =
    typeof tracking.changeReason === 'string' && CHANGE_REASONS.has(tracking.changeReason)
      ? tracking.changeReason
      : 'query';
  const executionNumber =
    typeof tracking.executionNumber === 'number' &&
    Number.isSafeInteger(tracking.executionNumber) &&
    tracking.executionNumber > 0
      ? tracking.executionNumber
      : page;
  const resultSetId = randomUUID();
  const resultItems = rows.map((row, index) => ({
    position: index + 1,
    item_type: row.item_type,
    resource_id: row.resource_id,
    content_node_id: row.content_node_id,
    ranking_tier: row.ranking_tier,
    rank_score: row.score,
    reason_code: row.match_reason_codes?.[0] ?? null,
    reason_context: { matchReasonCodes: row.match_reason_codes ?? [] },
  }));
  let recordedResultSetId: string | null = null;
  let recordedLogicalSearchId: string | null = null;

  if (query && clientSessionId && tabSessionId) {
    const completedAt = new Date();
    const { error: recordingError } = await admin.rpc('record_discovery_search_response', {
      _logical_search_id: logicalSearchId,
      _journey_id: journeyId,
      _parent_logical_search_id: parentLogicalSearchId,
      _user_id: guard.user.id,
      _client_session_id: clientSessionId,
      _tab_session_id: tabSessionId,
      _query_text: query,
      _browse_category: category,
      _filter_state: { types, duration, dateRange, includeRelated },
      _canonical_sort: sort,
      _change_reason: parentLogicalSearchId ? requestedChangeReason : 'initial',
      _execution_id: randomUUID(),
      _execution_number: executionNumber,
      _search_version: SEARCH_VERSION,
      _execution_pass: rows.some((row) => row.ranking_tier === 'strict') ? 'strict' : 'related',
      _requested_at: requestedAt.toISOString(),
      _completed_at: completedAt.toISOString(),
      _execution_status: 'completed',
      _latency_ms: Math.max(0, Math.round(performance.now() - startedAt)),
      _eligible_candidate_count: eligibleCandidateCount,
      _total_match_count: totalMatchCount,
      _execution_error_code: null,
      _result_set_id: resultSetId,
      _surface: 'discovery_catalogue',
      _page_number: page,
      _page_size: PAGE_SIZE,
      _is_prefetched: false,
      _result_status: rows.length > 0 ? 'generated' : 'empty',
      _returned_count: rows.length,
      _result_error_code: null,
      _items: resultItems,
    });

    if (recordingError) {
      console.warn('[discovery-catalogue] search analytics unavailable', recordingError);
    } else {
      recordedResultSetId = resultSetId;
      recordedLogicalSearchId = logicalSearchId;
    }
  } else {
    const context = category ? 'category' : 'catalogue';
    const { error: recordingError } = await admin.rpc('record_discovery_result_set', {
      _result_set_id: resultSetId,
      _user_id: guard.user.id,
      _context: context,
      _context_key: category ?? 'all',
      _surface: 'discovery_catalogue',
      _result_version: SEARCH_VERSION,
      _page_number: page,
      _page_size: PAGE_SIZE,
      _is_prefetched: false,
      _status: rows.length > 0 ? 'generated' : 'empty',
      _eligible_candidate_count: eligibleCandidateCount,
      _total_match_count: totalMatchCount,
      _returned_count: rows.length,
      _error_code: null,
      _logical_search_id: null,
      _search_execution_id: null,
      _items: resultItems,
    });
    if (recordingError) {
      console.warn('[discovery-catalogue] browse analytics unavailable', recordingError);
    } else {
      recordedResultSetId = resultSetId;
    }
  }

  return NextResponse.json({
    items: rows.map((row, index) => ({
      id:
        row.item_type === 'resource'
          ? `resource-${row.resource_id}`
          : `guide-${row.content_node_id}`,
      title: row.title,
      containerTitle: row.container_title ?? null,
      containerHref: row.container_path ? withAllLibraryView(row.container_path) : null,
      description: row.description,
      typeLabel: typeLabel(row.media_type),
      duration: row.duration,
      thumbnailUrl: row.thumbnail,
      href: withAllLibraryView(
        normalizeHref(row.open_path) ??
          normalizeHref(row.url) ??
          (row.item_type === 'resource'
            ? `/r/${row.resource_id}`
            : `/library/node/${row.content_node_id}`),
      ),
      rankingTier: row.ranking_tier,
      resultSetId: recordedResultSetId,
      logicalSearchId: recordedLogicalSearchId,
      position: index + 1,
    })),
    resultSetId: recordedResultSetId,
    logicalSearchId: recordedLogicalSearchId,
    journeyId: recordedLogicalSearchId ? journeyId : null,
    page,
    pageSize: PAGE_SIZE,
    totalMatchCount,
    eligibleCandidateCount,
  });
}
