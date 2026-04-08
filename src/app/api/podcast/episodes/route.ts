import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import type { PodcastEpisode, PodcastEpisodesResponse } from '@/types/podcast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TRANSISTOR_EPISODES_URL = 'https://api.transistor.fm/v1/episodes';
const CACHE_TTL_MS = 5 * 60 * 1000;

type TransistorEpisodeAttributes = {
  title?: string | null;
  summary?: string | null;
  formatted_summary?: string | null;
  description?: string | null;
  formatted_description?: string | null;
  duration?: number | null;
  duration_in_mmss?: string | null;
  published_at?: string | null;
  formatted_published_at?: string | null;
  number?: number | null;
  season?: number | null;
  share_url?: string | null;
  media_url?: string | null;
  image_url?: string | null;
  embed_html?: string | null;
  embed_html_dark?: string | null;
};

type TransistorEpisode = {
  id?: string | number | null;
  attributes?: TransistorEpisodeAttributes | null;
};

type TransistorEpisodesResponse = {
  data?: TransistorEpisode[];
  meta?: {
    currentPage?: number;
    totalPages?: number;
  };
};

type PodcastCache = {
  showId: string;
  expiresAt: number;
  episodes: PodcastEpisode[];
};

let cache: PodcastCache | null = null;

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const apiKey = process.env.TRANSISTOR_API_KEY;
  const showId = process.env.TRANSISTOR_SHOW_ID;

  if (!apiKey || !showId) {
    return NextResponse.json(
      { error: 'Podcast episodes are not configured.' },
      { status: 500 },
    );
  }

  try {
    const episodes = await getCachedEpisodes(showId, apiKey);
    const response: PodcastEpisodesResponse = { episodes };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load podcast episodes.';
    console.error('[podcast episodes] Transistor fetch failed', message);
    return NextResponse.json({ error: 'Failed to load podcast episodes.' }, { status: 502 });
  }
}

async function getCachedEpisodes(showId: string, apiKey: string): Promise<PodcastEpisode[]> {
  const now = Date.now();
  if (cache && cache.showId === showId && cache.expiresAt > now) {
    return cache.episodes;
  }

  const episodes = await getAllEpisodes(showId, apiKey);
  cache = {
    showId,
    expiresAt: now + CACHE_TTL_MS,
    episodes,
  };

  return episodes;
}

async function getAllEpisodes(showId: string, apiKey: string): Promise<PodcastEpisode[]> {
  const perPage = 100;
  let page = 1;
  let done = false;
  const episodes: PodcastEpisode[] = [];

  while (!done) {
    const url = new URL(TRANSISTOR_EPISODES_URL);
    url.searchParams.set('show_id', showId);
    url.searchParams.set('status', 'published');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('pagination[per]', String(perPage));
    url.searchParams.set('pagination[page]', String(page));

    for (const field of [
      'title',
      'summary',
      'formatted_summary',
      'description',
      'formatted_description',
      'duration',
      'duration_in_mmss',
      'published_at',
      'formatted_published_at',
      'number',
      'season',
      'share_url',
      'media_url',
      'image_url',
      'embed_html',
      'embed_html_dark',
    ]) {
      url.searchParams.append('fields[episode][]', field);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'x-api-key': apiKey,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Transistor API error ${response.status}: ${body.slice(0, 500)}`);
    }

    const json = (await response.json()) as TransistorEpisodesResponse;
    episodes.push(...(json.data ?? []).map(mapEpisode).filter(isPodcastEpisode));

    const currentPage = json.meta?.currentPage ?? page;
    const totalPages = json.meta?.totalPages ?? page;
    done = currentPage >= totalPages || (json.data ?? []).length === 0;
    page += 1;
  }

  return episodes;
}

function mapEpisode(episode: TransistorEpisode): PodcastEpisode | null {
  const attributes = episode.attributes;
  const id = readString(episode.id);
  if (!id || !attributes) return null;

  const title = readString(attributes.title) ?? 'Untitled episode';
  const embedHtml = readString(attributes.embed_html_dark) ?? readString(attributes.embed_html);
  const summary = readString(attributes.formatted_summary) ?? readString(attributes.summary);
  const descriptionHtml =
    readString(attributes.formatted_description) ??
    readString(attributes.description) ??
    summary;
  const durationSeconds = readFiniteNumber(attributes.duration);

  return {
    id,
    title,
    summary,
    descriptionHtml,
    durationSeconds,
    durationLabel: readString(attributes.duration_in_mmss) ?? formatDuration(durationSeconds),
    publishedAt: readString(attributes.published_at),
    publishedLabel:
      readString(attributes.formatted_published_at) ?? formatDate(attributes.published_at),
    episodeNumber: readFiniteNumber(attributes.number),
    seasonNumber: readFiniteNumber(attributes.season),
    imageUrl: readHttpsUrl(attributes.image_url),
    mediaUrl: readHttpsUrl(attributes.media_url),
    playerUrl: extractTransistorPlayerUrl(embedHtml),
    shareUrl: readHttpsUrl(attributes.share_url),
  };
}

function isPodcastEpisode(value: PodcastEpisode | null): value is PodcastEpisode {
  return value !== null;
}

function extractTransistorPlayerUrl(embedHtml: string | null): string | null {
  if (!embedHtml) return null;

  const match = embedHtml.match(/\ssrc=(["'])(.*?)\1/i);
  if (!match?.[2]) return null;

  return readTransistorShareUrl(match[2].replaceAll('&amp;', '&'));
}

function readTransistorShareUrl(value: unknown): string | null {
  const url = readHttpsUrl(value);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return parsed.hostname === 'share.transistor.fm' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function readHttpsUrl(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;

  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatDuration(totalSeconds: number | null): string | null {
  if (!totalSeconds || totalSeconds < 1) return null;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDate(value: string | null | undefined): string | null {
  const text = readString(value);
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
