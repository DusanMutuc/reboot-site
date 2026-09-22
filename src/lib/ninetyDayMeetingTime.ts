import { DateTime } from 'luxon';

/** Format the saved instant in an explicit zone, including its display name. */
export function formatNinetyDayMeetingTime(value: string, timezone: string): string {
  return DateTime.fromISO(value, { zone: timezone, locale: 'en-US' })
    .toFormat('cccc d LLLL, h:mm a ZZZZ');
}
