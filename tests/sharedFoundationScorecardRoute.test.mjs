import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const noteOwner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const historicalReviewOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function fixture({ authDenied = false, rpcError = null, noteMissing = false, noteDeleted = false, noteError = null } = {}) {
  const calls = [];
  const rows = {
    business_reviews: [{ id: 17, user_id: historicalReviewOwner, coaching_note_id: 81 }],
    coaching_notes_base: noteMissing ? [] : [{ id: 81, user_id: noteOwner, deleted_at: noteDeleted ? '2026-10-08T00:00:00Z' : null }],
  };
  const admin = {
    from(table) {
      assert.ok(table in rows);
      const filters = [];
      const query = {
        select(columns) { calls.push({ read: table, columns }); return query; },
        eq(column, value) { filters.push((row) => row[column] === value); return query; },
        is(column, value) { filters.push((row) => row[column] === value); return query; },
        async maybeSingle() {
          if (table === 'coaching_notes_base' && noteError) return { data: null, error: noteError };
          return { data: rows[table].find((row) => filters.every((filter) => filter(row))) ?? null, error: null };
        },
        single() { return query.maybeSingle(); },
      };
      return query;
    },
  };
  const imports = {
    'next/server': { NextRequest, NextResponse },
    '@/lib/requireUser': { async requireUser() {
      if (authDenied) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
      return { ok: true, user: { id: 'assigned-coach' }, roleCodes: ['coach'], supabase: {
        async rpc(name, args) { calls.push({ rpc: name, args }); return { error: rpcError }; },
      } };
    } },
    '@/lib/supabaseAdmin': { getAdminClient() { calls.push({ admin: true }); return admin; } },
    '@/lib/businessReviews': {
      parsePositiveInteger(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; },
      async loadBusinessReviews(client, memberId) {
        assert.equal(client, admin); calls.push({ loadMember: memberId });
        return { reviews: [{ id: memberId === noteOwner ? 'authorized-shared-review' : 'unrelated-private-review' }] };
      },
    },
  };
  const source = ts.transpileModule(fs.readFileSync(new URL('../src/app/api/business-reviews/[reviewId]/foundation-scorecard/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => {
    assert.ok(name in imports, `Unexpected import ${name}`); return imports[name];
  } });
  return { calls, async invoke(reviewId = '17') {
    return exports.POST(new NextRequest('https://example.test/api/business-reviews/17/foundation-scorecard', { method: 'POST' }),
      { params: Promise.resolve({ reviewId }) });
  } };
}

test('foundation assignment reloads the authorized note owner after sharing stops, never the historical review owner', async () => {
  const { invoke, calls } = fixture();
  const response = await invoke();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reviews: [{ id: 'authorized-shared-review' }] });
  assert.deepEqual(calls.filter((call) => call.loadMember), [{ loadMember: noteOwner }]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find((call) => call.rpc))), {
    rpc: 'assign_foundation_scorecard_to_business_review', args: { _business_review_id: 17 },
  });
});

test('failed authorization never performs a privileged reload', async () => {
  for (const options of [{ authDenied: true }, { rpcError: { code: '42501', message: 'Access denied' } }]) {
    const { invoke, calls } = fixture(options);
    const response = await invoke();
    assert.ok(response.status >= 400);
    assert.ok(!calls.some((call) => call.admin || call.read || call.loadMember));
  }
});

test('a missing or deleted note fails closed instead of falling back to review.user_id', async () => {
  for (const options of [{ noteMissing: true }, { noteDeleted: true }]) {
    const { invoke, calls } = fixture(options);
    assert.equal((await invoke()).status, 404);
    assert.ok(!calls.some((call) => call.loadMember));
  }
});

test('an authorization-scope read failure does not expose another member’s review history', async () => {
  const { invoke, calls } = fixture({ noteError: { message: 'Read failed' } });
  assert.equal((await invoke()).status, 500);
  assert.ok(!calls.some((call) => call.loadMember));
});
