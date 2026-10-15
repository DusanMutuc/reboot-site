import { DateTime } from 'luxon';
import { safeCoachHomeUrl } from '@/lib/coachHomeShared';
import type { CoachHomeGroupSession } from '@/types/coachHome';

export const COACH_GROUP_CALENDAR_URL = 'https://www.addevent.com/calendar/ez616853';

function plainText(value: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? match;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  }).replace(/\s+/g, ' ').trim();
}

/**
 * The existing public REBOOT calendar expands recurring occurrences on its
 * landing page. Read that published list, including its declared IANA zone;
 * never execute markup or invent a private API/subscription identifier.
 * If AddEvent changes its markup/date format, fail explicitly and link to it.
 */
export function parsePublishedCoachGroups(html: string, now = DateTime.utc()): CoachHomeGroupSession[] {
  const timezone = html.match(/id="timezone-dropdown"[^>]*data-timezone="([^"]+)"/)?.[1];
  const listStart = html.indexOf('class="lst-t1 eventslist"');
  if (!timezone || !DateTime.now().setZone(timezone).isValid || listStart < 0) throw new Error('The group calendar format has changed.');
  const parts = html.slice(listStart).split(/<div class="row">/).slice(1);
  const localNow = now.setZone(timezone);
  const horizon = now.plus({ days: 30 });
  const sessions: CoachHomeGroupSession[] = [];
  let recognized = 0;
  for (const part of parts) {
    const eventLink = part.match(/<p class="it tit evtlink">\s*<a href="\/event\/([a-z0-9]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!eventLink) continue;
    const label = part.match(/<p class="it dat">([\s\S]*?)<\/p>/)?.[1];
    const date = label && plainText(label).match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (\d{1,2}) ([A-Za-z]+) ⋅ (\d{1,2}:\d{2}) [–-] (\d{1,2}:\d{2}) \(([^)]+)\)$/);
    if (!date) throw new Error('A group session date could not be read.');
    // The upcoming list omits years. Resolve only occurrences within the next
    // 30 days, checking the weekday too; this also handles December/January.
    let start: DateTime | null = null;
    for (const year of [localNow.year, localNow.year + 1]) {
      const candidate = DateTime.fromFormat(`${year} ${date[3]} ${date[2]} ${date[4]}`, 'yyyy LLLL d H:mm', { zone: timezone, locale: 'en' });
      if (!candidate.isValid) throw new Error('A group session date could not be read.');
      if (candidate.toFormat('cccc') === date[1] && candidate >= now.minus({ days: 1 }) && candidate < horizon) start = candidate;
    }
    recognized++;
    if (!start) continue;
    const [endHour, endMinute] = date[5].split(':').map(Number);
    let end = start.set({ hour: endHour, minute: endMinute });
    if (end <= start) end = end.plus({ days: 1 });
    if (end <= now) continue;
    const location = part.match(/<div class="it loc">[\s\S]*?<span class="lbl">([\s\S]*?)<\/span>/)?.[1];
    sessions.push({ id: `addevent:${eventLink[1]}:${start.toUTC().toISO()}`, title: plainText(eventLink[2]),
      start: start.toUTC().toISO()!, end: end.toUTC().toISO(), joinUrl: safeCoachHomeUrl(location ? plainText(location) : null),
      audience: 'REBOOT group calendar', detailsUrl: `https://www.addevent.com/event/${eventLink[1]}` });
  }
  // An unrecognized empty document must not claim there are no group sessions.
  if (!recognized) throw new Error('The upcoming group calendar could not be read.');
  return [...new Map(sessions.map((session) => [session.id, session])).values()].sort((a, b) => a.start.localeCompare(b.start));
}

export async function loadPublishedCoachGroups(): Promise<CoachHomeGroupSession[]> {
  const response = await fetch(COACH_GROUP_CALENDAR_URL, {
    // These are the public calendar's own display preferences (no login or
    // subscriber state). Pin a deterministic format across deployment regions.
    headers: { Cookie: 'usrtzid=UTC; usrtifm=24h', 'Accept-Language': 'en' },
    next: { revalidate: 300 }, redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('The published group calendar is unavailable.');
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error('The published group calendar response is too large.');
  return parsePublishedCoachGroups(html);
}
