import 'server-only';

import { getAdminClient } from '@/lib/supabaseAdmin';

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
  byOrigin: Record<ThumbnailOrigin, number>;
  failures: Array<{ resourceId: number | null; message: string }>;
};

const TRANSISTOR_EPISODES_URL = 'https://api.transistor.fm/v1/episodes';
const VIMEO_OEMBED_URL = 'https://vimeo.com/api/oembed.json';
const FETCH_TIMEOUT_MS = 8_000;

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

async function fetchVimeoThumbnail(resource: ResourceRow): Promise<string | null> {
  if (!isVimeoUrl(resource.url)) return null;

  const endpoint = new URL(VIMEO_OEMBED_URL);
  endpoint.searchParams.set('url', resource.url);
  endpoint.searchParams.set('width', '640');

  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as { thumbnail_url?: unknown };
  return readHttpsUrl(payload.thumbnail_url);
}

async function fetchTransistorEpisodes(): Promise<TransistorEpisode[]> {
  const apiKey = process.env.TRANSISTOR_API_KEY;
  const showId = process.env.TRANSISTOR_SHOW_ID;
  if (!apiKey || !showId) return [];

  const episodes: TransistorEpisode[] = [];
  const perPage = 100;

  const showResponse = await fetch(
    `https://api.transistor.fm/v1/shows/${encodeURIComponent(showId)}`,
    {
      headers: { Accept: 'application/json', 'x-api-key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  if (!showResponse.ok) {
    throw new Error(`Transistor show lookup returned ${showResponse.status}.`);
  }
  const showPayload = (await showResponse.json()) as {
    data?: { attributes?: { image_url?: unknown } | null } | null;
  };
  const showImageUrl = readHttpsUrl(showPayload.data?.attributes?.image_url);

  for (let page = 1; page <= 100; page += 1) {
    const endpoint = new URL(TRANSISTOR_EPISODES_URL);
    endpoint.searchParams.set('show_id', showId);
    endpoint.searchParams.set('status', 'published');
    endpoint.searchParams.set('pagination[per]', String(perPage));
    endpoint.searchParams.set('pagination[page]', String(page));
    for (const field of ['title', 'media_url', 'share_url', 'image_url']) {
      endpoint.searchParams.append('fields[episode][]', field);
    }

    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json', 'x-api-key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
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

    const currentPage = payload.meta?.currentPage ?? page;
    const totalPages = payload.meta?.totalPages ?? page;
    if (currentPage >= totalPages || (payload.data ?? []).length === 0) break;
  }

  return episodes;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
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
    const episode =
      byUrl.get(canonicalUrl(resource.url) ?? '') ??
      byTitle.get(canonicalTitle(resource.title) ?? '');
    return episode?.imageUrl
      ? [{ resourceId: resource.id, origin: 'transistor', thumbnail: episode.imageUrl }]
      : [];
  });
}

export async function syncNativeResourceThumbnails(): Promise<ResourceThumbnailSyncReport> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('resources')
    .select('id, title, type, url, thumbnail, storage_bucket, storage_path')
    .eq('state', 'published')
    .order('id', { ascending: true });

  if (error) throw new Error(error.message);

  const missing = ((data ?? []) as ResourceRow[]).filter(
    (resource) => !resource.thumbnail?.trim(),
  );
  const failures: ResourceThumbnailSyncReport['failures'] = [];
  const resolved: ResolvedThumbnail[] = [];

  missing.forEach((resource) => {
    if (resource.type === 'image' && resource.storage_bucket && resource.storage_path) {
      resolved.push({
        resourceId: resource.id,
        origin: 'stored_image',
        thumbnail: `/r/${resource.id}`,
      });
    }
  });

  const vimeoResources = missing.filter(
    (resource) => resource.type === 'video' && isVimeoUrl(resource.url),
  );
  const vimeoResults = await mapWithConcurrency<ResourceRow, ResolvedThumbnail | null>(
    vimeoResources,
    6,
    async (resource) => {
      try {
        const thumbnail = await fetchVimeoThumbnail(resource);
        return thumbnail
          ? ({ resourceId: resource.id, origin: 'vimeo', thumbnail } satisfies ResolvedThumbnail)
          : null;
      } catch (caught) {
        failures.push({
          resourceId: resource.id,
          message: caught instanceof Error ? caught.message : 'Vimeo lookup failed.',
        });
        return null;
      }
    },
  );
  resolved.push(...vimeoResults.filter((item): item is ResolvedThumbnail => item !== null));

  const podcastResources = missing.filter((resource) => resource.type === 'podcast');
  if (podcastResources.length > 0) {
    try {
      const episodes = await fetchTransistorEpisodes();
      resolved.push(...matchTransistorArtwork(podcastResources, episodes));
    } catch (caught) {
      failures.push({
        resourceId: null,
        message: caught instanceof Error ? caught.message : 'Transistor lookup failed.',
      });
    }
  }

  const uniqueResolved = Array.from(
    new Map(resolved.map((item) => [item.resourceId, item])).values(),
  );
  const updateResults = await mapWithConcurrency<ResolvedThumbnail, ResolvedThumbnail | null>(
    uniqueResolved,
    10,
    async (item) => {
      const { data: updated, error: updateError } = await admin
        .from('resources')
        .update({ thumbnail: item.thumbnail })
        .eq('id', item.resourceId)
        .is('thumbnail', null)
        .select('id')
        .maybeSingle();

      if (updateError) {
        failures.push({ resourceId: item.resourceId, message: updateError.message });
        return null;
      }
      return updated ? item : null;
    },
  );
  const updatedItems = updateResults.filter(
    (item): item is ResolvedThumbnail => item !== null,
  );
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
    byOrigin,
    failures,
  };
}
