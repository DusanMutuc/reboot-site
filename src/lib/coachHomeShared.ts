import { DateTime } from 'luxon';
import type { CoachHomeMeeting } from '@/types/coachHome';

export type CoachHomeRange = {
  timezone: string;
  weekStart: string;
  weekEnd: string;
  startMs: number;
  endMs: number;
};

export type CoachCalendarEvent = {
  id: string;
  kind: CoachHomeMeeting['kind'];
  start: string;
  end: string | null;
  contactId: string | null;
  joinUrl: string | null;
};

export function coachHomeRange(timezone: string, week?: string | null, now = DateTime.utc()): CoachHomeRange {
  if (!DateTime.now().setZone(timezone).isValid) throw new Error('Choose a valid timezone.');
  const date = week ? DateTime.fromISO(week, { zone: timezone }) : now.setZone(timezone);
  if (!date.isValid || (week && !/^\d{4}-\d{2}-\d{2}$/.test(week))) throw new Error('Choose a valid week.');
  const start = date.startOf('week');
  const end = start.plus({ weeks: 1 });
  return { timezone, weekStart: start.toISODate()!, weekEnd: end.toISODate()!, startMs: start.toMillis(), endMs: end.toMillis() };
}

export function safeCoachHomeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function iso(value: unknown): string | null {
  const parsed = typeof value === 'number' ? DateTime.fromMillis(value)
    : typeof value === 'string' && /^\d{13}$/.test(value) ? DateTime.fromMillis(Number(value))
    : typeof value === 'string' ? DateTime.fromISO(value, { setZone: true }) : null;
  return parsed?.isValid ? parsed.toUTC().toISO() : null;
}

export function coachMeetingKind(title: unknown): CoachHomeMeeting['kind'] | null {
  if (typeof title !== 'string' || /\b(group|webinar|workshop)\b/i.test(title)) return null;
  if (/\b(business\s+(review|audit)|m2\s+meeting|momentum\s+(call|meeting))\b/i.test(title)) return 'business_review';
  if (/\bimplementation\s+(meeting|call)\b/i.test(title)) return 'implementation';
  return null;
}

/** Strict payload validation prevents a failed upstream response looking like an empty calendar. */
export function normalizeCoachCalendar(payload: unknown, range: CoachHomeRange): CoachCalendarEvent[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  const events = Array.isArray(payload) ? payload : record?.events ?? record?.appointments;
  if (!Array.isArray(events)) throw new Error('The calendar response was incomplete.');
  const byId = new Map<string, { event: Record<string, unknown>; modified: number; excluded: boolean }>();
  for (const item of events) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('The calendar response was incomplete.');
    const event = item as Record<string, unknown>;
    const id = String(event.id ?? event._id ?? '').trim();
    if (!id) continue;
    const status = String(event.appointmentStatus ?? event.status ?? '').toLowerCase().replace(/[\s_-]+/g, '');
    const excluded = event.deleted === true || ['cancelled', 'canceled', 'deleted', 'invalid', 'noshow'].includes(status);
    const modified = Date.parse(String(event.updatedAt ?? event.dateUpdated ?? '')) || 0;
    const previous = byId.get(id);
    // Prefer the most recent version; without timestamps cancellation wins.
    if (!previous || modified > previous.modified || (modified === previous.modified && excluded)) {
      byId.set(id, { event, modified, excluded });
    }
  }
  return [...byId].flatMap<CoachCalendarEvent>(([id, { event, excluded }]) => {
    const kind = coachMeetingKind(event.title ?? event.name);
    const start = iso(event.startTime ?? event.start ?? event.from);
    if (excluded || !kind || !start || Date.parse(start) < range.startMs || Date.parse(start) >= range.endMs) return [];
    const contact = event.contact && typeof event.contact === 'object' ? event.contact as Record<string, unknown> : null;
    return [{ id, kind, start, end: iso(event.endTime ?? event.end ?? event.to),
      contactId: text(event.contactId) ?? text(contact?.id),
      joinUrl: safeCoachHomeUrl(event.meetingLocation) ?? safeCoachHomeUrl(event.address) ?? safeCoachHomeUrl(event.location),
    }];
  }).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}

/** IDs are authoritative; an ambiguous shared identity must never select the wrong workspace. */
export function matchCoachHomeMember(
  contactId: string | null,
  members: Array<{ id: string; contactIds: string[] }>,
): string | null {
  if (!contactId) return null;
  const direct = members.filter((member) => member.contactIds.includes(contactId));
  return direct.length === 1 ? direct[0].id : null;
}

export function coachWorkspaceHref(memberId?: string | null, kind?: CoachHomeMeeting['kind'], exact?: {
  noteId?: number | null; meetingId?: number | null; reviewId?: number | null;
}): string {
  if (!memberId) return '/coach/students-overview';
  const params = new URLSearchParams({ userId: memberId, tab: kind === 'business_review' ? 'audit' : 'notes' });
  if (kind === 'business_review' && exact?.reviewId) params.set('reviewId', String(exact.reviewId));
  if (kind === 'implementation' && exact?.noteId && exact?.meetingId) {
    params.set('noteId', String(exact.noteId));
    params.set('meetingId', String(exact.meetingId));
  }
  return `/coach/students-overview?${params}`;
}
