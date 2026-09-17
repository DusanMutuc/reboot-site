import assert from 'node:assert/strict';
import test from 'node:test';
import { discoveryIds, discoveryNames, splitDiscoveryNames } from '../src/lib/discoveryAdminTypes.ts';

test('tag and selection IDs are bounded, positive integers, never tag names', () => {
  assert.deepEqual(discoveryIds([2, 1, 2]), [2, 1]);
  for (const input of [['Hiring'], ['1'], [-1], [0], [1.1], [null], [Number.MAX_SAFE_INTEGER + 1], null, Array(101).fill(1)]) {
    assert.throws(() => discoveryIds(input));
  }
});

test('alternate names stay bounded and content-specific', () => {
  assert.deepEqual(discoveryNames([' Nickname ', 'nickname']), ['nickname']);
  assert.deepEqual(splitDiscoveryNames('First name\n\nSecond name\n'), ['First name', 'Second name']);
  assert.deepEqual(discoveryNames([]), []);
  for (const input of [[null], [1], [''], [' '.repeat(8)], ['a'.repeat(121)], Array(21).fill('name'), null]) {
    assert.throws(() => discoveryNames(input));
  }
});
