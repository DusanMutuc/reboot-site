import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as currentMembers from '../src/lib/currentMembers.ts';
import * as memberPauses from '../src/lib/memberPauses.ts';

const require = createRequire(import.meta.url);
const assignment = (user_id, coach_id = 'coach') => ({
  user_id, coach_id, course_id: 2, is_active: true,
  relationship_type: 'primary', assigned_at: '2026-01-01T00:00:00Z',
});
const enrollment = (user_id, status = 'active', ended_at = null) => ({
  user_id, ended_at, ninety_day_cycles: { status },
});

function fixture({
  current = ['member'], past = ['past'],
  assignments = [assignment('member'), assignment('past')],
  partnerships = [], enrollments = [], pauses = [], failTable, membershipError,
} = {}) {
  const calls = [];
  const scans = [];
  const allIds = [...new Set([
    ...assignments.flatMap((row) => [row.user_id, row.coach_id]),
    ...partnerships.map((row) => row.user_id),
    ...enrollments.map((row) => row.user_id),
  ])];
  const tables = {
    user_coaches: assignments,
    partnership_users: partnerships,
    ninety_day_cycle_users: enrollments,
    user_roles: past.map((user_id) => ({ user_id, roles: { code: 'past_member' } })),
    member_pauses: pauses,
    profiles: allIds.map((id) => ({ id, first_name: id, last_name: 'Person', ghl_user_id: id })),
  };
  const valueAt = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
  const client = {
    rpc: async (name) => {
      assert.equal(name, 'get_current_member_ids');
      return { data: current.map((user_id) => ({ user_id })), error: membershipError ? { message: membershipError } : null };
    },
    from(table) {
      assert.ok(table in tables, `Unexpected table: ${table}`);
      let rows = tables[table];
      const call = { table, filters: [] };
      calls.push(call);
      const query = {
        select() { return query; },
        eq(key, value) { call.filters.push([key, value]); rows = rows.filter((row) => valueAt(row, key) === value); return query; },
        is(key, value) { return query.eq(key, value); },
        in(key, values) { call.filters.push([key, values]); rows = rows.filter((row) => values.includes(valueAt(row, key))); return query; },
        order() { return query; },
        then(resolve, reject) {
          return Promise.resolve({ data: rows, error: table === failTable ? { message: `Cannot read ${table}` } : null }).then(resolve, reject);
        },
      };
      return query;
    },
    auth: { admin: { listUsers: async () => ({ data: { users: allIds.map((id) => ({ id, email: `${id}@example.invalid` })) }, error: null }) } },
  };
  const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/bookingFollowUp.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const imports = {
    '@/lib/currentMembers': currentMembers,
    '@/lib/memberPauses': memberPauses,
    '@/lib/supabaseAdmin': { getAdminClient: () => client },
    '@/lib/config': { GHL: { BASE: 'https://calendar.example.invalid', TOKEN: 'fixture', VERSION: 'fixture', LOCATION_ID: 'fixture' } },
  };
  vm.runInNewContext(source, {
    exports, console, URL,
    require: (name) => imports[name] ?? require(name),
    fetch: async (url) => {
      scans.push(new URL(url).searchParams.get('userId'));
      return { ok: true, json: async () => ({ events: [] }) };
    },
  });
  return { build: exports.buildBookingFollowUp, client, calls, scans };
}

const memberIds = (report) => [...new Set(report.groups.flatMap((group) => group.members.flatMap((member) => member.memberIds)))].sort();
const partner = (user_id) => ({ user_id, partnership_id: 'pair', partnerships: { is_active: true } });

test('admin follow-up excludes past members with active coach assignments', async () => {
  const { build } = fixture();
  assert.deepEqual(memberIds(await build()), ['member']);
});

test('coach follow-up filters membership while retaining its coach scope', async () => {
  const { build } = fixture({ current: ['member', 'other'], assignments: [assignment('member'), assignment('past'), assignment('other', 'other-coach')] });
  const report = await build({ coachId: 'coach' });
  assert.deepEqual(memberIds(report), ['member']);
  assert.deepEqual(Array.from(report.groups, (group) => group.coachId), ['coach']);
});

test('an active partnership cannot reintroduce a past member or their coach', async () => {
  const { build, scans, calls } = fixture({ assignments: [assignment('member'), assignment('past', 'past-coach')], partnerships: [partner('member'), partner('past')] });
  assert.deepEqual(memberIds(await build({ coachId: 'coach' })), ['member']);
  assert.equal(scans.includes('past-coach'), false);
  const profileIds = calls.find((call) => call.table === 'profiles').filters.find(([key]) => key === 'id')[1];
  assert.equal(profileIds.includes('past'), false);
});

test('current partners still share a scheduling row even with different coaches', async () => {
  const { build } = fixture({ current: ['member', 'partner'], past: [], assignments: [assignment('member'), assignment('partner', 'partner-coach')], partnerships: [partner('member'), partner('partner')] });
  const report = await build({ coachId: 'coach' });
  assert.deepEqual(memberIds(report), ['member', 'partner']);
  assert.equal(report.groups[0].members.length, 1);
});

test('active programme members remain eligible but ended and inactive enrolments do not', async () => {
  const { build } = fixture({ current: [], past: [], assignments: ['active', 'ended', 'inactive'].map((id) => assignment(id)), enrollments: [enrollment('active'), enrollment('ended', 'active', '2026-01-02'), enrollment('inactive', 'completed')] });
  assert.deepEqual(memberIds(await build()), ['active']);
});

test('past-member status overrides an otherwise active programme enrolment', async () => {
  const { build, client } = fixture({ enrollments: [enrollment('past'), enrollment('programme')], assignments: [assignment('member'), assignment('past'), assignment('programme')] });
  assert.deepEqual((await currentMembers.fetchCoachingWorkspaceUserIds(client)).sort(), ['member', 'programme']);
  assert.deepEqual(memberIds(await build()), ['member', 'programme']);
});

test('paused current members remain visible without booking reminders', async () => {
  const { build } = fixture({ pauses: [{ id: 'pause', user_id: 'member', started_at: '2026-01-01T00:00:00Z', ended_at: null, reason: null }] });
  const report = await build();
  assert.deepEqual(memberIds(report), ['member']);
  const row = report.groups[0].members[0];
  assert.equal(row.pauseStartedAt, '2026-01-01T00:00:00Z');
  assert.equal(row.isNewMember || row.needsImplementation || row.needsM2, false);
});

test('an ineligible-only roster returns an empty report without calendar scans', async () => {
  const { build, scans } = fixture({ current: [], assignments: [assignment('past')] });
  assert.equal((await build()).groups.length, 0);
  assert.equal(scans.length, 0);
});

test('membership lookup failures stop the report instead of showing an unfiltered roster', async () => {
  for (const options of [{ membershipError: 'Membership unavailable' }, { failTable: 'ninety_day_cycle_users' }, { failTable: 'user_roles', enrollments: [enrollment('past')] }]) {
    const { build, scans } = fixture(options);
    await assert.rejects(() => build(), /unavailable|Cannot read/);
    assert.equal(scans.length, 0);
  }
});

test('programme eligibility checks every batch of revoked memberships', async () => {
  const ids = Array.from({ length: 205 }, (_, index) => `programme-${index}`);
  const { client } = fixture({ current: [], enrollments: ids.map((id) => enrollment(id)), past: [ids[204]] });
  const actual = await currentMembers.fetchCoachingWorkspaceUserIds(client);
  assert.equal(actual.length, 204);
  assert.equal(actual.includes(ids[204]), false);
});
