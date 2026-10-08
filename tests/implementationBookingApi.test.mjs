import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
function loadModule(path, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, process, console: { ...console, error() {} },
    require: (name) => Object.hasOwn(imports, name) ? imports[name] : require(name),
  });
  return exports;
}
const userRoles = loadModule('../src/lib/userRoles.ts');
const businessReviews = loadModule('../src/lib/businessReviews.ts', { '@/lib/userRoles': userRoles, '@/lib/partnershipScope': {} });
const implementationApi = loadModule('../src/lib/implementationApi.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
const memberId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1641';
const otherMemberId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1642';
const actorId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1643';
const validRequest = {
  userId: memberId, noteId: 42, meetingId: 123, expectedRevision: 7,
  operation: 'set_next_meeting_booked', payload: { booked: true },
};

function apiFor({
  authenticated = true, allowed = true,
  cycle = { id: 42, user_id: memberId }, cycleError = null,
  rpcError = null, loadError = null, booked = true, attendanceAllowed = true, attendanceError = null,
} = {}) {
  const calls = [];
  const workspace = {
    selectedNoteId: 42, cycles: [{ id: 'business_audit:20', noteId: 42 }],
    activeCycleId: 'business_audit:20', cycleEndDate: null, nextAuditDate: null,
    meetings: [
      { id: 122, session: { id: 'history', revision: 4, nextMeetingBooked: false } },
      { id: 123, session: { id: 'selected', revision: 8, nextMeetingBooked: booked } },
      { id: 124, session: { id: 'latest', revision: 2, nextMeetingBooked: true } },
    ],
    upcomingBusinessReview: null, bookingCoaches: { implementation: null, businessReview: null }, suggestedMeetingId: 124, latestSessionId: 'latest',
    actions: [], stepNotes: [], resources: [],
  };
  const guard = { ok: true, user: { id: actorId }, roleCodes: ['implementation_coach'], supabase: {} };
  const admin = {
    from(table) {
      assert.equal(table, 'coaching_notes');
      const filters = [];
      const call = { kind: 'cycle', columns: null, filters };
      calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(column, value) { filters.push({ column, value }); return query; },
        maybeSingle: async () => ({
          data: cycle && filters.every(({ column, value }) => cycle[column] === value) ? { id: cycle.id } : null,
          error: cycleError,
        }),
      };
      return query;
    },
  };
  const actor = {
    async rpc(name, args) {
      if (name === 'can_manage_coaching_attendance') {
        calls.push({ kind: 'attendance-access', args });
        return { data: attendanceAllowed, error: attendanceError };
      }
      assert.equal(name, 'mutate_implementation_workspace');
      calls.push({ kind: 'rpc', name, args });
      return { data: { id: 'mutation-result', revision: 8 }, error: rpcError };
    },
  };
  const api = loadModule('../src/app/api/implementation-workspace/route.ts', {
    '@/lib/requireUser': { requireUser: async () => authenticated ? guard : {
      ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } },
    '@/lib/supabaseAdmin': { getAdminClient() { calls.push({ kind: 'admin' }); return admin; } },
    '@/lib/businessReviews': businessReviews,
    '@/lib/implementationApi': { ...implementationApi, implementationActorClient(request, actualGuard) {
      assert.equal(actualGuard, guard);
      calls.push({ kind: 'actor', authorization: request.headers.get('authorization') });
      return actor;
    } },
    '@/lib/implementationWorkspaceServer': {
      async canAccessImplementationWorkspace(client, actualActorId, roles, userId) {
        assert.equal(client, admin);
        calls.push({ kind: 'access', actorId: actualActorId, roles, userId });
        return allowed;
      },
      async loadImplementationWorkspace(client, userId, noteId, options) {
        assert.equal(client, admin);
        calls.push({ kind: 'load', userId, noteId, options });
        if (loadError) throw loadError;
        return workspace;
      },
    },
  });
  return {
    calls, workspace,
    post: (body = validRequest, raw = false) => api.POST(new NextRequest('https://reboot.example/api/implementation-workspace', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer actor-token' },
      body: raw ? body : JSON.stringify(body),
    })),
  };
}

test('booking changes require authentication and member access before cycle lookup or mutation', async () => {
  const unauthenticated = apiFor({ authenticated: false });
  assert.equal((await unauthenticated.post()).status, 401);
  assert.equal(unauthenticated.calls.length, 0);
  const unauthorized = apiFor({ allowed: false });
  assert.equal((await unauthorized.post()).status, 403);
  assert.deepEqual(plain(unauthorized.calls), [
    { kind: 'admin' },
    { kind: 'access', actorId, roles: ['implementation_coach'], userId: memberId },
  ]);
});

test('the booking operation requires exactly one boolean payload field', async () => {
  const api = apiFor();
  const missingPayload = { ...validRequest };
  delete missingPayload.payload;
  const invalidBodies = [missingPayload];
  for (const payload of [null, [], 'true', true, 1, {}, { booked: null }, { booked: 1 },
    { booked: 'false' }, { booked: [] }, { booked: {} }, { booked: true, meetingId: 124 },
    { booked: true, extra: false }]) invalidBodies.push({ ...validRequest, payload });
  for (const body of invalidBodies) {
    assert.equal((await api.post(body)).status, 400, `Invalid booking payload: ${JSON.stringify(body.payload)}`);
  }
  assert.equal(api.calls.length, 0, 'Malformed booking payloads must not reach the database');
});

test('invalid member, cycle, meeting, revision and JSON values cannot reach the booking mutation', async () => {
  const api = apiFor();
  for (const body of [
    null, [], {}, { ...validRequest, userId: otherMemberId.slice(1) },
    { ...validRequest, noteId: 0 }, { ...validRequest, noteId: '42' },
    { ...validRequest, meetingId: 0 }, { ...validRequest, meetingId: '123' },
    { ...validRequest, meetingId: Number.MAX_SAFE_INTEGER + 1 },
    { ...validRequest, expectedRevision: -1 }, { ...validRequest, expectedRevision: 1.5 },
    { ...validRequest, expectedRevision: '7' },
  ]) assert.equal((await api.post(body)).status, 400);
  assert.equal((await api.post('{invalid', true)).status, 400);
  assert.equal(api.calls.length, 0);
});

test('a missing or other-member cycle cannot update a meeting’s booking state', async () => {
  for (const cycle of [null, { id: 42, user_id: otherMemberId }, { id: 43, user_id: memberId }]) {
    const api = apiFor({ cycle });
    assert.equal((await api.post()).status, 400);
    assert.ok(!api.calls.some((call) => ['actor', 'rpc', 'load'].includes(call.kind)));
    const lookup = api.calls.find((call) => call.kind === 'cycle');
    assert.equal(lookup.columns, 'id');
    assert.deepEqual(plain(lookup.filters), [{ column: 'id', value: 42 }, { column: 'user_id', value: memberId }]);
  }
});

test('both checking and unchecking target only the selected meeting and return the refreshed workspace', async () => {
  for (const booked of [true, false]) {
    const api = apiFor({ booked });
    const response = await api.post({ ...validRequest, payload: { booked } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), api.workspace);
    assert.deepEqual(plain(api.calls), [
      { kind: 'admin' },
      { kind: 'access', actorId, roles: ['implementation_coach'], userId: memberId },
      { kind: 'cycle', columns: 'id', filters: [{ column: 'id', value: 42 }, { column: 'user_id', value: memberId }] },
      { kind: 'actor', authorization: 'Bearer actor-token' },
      { kind: 'rpc', name: 'mutate_implementation_workspace', args: {
        _user_id: memberId, _note_id: 42, _meeting_id: 123, _operation: 'set_next_meeting_booked',
        _payload: { booked }, _expected_revision: 7,
      } },
      { kind: 'attendance-access', args: { _user_id: memberId } },
      { kind: 'load', userId: memberId, noteId: 42, options: { canReadAttendance: true } },
    ]);
  }
});

test('a stale revision returns a conflict and does not reload a success workspace', async () => {
  const api = apiFor({ rpcError: { code: '40001', message: 'This meeting was changed by another coach.' } });
  const response = await api.post();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'This meeting was changed by another coach.');
  assert.equal(api.calls.filter((call) => call.kind === 'rpc').length, 1);
  assert.ok(!api.calls.some((call) => call.kind === 'load'));
});

test('database permission and validation failures do not appear as successful booking changes', async () => {
  for (const [code, status] of [['42501', 403], ['22023', 400], ['PGRST202', 503]]) {
    const api = apiFor({ rpcError: { code, message: 'Booking update failed' } });
    assert.equal((await api.post()).status, status);
    assert.ok(!api.calls.some((call) => call.kind === 'load'));
  }
  const failedLookup = apiFor({ cycleError: { code: 'XX000', message: 'Lookup failed' } });
  assert.equal((await failedLookup.post()).status, 500);
  assert.ok(!failedLookup.calls.some((call) => ['rpc', 'load'].includes(call.kind)));
});

test('a workspace reload failure after the mutation is surfaced as an error', async () => {
  const api = apiFor({ loadError: { code: 'XX000', message: 'Reload failed' } });
  assert.equal((await api.post()).status, 500);
  assert.deepEqual(api.calls.filter((call) => ['rpc', 'load'].includes(call.kind)).map((call) => call.kind), ['rpc', 'load']);
});

test('a notes-shared booking update reloads without attendance unless the actor receives an explicit boolean grant', async () => {
  for (const attendanceAllowed of [false, null, 'true', {}, []]) {
    const api = apiFor({ attendanceAllowed });
    assert.equal((await api.post()).status, 200);
    assert.deepEqual(plain(api.calls.find((call) => call.kind === 'attendance-access').args), { _user_id: memberId });
    assert.deepEqual(plain(api.calls.find((call) => call.kind === 'load').options), { canReadAttendance: false });
    assert.equal(api.calls.filter((call) => call.kind === 'actor').length, 1, 'Mutation and scope read use the same authenticated actor');
    assert.equal(api.calls.filter((call) => call.kind === 'rpc').length, 1);
  }
});

test('attendance authorization failures after a booking save never fall back to privileged attendance reads', async () => {
  for (const [code, status] of [['XX000', 500], ['PGRST202', 503], ['42501', 403]]) {
    const api = apiFor({ attendanceError: { code, message: 'Attendance authorization failed' } });
    assert.equal((await api.post()).status, status);
    assert.equal(api.calls.filter((call) => call.kind === 'rpc').length, 1, 'The booking save already ran; the caller can reconcile its result');
    assert.equal(api.calls.filter((call) => call.kind === 'attendance-access').length, 1);
    assert.ok(!api.calls.some((call) => call.kind === 'load'));
  }
});
