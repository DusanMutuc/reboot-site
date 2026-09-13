import assert from 'node:assert/strict';
import test from 'node:test';
import { activeDaysSinceForGroup, activePause, isMeetingDatePaused } from '../src/lib/memberPauses.ts';

const day = 86_400_000;
const at = (days) => new Date(days * day).toISOString();
const pause = (start, end = null) => ({
  id: `${start}`,
  user_id: 'member',
  started_at: at(start),
  ended_at: end === null ? null : at(end),
  reason: null,
});

test('an open pause suspends a member booking clock', () => {
  assert.equal(activeDaysSinceForGroup(0, 10 * day, [[pause(3)]]), 3);
  assert.equal(activePause([pause(1, 2), pause(3)])?.started_at, at(3));
});

test('a resumed member keeps time already accrued before and after the pause', () => {
  assert.equal(activeDaysSinceForGroup(0, 10 * day, [[pause(2, 5)]]), 7);
  assert.equal(activeDaysSinceForGroup(4 * day, 10 * day, [[pause(2, 5)]]), 5);
});

test('a partnership clock stops only when both members pause together', () => {
  assert.equal(activeDaysSinceForGroup(0, 10 * day, [
    [pause(2, 7)],
    [pause(5, 9)],
  ]), 8);
  assert.equal(activeDaysSinceForGroup(0, 10 * day, [[pause(2, 7)], []]), 10);
});

test('engagement attendance excludes paused calendar dates after resumption', () => {
  const history = [pause(2, 5)];
  assert.equal(isMeetingDatePaused(at(1).slice(0, 10), history), false);
  assert.equal(isMeetingDatePaused(at(2).slice(0, 10), history), true);
  assert.equal(isMeetingDatePaused(at(5).slice(0, 10), history), true);
  assert.equal(isMeetingDatePaused(at(6).slice(0, 10), history), false);
});
