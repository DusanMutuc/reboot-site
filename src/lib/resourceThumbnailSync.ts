import type { SupabaseClient } from '@supabase/supabase-js';

type ResourceRow = {
  id: number;
  title: string;
  type: string;
  url: string;
  thumbnail: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
};

type TransistorEpisode = {
  id: string;
  title: string;
  mediaUrl: string | null;
  shareUrl: string | null;
  imageUrl: string | null;
};

type ThumbnailOrigin = 'stored_image' | 'transistor' | 'vimeo';

type ResolvedThumbnail = {
  resourceId: number;
  origin: ThumbnailOrigin;
  thumbnail: string;
};

export type ResourceThumbnailSyncReport = {
  examined: number;
  updated: number;
  unresolved: number;
  budgetExhausted: boolean;
  byOrigin: Record<ThumbnailOrigin, number>;
  failures: Array<{ resourceId: number | null; message: string }>;
};

const TRANSISTOR_EPISODES_URL = 'https://api.transistor.fm/v1/episodes';
const VIMEO_OEMBED_URL = 'https://vimeo.com/api/oembed.json';
const FETCH_TIMEOUT_MS = 8_000;
const RESOURCE_PAGE_SIZE = 500;

/** The server route supplies credentials; tests can supply isolated providers. */
type ThumbnailSyncOptions = {
  fetch?: typeof fetch;
  transistorApiKey?: string;
  transistorShowId?: string;
  maxDurationMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

type WorkBudget = {
  hasTime: () => boolean;
  requestTimeoutMs: () => number;
  remainingMs: () => number;
};

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readHttpsUrl(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;

  try {
    const parsed = new URL(text);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function canonicalUrl(value: string | null | undefined): string | null {
  const text = readString(value);
  if (!text) return null;

  try {
    const parsed = new URL(text);
    parsed.hash = '';
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return text.replace(/\/$/, '').toLowerCase();
  }
}

function canonicalTitle(value: string | null | undefined): string | null {
  const text = readString(value);
  return text ? text.replace(/\s+/g, ' ').toLowerCase() : null;
}

function isVimeoUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'vimeo.com' || hostname.endsWith('.vimeo.com');
  } catch {
    return false;
  }
}

async function fetchVimeoThumbnail(
  resource: ResourceRow,
  fetcher: typeof fetch,
  budget: WorkBudget,
): Promise<string | null> {
  if (!isVimeoUrl(resource.url)) return null;

  const endpoint = new URL(VIMEO_OEMBED_URL);
  endpoint.searchParams.set('url', resource.url);
  endpoint.searchParams.set('width', '640');

  const response = await fetcher(endpoint, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(budget.requestTimeoutMs()),
  });
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Vimeo returned ${response.status}.`);

  const payload = (await response.json()) as { thumbnail_url?: unknown };
  return readHttpsUrl(payload.thumbnail_url);
}

async function visitTransistorEpisodes(
  options: ThumbnailSyncOptions,
  budget: WorkBudget,
  onPage: (episodes: TransistorEpisode[]) => Promise<void>,
): Promise<boolean> {
  const apiKey = options.transistorApiKey;
  const showId = options.transistorShowId;
  const fetcher = options.fetch ?? fetch;
  if (!apiKey || !showId || !budget.hasTime()) return false;

  const perPage = 100;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  async function requestTransistor(endpoint: URL | string): Promise<Response> {
    for (let retry = 0; ; retry += 1) {
      const response = await fetcher(endpoint, {
        headers: { Accept: 'application/json', 'x-api-key': apiKey! },
        cache: 'no-store',
        signal: AbortSignal.timeout(budget.requestTimeoutMs()),
      });
      if (response.status !== 429 || retry >= 2) return response;

      // Transistor allows ten requests per ten seconds. Honor its retry
      // advice, with bounded retries and no wait beyond this run's budget.
      const retryAfter = response.headers.get('retry-after');
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const dateDelay = retryAfter === null ? NaN : Date.parse(retryAfter) - now();
      const delay = Math.max(1_000, Number.isFinite(seconds)
        ? seconds * 1_000
        : Number.isFinite(dateDelay) ? dateDelay : 10_000);
      if (delay >= budget.remainingMs()) return response;
      await sleep(delay);
      if (!budget.hasTime()) return response;
    }
  }

  const showResponse = await requestTransistor(
    `https://api.transistor.fm/v1/shows/${encodeURIComponent(showId)}`,
  );
  if (!showResponse.ok) {
    throw new Error(`Transistor show lookup returned ${showResponse.status}.`);
  }
  const showPayload = (await showResponse.json()) as {
    data?: { attributes?: { image_url?: unknown } | null } | null;
  };
  const showImageUrl = readHttpsUrl(showPayload.data?.attributes?.image_url);

  for (let page = 1; page <= 100 && budget.hasTime(); page += 1) {
    const endpoint = new URL(TRANSISTOR_EPISODES_URL);
    endpoint.searchParams.set('show_id', showId);
    endpoint.searchParams.set('status', 'published');
    endpoint.searchParams.set('pagination[per]', String(perPage));
    endpoint.searchParams.set('pagination[page]', String(page));
    for (const field of ['title', 'media_url', 'share_url', 'image_url']) {
      endpoint.searchParams.append('fields[episode][]', field);
    }

    const response = await requestTransistor(endpoint);
    if (!response.ok) {
      throw new Error(`Transistor returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      data?: Array<{
        id?: unknown;
        attributes?: {
          title?: unknown;
          media_url?: unknown;
          share_url?: unknown;
          image_url?: unknown;
        } | null;
      }>;
      meta?: { currentPage?: number; totalPages?: number };
    };

    const episodes: TransistorEpisode[] = [];
    for (const episode of payload.data ?? []) {
      const id = readString(episode.id);
      const title = readString(episode.attributes?.title);
      if (!id || !title) continue;

      episodes.push({
        id,
        title,
        mediaUrl: readHttpsUrl(episode.attributes?.media_url),
        shareUrl: readHttpsUrl(episode.attributes?.share_url),
        imageUrl: readHttpsUrl(episode.attributes?.image_url) ?? showImageUrl,
      });
    }

    // Persist each completed page before another request can fail or time out.
    await onPage(episodes);
    const currentPage = payload.meta?.currentPage ?? page;
    const totalPages = payload.meta?.totalPages ?? page;
    if (currentPage >= totalPages) return true;
    if ((payload.data ?? []).length === 0) return false;
  }
  return false;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
  shouldContinue: () => boolean = () => true,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length && shouldContinue()) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function matchTransistorArtwork(
  resources: ResourceRow[],
  episodes: TransistorEpisode[],
  matchBy: 'url' | 'title',
): ResolvedThumbnail[] {
  const byUrl = new Map<string, TransistorEpisode>();
  const byTitle = new Map<string, TransistorEpisode>();

  episodes.forEach((episode) => {
    const titleKey = canonicalTitle(episode.title);
    if (titleKey && !byTitle.has(titleKey)) byTitle.set(titleKey, episode);

    [episode.mediaUrl, episode.shareUrl].forEach((url) => {
      const urlKey = canonicalUrl(url);
      if (urlKey) byUrl.set(urlKey, episode);
    });
  });

  return resources.flatMap((resource) => {
    const episode = matchBy === 'url'
      ? byUrl.get(canonicalUrl(resource.url) ?? '')
      : byTitle.get(canonicalTitle(resource.title) ?? '');
    return episode?.imageUrl
      ? [{ resourceId: resource.id, origin: 'transistor', thumbnail: episode.imageUrl }]
      : [];
  });
}

async function loadPublishedResources(admin: SupabaseClient): Promise<ResourceRow[]> {
  const resources: ResourceRow[] = [];
  let afterId: number | null = null;

  // Keyset pagination remains correct if publication changes during the scan.
  // Continue until empty: the database may cap responses below our page size.
  for (;;) {
    let query = admin
      .from('resources')
      .select('id, title, type, url, thumbnail, storage_bucket, storage_path')
      .eq('state', 'published')
      .order('id', { ascending: true })
      .limit(RESOURCE_PAGE_SIZE);
    if (afterId !== null) query = query.gt('id', afterId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const page = (data ?? []) as ResourceRow[];
    if (page.length === 0) break;
    resources.push(...page);
    afterId = page[page.length - 1].id;
  }

  return resources;
}

export async function syncNativeResourceThumbnails(
  admin: SupabaseClient,
  options: ThumbnailSyncOptions = {},
): Promise<ResourceThumbnailSyncReport> {
  const now = options.now ?? Date.now;
  // The route allows 120 seconds. Stop scheduling at 90 seconds and leave
  // headroom for in-flight requests and their conditional database writes.
  const deadline = now() + (options.maxDurationMs ?? 90_000);
  const budget: WorkBudget = {
    hasTime: () => now() < deadline,
    requestTimeoutMs: () => Math.max(1, Math.min(FETCH_TIMEOUT_MS, deadline - now())),
    remainingMs: () => Math.max(0, deadline - now()),
  };
  const resources = await loadPublishedResources(admin);
  const missing = resources.filter((resource) => !resource.thumbnail?.trim());
  const originalResources = new Map(missing.map((resource) => [resource.id, resource]));
  const fetcher = options.fetch ?? fetch;
  const failures: ResourceThumbnailSyncReport['failures'] = [];
  const updatedItems: ResolvedThumbnail[] = [];

  async function saveThumbnail(item: ResolvedThumbnail): Promise<void> {
    const original = originalResources.get(item.resourceId);
    if (!original) return;
    let update = admin
      .from('resources')
      .update({ thumbnail: item.thumbnail })
      .eq('id', item.resourceId)
      .eq('state', 'published')
      .eq('type', original.type)
      .eq('url', original.url)
      .eq('title', original.title);
    for (const field of ['storage_bucket', 'storage_path'] as const) {
      update = original[field] === null
        ? update.is(field, null)
        : update.eq(field, original[field]);
    }
    // Match the exact value observed, including blank strings. An admin's
    // newly selected image or changed resource identity wins the race.
    update = original.thumbnail === null
      ? update.is('thumbnail', null)
      : update.eq('thumbnail', original.thumbnail);
    const { data: updated, error: updateError } = await update.select('id').maybeSingle();

    if (updateError) {
      failures.push({ resourceId: item.resourceId, message: updateError.message });
    } else if (updated) {
      updatedItems.push(item);
    }
  }

  // Cheap, independent images must make progress even when remote providers
  // are slow or unavailable. Completed writes disappear from the next run.
  const storedImages = missing.filter(
    (resource) => resource.type === 'image' && resource.storage_bucket && resource.storage_path,
  );
  await mapWithConcurrency(storedImages, 10, async (resource) => {
    await saveThumbnail({
      resourceId: resource.id,
      origin: 'stored_image',
      thumbnail: `/r/${resource.id}`,
    });
  }, budget.hasTime);

  const vimeoResources = missing.filter(
    (resource) => resource.type === 'video' && isVimeoUrl(resource.url),
  );
  await mapWithConcurrency(vimeoResources, 6, async (resource) => {
    try {
      const thumbnail = await fetchVimeoThumbnail(resource, fetcher, budget);
      if (thumbnail) {
        // Write as soon as this result arrives; do not wait for slower videos.
        await saveThumbnail({ resourceId: resource.id, origin: 'vimeo', thumbnail });
      }
    } catch (caught) {
      failures.push({
        resourceId: resource.id,
        message: caught instanceof Error ? caught.message : 'Vimeo lookup failed.',
      });
    }
  }, budget.hasTime);

  const podcastResources = missing.filter((resource) => resource.type === 'podcast');
  if (podcastResources.length > 0 && budget.hasTime()) {
    try {
      const exactMatchIds = new Set<number>();
      const titleCandidates = new Map<number, ResolvedThumbnail>();
      const complete = await visitTransistorEpisodes(options, budget, async (episodes) => {
        const episodeUrls = new Set(episodes.flatMap((episode) => [
          canonicalUrl(episode.mediaUrl), canonicalUrl(episode.shareUrl),
        ]).filter((url): url is string => url !== null));
        for (const resource of podcastResources) {
          const resourceUrl = canonicalUrl(resource.url);
          if (resourceUrl && episodeUrls.has(resourceUrl)) exactMatchIds.add(resource.id);
        }
        // An exact episode without artwork still rules out another episode's
        // same-title image as a fallback.
        const exactMatches = matchTransistorArtwork(podcastResources, episodes, 'url');
        await mapWithConcurrency(exactMatches, 10, saveThumbnail);

        for (const item of matchTransistorArtwork(podcastResources, episodes, 'title')) {
          if (!titleCandidates.has(item.resourceId)) titleCandidates.set(item.resourceId, item);
        }
      });
      // A title on an early page must never beat the exact URL on a later page.
      // Incomplete scans cannot establish that no exact URL exists.
      if (complete) {
        const fallback = [...titleCandidates.values()]
          .filter((item) => !exactMatchIds.has(item.resourceId));
        await mapWithConcurrency(fallback, 10, saveThumbnail, budget.hasTime);
      }
    } catch (caught) {
      failures.push({
        resourceId: null,
        message: caught instanceof Error ? caught.message : 'Transistor lookup failed.',
      });
    }
  }

  const byOrigin: ResourceThumbnailSyncReport['byOrigin'] = {
    stored_image: 0,
    transistor: 0,
    vimeo: 0,
  };
  updatedItems.forEach((item) => {
    byOrigin[item.origin] += 1;
  });

  return {
    examined: missing.length,
    updated: updatedItems.length,
    unresolved: Math.max(0, missing.length - updatedItems.length),
    budgetExhausted: !budget.hasTime(),
    byOrigin,
    failures,
  };
}
