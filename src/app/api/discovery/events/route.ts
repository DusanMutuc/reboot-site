import { NextRequest, NextResponse } from 'next/server';

import type { DiscoveryEventType } from '@/lib/discoveryClient';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { isMemberDiscoveryEnabled } from '@/lib/discoveryFlags';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set<DiscoveryEventType>([
  'result_set_shown',
  'item_impression',
  'item_open',
  'full_library_opened',
  'discovery_opened',
  'category_selected',
  'filter_changed',
  'sort_changed',
  'search_reformulated',
  'search_cleared',
  'search_dismissed',
  'tab_session_ended',
  'feedback_finished',
  'feedback_not_interested',
]);

type EventRequest = {
  eventId?: unknown;
  schemaVersion?: unknown;
  clientSessionId?: unknown;
  tabSessionId?: unknown;
  clientSequence?: unknown;
  eventType?: unknown;
  resultSetId?: unknown;
  logicalSearchId?: unknown;
  itemPosition?: unknown;
  visibleFraction?: unknown;
  visibleMs?: unknown;
  clientOccurredAt?: unknown;
  metadata?: unknown;
};

function optionalUuid(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export async function POST(request: NextRequest) {
  if (!isMemberDiscoveryEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  let body: EventRequest;
  try {
    body = (await request.json()) as EventRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid analytics event.' }, { status: 400 });
  }

  const eventId = optionalUuid(body.eventId);
  const tabSessionId = optionalUuid(body.tabSessionId);
  const resultSetId = optionalUuid(body.resultSetId);
  const logicalSearchId = optionalUuid(body.logicalSearchId);
  const itemPosition = optionalNumber(body.itemPosition);
  const visibleFraction = optionalNumber(body.visibleFraction);
  const visibleMs = optionalNumber(body.visibleMs);
  const eventType =
    typeof body.eventType === 'string' && EVENT_TYPES.has(body.eventType as DiscoveryEventType)
      ? (body.eventType as DiscoveryEventType)
      : null;
  const clientSessionId =
    typeof body.clientSessionId === 'string' && body.clientSessionId.length <= 200
      ? body.clientSessionId.trim()
      : '';
  const clientSequence =
    typeof body.clientSequence === 'number' &&
    Number.isSafeInteger(body.clientSequence) &&
    body.clientSequence >= 0
      ? body.clientSequence
      : null;
  const occurredAt =
    typeof body.clientOccurredAt === 'string' && !Number.isNaN(Date.parse(body.clientOccurredAt))
      ? body.clientOccurredAt
      : null;
  const metadata =
    body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata
      : {};

  if (
    !eventId ||
    !tabSessionId ||
    resultSetId === undefined ||
    logicalSearchId === undefined ||
    itemPosition === undefined ||
    visibleFraction === undefined ||
    visibleMs === undefined ||
    !eventType ||
    !clientSessionId ||
    clientSequence === null ||
    !occurredAt
  ) {
    return NextResponse.json({ error: 'Invalid analytics event.' }, { status: 400 });
  }

  if (
    (itemPosition !== null && (!Number.isInteger(itemPosition) || itemPosition <= 0)) ||
    (visibleFraction !== null && (visibleFraction < 0 || visibleFraction > 1)) ||
    (visibleMs !== null && (!Number.isInteger(visibleMs) || visibleMs < 0))
  ) {
    return NextResponse.json({ error: 'Invalid analytics event.' }, { status: 400 });
  }

  const { error } = await getAdminClient().rpc('record_discovery_event', {
    _event_id: eventId,
    _schema_version: 1,
    _user_id: guard.user.id,
    _client_session_id: clientSessionId,
    _tab_session_id: tabSessionId,
    _client_sequence: clientSequence,
    _event_type: eventType,
    _result_set_id: resultSetId,
    _logical_search_id: logicalSearchId,
    _item_position: itemPosition,
    _visible_fraction: visibleFraction,
    _visible_ms: visibleMs,
    _client_occurred_at: occurredAt,
    _metadata: metadata,
  });

  if (error) {
    console.warn('[discovery-events] event rejected', { eventType, error });
    return NextResponse.json({ error: 'Analytics is unavailable.' }, { status: 503 });
  }

  return new NextResponse(null, { status: 202 });
}
