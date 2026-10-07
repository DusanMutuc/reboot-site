import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/implementationBookingConfirmation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
vm.runInNewContext(source, { exports, URLSearchParams });
const { saveImplementationBookingConfirmation: save } = exports;
const target = { userId: 'bb8f369e-c343-4b6a-9c9c-5e15c54c1641', noteId: 42, meetingId: 123, sessionId: 'original-session' };
function workspace({ booked = false, revision = 7, sessionId = target.sessionId, noteId = 42, meetingId = 123, cancelled = false } = {}) {
  return { selectedNoteId: noteId, suggestedMeetingId: 999, meetings: [
    { id: meetingId, cancelled, attended: true, session: sessionId === null ? null : { id: sessionId, noteId, meetingId, revision,
      nextMeetingBooked: booked, notes: 'Existing notes', commitments: 'Existing commitments', status: 'completed' } },
    { id: 999, cancelled: false, session: { id: 'newest-session', noteId, meetingId: 999, revision: 11, nextMeetingBooked: true } },
  ] };
}
function reply(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
function mock(steps) {
  const calls = [];
  const request = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, init, body: init?.body && JSON.parse(init.body) });
    assert.ok(steps.length, `Unexpected ${method} ${url}`);
    const [expected, result] = steps.shift();
    assert.equal(method, expected);
    return typeof result === 'function' ? result() : result;
  };
  return { calls, request, done: () => assert.equal(steps.length, 0) };
}

test('confirmation pins the original source and writes only true with its latest revision', async () => {
  const api = mock([['GET', reply(workspace())], ['POST', reply(workspace({ booked: true, revision: 8 }))]]);
  const result = await save(target, api.request);
  assert.equal(result.status, 'saved');
  assert.equal(api.calls[0].url, `/api/implementation-workspace?userId=${target.userId}&noteId=42`);
  assert.equal(api.calls[0].init.cache, 'no-store');
  assert.deepEqual(api.calls[1].body, { userId: target.userId, noteId: 42, meetingId: 123,
    operation: 'set_next_meeting_booked', expectedRevision: 7, payload: { booked: true } });
  assert.equal(result.workspace.meetings[0].session.notes, 'Existing notes');
  api.done();
});

test('unstarted meetings wait without silently starting a session or changing attendance', async () => {
  const api = mock([['GET', reply(workspace({ sessionId: null }))]]);
  assert.equal((await save({ ...target, sessionId: null }, api.request)).status, 'waiting_for_session');
  api.done();
});

test('an already recorded confirmation does not write again', async () => {
  const api = mock([['GET', reply(workspace({ booked: true }))]]);
  assert.equal((await save(target, api.request)).status, 'saved');
  api.done();
});

test('a pending unstarted source can save after that exact meeting is started', async () => {
  const api = mock([['GET', reply(workspace())], ['POST', reply(workspace({ booked: true }))]]);
  assert.equal((await save({ ...target, sessionId: null }, api.request)).status, 'saved');
  api.done();
});

test('a conflict reloads the source revision before retrying without using the suggested meeting', async () => {
  const api = mock([['GET', reply(workspace())], ['POST', reply({}, 409)], ['GET', reply(workspace({ revision: 8 }))],
    ['POST', reply(workspace({ booked: true, revision: 9 }))]]);
  assert.equal((await save(target, api.request)).status, 'saved');
  assert.deepEqual(api.calls.filter(call => call.method === 'POST').map(call => call.body.expectedRevision), [7, 8]);
  assert.ok(api.calls.every(call => !call.body || call.body.meetingId === 123));
  api.done();
});

for (const [label, acknowledgement] of [
  ['network loss', () => { throw new Error('Connection lost'); }],
  ['server reload failure', reply({}, 500)],
  ['unreadable acknowledgement', new Response('not json', { status: 200 })],
]) test(`a committed write followed by ${label} is confirmed by GET without a duplicate write`, async () => {
  const api = mock([['GET', reply(workspace())], ['POST', acknowledgement], ['GET', reply(workspace({ booked: true, revision: 8 }))]]);
  assert.equal((await save(target, api.request)).status, 'saved');
  assert.equal(api.calls.filter(call => call.method === 'POST').length, 1);
  api.done();
});

test('an uncertain uncommitted write is retried only after a fresh GET', async () => {
  const api = mock([['GET', reply(workspace())], ['POST', () => { throw new Error('Network lost'); }],
    ['GET', reply(workspace({ revision: 9 }))], ['POST', reply(workspace({ booked: true, revision: 10 }))]]);
  assert.equal((await save(target, api.request)).status, 'saved');
  assert.equal(api.calls[3].body.expectedRevision, 9);
  api.done();
});

test('a successful HTTP response without the saved flag is not accepted as confirmation', async () => {
  const api = mock([['GET', reply(workspace())], ['POST', reply(workspace())],
    ['GET', reply(workspace({ booked: true }))]]);
  assert.equal((await save(target, api.request)).status, 'saved');
  api.done();
});

test('retries are bounded even if the workspace keeps changing', async () => {
  const steps = [['GET', reply(workspace())]];
  for (let revision = 8; revision <= 10; revision += 1) steps.push(['POST', reply({}, 409)], ['GET', reply(workspace({ revision }))]);
  const api = mock(steps);
  await assert.rejects(save(target, api.request), /retry saving/i);
  assert.equal(api.calls.filter(call => call.method === 'POST').length, 3);
  api.done();
});

for (const [label, body] of [
  ['cycle mismatch', workspace({ noteId: 43 })],
  ['missing original meeting', workspace({ meetingId: 124 })],
  ['cancelled original meeting', workspace({ cancelled: true })],
  ['changed source session', workspace({ sessionId: 'different-session' })],
  ['disappeared source session', workspace({ sessionId: null })],
  ['malformed response', {}],
  ['invalid revision', workspace({ revision: -1 })],
]) test(`${label} cannot receive a confirmation`, async () => {
  const api = mock([['GET', reply(body)]]);
  await assert.rejects(save(target, api.request));
  assert.equal(api.calls.length, 1);
  api.done();
});

test('a response for another source cannot falsely confirm a successful write', async () => {
  const api = mock([['GET', reply(workspace())], ['POST', reply(workspace({ booked: true, sessionId: 'different-session' }))]]);
  await assert.rejects(save(target, api.request), /session has changed/);
  api.done();
});

test('the discovered session stays pinned across an uncertain write', async () => {
  const api = mock([['GET', reply(workspace())], ['POST', reply({}, 500)], ['GET', reply(workspace({ sessionId: 'different-session' }))]]);
  await assert.rejects(save({ ...target, sessionId: null }, api.request), /session has changed/);
  api.done();
});

for (const status of [400, 401, 403]) test(`POST ${status} stops without retrying a rejected write`, async () => {
  const api = mock([['GET', reply(workspace())], ['POST', reply({}, status)]]);
  await assert.rejects(save(target, api.request));
  api.done();
});

for (const status of [401, 403, 500]) test(`GET ${status} cannot trigger any write`, async () => {
  const api = mock([['GET', reply({}, status)]]);
  await assert.rejects(save(target, api.request));
  api.done();
});

test('failed reconciliation leaves the confirmation unsaved for explicit retry', async () => {
  const api = mock([['GET', reply(workspace())], ['POST', reply({}, 500)], ['GET', () => { throw new Error('Offline'); }]]);
  await assert.rejects(save(target, api.request), /retry saving/i);
  api.done();
});

test('the caller cannot retarget an in-flight confirmation by mutating its input', async () => {
  const mutableTarget = { ...target };
  const api = mock([['GET', () => { mutableTarget.meetingId = 999; mutableTarget.noteId = 99; return reply(workspace()); }],
    ['POST', reply(workspace({ booked: true }))]]);
  assert.equal((await save(mutableTarget, api.request)).status, 'saved');
  assert.equal(api.calls[1].body.meetingId, 123);
  assert.equal(api.calls[1].body.noteId, 42);
  api.done();
});

test('invalid targets fail before any request', async () => {
  for (const changes of [{ userId: '' }, { noteId: -1 }, { meetingId: 0 }, { sessionId: '' }]) {
    const api = mock([]);
    await assert.rejects(save({ ...target, ...changes }, api.request), /valid original/);
    api.done();
  }
});
