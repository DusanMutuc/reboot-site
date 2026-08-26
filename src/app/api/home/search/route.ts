import { NextRequest, NextResponse } from 'next/server';

import type { SearchItem } from '@/components/home/types';
import { requireUser } from '@/lib/requireUser';

type ResourceSearchRow = {
  id: number;
  title: string;
  type: string;
  url: string | null;
  page_slug?: string | null;
  open_path?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  video: 'Video',
  podcast: 'Podcast',
  pdf: 'PDF',
  document: 'Document',
  audio: 'Audio',
  image: 'Image',
  link: 'Library',
};

function normalizeHref(href: string | null | undefined): string | null {
  const value = href?.trim();
  if (!value) return null;
  if (/^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith('/')) return value;
  return `/${value.replace(/^\/+/, '')}`;
}

function toSearchItem(row: ResourceSearchRow): SearchItem {
  return {
    title: row.title,
    typeLabel: TYPE_LABELS[row.type.toLowerCase()] ?? row.type,
    href:
      normalizeHref(row.open_path) ??
      (row.page_slug ? `/library/${row.page_slug}` : normalizeHref(row.url)) ??
      `/r/${row.id}`,
  };
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return NextResponse.json({ items: [] });
  if (query.length > 100) {
    return NextResponse.json({ error: 'Search query is too long.' }, { status: 400 });
  }

  const args = {
    _q: query,
    _types: null,
    _tag_ids: null,
    _duration: null,
    _date_range: null,
    _sort: 'relevance',
    _limit: 5,
    _offset: 0,
    _mode: 'balanced',
  };

  const { data, error } = await guard.supabase.rpc('search_resources_with_page', args);
  if (error) {
    console.error('[momentum-search] balanced search', error);
    return NextResponse.json({ error: 'Search is unavailable right now.' }, { status: 500 });
  }

  let rows = (data ?? []) as ResourceSearchRow[];
  if (query.length >= 3 && rows.length < 5) {
    const broad = await guard.supabase.rpc('search_resources_with_page', {
      ...args,
      _mode: 'loose',
    });
    if (!broad.error && broad.data) rows = broad.data as ResourceSearchRow[];
  }

  return NextResponse.json({ items: rows.slice(0, 5).map(toSearchItem) });
}
