import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as partnershipScope from '../src/lib/partnershipScope.ts';

function load(path, imports) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  } });
  return exports;
}
const reviews = load('../src/lib/businessReviews.ts', {
  '@/lib/userRoles': { hasRoleCode: (roles, role) => roles.includes(role) },
  '@/lib/partnershipScope': partnershipScope,
});
const cycles = load('../src/lib/coachingCycles.ts', {
  '@/lib/businessReviews': reviews,
  '@/lib/partnershipScope': partnershipScope,
  '@/lib/businessAuditConfig': { getBusinessAuditLocalDate: (date) => date ? date.toISOString().slice(0, 10) : '2026-10-08' },
});

function fixture({ shared = true, active = true, pageSize = Infinity, merged = [], assignments, errorTable = null } = {}) {
  const note = (id, user_id) => ({ id, user_id, created_at: '2026-01-01T00:00:00Z', m2_meeting_id: null });
  const review = (id, user_id, coaching_note_id, review_date) => ({ id, user_id, coaching_note_id, review_date,
    coach_id: 'coach', meeting_id: null, archived_meeting_id: null, focus_finder_template_key: 'focus_finder_v1',
    system_scorecard_template_key: 'foundation', status: 'completed', completed_at: `${review_date}T00:00:00Z`,
    created_at: '2026-01-01T00:00:00Z', updated_at: `${review_date}T00:00:00Z` });
  const aliases = (id) => shared && active && ['primary', 'secondary'].includes(id) ? ['primary', 'secondary'] : [id];
  const tables = {
    profiles: ['primary', 'secondary', 'unrelated'].map((id) => ({ id, merged_at: merged.includes(id) ? '2026-10-01' : null })),
    user_coaches: assignments ?? [{ id: 1, user_id: 'primary', coach_id: 'coach', is_active: true, ended_at: null }],
    coaching_notes: [note(50, 'primary'), note(51, 'secondary'), note(99, 'unrelated')]
      .flatMap((row) => aliases(row.user_id).map((user_id) => ({ ...row, user_id }))),
    coaching_notes_base: [note(50, 'primary'), note(51, 'secondary'), note(99, 'unrelated')]
      .map((row) => ({ ...row, deleted_at: null })),
    business_reviews: [review(1, 'primary', 50, '2026-09-01'), review(2, 'secondary', 51, '2026-09-15'), review(3, 'unrelated', 99, '2026-10-01')],
    focus_finder_dimensions: [], business_review_additional_scorecards: [], business_review_focus_values: [],
    business_review_system_ratings: [
      { business_review_id: 1, system_id: 1, status: 'complete', reviewed_at: '2026-09-01T00:00:00Z', reviewed_by: 'coach', updated_at: '2026-09-01T00:00:00Z' },
      { business_review_id: 2, system_id: 1, status: 'complete', reviewed_at: '2026-09-15T00:00:00Z', reviewed_by: 'coach', updated_at: '2026-09-15T00:00:00Z' },
      { business_review_id: 3, system_id: 1, status: 'complete', reviewed_at: '2026-10-01T00:00:00Z', reviewed_by: 'coach', updated_at: '2026-10-01T00:00:00Z' },
    ], business_review_system_priorities: [], business_review_preparation_responses: [],
    system_scorecard_templates: [{ key: 'foundation', audience: 'foundation', name: 'Foundation', version: 1 }],
    system_scorecard_categories: [{ id: 1, template_key: 'foundation', key: 'cat', label: 'Category', position: 1 }],
    system_scorecard_systems: [{ id: 1, template_key: 'foundation', category_id: 1, key: 'system', label: 'System', position: 1, library_item_id: null }],
  };
  const client = {
    async rpc(name, args) {
      assert.equal(name, 'view_user_ids_for_owner'); assert.equal(args._domain, 'notes');
      return { data: aliases(args._owner).map((user_id) => ({ user_id })), error: null };
    },
    from(table) {
      assert.ok(table in tables, `Unexpected table ${table}`);
      const filters = [];
      const orders = [];
      let limit = Infinity, start = 0;
      const q = {
        select() { return q; },
        eq(key, value) { filters.push((row) => row[key] === value); return q; },
        is(key, value) { filters.push((row) => row[key] === value); return q; },
        in(key, values) { filters.push((row) => values.some((value) => String(value) === String(row[key]))); return q; },
        gt(key, value) { filters.push((row) => row[key] > value); return q; },
        or() { filters.push((row) => row.ended_at === null || Date.parse(row.ended_at) > Date.now()); return q; },
        order(key, { ascending = true } = {}) { orders.push([key, ascending]); return q; },
        limit(value) { limit = value; return q; },
        range(first, last) { start = first; limit = last - first + 1; return q; },
        async maybeSingle() { const result = await q; return { ...result, data: result.data[0] ?? null }; },
        then(resolve, reject) {
          const values = tables[table].filter((row) => filters.every((filter) => filter(row))).sort((a, b) => {
            for (const [key, ascending] of orders) {
              const result = a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0;
              if (result) return result * (ascending ? 1 : -1);
            }
            return 0;
          });
          return Promise.resolve({ data: values.slice(start, start + Math.min(limit, pageSize)),
            error: table === errorTable ? new Error('Read failed') : null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return { client, tables };
}

test('both partners see reviews owned by either member and the same business-review cycles', async () => {
  const { client } = fixture();
  for (const userId of ['primary', 'secondary']) {
    const result = await reviews.loadBusinessReviews(client, userId);
    assert.deepEqual(Array.from(result.reviews, (review) => review.id), [2, 1]);
    const history = await cycles.loadCoachingCycles(client, userId);
    assert.equal(history.activeCycleId, 'business_audit:2');
    assert.deepEqual(Array.from(history.cycles, (cycle) => [cycle.kind, cycle.cycleDate]),
      [['business_audit', '2026-09-15'], ['business_audit', '2026-09-01']]);
  }
});

test('scorecard last-reviewed dates use the latest shared review and survive capped pages', async () => {
  const { client } = fixture({ pageSize: 1 });
  const result = await reviews.loadBusinessReviews(client, 'secondary');
  assert.equal(result.reviews.length, 2);
  for (const review of result.reviews) {
    assert.equal(review.systemScorecard.categories[0].systems[0].rating.lastReviewedAt, '2026-09-15T00:00:00Z');
  }
});

test('inactive partnerships and partnerships without notes sharing expose only the selected member', async () => {
  for (const options of [{ shared: false }, { active: false }]) {
    const { client } = fixture(options);
    const result = await reviews.loadBusinessReviews(client, 'secondary');
    assert.deepEqual(Array.from(result.reviews, (review) => review.id), [2]);
    assert.equal(await reviews.canManageBusinessReviews(client, 'coach', ['coach'], 'secondary'), false);
  }
});

test('shared member access accepts a live partner assignment but rejects unrelated, inactive, expired and archived assignments', async () => {
  const { client } = fixture();
  assert.equal(await reviews.canManageBusinessReviews(client, 'coach', ['coach'], 'secondary'), true);
  assert.equal(await reviews.canManageBusinessReviews(client, 'coach', ['coach'], 'unrelated'), false);
  assert.equal(await reviews.canManageBusinessReviews(client, 'coach', ['user'], 'secondary'), false);
  for (const options of [
    { assignments: [{ id: 1, user_id: 'primary', coach_id: 'coach', is_active: false, ended_at: null }] },
    { assignments: [{ id: 1, user_id: 'primary', coach_id: 'coach', is_active: true, ended_at: '2000-01-01' }] },
    { merged: ['primary'] }, { merged: ['secondary'] },
  ]) {
    assert.equal(await reviews.canManageBusinessReviews(fixture(options).client, 'coach', ['coach'], 'secondary'), false);
  }
});

test('sharing lookup failures fail closed and archived admin history remains readable', async () => {
  await assert.rejects(reviews.canManageBusinessReviews(fixture({ errorTable: 'profiles' }).client, 'coach', ['coach'], 'secondary'), /Read failed/);
  await assert.rejects(reviews.loadBusinessReviews(fixture({ errorTable: 'coaching_notes' }).client, 'secondary'), /Read failed/);
  assert.equal(await reviews.canManageBusinessReviews(fixture({ merged: ['secondary'] }).client, 'admin', ['admin'], 'secondary'), true);
});

test('record authorization follows the attached note when the review owner no longer shares notes', async () => {
  const { client, tables } = fixture({ shared: false });
  tables.business_reviews[0].user_id = 'secondary';
  assert.equal(await reviews.canManageBusinessReviewRecord(client, 'coach', ['coach'], 50), true);
  assert.equal(await reviews.canManageBusinessReviewRecord(client, 'coach', ['coach'], 51), false);
  tables.coaching_notes_base[0].deleted_at = '2026-10-01';
  assert.equal(await reviews.canManageBusinessReviewRecord(client, 'coach', ['coach'], 50), false);
});

test('shared scorecard history excludes private reviews with the same original review owner', async () => {
  const { client, tables } = fixture({ shared: false });
  tables.business_reviews[0].user_id = 'secondary';
  const result = await reviews.loadBusinessReviews(client, 'primary');
  assert.deepEqual(Array.from(result.reviews, (review) => review.id), [1]);
  assert.equal(result.reviews[0].systemScorecard.categories[0].systems[0].rating.lastReviewedAt, '2026-09-01T00:00:00Z');
});

test('annual scorecard due dates clamp leap-day reviews to the last day of February', async () => {
  const { client, tables } = fixture({ shared: false });
  tables.business_review_system_ratings[0].reviewed_at = '2024-02-29T12:34:56Z';
  const result = await reviews.loadBusinessReviews(client, 'primary');
  const rating = result.reviews[0].systemScorecard.categories[0].systems[0].rating;
  assert.equal(rating.reviewDueAt, '2025-02-28T12:34:56.000Z');
  assert.equal(rating.reviewOverdue, true);
});
