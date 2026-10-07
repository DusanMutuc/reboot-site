import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as businessAuditConfig from '../src/lib/businessAuditConfig.ts';
import * as userRoles from '../src/lib/userRoles.ts';

function loadModule(path, imports) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => {
    assert.ok(name in imports, `Unexpected module ${name}`);
    return imports[name];
  } });
  return exports;
}
const businessReviews = loadModule('../src/lib/businessReviews.ts', { '@/lib/userRoles': userRoles });
const { loadCoachingCycles } = loadModule('../src/lib/coachingCycles.ts', {
  '@/lib/businessAuditConfig': businessAuditConfig,
  '@/lib/businessReviews': businessReviews,
});

function clientFor({ notes = [], reviews = [], meetings = [] }) {
  const tables = { coaching_notes: notes, business_reviews: reviews, meetings };
  return { from(table) {
    assert.ok(table in tables);
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; }, in() { return query; },
      then(resolve, reject) { return Promise.resolve({ data: tables[table], error: null }).then(resolve, reject); },
    };
    return query;
  } };
}

test('M2 cancellation excludes a newer cancelled cycle from active selection', async () => {
  const result = await loadCoachingCycles(clientFor({
    notes: [
      { id: 1, created_at: '2020-01-01T18:00:00Z', m2_meeting_id: 10 },
      { id: 2, created_at: '2020-02-01T18:00:00Z', m2_meeting_id: 11 },
    ],
    meetings: [
      { id: 10, date: '2020-01-01', ghl_status: null },
      { id: 11, date: '2020-02-01', ghl_status: 'No_Show' },
    ],
  }), 'member');
  assert.equal(result.activeCycleId, 'm2:1');
  assert.equal(result.cycles.find((cycle) => cycle.noteId === 2).cancelled, true);
});

test('M2 fallback dates use Edmonton midnight boundaries in summer and winter', async () => {
  const result = await loadCoachingCycles(clientFor({ notes: [
    { id: 1, created_at: '2020-09-26T01:00:00Z', m2_meeting_id: null },
    { id: 2, created_at: '2020-01-26T06:30:00Z', m2_meeting_id: 999 },
  ] }), 'member');
  assert.equal(result.cycles.find((cycle) => cycle.noteId === 1).cycleDate, '2020-09-25');
  assert.equal(result.cycles.find((cycle) => cycle.noteId === 2).cycleDate, '2020-01-25');
});

test('an explicit M2 meeting date remains authoritative and a linked review takes precedence', async () => {
  const result = await loadCoachingCycles(clientFor({
    notes: [
      { id: 1, created_at: '2020-09-26T01:00:00Z', m2_meeting_id: 10 },
      { id: 2, created_at: '2020-09-26T01:00:00Z', m2_meeting_id: 10 },
    ],
    meetings: [{ id: 10, date: '2020-09-26', ghl_status: 'cancelled' }],
    reviews: [{ id: 20, coaching_note_id: 2, meeting_id: null, review_date: '2020-10-01' }],
  }), 'member');
  assert.equal(result.cycles.find((cycle) => cycle.noteId === 1).cycleDate, '2020-09-26');
  assert.equal(result.cycles.find((cycle) => cycle.noteId === 2).kind, 'business_audit');
  assert.equal(result.cycles.find((cycle) => cycle.noteId === 2).cancelled, false);
  assert.equal(result.activeCycleId, 'business_audit:20');
});
