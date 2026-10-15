import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as luxon from 'luxon';

function loadModule(path, imports, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, URL, URLSearchParams, AbortSignal, Date, console, process: { env: { NODE_ENV: 'test' } }, ...globals,
    require(name) { assert.ok(name in imports, `Unexpected import ${name}`); return imports[name]; } });
  return exports;
}
const shared = loadModule('../src/lib/coachHomeShared.ts', { luxon });
const schedule = loadModule('../src/lib/coachSchedule.ts', { 'server-only': {}, luxon, '@/lib/currentMembers': {} });

function joinFixture({ event = { id: 'appointment', meetingLocation: 'https://zoom.us/j/example' }, key = 'appointment', ok = true, base = 'https://example.com' } = {}) {
  const requests = [];
  const service = loadModule('../src/lib/coachMeetingJoin.ts', {
    'server-only': {}, '@/lib/coachHomeShared': shared, '@/lib/coachSchedule': schedule,
    '@/lib/config': { GHL: { BASE: base, TOKEN: 'test-token', VERSION: 'test' } },
  }, { fetch: async (url, options) => { requests.push({ url, options }); return { ok, json: async () => ({ [key]: event }) }; } });
  return { ...service, requests };
}

test('call-link resolution reads one known appointment and retains its safe join URL', async () => {
  const env = joinFixture();
  assert.equal(await env.resolveCoachMeetingJoinUrl('appointment'), 'https://zoom.us/j/example');
  assert.equal(env.requests.length, 1);
  assert.equal(env.requests[0].url, 'https://example.com/calendars/events/appointments/appointment');
  assert.equal(env.requests[0].options.redirect, 'error');
});

test('call links support the live address field and the preview event envelope', async () => {
  assert.equal(await joinFixture({ event: { id: 'appointment', address: 'https://us06web.zoom.us/j/example' } })
    .resolveCoachMeetingJoinUrl('appointment'), 'https://us06web.zoom.us/j/example');
  assert.equal(await joinFixture({ key: 'event' }).resolveCoachMeetingJoinUrl('appointment'), 'https://zoom.us/j/example');
});

test('cancelled, unrelated and unsafe appointment URLs are not opened', async () => {
  for (const event of [
    { id: 'other', meetingLocation: 'https://zoom.us/j/other' },
    { id: 'appointment', appointmentStatus: 'No_Show', meetingLocation: 'https://zoom.us/j/example' },
    { id: 'appointment', deleted: true, meetingLocation: 'https://zoom.us/j/example' },
    { id: 'appointment', meetingLocation: 'javascript:alert(1)' },
  ]) assert.equal(await joinFixture({ event }).resolveCoachMeetingJoinUrl('appointment'), null);
});

test('upstream and invalid connection failures remain explicit', async () => {
  await assert.rejects(() => joinFixture({ ok: false }).resolveCoachMeetingJoinUrl('appointment'));
  const env = joinFixture({ base: 'http://untrusted.example' });
  await assert.rejects(() => env.resolveCoachMeetingJoinUrl('appointment'));
  assert.equal(env.requests.length, 0);
});

class TestResponse {
  constructor(body, options = {}) { this.body = body; this.status = options.status ?? 200; this.headers = new Map(Object.entries(options.headers ?? {})); }
  static json(body, options) { return new TestResponse(body, options); }
  static redirect(url, status) { const response = new TestResponse(null, { status }); response.url = url; return response; }
}
function routeFixture({ guard = { ok: true, roleCodes: ['coach'], user: { id: 'coach' } }, meetings = [{ meeting: { ghl_appointment_id: 'appointment' } }], failure = false } = {}) {
  let privilegedReads = 0, ghlReads = 0;
  const route = loadModule('../src/app/api/coach/meetings/[meetingId]/join/route.ts', {
    'next/server': { NextResponse: TestResponse }, '@/lib/requireUser': { requireUser: async () => guard },
    '@/lib/supabaseAdmin': { getAdminClient: () => { privilegedReads++; return {}; } },
    '@/lib/coachHomeShared': shared,
    '@/lib/coachSchedule': {
      loadCoachAssignments: async (_client, id) => { assert.equal(id, 'coach'); return []; },
      loadCoachSchedule: async (_client, id, _assignments, _range, meetingId) => { assert.equal(id, 'coach'); assert.equal(meetingId, 123); return meetings; },
    },
    '@/lib/coachMeetingJoin': { resolveCoachMeetingJoinUrl: async () => { ghlReads++; if (failure) throw new Error('Offline'); return 'https://zoom.us/j/example'; } },
  });
  return { request: (id = '123') => route.GET({}, { params: Promise.resolve({ meetingId: id }) }), reads: () => ({ privilegedReads, ghlReads }) };
}

test('joining enforces authentication and coach role before any privileged read', async () => {
  const anonymous = routeFixture({ guard: { ok: false, res: { status: 401 } } });
  assert.equal((await anonymous.request()).status, 401);
  assert.equal(anonymous.reads().privilegedReads, 0);
  const member = routeFixture({ guard: { ok: true, roleCodes: ['user'], user: { id: 'member' } } });
  assert.equal((await member.request()).status, 403);
  assert.equal(member.reads().privilegedReads, 0);
});

test('a meeting outside the authorized roster/type scope never requests its GHL URL', async () => {
  const env = routeFixture({ meetings: [] });
  assert.equal((await env.request()).status, 404);
  assert.equal(env.reads().ghlReads, 0);
});

test('invalid meeting identifiers are rejected before looking up data', async () => {
  for (const id of ['abc', '1e2', '-1', '9007199254740993']) {
    const env = routeFixture();
    assert.equal((await env.request(id)).status, 404);
    assert.equal(env.reads().privilegedReads, 0);
  }
});

test('an authorized call redirects without caching and an unavailable call has a readable fallback', async () => {
  const response = await routeFixture().request();
  assert.equal(response.status, 303);
  assert.equal(response.url, 'https://zoom.us/j/example');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const failed = await routeFixture({ failure: true }).request();
  assert.equal(failed.status, 503);
  assert.match(failed.body, /Call link unavailable/);
  assert.ok(!failed.body.includes('Offline'));
});
