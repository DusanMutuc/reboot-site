import { DateTime } from 'luxon';

/** Every calendar month touched by the inclusive programme date range. */
export function programmeMonths(cycle: { starts_on: string; ends_on: string; timezone: string }) {
  const zone = cycle.timezone || 'America/Edmonton';
  const start = DateTime.fromISO(cycle.starts_on, { zone });
  const end = DateTime.fromISO(cycle.ends_on, { zone });
  if (!start.isValid || !end.isValid || end < start) {
    throw new Error('The programme needs a valid start and end date.');
  }
  const months: Array<{ periodStart: string; label: string }> = [];
  for (let month = start.startOf('month'); month <= end.startOf('month'); month = month.plus({ months: 1 })) {
    months.push({ periodStart: month.toISODate()!, label: month.toFormat('LLLL') });
  }
  return months;
}
