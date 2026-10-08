import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as partnershipScope from '../src/lib/partnershipScope.ts';

const exports = {};
const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/businessReviews.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, { exports, require(name) {
  if (name === '@/lib/partnershipScope') return partnershipScope;
  assert.equal(name, '@/lib/userRoles');
  return { hasRoleCode: (codes, code) => codes.includes(code) };
} });

function fixture({ meeting_id = null, archived_meeting_id = null, meetings = [] } = {}) {
  const calls = [];
  const review = { id: 1, user_id: 'archived-member', coach_id: 'coach', meeting_id, archived_meeting_id,
    coaching_note_id: 50, focus_finder_template_key: 'focus_finder_v1', system_scorecard_template_key: null,
    review_date: '2026-10-08', status: 'completed', completed_at: '2026-10-08T12:00:00Z',
    created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-08T12:00:00Z' };
  const tables = { focus_finder_dimensions: [], business_reviews: [review], meetings,
    coaching_notes: [{ id: 50, user_id: 'archived-member', created_at: review.created_at, m2_meeting_id: null }],
    business_review_additional_scorecards: [], business_review_focus_values: [],
    business_review_system_ratings: [], business_review_system_priorities: [], business_review_preparation_responses: [] };
  return { calls, client: { from(table) {
    assert.ok(table in tables, `Unexpected table ${table}`);
    let rows = tables[table];
    let columns = [];
    const call = { table, filters: [] };
    calls.push(call);
    const query = {
      select(value) { columns = value.split(',').map((column) => column.trim()); return query; },
      eq(column, value) { rows = rows.filter((row) => row[column] === value); return query; },
      in(column, values) { call.filters.push({ column, values: Array.from(values) }); rows = rows.filter((row) => values.some((value) => String(value) === String(row[column]))); return query; },
      gt(column, value) { rows = rows.filter((row) => row[column] > value); return query; },
      limit(count) { rows = rows.slice(0, count); return query; },
      range(start, end) { rows = rows.slice(start, end + 1); return query; },
      order() { return query; },
      then(resolve, reject) {
        return Promise.resolve({ data: rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))), error: null }).then(resolve, reject);
      },
    };
    return query;
  } } };
}

test('archived business review keeps its historical meeting reference and cancellation status', async () => {
  const { client, calls } = fixture({ archived_meeting_id: 100, meetings: [{ id: 100, ghl_status: 'cancelled' }] });
  const { reviews } = await exports.loadBusinessReviews(client, 'archived-member');
  assert.equal(reviews[0].meetingId, 100);
  assert.equal(reviews[0].meetingStatus, 'cancelled');
  assert.equal(reviews[0].meetingCancelled, true);
  assert.equal(reviews[0].coachingNoteId, 50);
  assert.deepEqual(calls.find((call) => call.table === 'meetings').filters, [{ column: 'id', values: [100] }]);
});

test('an active meeting takes precedence over historical linkage for display and status lookup', async () => {
  const { client, calls } = fixture({ meeting_id: 200, archived_meeting_id: 100,
    meetings: [{ id: 100, ghl_status: 'cancelled' }, { id: 200, ghl_status: 'confirmed' }] });
  const { reviews } = await exports.loadBusinessReviews(client, 'archived-member');
  assert.equal(reviews[0].meetingId, 200);
  assert.equal(reviews[0].meetingStatus, 'confirmed');
  assert.equal(reviews[0].meetingCancelled, false);
  assert.deepEqual(calls.find((call) => call.table === 'meetings').filters, [{ column: 'id', values: [200] }]);
});

test('standalone business reviews still load without issuing a meeting lookup', async () => {
  const { client, calls } = fixture();
  const { reviews } = await exports.loadBusinessReviews(client, 'archived-member');
  assert.equal(reviews[0].meetingId, null);
  assert.equal(reviews[0].meetingStatus, null);
  assert.equal(reviews[0].meetingCancelled, false);
  assert.equal(calls.some((call) => call.table === 'meetings'), false);
});
