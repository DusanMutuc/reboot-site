import 'server-only';

import { DateTime } from 'luxon';

import { getAdminClient } from '@/lib/supabaseAdmin';

type CycleRow = {
  id: number;
  name: string;
  starts_on: string;
  ends_on: string;
  timezone: string;
  status: string;
  active_system_node_id: number | null;
};

type SystemLinkRow = { node_id: number; position: number };
type SystemNodeRow = {
  id: number;
  title: string;
  slug: string | null;
  description: string | null;
  hero_image: string | null;
};

export type NinetyDaySystem = {
  id: number;
  position: number;
  title: string;
  description: string | null;
  href: string;
  heroUrl: string | null;
  progressPct: number | null;
  isActive: boolean;
};

export type NinetyDayMeeting = {
  id: number;
  title: string;
  startsAt: string;
  whenLabel: string;
  relativeLabel: string;
  joinUrl: string | null;
  imminent: boolean;
};

export type NinetyDayProgrammePayload = {
  cycle: CycleRow;
  week: { current: number; total: 13 };
  systems: NinetyDaySystem[];
  currentSystem: NinetyDaySystem | null;
  nextMeeting: NinetyDayMeeting | null;
  course: {
    title: string;
    description: string | null;
    href: '/courses/set-your-compass';
    heroUrl: string | null;
  };
};

function resolveHeroUrl(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return getAdminClient().storage.from('course-heroes').getPublicUrl(trimmed).data.publicUrl ?? null;
}

async function loadActiveCycle(userId: string): Promise<CycleRow | null> {
  const client = getAdminClient();
  const { data: enrollment, error: enrollmentError } = await client
    .from('ninety_day_cycle_users')
    .select('cycle_id')
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle();

  if (enrollmentError) {
    throw new Error(`Failed to load 90-day enrollment: ${enrollmentError.message}`);
  }
  if (!enrollment) return null;

  const { data: cycle, error: cycleError } = await client
    .from('ninety_day_cycles')
    .select('id, name, starts_on, ends_on, timezone, status, active_system_node_id')
    .eq('id', enrollment.cycle_id)
    .eq('status', 'active')
    .maybeSingle();

  if (cycleError) throw new Error(`Failed to load active 90-day cycle: ${cycleError.message}`);
  return (cycle as CycleRow | null) ?? null;
}

async function loadSystemRows(cycleId: number): Promise<Array<SystemLinkRow & { node: SystemNodeRow }>> {
  const client = getAdminClient();
  const { data: links, error: linkError } = await client
    .from('ninety_day_cycle_systems')
    .select('node_id, position')
    .eq('cycle_id', cycleId)
    .order('position');

  if (linkError) throw new Error(`Failed to load 90-day systems: ${linkError.message}`);
  const linkRows = (links ?? []) as SystemLinkRow[];
  if (linkRows.length === 0) return [];

  const { data: nodes, error: nodeError } = await client
    .from('content_nodes')
    .select('id, title, slug, description, hero_image')
    .in('id', linkRows.map((link) => link.node_id));

  if (nodeError) throw new Error(`Failed to load 90-day system content: ${nodeError.message}`);
  const nodeMap = new Map(((nodes ?? []) as SystemNodeRow[]).map((node) => [Number(node.id), node]));

  return linkRows.flatMap((link) => {
    const node = nodeMap.get(Number(link.node_id));
    return node ? [{ ...link, node }] : [];
  });
}

function cycleWeek(cycle: CycleRow): { current: number; total: 13 } {
  const zone = cycle.timezone || 'America/Edmonton';
  const start = DateTime.fromISO(cycle.starts_on, { zone }).startOf('day');
  const now = DateTime.now().setZone(zone).startOf('day');
  const elapsedDays = Math.max(0, Math.floor(now.diff(start, 'days').days));
  return { current: Math.min(13, Math.floor(elapsedDays / 7) + 1), total: 13 };
}

async function loadNextMeeting(cycle: CycleRow): Promise<NinetyDayMeeting | null> {
  const client = getAdminClient();
  const now = DateTime.now();
  const oldestVisible = now.minus({ hours: 2 }).toUTC().toISO();
  const { data, error } = await client
    .from('ninety_day_cycle_meetings')
    .select('id, title, starts_at, ends_at, join_url')
    .eq('cycle_id', cycle.id)
    .gte('starts_at', oldestVisible)
    .order('starts_at')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load 90-day meeting: ${error.message}`);
  if (!data) return null;

  const starts = DateTime.fromISO(data.starts_at).setZone(cycle.timezone);
  const ends = data.ends_at
    ? DateTime.fromISO(data.ends_at).setZone(cycle.timezone)
    : starts.plus({ hours: 1 });
  const localNow = now.setZone(cycle.timezone);

  return {
    id: Number(data.id),
    title: data.title || 'Weekly group call',
    startsAt: data.starts_at,
    whenLabel: starts.toFormat('cccc d LLLL, h:mm a'),
    relativeLabel: starts.toRelative({ base: localNow }) ?? '',
    joinUrl: data.join_url,
    imminent: localNow >= starts.minus({ minutes: 30 }) && localNow <= ends,
  };
}

export async function loadNinetyDayProgramme(
  userId: string,
): Promise<NinetyDayProgrammePayload | null> {
  const client = getAdminClient();
  const cycle = await loadActiveCycle(userId);
  if (!cycle) return null;

  const rows = await loadSystemRows(cycle.id);
  const nodeIds = rows.map((row) => row.node_id);
  const { data: progressRows, error: progressError } = nodeIds.length > 0
    ? await client
        .from('user_node_progress')
        .select('node_id, status')
        .eq('user_id', userId)
        .in('node_id', nodeIds)
    : { data: [], error: null };

  if (progressError) throw new Error(`Failed to load 90-day progress: ${progressError.message}`);
  const progress = new Map(
    (progressRows ?? []).map((row) => [
      Number(row.node_id),
      row.status === 'completed' ? 100 : row.status === 'in_progress' ? 40 : null,
    ]),
  );

  const systems: NinetyDaySystem[] = rows.map(({ node, position }) => ({
    id: Number(node.id),
    position,
    title: node.title,
    description: node.description?.trim() || null,
    href: node.slug ? `/library/${node.slug}` : `/library/${node.id}`,
    heroUrl: resolveHeroUrl(node.hero_image),
    progressPct: progress.get(Number(node.id)) ?? null,
    isActive: Number(node.id) === Number(cycle.active_system_node_id),
  }));

  const { data: compass, error: compassError } = await client
    .from('content_nodes')
    .select('title, description, hero_image')
    .eq('node_type', 'course')
    .eq('state', 'published')
    .eq('slug', 'set-your-compass')
    .maybeSingle();
  if (compassError) throw new Error(`Failed to load Set Your Compass: ${compassError.message}`);

  return {
    cycle,
    week: cycleWeek(cycle),
    systems,
    currentSystem: systems.find((system) => system.isActive) ?? null,
    nextMeeting: await loadNextMeeting(cycle),
    course: {
      title: compass?.title?.trim() || 'Set Your Compass',
      description: compass?.description?.trim() || null,
      href: '/courses/set-your-compass',
      heroUrl: resolveHeroUrl(compass?.hero_image ?? null),
    },
  };
}

/** The eight cycle systems and their descendants form the complete library entitlement. */
export async function getNinetyDayAccessibleNodeIds(userId: string): Promise<Set<number>> {
  const cycle = await loadActiveCycle(userId);
  if (!cycle) return new Set();

  const client = getAdminClient();
  const rows = await loadSystemRows(cycle.id);
  const allowed = new Set(rows.map((row) => Number(row.node_id)));
  let frontier = Array.from(allowed);

  while (frontier.length > 0) {
    const { data, error } = await client
      .from('node_children')
      .select('child_id')
      .in('parent_id', frontier);
    if (error) throw new Error(`Failed to expand 90-day system access: ${error.message}`);

    const next: number[] = [];
    for (const row of data ?? []) {
      const childId = Number(row.child_id);
      if (allowed.has(childId)) continue;
      allowed.add(childId);
      next.push(childId);
    }
    frontier = next;
  }

  return allowed;
}
