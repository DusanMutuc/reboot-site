import assert from 'node:assert/strict';
import test from 'node:test';
import { Settings } from 'luxon';
import { cycleMeetingTimeToUtc, formatNinetyDayMeetingTime } from '../src/lib/ninetyDayMeetingTime.ts';

test('admin inputs use the cycle timezone regardless of the admin timezone', () => {
  const originalZone = Settings.defaultZone;
  try {
    for (const hostZone of ['Europe/Belgrade', 'Europe/Moscow', 'UTC', 'America/Los_Angeles']) {
      Settings.defaultZone = hostZone;
      const saved = cycleMeetingTimeToUtc('2026-09-24T09:00', 'America/Edmonton');
      assert.equal(saved, '2026-09-24T15:00:00.000Z');
      assert.equal(formatNinetyDayMeetingTime(saved, 'America/Edmonton'), 'Thursday 24 September, 9:00 AM MDT');
      assert.match(formatNinetyDayMeetingTime(saved, 'Europe/Belgrade'), /5:00 PM/);
    }
  } finally {
    Settings.defaultZone = originalZone;
  }
});

test('admin inputs use date-specific daylight saving and fractional offsets', () => {
  assert.equal(cycleMeetingTimeToUtc('2026-12-24T09:00', 'America/Edmonton'), '2026-12-24T16:00:00.000Z');
  assert.equal(cycleMeetingTimeToUtc('2026-09-24T00:15', 'Asia/Kolkata'), '2026-09-23T18:45:00.000Z');
});

test('invalid, nonexistent and ambiguous local meeting times are rejected', () => {
  for (const value of ['', '2026-02-30T09:00', '2026-09-24T09:00Z']) {
    assert.throws(() => cycleMeetingTimeToUtc(value, 'America/Edmonton'), /valid meeting/);
  }
  assert.throws(() => cycleMeetingTimeToUtc('2026-09-24T09:00', 'Invalid/Zone'), /valid meeting/);
  assert.throws(() => cycleMeetingTimeToUtc('2026-03-08T02:30', 'America/Edmonton'), /does not exist/);
  assert.throws(() => cycleMeetingTimeToUtc('2026-11-01T01:30', 'America/Edmonton'), /occurs twice/);
});

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
