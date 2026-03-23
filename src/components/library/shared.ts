'use client';

import { supabase } from '@/lib/supabaseClient';
import type {
  LibraryChildRow,
  LibraryDetailResponse,
  LibraryScope,
  LibrarySidebarItem,
} from '@/types/library';

const HERO_BUCKET = 'course-heroes';

export type {
  LibraryChildRow,
  LibraryDetailNode,
  LibraryNodeRow,
  LibraryScope,
  LibrarySidebarItem,
} from '@/types/library';

export function resolveLibraryHeroSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const { data } = supabase.storage.from(HERO_BUCKET).getPublicUrl(trimmed.replace(/^\/+/, ''));
  return data?.publicUrl ?? null;
}

async function fetchLibraryJson<T>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? fallback);
  }

  return json;
}

export async function fetchLibraryChildren(scope: LibraryScope): Promise<LibraryChildRow[]> {
  const data = await fetchLibraryJson<{ items: LibraryChildRow[] }>(
    `/api/library/collection?scope=${encodeURIComponent(scope)}`,
    'Failed to load Library items',
  );
  return data.items ?? [];
}

export async function fetchLibrarySidebarItems(scope: LibraryScope): Promise<LibrarySidebarItem[]> {
  const data = await fetchLibraryJson<{ items: LibrarySidebarItem[] }>(
    `/api/library/sidebar?scope=${encodeURIComponent(scope)}`,
    'Failed to load Library items',
  );

  return (data.items ?? []).map((item) => ({
    ...item,
    hero_image: resolveLibraryHeroSrc(item.hero_image) ?? undefined,
    children: item.children?.map((child) => ({
      ...child,
      hero_image: resolveLibraryHeroSrc(child.hero_image) ?? undefined,
    })),
  }));
}

export async function resolveLibrarySlugFromNodeId(scope: LibraryScope, id: number): Promise<string | null> {
  const data = await fetchLibraryJson<{ slug: string | null }>(
    `/api/library/slug?scope=${encodeURIComponent(scope)}&id=${encodeURIComponent(String(id))}`,
    'Failed to resolve Library item',
  );

  return data.slug ?? null;
}

export async function fetchLibraryDetailData(
  scope: LibraryScope,
  identifier: string,
): Promise<LibraryDetailResponse> {
  const isNumericId = /^\d+$/.test(identifier);
  const query = isNumericId
    ? `scope=${encodeURIComponent(scope)}&id=${encodeURIComponent(identifier)}`
    : `scope=${encodeURIComponent(scope)}&slug=${encodeURIComponent(identifier)}`;

  return fetchLibraryJson<LibraryDetailResponse>(
    `/api/library/detail?${query}`,
    'Failed to load Library detail',
  );
}
