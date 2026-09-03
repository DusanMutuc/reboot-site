import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

type TransistorEpisodeAttributes = {
  title?: string | null;
  duration?: number | null;
  share_url?: string | null;
  media_url?: string | null;
  image_url?: string | null;
};

type SyncEpisode = {
  title: string;
  duration: number | null;
  url: string | null;
  thumbnail: string | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function validateCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = req.headers.get('authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

async function getAllEpisodes(showId: string, transistorApiKey: string): Promise<SyncEpisode[]> {
  const base = 'https://api.transistor.fm/v1/episodes';
  const perPage = 100;
  let page = 1;
  let done = false;
  const episodes: SyncEpisode[] = [];

  while (!done) {
    const url = new URL(base);
    url.searchParams.set('show_id', showId);
    url.searchParams.set('pagination[per]', String(perPage));
    url.searchParams.set('pagination[page]', String(page));
    url.searchParams.set('order', 'asc');
    url.searchParams.append('fields[episode][]', 'title');
    url.searchParams.append('fields[episode][]', 'duration');
    url.searchParams.append('fields[episode][]', 'share_url');
    url.searchParams.append('fields[episode][]', 'media_url');
    url.searchParams.append('fields[episode][]', 'image_url');

    const response = await fetch(url.toString(), {
      headers: { 'x-api-key': transistorApiKey },
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Transistor API error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as {
      data?: Array<{ attributes?: TransistorEpisodeAttributes | null }>;
      meta?: { currentPage?: number; totalPages?: number };
    };

    const pageItems = json.data ?? [];
    episodes.push(
      ...pageItems.map(({ attributes }) => ({
        title: (attributes?.title ?? '').trim() || 'Untitled',
        duration:
          typeof attributes?.duration === 'number' && Number.isFinite(attributes.duration)
            ? attributes.duration
            : null,
        url: attributes?.share_url ?? attributes?.media_url ?? null,
        thumbnail: attributes?.image_url ?? null,
      })),
    );

    const currentPage = json.meta?.currentPage ?? page;
    const totalPages = json.meta?.totalPages ?? page;
    done = currentPage >= totalPages;
    page += 1;

    await sleep(300);
  }

  return episodes;
}

async function getExistingPodcastTitlesSet(adminClient: ReturnType<typeof getAdminClient>, titles: string[]) {
  const uniqueTitles = [...new Set(titles.filter(Boolean))];
  const existingTitlesSet = new Set<string>();
  const chunkSize = 100;

  for (let index = 0; index < uniqueTitles.length; index += chunkSize) {
    const chunk = uniqueTitles.slice(index, index + chunkSize);
    const { data, error } = await adminClient
      .from('resources')
      .select('title')
      .eq('type', 'podcast')
      .in('title', chunk);

    if (error) throw error;

    for (const row of data ?? []) {
      if (row.title) existingTitlesSet.add(row.title);
    }
  }

  return existingTitlesSet;
}

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const transistorApiKey = process.env.TRANSISTOR_API_KEY;
  const transistorShowId = process.env.TRANSISTOR_SHOW_ID;

  if (!transistorApiKey || !transistorShowId) {
    return NextResponse.json(
      {
        error: 'Missing required env vars: TRANSISTOR_API_KEY and/or TRANSISTOR_SHOW_ID',
      },
      { status: 500 },
    );
  }

  const admin = getAdminClient();

  try {
    const episodes = await getAllEpisodes(transistorShowId, transistorApiKey);
    const existingTitles = await getExistingPodcastTitlesSet(
      admin,
      episodes.map((episode) => episode.title),
    );

    let upserted = 0;
    let skippedMissingUrl = 0;
    let skippedExistingTitle = 0;
    let failed = 0;

    for (const episode of episodes) {
      if (!episode.url) {
        skippedMissingUrl += 1;
        continue;
      }

      if (existingTitles.has(episode.title)) {
        skippedExistingTitle += 1;
        continue;
      }

      const { data, error } = await admin
        .from('resources')
        .upsert(
          {
            title: episode.title,
            type: 'podcast',
            url: episode.url,
            thumbnail: episode.thumbnail,
            duration: episode.duration,
            state: 'published',
            is_discoverable: true,
          },
          { onConflict: 'url' },
        )
        .select('id')
        .single();

      if (error || !data) {
        failed += 1;
        console.error(`Failed upsert for "${episode.title}":`, error?.message || 'Unknown error');
        continue;
      }

      upserted += 1;
      existingTitles.add(episode.title);
    }

    return NextResponse.json({
      ok: true,
      fetched: episodes.length,
      upserted,
      skippedMissingUrl,
      skippedExistingTitle,
      failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('Cron sync failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
