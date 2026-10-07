import assert from 'node:assert/strict';
import test from 'node:test';
import { implementationLocalDate, selectImplementationMeeting } from '../src/lib/implementationMeetingSelection.ts';

const now = new Date('2026-09-25T18:00:00Z');
const meeting = (id, date, options = {}) => ({ id, date, startsAt: null, timezone: 'America/Edmonton', cancelled: false, session: null, ...options });

test('selects the closest appointment today before a previously open meeting', () => {
  assert.equal(selectImplementationMeeting([
    meeting(1, '2026-09-24', { session: { status: 'open' } }),
    meeting(2, '2026-09-25', { startsAt: '2026-09-25T15:00:00Z' }),
    meeting(3, '2026-09-25', { startsAt: '2026-09-25T18:30:00Z' }),
  ], now), 3);
});
test('resumes an open session before falling back to the nearest scheduled date', () => {
  assert.equal(selectImplementationMeeting([meeting(1, '2026-09-27'), meeting(2, '2026-09-22', { session: { status: 'open' } })], now), 2);
  assert.equal(selectImplementationMeeting([meeting(1, '2026-09-27'), meeting(2, '2026-09-22')], now), 1);
});
test('never auto-selects a cancelled meeting', () => {
  assert.equal(selectImplementationMeeting([meeting(1, '2026-09-25', { cancelled: true }), meeting(2, '2026-09-26')], now), 2);
  assert.equal(selectImplementationMeeting([], now), null);
});
test('an older open session is historical once a newer session has started', () => {
  assert.equal(selectImplementationMeeting([
    meeting(1, '2026-09-20', { session: { id: 'old', status: 'open' } }),
    meeting(2, '2026-09-22', { session: { id: 'latest', status: 'completed' } }),
    meeting(3, '2026-09-26'),
  ], now, 'latest'), 3);
});
test('uses the appointment timezone across midnight and handles an invalid legacy timezone', () => {
  const midnight = new Date('2026-09-26T01:00:00Z');
  assert.equal(implementationLocalDate('America/Edmonton', midnight), '2026-09-25');
  assert.equal(implementationLocalDate('Europe/Belgrade', midnight), '2026-09-26');
  assert.equal(implementationLocalDate('Invalid/Zone', midnight), '2026-09-25');
  assert.equal(selectImplementationMeeting([meeting(1, '2026-09-25'), meeting(2, '2026-09-26')], midnight), 1);
});
