'use client';

const CLIENT_SESSION_KEY = 'reboot.discovery.client-session.v1';
const TAB_SESSION_KEY = 'reboot.discovery.tab-session.v1';
const SEQUENCE_KEY = 'reboot.discovery.sequence.v1';

let fallbackClientSessionId: string | null = null;
let fallbackTabSessionId: string | null = null;
let fallbackSequence = 0;

export type DiscoveryEventType =
  | 'result_set_shown'
  | 'item_impression'
  | 'item_open'
  | 'full_library_opened'
  | 'discovery_opened'
  | 'category_selected'
  | 'filter_changed'
  | 'sort_changed'
  | 'search_reformulated'
  | 'search_cleared'
  | 'search_dismissed'
  | 'tab_session_ended'
  | 'feedback_finished'
  | 'feedback_not_interested';

export type DiscoveryTrackingIdentity = {
  clientSessionId: string;
  tabSessionId: string;
};

type DiscoveryEventInput = {
  eventType: DiscoveryEventType;
  resultSetId?: string | null;
  logicalSearchId?: string | null;
  itemPosition?: number | null;
  visibleFraction?: number | null;
  visibleMs?: number | null;
  metadata?: Record<string, unknown>;
};

function newId(): string {
  return crypto.randomUUID();
}

function storedId(key: string, fallback: 'client' | 'tab'): string {
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const created = newId();
    window.sessionStorage.setItem(key, created);
    return created;
  } catch {
    if (fallback === 'client') {
      fallbackClientSessionId ??= newId();
      return fallbackClientSessionId;
    }
    fallbackTabSessionId ??= newId();
    return fallbackTabSessionId;
  }
}

function nextSequence(): number {
  try {
    const current = Number(window.sessionStorage.getItem(SEQUENCE_KEY) ?? '0');
    const next = Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
    window.sessionStorage.setItem(SEQUENCE_KEY, String(next));
    return next;
  } catch {
    fallbackSequence += 1;
    return fallbackSequence;
  }
}

export function getDiscoveryTrackingIdentity(): DiscoveryTrackingIdentity {
  return {
    clientSessionId: storedId(CLIENT_SESSION_KEY, 'client'),
    tabSessionId: storedId(TAB_SESSION_KEY, 'tab'),
  };
}

export function recordDiscoveryEvent(
  input: DiscoveryEventInput,
  options: { keepalive?: boolean } = {},
): void {
  const identity = getDiscoveryTrackingIdentity();
  const body = JSON.stringify({
    eventId: newId(),
    schemaVersion: 1,
    ...identity,
    clientSequence: nextSequence(),
    eventType: input.eventType,
    resultSetId: input.resultSetId ?? null,
    logicalSearchId: input.logicalSearchId ?? null,
    itemPosition: input.itemPosition ?? null,
    visibleFraction: input.visibleFraction ?? null,
    visibleMs: input.visibleMs ?? null,
    clientOccurredAt: new Date().toISOString(),
    metadata: input.metadata ?? {},
  });

  void fetch('/api/discovery/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: options.keepalive ?? false,
  }).catch(() => {
    // Analytics must never interrupt discovery or navigation.
  });
}
