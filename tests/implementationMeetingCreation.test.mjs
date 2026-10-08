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

const memberId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1621';
const otherMemberId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1622';
const actorId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1623';
const requestId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1624';
const validRequest = { userId: memberId, noteId: 42, meetingDate: '2026-09-29', requestId };

function apiFor({
  authenticated = true, allowed = true, accessError = null,
  cycle = { id: 42, user_id: memberId }, cycleError = null,
  rpcError = null, rpcData = { meeting_id: 123, created: true },
  loadErrors = [], attendanceAllowed = true, attendanceError = null,
} = {}) {
  const calls = [];
  const workspace = {
    selectedNoteId: 42, cycles: [{ id: 'business_audit:20', noteId: 42 }],
    activeCycleId: 'business_audit:20', cycleEndDate: null, nextAuditDate: null,
    meetings: [{ id: 123, date: validRequest.meetingDate, session: null, attended: false }],
    suggestedMeetingId: 123, latestSessionId: null, actions: [], stepNotes: [], resources: [], upcomingBusinessReview: null,
    bookingCoaches: { implementation: null, businessReview: null },
  };
  const guard = { ok: true, user: { id: actorId }, roleCodes: ['implementation_coach'], supabase: {} };
  const admin = {
    from(table) {
      assert.equal(table, 'coaching_notes', 'Ownership must use the visible, non-deleted coaching cycle view');
      const filters = [];
      const call = { kind: 'cycle', table, columns: null, filters };
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
      assert.equal(name, 'create_implementation_meeting');
      calls.push({ kind: 'rpc', name, args });
      return { data: typeof rpcData === 'function' ? rpcData(args) : rpcData, error: rpcError };
    },
  };
  let loadCount = 0;
  const api = loadModule('../src/app/api/implementation-workspace/meetings/route.ts', {
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
        if (accessError) throw accessError;
        return allowed;
      },
      async loadImplementationWorkspace(client, userId, noteId, options) {
        assert.equal(client, admin);
        calls.push({ kind: 'load', userId, noteId, options });
        const error = loadErrors[loadCount++];
        if (error) throw error;
        return workspace;
      },
    },
  });
  return {
    calls, workspace,
    post: (body = validRequest, { raw = false, bearer = true } = {}) => api.POST(new NextRequest(
      'https://reboot.example/api/implementation-workspace/meetings', {
        method: 'POST', headers: {
          'content-type': 'application/json', ...(bearer ? { authorization: 'Bearer actor-token' } : {}),
        }, body: raw ? body : JSON.stringify(body),
      },
    )),
  };
}

test('unauthenticated creation stops before member lookup, cycle lookup, or mutation', async () => {
  const api = apiFor({ authenticated: false });
  assert.equal((await api.post()).status, 401);
  assert.equal(api.calls.length, 0);
});

test('unauthorized members are rejected before cycle lookup and any actor RPC', async () => {
  const api = apiFor({ allowed: false });
  assert.equal((await api.post()).status, 403);
  assert.deepEqual(plain(api.calls), [
    { kind: 'admin' },
    { kind: 'access', actorId, roles: ['implementation_coach'], userId: memberId },
  ]);
});

test('creation requires exactly four valid fields and a real ISO calendar date', async () => {
  const api = apiFor();
  const invalidBodies = [null, [], 'meeting', {}, { ...validRequest, extra: true }];
  for (const key of Object.keys(validRequest)) {
    const body = { ...validRequest };
    delete body[key];
    invalidBodies.push(body);
  }
  for (const userId of ['', 'invalid', 12, null]) invalidBodies.push({ ...validRequest, userId });
  for (const noteId of [0, -1, 1.5, '42', null, Number.MAX_SAFE_INTEGER + 1]) invalidBodies.push({ ...validRequest, noteId });
  for (const meetingDate of ['', '2026-9-29', '2026-02-29', '2026-04-31', '2026-13-01',
    '2026-09-00', '2026-09-29T00:00:00Z', ' 2026-09-29 ', 20260929, null]) {
    invalidBodies.push({ ...validRequest, meetingDate });
  }
  for (const value of ['', 'invalid', 12, null]) invalidBodies.push({ ...validRequest, requestId: value });
  for (const body of invalidBodies) {
    assert.equal((await api.post(body)).status, 400, `Invalid body: ${JSON.stringify(body)}`);
  }
  assert.equal((await api.post('{not-json', { raw: true })).status, 400);
  assert.equal(api.calls.length, 0, 'Invalid requests must not start database work');
});

test('missing, deleted, or other-member cycles cannot reach meeting creation', async () => {
  for (const cycle of [null, { id: 42, user_id: otherMemberId }, { id: 43, user_id: memberId }]) {
    const api = apiFor({ cycle });
    assert.equal((await api.post()).status, 400);
    assert.ok(!api.calls.some((call) => ['actor', 'rpc', 'load'].includes(call.kind)));
    const lookup = api.calls.find((call) => call.kind === 'cycle');
    assert.equal(lookup.columns, 'id');
    assert.deepEqual(plain(lookup.filters), [{ column: 'id', value: 42 }, { column: 'user_id', value: memberId }]);
  }
});

test('creation forwards the authenticated actor and request ID, then reloads the selected cycle', async () => {
  const api = apiFor();
  const response = await api.post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { meetingId: 123, created: true, ...api.workspace });
  assert.deepEqual(plain(api.calls), [
    { kind: 'admin' },
    { kind: 'access', actorId, roles: ['implementation_coach'], userId: memberId },
    { kind: 'cycle', table: 'coaching_notes', columns: 'id', filters: [
      { column: 'id', value: 42 }, { column: 'user_id', value: memberId },
    ] },
    { kind: 'actor', authorization: 'Bearer actor-token' },
    { kind: 'rpc', name: 'create_implementation_meeting', args: {
      _user_id: memberId, _note_id: 42, _meeting_date: '2026-09-29', _request_id: requestId,
    } },
    { kind: 'attendance-access', args: { _user_id: memberId } },
    { kind: 'load', userId: memberId, noteId: 42, options: { canReadAttendance: true } },
  ]);
});

test('valid leap dates and cookie-authenticated callers use the same actor-bound mutation', async () => {
  const api = apiFor();
  assert.equal((await api.post({ ...validRequest, meetingDate: '2024-02-29' }, { bearer: false })).status, 200);
  assert.equal(api.calls.find((call) => call.kind === 'actor').authorization, null);
  assert.equal(api.calls.find((call) => call.kind === 'rpc').args._meeting_date, '2024-02-29');
});

test('an existing meeting returned by the RPC preserves created false in the response', async () => {
  const api = apiFor({ rpcData: { meeting_id: 456, created: false } });
  const response = await api.post();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.meetingId, 456);
  assert.equal(body.created, false);
  assert.equal(api.calls.filter((call) => call.kind === 'rpc').length, 1);
  assert.equal(api.calls.filter((call) => call.kind === 'load').length, 1);
});

test('access and ownership lookup failures stop before mutation', async () => {
  for (const options of [
    { accessError: { code: 'XX000', message: 'Authorization lookup failed' } },
    { cycleError: { code: 'XX000', message: 'Cycle lookup failed' } },
  ]) {
    const api = apiFor(options);
    assert.equal((await api.post()).status, 500);
    assert.ok(!api.calls.some((call) => ['actor', 'rpc', 'load'].includes(call.kind)));
  }
});

test('stale cycle conflicts and other RPC failures are propagated without a workspace reload', async () => {
  for (const [code, status] of [['40001', 409], ['42501', 403], ['22023', 400], ['PGRST202', 503], ['XX000', 500]]) {
    const api = apiFor({ rpcError: { code, message: 'Meeting creation failed' } });
    const response = await api.post();
    assert.equal(response.status, status);
    assert.ok((await response.json()).error);
    assert.equal(api.calls.filter((call) => call.kind === 'rpc').length, 1);
    assert.ok(!api.calls.some((call) => call.kind === 'load'));
  }
});

test('invalid database result shapes cannot masquerade as a successfully created meeting', async () => {
  for (const rpcData of [
    null, [], [{ meeting_id: 123, created: true }], {}, { meeting_id: 123 }, { created: true },
    { meeting_id: '123', created: true }, { meeting_id: 0, created: true }, { meeting_id: -1, created: true },
    { meeting_id: 1.5, created: true }, { meeting_id: Number.MAX_SAFE_INTEGER + 1, created: true },
    { meeting_id: 123, created: 'false' }, { meeting_id: 123, created: null },
  ]) {
    const api = apiFor({ rpcData });
    assert.equal((await api.post()).status, 500, `Invalid database result: ${JSON.stringify(rpcData)}`);
    assert.ok(!api.calls.some((call) => call.kind === 'load'));
  }
});

test('a reload failure after commit can be retried with the original request ID', async () => {
  let rpcCount = 0;
  const api = apiFor({
    rpcData: () => ({ meeting_id: 123, created: rpcCount++ === 0 }),
    loadErrors: [{ code: 'XX000', message: 'Workspace reload failed after commit' }],
  });
  assert.equal((await api.post()).status, 500);
  const retry = await api.post();
  assert.equal(retry.status, 200);
  const body = await retry.json();
  assert.equal(body.meetingId, 123);
  assert.equal(body.created, false);
  assert.equal(body.selectedNoteId, 42);
  const mutations = api.calls.filter((call) => call.kind === 'rpc');
  assert.equal(mutations.length, 2);
  assert.deepEqual(plain(mutations[0].args), plain(mutations[1].args));
  assert.equal(mutations[1].args._request_id, requestId);
});

test('meeting creation rechecks attendance permission for its response and does not treat malformed grants as true', async () => {
  for (const attendanceAllowed of [false, null, 'true', {}, []]) {
    const api = apiFor({ attendanceAllowed });
    assert.equal((await api.post()).status, 200);
    assert.deepEqual(plain(api.calls.find((call) => call.kind === 'attendance-access').args), { _user_id: memberId });
    assert.deepEqual(plain(api.calls.find((call) => call.kind === 'load').options), { canReadAttendance: false });
    assert.equal(api.calls.filter((call) => call.kind === 'actor').length, 1);
    assert.equal(api.calls.filter((call) => call.kind === 'rpc').length, 1);
  }
});

test('attendance authorization errors after meeting creation cannot return an unrestricted workspace', async () => {
  for (const [code, status] of [['XX000', 500], ['PGRST202', 503], ['42501', 403]]) {
    const api = apiFor({ attendanceError: { code, message: 'Attendance authorization failed' } });
    assert.equal((await api.post()).status, status);
    assert.equal(api.calls.filter((call) => call.kind === 'rpc').length, 1);
    assert.equal(api.calls.filter((call) => call.kind === 'attendance-access').length, 1);
    assert.ok(!api.calls.some((call) => call.kind === 'load'));
  }
});
