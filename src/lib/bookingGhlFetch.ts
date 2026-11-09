const REQUEST_INTERVAL_MS = 200;
const BURST_COOLDOWN_MS = 10_000;
const MAX_RETRY_DELAY_MS = 30_000;
const MAX_RETRIES = 2;

// Calendar scans and contact verification share the same GHL integration quota.
// Serialize starts only, so slow responses do not block unrelated requests.
let startQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;
let cooldownUntil = 0;

async function waitForTurn(): Promise<void> {
  const previous = startQueue;
  let release!: () => void;
  startQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    let delay: number;
    // An in-flight response can extend the cooldown while this turn is waiting.
    while ((delay = Math.max(nextRequestAt, cooldownUntil) - Date.now()) > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
  } finally {
    release();
  }
}

/** Pace the booking report's GET requests and retry temporary GHL throttling. */
export async function fetchBookingGhl(
  url: string,
  init: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    await waitForTurn();
    // Queue/cooldown time must not consume the contact request's timeout.
    const response = await fetch(url, {
      ...init,
      ...(timeoutMs === undefined ? {} : { signal: AbortSignal.timeout(timeoutMs) }),
    });
    if (response.status !== 429) return response;

    // A daily quota cannot be recovered within an interactive report request.
    if (response.headers.get('X-RateLimit-Daily-Remaining') === '0') return response;
    const interval = Number(response.headers.get('X-RateLimit-Interval-Milliseconds'));
    const delay = Math.max(BURST_COOLDOWN_MS, Number.isFinite(interval) ? interval : 0);
    if (delay > MAX_RETRY_DELAY_MS) return response;
    cooldownUntil = Math.max(cooldownUntil, Date.now() + delay);
    if (attempt >= MAX_RETRIES) return response;

    await response.body?.cancel().catch(() => undefined);
  }
}
