import assert from 'node:assert/strict';
import test from 'node:test';
import { Settings } from 'luxon';
import { programmeMonths } from '../src/lib/ninetyDayProgrammeMonths.ts';

const periods = (start, end, timezone = 'America/Edmonton') => programmeMonths({ starts_on: start, ends_on: end, timezone }).map(row => row.periodStart);

test('mid-month 90-day programme includes its fourth calendar month', () => {
  assert.deepEqual(periods('2026-09-22', '2026-12-20'), ['2026-09-01','2026-10-01','2026-11-01','2026-12-01']);
});
test('inclusive end date adds a month only when the cycle reaches it', () => {
  assert.deepEqual(periods('2026-01-01', '2026-03-31'), ['2026-01-01','2026-02-01','2026-03-01']);
  assert.deepEqual(periods('2026-01-01', '2026-04-01'), ['2026-01-01','2026-02-01','2026-03-01','2026-04-01']);
});
test('year boundaries, leap day and short cycles retain exact months', () => {
  assert.deepEqual(periods('2027-12-15', '2028-03-13'), ['2027-12-01','2028-01-01','2028-02-01','2028-03-01']);
  assert.deepEqual(periods('2028-02-29', '2028-02-29'), ['2028-02-01']);
});
test('host timezone does not alter programme calendar month coverage', () => {
  const previous = Settings.defaultZone;
  try {
    for (const zone of ['Pacific/Auckland','America/Los_Angeles','Europe/Belgrade']) {
      Settings.defaultZone = zone;
      assert.deepEqual(periods('2026-09-30','2026-10-01','Asia/Kolkata'), ['2026-09-01','2026-10-01']);
    }
  } finally { Settings.defaultZone = previous; }
});
test('invalid or reversed dates fail explicitly instead of inventing KPI periods', () => {
  for (const [start,end] of [['2026-02-30','2026-04-01'],['2026-04-01','2026-03-01']]) {
    assert.throws(() => periods(start,end), /valid start and end date/);
  }
});
