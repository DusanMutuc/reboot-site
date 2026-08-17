import type { StaticImageData } from 'next/image';
import podcastHero from '/public/podcast-hero.png';
import searchHero from '/public/search-hero.png';
import graph from '/public/graph.png';

/**
 * Placeholder artwork only — real items render their own `hero_image`.
 *
 * There are only three usable photographs in `public/`, so repeated cards were
 * reading as identical. Each is 2560x680, which is wide enough that cropping at
 * different points yields genuinely different-looking thumbnails — nine rather
 * than three.
 *
 * The numbered sticker graphics are deliberately excluded: as cover art they
 * read as step numbers, which is actively misleading in a browse rail.
 */
type Thumb = { src: StaticImageData; objectPosition: string };

const CROPS = ['12% 50%', '38% 50%', '64% 50%', '88% 50%'];
const SOURCES: StaticImageData[] = [searchHero, graph, podcastHero];

/** Interleaved so consecutive cards never share a source image. */
const THUMBS: Thumb[] = CROPS.flatMap((objectPosition) =>
  SOURCES.map((src) => ({ src, objectPosition })),
);

export function thumbFor(index: number): Thumb {
  const safe = ((index % THUMBS.length) + THUMBS.length) % THUMBS.length;
  return THUMBS[safe];
}

export const thumbCount = THUMBS.length;
