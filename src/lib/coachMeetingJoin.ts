import 'server-only';

import { GHL } from '@/lib/config';
import { safeCoachHomeUrl } from '@/lib/coachHomeShared';
import { excludedCoachMeeting } from '@/lib/coachSchedule';

/** Resolving a call URL is independent of loading the saved agenda. */
export async function resolveCoachMeetingJoinUrl(appointmentId: string): Promise<string | null> {
  if (!GHL.BASE || !GHL.TOKEN || !GHL.VERSION) throw new Error('The call link is unavailable.');
  const base = new URL(GHL.BASE);
  const local = process.env.NODE_ENV !== 'production' && base.protocol === 'http:'
    && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !local) || base.username || base.password) throw new Error('Invalid calendar configuration.');
  const response = await fetch(`${base.href.replace(/\/+$/, '')}/calendars/events/appointments/${encodeURIComponent(appointmentId)}`, {
    headers: { Authorization: `Bearer ${GHL.TOKEN}`, Version: GHL.VERSION, Accept: 'application/json' },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error('The call link could not be loaded.');
  const payload = await response.json();
  const event = payload?.appointment ?? payload?.event;
  if (!event || String(event.id ?? event._id ?? '') !== appointmentId
    || event.deleted === true || excludedCoachMeeting(event.appointmentStatus ?? event.status ?? null)) return null;
  return safeCoachHomeUrl(event.meetingLocation) ?? safeCoachHomeUrl(event.address) ?? safeCoachHomeUrl(event.location);
}
