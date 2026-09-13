import type { SupabaseClient } from '@supabase/supabase-js';

export type MemberPause = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  reason: string | null;
};

const CHUNK_SIZE = 200;

export async function loadMemberPauses(
  client: SupabaseClient,
  userIds: string[],
  activeOnly = false,
): Promise<Map<string, MemberPause[]>> {
  const result = new Map<string, MemberPause[]>();
  const ids = Array.from(new Set(userIds));

  for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
    let query = client
      .from('member_pauses')
      .select('id, user_id, started_at, ended_at, reason')
      .in('user_id', ids.slice(index, index + CHUNK_SIZE))
      .order('started_at', { ascending: false });
    if (activeOnly) query = query.is('ended_at', null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    for (const pause of (data ?? []) as MemberPause[]) {
      result.set(pause.user_id, [...(result.get(pause.user_id) ?? []), pause]);
    }
  }

  return result;
}

export function activePause(pauses: MemberPause[] | undefined): MemberPause | null {
  return pauses?.find((pause) => pause.ended_at === null) ?? null;
}

export function isMeetingDatePaused(date: string, pauses: MemberPause[] | undefined): boolean {
  return pauses?.some((pause) =>
    date >= pause.started_at.slice(0, 10) &&
    (pause.ended_at === null || date <= pause.ended_at.slice(0, 10))
  ) ?? false;
}

// A partnership's booking clock stops only while every member is paused.
export function activeDaysSinceForGroup(
  startMs: number,
  endMs: number,
  pauseHistories: MemberPause[][],
): number {
  if (pauseHistories.length === 0 || endMs <= startMs) {
    return Math.max(0, Math.floor((endMs - startMs) / 86_400_000));
  }

  let sharedIntervals = [{ start: startMs, end: endMs }];
  for (const history of pauseHistories) {
    sharedIntervals = sharedIntervals.flatMap((interval) => history.flatMap((pause) => {
      const pauseStart = Date.parse(pause.started_at);
      const pauseEnd = pause.ended_at ? Date.parse(pause.ended_at) : endMs;
      if (!Number.isFinite(pauseStart) || !Number.isFinite(pauseEnd)) return [];
      const start = Math.max(interval.start, pauseStart);
      const end = Math.min(interval.end, pauseEnd);
      return end > start ? [{ start, end }] : [];
    }));
    if (sharedIntervals.length === 0) break;
  }
  const pausedMs = sharedIntervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  return Math.max(0, Math.floor((endMs - startMs - pausedMs) / 86_400_000));
}
