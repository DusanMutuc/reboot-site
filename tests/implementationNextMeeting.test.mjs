import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { implementationLocalDate } from '../src/lib/implementationMeetingSelection.ts';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/implementationNextMeeting.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
vm.runInNewContext(source, { exports, Intl, Date, require: (name) => {
  assert.equal(name, './implementationMeetingSelection');
  return { implementationLocalDate };
} });
const { getImplementationNextMeeting } = exports;
const now = new Date('2026-09-29T18:00:00Z');
const plain = (value) => JSON.parse(JSON.stringify(value));
const meeting = (id, date, options = {}) => ({ id, date, title: null, startsAt: null,
  timezone: 'America/Edmonton', attended: false, cancelled: false, isToday: date === '2026-09-29',
  isFuture: date > '2026-09-29', session: null, ...options });
const session = (id = 'selected', status = 'open') => ({ id, status });
const review = (date, options = {}) => ({ reviewId: 100, meetingId: 200, date, startsAt: null,
  timezone: 'America/Edmonton', title: 'Business Review', isToday: false, ...options });
function recommend(selectedMeeting, meetings = [selectedMeeting], options = {}, clock = now) {
  return getImplementationNextMeeting({ selectedMeeting, meetings, upcomingBusinessReview: null,
    cycleStartDate: '2026-09-01', cycleEndDate: null, ...options }, clock);
}

test('wrap-up counts the current session before attendance and recommends a review after the third call', () => {
  const selected = meeting(3, '2026-09-29', { session: session() });
  const result = recommend(selected, [meeting(1, '2026-09-05', { attended: true }),
    meeting(2, '2026-09-15', { attended: true }), selected]);
  assert.equal(result.type, 'business_review');
  assert.equal(result.reason, 'cycle_complete');
  assert.equal(result.implementationCount, 3);
  assert.equal(result.scheduledMeeting, null);
});

test('missed, cancelled, future and duplicate meetings do not inflate the cadence', () => {
  const selected = meeting(5, '2026-09-29', { session: session(), attended: true });
  const attended = meeting(1, '2026-09-05', { attended: true });
  const result = recommend(selected, [attended, attended, selected, selected,
    meeting(2, '2026-09-10', { session: session('missed', 'completed') }),
    meeting(3, '2026-09-20', { attended: true, cancelled: true }),
    meeting(4, '2026-10-05', { attended: true, cancelled: true })]);
  assert.equal(result.implementationCount, 2);
  assert.equal(result.type, 'implementation');
});

test('an existing next implementation wins over the three-meeting fallback', () => {
  const selected = meeting(3, '2026-09-29', { attended: true });
  const next = meeting(4, '2026-10-02', { startsAt: '2026-10-02T16:00:00Z', title: 'Follow-up' });
  const result = recommend(selected, [meeting(1, '2026-09-05', { attended: true }),
    meeting(2, '2026-09-15', { attended: true }), selected, next]);
  assert.equal(result.type, 'implementation');
  assert.equal(result.reason, 'scheduled');
  assert.equal(result.implementationCount, 3);
  assert.deepEqual(plain(result.scheduledMeeting), { meetingId: 4, reviewId: null, date: next.date,
    startsAt: next.startsAt, timezone: next.timezone, title: next.title });
});

test('a booked review does not skip missing implementations, regardless of how soon it is', () => {
  const selected = meeting(1, '2026-09-29', { session: session() });
  const next = meeting(2, '2026-10-02');
  assert.equal(recommend(selected, [selected, next], { upcomingBusinessReview: review('2026-10-03') }).type, 'implementation');
  for (const date of ['2026-10-01', '2026-11-01']) {
    const result = recommend(selected, [selected], { upcomingBusinessReview: review(date), cycleEndDate: date });
    assert.equal(result.type, 'implementation');
    assert.equal(result.reason, 'continue_cycle');
    assert.equal(result.implementationCount, 1);
    assert.equal(result.scheduledMeeting, null);
  }
  const afterReview = recommend(selected, [selected, next], { upcomingBusinessReview: review('2026-10-01') });
  assert.equal(afterReview.type, 'implementation');
  assert.equal(afterReview.scheduledMeeting, null, 'An implementation after the next review cannot fill the missing call before it');
});

test('a third call recommends its scheduled review without fabricating a time for a manual review', () => {
  const selected = meeting(3, '2026-09-29', { session: session() });
  const meetings = [meeting(1, '2026-09-05', { attended: true }), meeting(2, '2026-09-15', { attended: true }), selected];
  const result = recommend(selected, meetings, { upcomingBusinessReview: review('2026-10-01', { meetingId: null }) });
  assert.equal(result.type, 'business_review');
  assert.equal(result.reason, 'scheduled');
  assert.equal(result.implementationCount, 3);
  assert.equal(result.scheduledMeeting.meetingId, null);
  assert.equal(result.scheduledMeeting.reviewId, 100);
  assert.equal(result.scheduledMeeting.startsAt, null);
});

test('an explicitly booked extra implementation before the review remains next after the third call', () => {
  const selected = meeting(3, '2026-09-29', { session: session() });
  const next = meeting(4, '2026-10-03');
  const meetings = [meeting(1, '2026-09-05', { attended: true }), meeting(2, '2026-09-15', { attended: true }), selected, next];
  const result = recommend(selected, meetings, { upcomingBusinessReview: review('2026-10-10'), cycleEndDate: '2026-10-10' });
  assert.equal(result.type, 'implementation');
  assert.equal(result.reason, 'scheduled');
  assert.equal(result.scheduledMeeting.meetingId, 4);
  assert.equal(result.implementationCount, 3);
  const earlierReview = recommend(selected, meetings, { upcomingBusinessReview: review('2026-10-01') });
  assert.equal(earlierReview.type, 'business_review');
  assert.equal(earlierReview.scheduledMeeting.reviewId, 100);
});

test('historical recommendations stay anchored to the selected meeting rather than today', () => {
  const selected = meeting(1, '2026-09-05', { session: session() });
  const options = { cycleEndDate: '2026-09-20' };
  const result = recommend(selected, [selected], options);
  assert.equal(result.type, 'implementation');
  assert.equal(result.reason, 'continue_cycle');
  assert.equal(result.historical, true);
  const next = meeting(2, '2026-09-10', { attended: true });
  const nextResult = recommend(selected, [selected, next], options);
  assert.equal(nextResult.scheduledMeeting.meetingId, 2);
  assert.equal(nextResult.implementationCount, 1, 'Later attendance is not work completed before the selected call');
});

test('rescheduled pinned sessions retain their cycle and crossing its boundary recommends the review', () => {
  const selected = meeting(3, '2026-10-03', { session: session() });
  const result = recommend(selected, [meeting(1, '2026-08-31', { attended: true, session: session('pinned') }),
    meeting(2, '2026-09-25', { attended: true }), selected], { cycleEndDate: '2026-10-01' });
  assert.equal(result.implementationCount, 3);
  assert.equal(result.type, 'business_review');
  const crossing = recommend(selected, [selected], { cycleEndDate: '2026-10-01' });
  assert.equal(crossing.reason, 'cycle_ended');
  assert.equal(crossing.type, 'business_review');
});

test('unstarted meetings outside the selected cycle never affect its recommendation', () => {
  const selected = meeting(1, '2026-09-29', { session: session() });
  const result = recommend(selected, [selected, meeting(2, '2026-08-31', { attended: true }),
    meeting(3, '2026-10-01'), meeting(4, '2026-09-30', { cancelled: true })], { cycleEndDate: '2026-10-01' });
  assert.equal(result.implementationCount, 1);
  assert.equal(result.scheduledMeeting, null);
  assert.equal(result.type, 'implementation');
});

test('same-day meetings use actual times without interpreting IDs as chronology', () => {
  const selected = meeting(100, '2026-09-29', { session: session(), startsAt: '2026-09-29T18:00:00Z' });
  const result = recommend(selected, [meeting(300, '2026-09-15', { attended: true }),
    meeting(200, '2026-09-29', { attended: true, startsAt: '2026-09-29T16:00:00Z' }),
    selected, meeting(1, '2026-09-29', { startsAt: '2026-09-29T20:00:00Z' })], {
    upcomingBusinessReview: review('2026-09-29', { startsAt: '2026-09-29T19:00:00Z' }),
  });
  assert.equal(result.implementationCount, 3);
  assert.equal(result.type, 'business_review');
  assert.equal(result.scheduledMeeting.startsAt, '2026-09-29T19:00:00Z');
  const unknownOrder = recommend(selected, [selected, meeting(101, '2026-09-29', { attended: true })]);
  assert.equal(unknownOrder.implementationCount, 1);
  assert.equal(unknownOrder.scheduledMeeting, null);
});

test('a review already earlier on the selected day is not recommended as the next appointment', () => {
  const selected = meeting(1, '2026-09-29', { session: session(), startsAt: '2026-09-29T18:00:00Z' });
  const result = recommend(selected, [selected], {
    upcomingBusinessReview: review('2026-09-29', { startsAt: '2026-09-29T16:00:00Z' }),
  });
  assert.equal(result.type, 'implementation');
  assert.equal(result.scheduledMeeting, null);
});

test('timezone-aware historical labels handle midnight and invalid legacy zones', () => {
  const clock = new Date('2026-09-30T01:00:00Z');
  for (const timezone of ['America/Edmonton', 'Invalid/Zone']) {
    const selected = meeting(1, '2026-09-29', { timezone, session: session() });
    assert.equal(recommend(selected, [selected], {}, clock).historical, false);
  }
  const selected = meeting(1, '2026-09-29', { timezone: 'Europe/Belgrade', session: session() });
  assert.equal(recommend(selected, [selected], {}, clock).historical, true);
});

test('empty and cancelled selections offer no prompt and reading never mutates workspace arrays', () => {
  assert.equal(recommend(null, []), null);
  const cancelled = meeting(1, '2026-09-29', { cancelled: true });
  assert.equal(recommend(cancelled), null);
  const selected = meeting(1, '2026-09-29', { session: session() });
  const meetings = [meeting(3, '2026-10-03'), selected, meeting(2, '2026-10-01')];
  const original = plain(meetings);
  assert.equal(recommend(selected, meetings).scheduledMeeting.meetingId, 2);
  assert.deepEqual(meetings, original);
});
