import assert from 'node:assert/strict';
import test from 'node:test';
import {
  discoveryVisibility,
  discoveryVisibilityFlags,
} from '../src/lib/discoveryVisibility.ts';

test('visibility choices round-trip without granting browse implicitly', () => {
  for (const value of ['hidden', 'search_only', 'browse']) {
    const flags = discoveryVisibilityFlags(value);
    assert.equal(discoveryVisibility(flags), value);
    assert.ok(!flags.is_browsable || flags.is_discoverable);
  }
  assert.deepEqual(discoveryVisibilityFlags('search_only'), {
    is_discoverable: true, is_browsable: false,
  });
});

test('legacy searchable records remain search only until browse approval', () => {
  assert.equal(discoveryVisibility({ is_discoverable: true }), 'search_only');
  assert.equal(discoveryVisibility(undefined), 'hidden');
  assert.equal(discoveryVisibility({ is_discoverable: false, is_browsable: true }), 'hidden');
});
