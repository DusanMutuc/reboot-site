const REQUEST_WINDOW_MS = 10_000;
const REQUESTS_PER_WINDOW = 80;
const BURST_COOLDOWN_MS = 10_000;
const MAX_RETRY_DELAY_MS = 30_000;
const MAX_RETRIES = 2;

// Calendar scans and contact verification share the same GHL integration quota.
// Serialize starts only, so slow responses do not block unrelated requests.
let startQueue: Promise<void> = Promise.resolve();
const requestStarts: number[] = [];
let cooldownUntil = 0;

async function waitForTurn(): Promise<void> {
  const previous = startQueue;
  let release!: () => void;
  startQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    for (;;) {
      const now = Date.now();
      while (requestStarts.length > 0 && requestStarts[0] <= now - REQUEST_WINDOW_MS) {
        requestStarts.shift();
      }
      const availableAt = requestStarts.length >= REQUESTS_PER_WINDOW
        ? requestStarts[0] + REQUEST_WINDOW_MS
        : now;
      const delay = Math.max(availableAt, cooldownUntil) - now;
      // An in-flight response can extend the cooldown while this turn is waiting.
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        continue;
      }
      requestStarts.push(now);
      break;
    }
  } finally {
    release();
  }
}

/** Limit booking report reads and retry temporary GHL throttling. */
export async function fetchBookingGhl(
  url: string,
  init: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    await waitForTurn();
    // Queue/cooldown time must not consume the contact request's timeout.
    const timeoutSignal = timeoutMs === undefined ? null : AbortSignal.timeout(timeoutMs);
    // An explicit signal also prevents Next from memoizing a throttled GET.
    const signal = init.signal
      ? (timeoutSignal ? AbortSignal.any([init.signal, timeoutSignal]) : init.signal)
      : (timeoutSignal ?? new AbortController().signal);
    const response = await fetch(url, { ...init, signal });
    if (response.status !== 429) return response;

    // A daily quota cannot be recovered within an interactive report request.
    if (response.headers.get('X-RateLimit-Daily-Remaining') === '0') return response;
    const interval = Number(response.headers.get('X-RateLimit-Interval-Milliseconds'));
    const delay = Math.max(BURST_COOLDOWN_MS, Number.isFinite(interval) ? interval : 0);
    if (delay > MAX_RETRY_DELAY_MS) return response;
    cooldownUntil = Math.max(cooldownUntil, Date.now() + delay);
    if (attempt >= MAX_RETRIES) return response;

    // Next may tee a response body; cancelling one branch can wait indefinitely
    // for its unread sibling. Releasing the body must not block the retry.
    void response.body?.cancel().catch(() => undefined);
  }
}
