import { DateTime } from 'luxon';

/** Format the saved instant in an explicit zone, including its display name. */
export function formatNinetyDayMeetingTime(value: string, timezone: string): string {
  return DateTime.fromISO(value, { zone: timezone, locale: 'en-US' })
    .toFormat('cccc d LLLL, h:mm a ZZZZ');
}

/** Interpret an admin's datetime-local input in the saved cycle timezone. */
export function cycleMeetingTimeToUtc(value: string, timezone: string): string {
  const time = DateTime.fromISO(value, { zone: timezone });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !time.isValid) {
    throw new Error('Enter a valid meeting date and time.');
  }
  // Luxon otherwise moves a nonexistent spring-forward time into the next hour.
  if (time.toFormat("yyyy-MM-dd'T'HH:mm") !== value) {
    throw new Error(`This time does not exist in ${timezone} because the clocks move forward. Choose another time.`);
  }
  if (time.getPossibleOffsets().length > 1) {
    throw new Error(`This time occurs twice in ${timezone} because the clocks move back. Choose an unambiguous time.`);
  }
  return time.toUTC().toISO()!;
}
