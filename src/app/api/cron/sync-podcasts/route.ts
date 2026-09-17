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
  sourceId: string;
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
      data?: Array<{ id?: string | null; attributes?: TransistorEpisodeAttributes | null }>;
      meta?: { currentPage?: number; totalPages?: number };
    };

    const pageItems = json.data ?? [];
    episodes.push(
      ...pageItems.flatMap(({ id, attributes }) => id ? [{
        sourceId: id,
        title: (attributes?.title ?? '').trim() || 'Untitled',
        duration:
          typeof attributes?.duration === 'number' && Number.isFinite(attributes.duration)
            ? attributes.duration
            : null,
        url: attributes?.share_url ?? attributes?.media_url ?? null,
        thumbnail: attributes?.image_url ?? null,
      }] : []),
    );

    const currentPage = json.meta?.currentPage ?? page;
    const totalPages = json.meta?.totalPages ?? page;
    done = currentPage >= totalPages;
    page += 1;

    await sleep(300);
  }

  return episodes;
}

type ExistingPodcast = {
  id: number;
  title: string;
  source: string | null;
  source_id: string | null;
  metadata: Record<string, unknown> | null;
};

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
    const { data: existingData, error: existingError } = await admin
      .from('resources')
      .select('id,title,source,source_id,metadata')
      .eq('type', 'podcast');
    if (existingError) throw existingError;

    const existing = (existingData ?? []) as ExistingPodcast[];
    const sourcePrefix = `transistor:${transistorShowId}:`;
    const bySourceId = new Map(
      existing
        .filter((resource) => resource.source === 'rss' && resource.source_id)
        .map((resource) => [resource.source_id!, resource]),
    );
    const byTitle = new Map(existing.map((resource) => [resource.title.toLowerCase(), resource]));
    const seenSourceIds = new Set<string>();

    let upserted = 0;
    let skippedMissingUrl = 0;
    let adoptedExisting = 0;
    let archived = 0;
    let failed = 0;

    for (const episode of episodes) {
      if (!episode.url) {
        skippedMissingUrl += 1;
        continue;
      }

      const sourceId = `${sourcePrefix}${episode.sourceId}`;
      seenSourceIds.add(sourceId);
      const stableMatch = bySourceId.get(sourceId);
      const titleMatch = byTitle.get(episode.title.toLowerCase());
      const adoptableTitleMatch =
        !stableMatch && titleMatch && !titleMatch.source_id ? titleMatch : null;

      const payload = {
        title: episode.title,
        type: 'podcast' as const,
        url: episode.url,
        thumbnail: episode.thumbnail,
        duration: episode.duration,
        source: 'rss' as const,
        source_id: sourceId,
        metadata: {
          provider: 'transistor',
          show_id: transistorShowId,
          episode_id: episode.sourceId,
        },
        state: 'published' as const,
        is_discoverable: true,
        // Browse is a separate reviewed decision. Omit is_browsable so updates
        // preserve the admin's choice and new episodes default to search only.
      };

      const write = stableMatch || adoptableTitleMatch
        ? admin
            .from('resources')
            .update(payload)
            .eq('id', (stableMatch ?? adoptableTitleMatch)!.id)
            .select('id,title,source,source_id,metadata')
            .single()
        : admin
            .from('resources')
            .upsert(payload, { onConflict: 'source,source_id' })
            .select('id,title,source,source_id,metadata')
            .single();

      const { data, error } = await write;

      if (error || !data) {
        failed += 1;
        console.error(`Failed upsert for "${episode.title}":`, error?.message || 'Unknown error');
        continue;
      }

      upserted += 1;
      if (adoptableTitleMatch) adoptedExisting += 1;
      const saved = data as ExistingPodcast;
      bySourceId.set(sourceId, saved);
      byTitle.set(episode.title.toLowerCase(), saved);
    }

    const missingIds = existing
      .filter((resource) => {
        const managedBySourceId = resource.source_id?.startsWith(sourcePrefix) ?? false;
        const managedByMetadata =
          resource.metadata?.provider === 'transistor' &&
          resource.metadata?.show_id === transistorShowId;
        return (managedBySourceId || managedByMetadata) &&
          (!resource.source_id || !seenSourceIds.has(resource.source_id));
      })
      .map((resource) => resource.id);

    if (missingIds.length > 0) {
      const { error: archiveError } = await admin
        .from('resources')
        .update({ state: 'archived' })
        .in('id', missingIds);
      if (archiveError) throw archiveError;
      archived = missingIds.length;
    }

    return NextResponse.json({
      ok: true,
      fetched: episodes.length,
      upserted,
      skippedMissingUrl,
      adoptedExisting,
      archived,
      failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('Cron sync failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
