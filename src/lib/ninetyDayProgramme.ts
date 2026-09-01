import 'server-only';

import { DateTime } from 'luxon';

import type {
  ContentItem,
  CurrentFocus,
  MeetingSlot,
  ProgrammeMonth,
  ProgrammeWeek,
  RequiredTraining,
  SearchItem,
} from '@/components/home/types';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { loadNinetyDayCompassCourse } from '@/lib/trainingAssignments';

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
type MeetingRow = {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string | null;
  join_url: string | null;
};

export type NinetyDayProgrammePayload = {
  cycle: CycleRow;
  systems: ContentItem[];
  focus: CurrentFocus | null;
  week: ProgrammeWeek;
  meetings: MeetingSlot[];
  course: RequiredTraining | null;
  trackerMonths: ProgrammeMonth[];
  searchIndex: SearchItem[];
};

function heroUrl(client: ReturnType<typeof getAdminClient>, value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return client.storage.from('course-heroes').getPublicUrl(trimmed).data.publicUrl ?? null;
}
async function loadActiveCycle(userId: string): Promise<CycleRow | null> {
  const client = getAdminClient();
  const { data: enrollment, error: enrollmentError } = await client
    .from('ninety_day_cycle_users')
    .select('cycle_id')
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle();

  if (enrollmentError) throw new Error(`Failed to load 90-day enrollment: ${enrollmentError.message}`);
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

function cycleWeek(cycle: CycleRow): ProgrammeWeek {
  const zone = cycle.timezone || 'America/Edmonton';
  const start = DateTime.fromISO(cycle.starts_on, { zone }).startOf('day');
  const now = DateTime.now().setZone(zone).startOf('day');
  const elapsedDays = Math.max(0, Math.floor(now.diff(start, 'days').days));
  return { current: Math.min(13, Math.floor(elapsedDays / 7) + 1), total: 13 };
}

function cycleMonths(cycle: CycleRow): ProgrammeMonth[] {
  const start = DateTime.fromISO(cycle.starts_on, { zone: cycle.timezone }).startOf('month');
  return Array.from({ length: 3 }, (_, index) => {
    const month = start.plus({ months: index });
    return {
      periodStart: month.toISODate() ?? cycle.starts_on,
      label: month.toFormat('LLLL'),
    };
  });
}

async function loadNextMeeting(cycle: CycleRow, focusTitle: string | null): Promise<MeetingSlot[]> {
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
  if (!data) return [];

  const meeting = data as MeetingRow;
  const starts = DateTime.fromISO(meeting.starts_at).setZone(cycle.timezone);
  const ends = meeting.ends_at
    ? DateTime.fromISO(meeting.ends_at).setZone(cycle.timezone)
    : starts.plus({ hours: 1 });
  const cycleNow = now.setZone(cycle.timezone);
  const imminent = cycleNow >= starts.minus({ minutes: 30 }) && cycleNow <= ends;

  return [{
    id: 'weekly_group',
    kind: meeting.title || 'Weekly group call',
    startsAt: meeting.starts_at,
    whenLabel: starts.toFormat('cccc d LLLL, h:mm a'),
    relativeLabel: starts.toRelative({ base: cycleNow }) ?? '',
    joinUrl: meeting.join_url,
    bookUrl: meeting.join_url ?? '#weekly-call',
    imminent,
    prepLabel: focusTitle ? `Current system — ${focusTitle}` : null,
    prepHref: null,
    prepSubmitted: false,
    reschedulable: false,
  }];
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

  const systems: ContentItem[] = rows.map(({ node, position }) => ({
    id: `system-${node.id}`,
    title: node.title,
    typeLabel: 'System',
    metaLabel: '',
    href: node.slug ? `/library/${node.slug}` : `/library/${node.id}`,
    thumbnailUrl: heroUrl(client, node.hero_image),
    thumbIndex: position,
    categories: ['systems'],
    progressPct: progress.get(Number(node.id)) ?? null,
  }));
  const activeRow = rows.find((row) => Number(row.node_id) === Number(cycle.active_system_node_id));
  const focus: CurrentFocus | null = activeRow
    ? {
        id: `focus-${activeRow.node.id}`,
        title: activeRow.node.title,
        detail: activeRow.node.description?.trim() || 'This is the system your group is working on now.',
        guideHref: activeRow.node.slug ? `/library/${activeRow.node.slug}` : `/library/${activeRow.node.id}`,
      }
    : null;

  const [meetings, course] = await Promise.all([
    loadNextMeeting(cycle, activeRow?.node.title ?? null),
    loadNinetyDayCompassCourse(client, userId),
  ]);
  const searchIndex: SearchItem[] = [
    ...systems.map((system) => ({
      title: system.title,
      typeLabel: system.typeLabel,
      href: system.href,
    })),
    ...(course ? [{ title: course.title, typeLabel: 'Course', href: course.href }] : []),
  ];

  return {
    cycle,
    systems,
    focus,
    week: cycleWeek(cycle),
    meetings,
    course,
    trackerMonths: cycleMonths(cycle),
    searchIndex,
  };
}

/** Node entitlement used by the normal library APIs for 90-day-only users. */
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
