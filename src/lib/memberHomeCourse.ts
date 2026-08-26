import 'server-only';

import { adminClient } from '@/lib/courseBuilder';
import { getAvailableCourseIdsForUser } from '@/lib/courseAccess';
import { getSupabaseServer } from '@/lib/supabaseServer';

/**
 * A real course, for the required-training block on the member home.
 *
 * The rest of that page runs on placeholder data, and deliberately so — it is
 * a design surface. This one piece is live because the thing being reviewed is
 * the artwork: courses already carry a `hero_image`, and a card built to hold a
 * thumbnail cannot be judged against a grey box.
 *
 * Only identity is real. Part titles, runtimes and completion are still
 * placeholder, because per-node progress has no helper in this codebase yet
 * and inventing one belongs to a different piece of work.
 */
export type FeaturedCourse = {
  title: string;
  href: string;
  /** Public URL for `hero_image`, or null when the course has no artwork. */
  heroUrl: string | null;
};

type CourseRow = {
  id: number;
  title: string | null;
  slug: string | null;
  hero_image: string | null;
};

function resolveHeroUrl(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const { data } = adminClient.storage.from('course-heroes').getPublicUrl(trimmed);
  return data?.publicUrl ?? null;
}

/**
 * The first course this member can reach that actually has artwork, falling
 * back to the first they can reach at all. Never throws: the home page must
 * still render if course data is unavailable, so every failure returns null
 * and the caller keeps its placeholder.
 */
export async function getFeaturedCourse(): Promise<FeaturedCourse | null> {
  try {
    const supabase = getSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const courseIds = await getAvailableCourseIdsForUser(user.id);
    if (courseIds.length === 0) return null;

    const { data, error } = await adminClient
      .from('content_nodes')
      .select('id, title, slug, hero_image')
      .eq('node_type', 'course')
      .in('id', courseIds);

    if (error || !data) return null;

    const rows = data as CourseRow[];
    const usable = rows.filter((row) => row.title && row.slug);
    if (usable.length === 0) return null;

    const withArt = usable.find((row) => resolveHeroUrl(row.hero_image) !== null);
    const chosen = withArt ?? usable[0];

    return {
      title: chosen.title as string,
      href: `/courses/${chosen.slug}`,
      heroUrl: resolveHeroUrl(chosen.hero_image),
    };
  } catch {
    return null;
  }
}
