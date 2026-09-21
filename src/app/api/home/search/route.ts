import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import type { SearchItem } from '@/components/home/types';
import { isMemberDiscoveryEnabled } from '@/lib/discoveryFlags';
import { withAllLibraryView } from '@/lib/libraryContentHref';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

const PAGE_SIZE = 5;
const SEARCH_VERSION = 'discovery-context-v3';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SearchRequest = {
  query?: unknown;
  tracking?: {
    clientSessionId?: unknown;
    tabSessionId?: unknown;
    journeyId?: unknown;
    logicalSearchId?: unknown;
    parentLogicalSearchId?: unknown;
  };
};

type DiscoverySearchRow = {
  item_type: 'resource' | 'guide';
  resource_id: number | null;
  content_node_id: number | null;
  title: string;
  media_type: string;
  url: string | null;
  open_path: string | null;
  container_title?: string | null;
  container_path?: string | null;
  ranking_tier: 'strict' | 'related';
  score: number | null;
  total_match_count: number;
  eligible_candidate_count: number;
  match_reason_codes: string[] | null;
};

type LegacyResourceSearchRow = {
  id: number;
  title: string;
  type: string;
  url: string | null;
  page_slug?: string | null;
  open_path?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
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

function normalizeHref(href: string | null | undefined): string | null {
  const value = href?.trim();
  if (!value) return null;
  if (/^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith('/')) return value;
  return `/${value.replace(/^\/+/, '')}`;
}

function uuidOrNull(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function sessionIdOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 200 ? trimmed : null;
}

function toSearchItem(
  row: DiscoverySearchRow,
  position: number,
  resultSetId: string | null,
  logicalSearchId: string | null,
): SearchItem {
  const fallbackHref =
    row.item_type === 'resource' ? `/r/${row.resource_id}` : `/library/node/${row.content_node_id}`;

  return {
    title: row.title,
    containerTitle: row.container_title ?? null,
    containerHref: row.container_path ? withAllLibraryView(row.container_path) : null,
    typeLabel: TYPE_LABELS[row.media_type.toLowerCase()] ?? row.media_type,
    href: withAllLibraryView(normalizeHref(row.open_path) ?? normalizeHref(row.url) ?? fallbackHref),
    rankingTier: row.ranking_tier,
    resultSetId,
    logicalSearchId,
    position,
  };
}

function toLegacySearchItem(row: LegacyResourceSearchRow): SearchItem {
  return {
    title: row.title,
    typeLabel: TYPE_LABELS[row.type.toLowerCase()] ?? row.type,
    href: withAllLibraryView(
      normalizeHref(row.open_path) ??
        (row.page_slug ? `/library/${row.page_slug}` : normalizeHref(row.url)) ??
        `/r/${row.id}`,
    ),
  };
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  let body: SearchRequest;
  try {
    body = (await request.json()) as SearchRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid search request.' }, { status: 400 });
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (query.length < 2) return NextResponse.json({ items: [] });
  if (query.length > 100) {
    return NextResponse.json({ error: 'Search query is too long.' }, { status: 400 });
  }

  if (!isMemberDiscoveryEnabled()) {
    const args = {
      _q: query,
      _types: null,
      _tag_ids: null,
      _duration: null,
      _date_range: null,
      _sort: 'relevance',
      _limit: PAGE_SIZE,
      _offset: 0,
      _mode: 'balanced',
    };
    const primary = await guard.supabase.rpc('search_resources_with_page', args);
    if (primary.error) {
      console.error('[momentum-search] legacy search', primary.error);
      return NextResponse.json({ error: 'Search is unavailable right now.' }, { status: 500 });
    }

    let rows = (primary.data ?? []) as LegacyResourceSearchRow[];
    if (query.length >= 3 && rows.length < PAGE_SIZE) {
      const broad = await guard.supabase.rpc('search_resources_with_page', {
        ...args,
        _mode: 'loose',
      });
      if (!broad.error && broad.data) rows = broad.data as LegacyResourceSearchRow[];
    }

    return NextResponse.json({
      items: rows.slice(0, PAGE_SIZE).map(toLegacySearchItem),
      totalMatchCount: rows.length,
    });
  }

  const admin = getAdminClient();
  const requestedAt = new Date();
  const startedAt = performance.now();
  const { data, error } = await admin.rpc('search_discovery_catalogue', {
    _user_id: guard.user.id,
    _q: query,
    _browse_category: null,
    _types: null,
    _tag_ids: null,
    _duration: null,
    _date_range: null,
    _sort: 'relevance',
    _limit: PAGE_SIZE,
    _offset: 0,
    _include_related: true,
  });

  if (error) {
    // Legacy search does not enforce the reviewed eligibility contract.
    console.error('[momentum-search] discovery search unavailable', error);
    return NextResponse.json({ error: 'Search is unavailable right now.' }, { status: 503 });
  }

  const rows = (data ?? []) as DiscoverySearchRow[];
  let eligibleCandidateCount = Number(rows[0]?.eligible_candidate_count ?? 0);
  const totalMatchCount = Number(rows[0]?.total_match_count ?? 0);

  // A rowless table-function response cannot carry its pre-ranking count. A
  // one-row empty-query probe preserves the contract for no-result searches.
  if (rows.length === 0) {
    const candidateProbe = await admin.rpc('search_discovery_catalogue', {
      _user_id: guard.user.id,
      _q: '',
      _browse_category: null,
      _types: null,
      _tag_ids: null,
      _duration: null,
      _date_range: null,
      _sort: 'relevance',
      _limit: 1,
      _offset: 0,
      _include_related: false,
    });
    if (!candidateProbe.error) {
      const probe = (candidateProbe.data ?? []) as DiscoverySearchRow[];
      eligibleCandidateCount = Number(probe[0]?.eligible_candidate_count ?? 0);
    }
  }

  const tracking = body.tracking ?? {};
  const clientSessionId = sessionIdOrNull(tracking.clientSessionId);
  const tabSessionId = uuidOrNull(tracking.tabSessionId);
  const journeyId = uuidOrNull(tracking.journeyId) ?? randomUUID();
  const logicalSearchId = uuidOrNull(tracking.logicalSearchId) ?? randomUUID();
  const parentLogicalSearchId = uuidOrNull(tracking.parentLogicalSearchId);
  const executionId = randomUUID();
  const resultSetId = randomUUID();
  const completedAt = new Date();
  const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
  let recordedResultSetId: string | null = null;

  if (clientSessionId && tabSessionId) {
    const { error: recordingError } = await admin.rpc('record_discovery_search_response', {
      _logical_search_id: logicalSearchId,
      _journey_id: journeyId,
      _parent_logical_search_id: parentLogicalSearchId,
      _user_id: guard.user.id,
      _client_session_id: clientSessionId,
      _tab_session_id: tabSessionId,
      _query_text: query,
      _browse_category: null,
      _filter_state: {},
      _canonical_sort: 'relevance',
      _change_reason: parentLogicalSearchId ? 'query' : 'initial',
      _execution_id: executionId,
      _execution_number: 1,
      _search_version: SEARCH_VERSION,
      _execution_pass: rows.some((row) => row.ranking_tier === 'strict') ? 'strict' : 'related',
      _requested_at: requestedAt.toISOString(),
      _completed_at: completedAt.toISOString(),
      _execution_status: 'completed',
      _latency_ms: latencyMs,
      _eligible_candidate_count: eligibleCandidateCount,
      _total_match_count: totalMatchCount,
      _execution_error_code: null,
      _result_set_id: resultSetId,
      _surface: 'member_home_search',
      _page_number: 1,
      _page_size: PAGE_SIZE,
      _is_prefetched: false,
      _result_status: rows.length > 0 ? 'generated' : 'empty',
      _returned_count: rows.length,
      _result_error_code: null,
      _items: rows.map((row, index) => ({
        position: index + 1,
        item_type: row.item_type,
        resource_id: row.resource_id,
        content_node_id: row.content_node_id,
        ranking_tier: row.ranking_tier,
        rank_score: row.score,
        reason_code: row.match_reason_codes?.[0] ?? null,
        reason_context: { matchReasonCodes: row.match_reason_codes ?? [] },
      })),
    });

    if (recordingError) {
      console.warn('[momentum-search] response analytics unavailable', recordingError);
    } else {
      recordedResultSetId = resultSetId;
    }
  }

  return NextResponse.json({
    items: rows.map((row, index) =>
      toSearchItem(row, index + 1, recordedResultSetId, recordedResultSetId ? logicalSearchId : null),
    ),
    resultSetId: recordedResultSetId,
    logicalSearchId: recordedResultSetId ? logicalSearchId : null,
    journeyId: recordedResultSetId ? journeyId : null,
    totalMatchCount,
    eligibleCandidateCount,
  });
}
