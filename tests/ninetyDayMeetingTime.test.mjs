import assert from 'node:assert/strict';
import test from 'node:test';
import { Settings } from 'luxon';
import { formatNinetyDayMeetingTime } from '../src/lib/ninetyDayMeetingTime.ts';

test('the September 24 meeting displays in the viewer zone instead of the cycle zone', () => {
  const saved = '2026-09-24T06:00:00+00:00';
  assert.equal(
    formatNinetyDayMeetingTime(saved, 'America/Edmonton'),
    'Thursday 24 September, 12:00 AM MDT',
  );
  assert.match(
    formatNinetyDayMeetingTime(saved, 'Europe/Moscow'),
    /^Thursday 24 September, 9:00 AM /,
  );
  assert.match(
    formatNinetyDayMeetingTime(saved, 'Europe/Belgrade'),
    /^Thursday 24 September, 8:00 AM /,
  );
});

test('the viewer timezone wins over the server or host timezone', () => {
  const originalZone = Settings.defaultZone;
  try {
    for (const hostZone of ['Europe/Belgrade', 'UTC', 'America/Los_Angeles']) {
      Settings.defaultZone = hostZone;
      assert.equal(
        formatNinetyDayMeetingTime('2026-09-22T16:30:00Z', 'America/Edmonton'),
        'Tuesday 22 September, 10:30 AM MDT',
      );
    }
  } finally {
    Settings.defaultZone = originalZone;
  }
});

test('daylight saving uses the offset on the meeting date', () => {
  assert.equal(
    formatNinetyDayMeetingTime('2026-12-22T17:30:00Z', 'America/Edmonton'),
    'Tuesday 22 December, 10:30 AM MST',
  );
});

test('local formatting handles date rollover and fractional-hour offsets', () => {
  assert.equal(
    formatNinetyDayMeetingTime('2026-09-23T01:30:00+00:00', 'America/Edmonton'),
    'Tuesday 22 September, 7:30 PM MDT',
  );
  assert.match(
    formatNinetyDayMeetingTime('2026-09-22T05:00:00Z', 'Asia/Kolkata'),
    /^Tuesday 22 September, 10:30 AM /,
  );
});
