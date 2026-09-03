import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DISCOVERY_ANSWERS, durationLabel, formatLabel, parseRefKey, refKey, sameRef, splitTitleMarker,
} from '../src/lib/discoveryJobTypes.ts';

/**
 * The colliding pair. `resources` and `content_nodes` have independent id sequences, so the same
 * integer names two different items — 35 rows in the current catalogue collide, including
 * node 99 (the lesson "Foundations") and resource 99 (the podcast "Ep 88").
 *
 * A prototype of Job A keyed selection and decisions by the bare id, and a two-row bulk write
 * silently modified a third, unselected row. These tests exist so that cannot come back.
 */
const NODE_99 = { kind: 'node', id: 99 };
const RESOURCE_99 = { kind: 'resource', id: 99 };

test('a colliding pair produces distinct keys', () => {
  assert.notEqual(refKey(NODE_99), refKey(RESOURCE_99));
  assert.equal(refKey(NODE_99), 'node:99');
  assert.equal(refKey(RESOURCE_99), 'resource:99');
});

test('sameRef distinguishes kind, not just id', () => {
  assert.equal(sameRef(NODE_99, RESOURCE_99), false);
  assert.equal(sameRef(NODE_99, { kind: 'node', id: 99 }), true);
  assert.equal(sameRef(NODE_99, { kind: 'node', id: 98 }), false);
});

test('a selection set keyed by refKey holds both members of a colliding pair', () => {
  const selection = new Set([refKey(NODE_99), refKey(RESOURCE_99)]);
  assert.equal(selection.size, 2, 'a bare-id key would have collapsed these to one entry');
  selection.delete(refKey(NODE_99));
  assert.equal(selection.has(refKey(RESOURCE_99)), true, 'deselecting the lesson must not deselect the resource');
});

test('a per-item map keyed by refKey never leaks across a colliding pair', () => {
  const drafts = {};
  drafts[refKey(NODE_99)] = [1, 2];
  drafts[refKey(RESOURCE_99)] = [3];
  assert.deepEqual(drafts[refKey(NODE_99)], [1, 2]);
  assert.deepEqual(drafts[refKey(RESOURCE_99)], [3]);
  assert.equal(Object.keys(drafts).length, 2);
});

test('parseRefKey round-trips and rejects a bare id', () => {
  assert.deepEqual(parseRefKey('node:99'), NODE_99);
  assert.deepEqual(parseRefKey(refKey(RESOURCE_99)), RESOURCE_99);
  assert.throws(() => parseRefKey('99'), /not a discovery item reference/i);
  assert.throws(() => parseRefKey('guide:99'), /not a discovery item reference/i);
  assert.throws(() => parseRefKey('resource:0'), /not a discovery item reference/i);
  assert.throws(() => parseRefKey('resource:abc'), /not a discovery item reference/i);
});

test('each question has exactly two valid answers and neither is a skip', () => {
  Object.entries(DISCOVERY_ANSWERS).forEach(([question, answers]) => {
    assert.equal(answers.length, 2, `${question} must offer exactly two answers`);
    assert.equal(new Set(answers).size, 2);
    assert.equal(answers.includes('skip'), false, 'skip is never an answer — it records nothing');
  });
});

test('a trailing format marker is split from the subject so long titles stay scannable', () => {
  assert.deepEqual(
    splitTitleMarker('[Ep 108] Building a Team - Team Offer and Commission Splits [Coaching Replay with Gerry]'),
    { subject: '[Ep 108] Building a Team - Team Offer and Commission Splits', marker: ' [Coaching Replay with Gerry]' },
  );
  // A title with no trailing marker is returned whole rather than being cut at a bracket.
  assert.deepEqual(
    splitTitleMarker('[Ep 114] To Incorporate or Not? Your 2026 Budget Blueprint'),
    { subject: '[Ep 114] To Incorporate or Not? Your 2026 Budget Blueprint', marker: '' },
  );
});

test('formats and durations read as words, not raw values', () => {
  assert.equal(formatLabel('pdf'), 'PDF');
  assert.equal(formatLabel('podcast'), 'Podcast');
  assert.equal(formatLabel('something_new'), 'something_new');
  assert.equal(durationLabel(null), null);
  assert.equal(durationLabel(0), null);
  assert.equal(durationLabel(90), '1 min');
  assert.equal(durationLabel(3900), '1h 5m');
});
