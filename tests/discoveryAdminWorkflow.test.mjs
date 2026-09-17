import assert from 'node:assert/strict';
import test from 'node:test';
import { findDuplicateGroups, normalizeTagName, looksLikeVariant } from '../src/lib/discoveryDuplicates.ts';
import { discoveryReviewStatus, inheritedDiscoveryCategories } from '../src/lib/discoveryAdminTypes.ts';
import { discoveryOutcome } from '../src/lib/discoveryOutcome.ts';
import { readDiscoveryResponse } from '../src/lib/discoveryAdminClient.ts';
import { DISCOVERY_NAVIGATION_EVENT, navigateWithDiscoveryGuard } from '../src/lib/discoveryAdminNavigation.ts';

test('categories inherit from active topics only, deduplicate, and allow multiple categories', () => {
  assert.deepEqual(inheritedDiscoveryCategories([
    { tag_kind: 'topic', browse_category: 'hiring', is_active: true },
    { tag_kind: 'topic', browse_category: 'hiring', is_active: true },
    { tag_kind: 'topic', browse_category: 'systems', is_active: true },
    { tag_kind: 'browse_category', browse_category: 'marketing', is_active: true },
    { tag_kind: 'topic', browse_category: 'mindset', is_active: false },
  ]), ['hiring', 'systems']);
});

test('safe defaults are not human review; both context and direct can be reviewed', () => {
  assert.equal(discoveryReviewStatus({ discovery_open_mode: 'context' }), 'pending');
  assert.equal(discoveryReviewStatus({ discovery_open_mode: 'direct' }), 'pending');
  assert.equal(discoveryReviewStatus({ discovery_open_mode: 'context', discovery_reviewed_at: '2026-08-31' }), 'context');
  assert.equal(discoveryReviewStatus({ discovery_open_mode: 'direct', discovery_reviewed_at: '2026-08-31' }), 'direct');
});

test('duplicate suggestions preserve different subject scopes and catch known spelling variants', () => {
  const similar = (a, b) => looksLikeVariant(normalizeTagName(a), normalizeTagName(b));
  for (const [a, b] of [['price', 'price reduction'], ['social', 'social tagging'], ['mindset', 'minds'], ['website', 'website build'], ['blow', 'flow']]) {
    assert.equal(similar(a, b), false, `${a} is not a spelling of ${b}`);
  }
  for (const name of ['pnl', 'p n l', 'p and l', 'P&L']) assert.equal(normalizeTagName(name), normalizeTagName('p&l'));
  assert.equal(similar('referral', 'refferal'), true);
  assert.equal(similar('tagging', 'taging'), true);
  const tags = ['referral', 'refferal', 'refferral'].map((name, index) => ({ id: index + 1, name, tag_kind: 'topic', is_active: true }));
  const groups = findDuplicateGroups(tags);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].tags.length, 3);
  assert.equal(findDuplicateGroups([...tags].reverse())[0].signature, groups[0].signature);
  assert.notEqual(findDuplicateGroups(tags.map(tag => ({ ...tag, browse_category: 'marketing' })))[0].signature, groups[0].signature);
  assert.equal(findDuplicateGroups(tags.map((tag, index) => ({ ...tag, browse_category: String(index) }))).length, 0);
  const chain = ['abcde', 'abcdf', 'abddf'].map((name, index) => ({ id: index + 1, name, tag_kind: 'topic', is_active: true }));
  assert.equal(findDuplicateGroups(chain)[0].tags.length, 2, 'similarity cannot pull unrelated endpoints together');
  assert.equal(findDuplicateGroups(chain)[0].signature, findDuplicateGroups([...chain].reverse())[0].signature);
});

test('admin navigation waits for an unsaved-draft guard to approve the action', () => {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  try {
    let navigated = 0;
    navigateWithDiscoveryGuard(() => { navigated += 1; });
    assert.equal(navigated, 1, 'clean navigation runs immediately');
    let deferred;
    globalThis.window.addEventListener(DISCOVERY_NAVIGATION_EVENT, event => {
      event.preventDefault(); deferred = event.detail.run;
    });
    navigateWithDiscoveryGuard(() => { navigated += 1; });
    assert.equal(navigated, 1, 'the guard can keep the draft open');
    deferred();
    assert.equal(navigated, 2, 'confirmed discard runs the original navigation');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('outcome wording distinguishes guides, unpublished content, approval and category membership', () => {
  const base = { visibility: 'browse', openMode: 'direct', embedded: false };
  assert.match(discoveryOutcome(base).browse, /in All/);
  assert.match(discoveryOutcome({ ...base, hasCategory: true }).browse, /categories shown above/);
  assert.match(discoveryOutcome({ ...base, state: 'draft' }).search, /cannot appear/);
  assert.match(discoveryOutcome({ ...base, openMode: 'context', embedded: true }).browse, /stays out/);
  assert.match(discoveryOutcome({ ...base, kind: 'guide', mediaType: 'course' }).search, /whole course/);
  assert.match(discoveryOutcome({ ...base, kind: 'guide', mediaType: 'lesson' }).browse, /stay out/);
  assert.match(discoveryOutcome({ ...base, visibility: 'hidden' }).search, /existing learning access/);
});

test('HTML, expired sessions and invalid JSON produce useful recovery instructions', async () => {
  await assert.rejects(readDiscoveryResponse(new Response('<!DOCTYPE html>', { status: 500, headers: { 'content-type': 'text/html' } })), /Reload these settings/);
  await assert.rejects(readDiscoveryResponse(new Response('', { status: 401 })), /Sign in again/);
  await assert.rejects(readDiscoveryResponse(new Response('{', { headers: { 'content-type': 'application/json' } })), /incomplete response/);
  await assert.rejects(readDiscoveryResponse(Response.json({ error: 'Choose a topic' }, { status: 400 })), /Choose a topic/);
  assert.deepEqual(await readDiscoveryResponse(Response.json({ ok: true })), { ok: true });
});
