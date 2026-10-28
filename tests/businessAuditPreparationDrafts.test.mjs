import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as shared from '../src/lib/businessAuditPreparationShared.ts';

const require = createRequire(import.meta.url);
const clone = (v) => JSON.parse(JSON.stringify(v));
function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, Error, console, require: (name) => imports[name] ?? require(name) });
  return exports;
}
const { PreparationDraftEditor, PreparationSaveError } = load('../src/lib/businessAuditPreparationDrafts.ts', {
  './businessAuditPreparationShared': shared,
});
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const empty = () => ({ ...shared.EMPTY_PREPARATION });
const complete = () => ({ ...Object.fromEntries(shared.BUSINESS_AUDIT_TEXT_FIELDS.map((key) => [key, 'A thoughtful answer'])), businessRating: 8, personalRating: 6 });
const payload = () => ({ userId: uuid(1), audit: { id: 42 }, answers: null, draft: null });

function setup(initial = payload(), backup = null) {
  const requests = [];
  let sequence = 1;
  let localBackup;
  let current = clone(initial);
  const io = {
    requestId: () => uuid(++sequence), backup: (v) => { localBackup = clone(v); }, changed() {},
    reload: async () => clone(current),
    write(request) {
      const call = { request: clone(request) }; requests.push(call);
      return new Promise((resolve, reject) => {
        call.reject = reject;
        call.finish = () => {
          if (request.expectedRevision !== (current.draft?.revision ?? 0)
            && request.requestId !== current.draft?.lastRequestId) {
            reject(new PreparationSaveError('conflict', 409)); return;
          }
          if (request.requestId !== current.draft?.lastRequestId) {
            current.draft = { values: clone(request.values), revision: request.expectedRevision + 1,
              submittedRevision: request.mode === 'submit' ? request.expectedRevision + 1 : current.draft?.submittedRevision ?? null,
              updatedAt: '2026-10-16T10:00:00Z', lastRequestId: request.requestId };
            if (request.mode === 'submit') current.answers = { ...clone(request.values), submittedAt: current.draft.updatedAt, updatedAt: current.draft.updatedAt };
          }
          resolve({ businessReviewId: 42, draft: clone(current.draft), answers: clone(current.answers) });
        };
      });
    },
  };
  return { editor: new PreparationDraftEditor(initial, io, backup), requests, io,
    backup: () => clone(localBackup), state: () => clone(current), replace: (v) => { current = clone(v); } };
}
async function tick() { for (let n = 0; n < 15; n++) await Promise.resolve(); }

test('partial drafts allow blanks, never relax final submission or allowed ratings', () => {
  assert.deepEqual(shared.validatePreparation(empty(), false), {});
  assert.equal(Object.keys(shared.validatePreparation(empty(), true)).length, 8);
  assert.equal(Object.keys(shared.validatePreparation({ ...empty(), businessRating: 5 }, false)).length, 1);
  assert.equal(Object.keys(shared.validatePreparation({ ...empty(), personalRating: '8' }, false)).length, 1);
  assert.equal(Object.keys(shared.validatePreparation({ ...empty(), topicsToDiscuss: 'x'.repeat(10001) }, false)).length, 1);
});

test('a pending autosave never acknowledges newer typing and writes remain serialized', async () => {
  const app = setup(); const e = app.editor;
  e.edit('businessForwardWins', 'first');
  const first = e.save();
  e.edit('businessForwardWins', 'newer');
  const second = e.save();
  assert.equal(app.requests.length, 1);
  app.requests[0].finish(); await first; await tick();
  assert.equal(e.values.businessForwardWins, 'newer');
  assert.equal(e.dirty, true);
  assert.equal(app.requests.length, 2);
  assert.equal(app.requests[1].request.expectedRevision, 1);
  app.requests[1].finish(); await second;
  assert.equal(e.dirty, false);
  assert.equal(app.state().answers, null, 'autosaving all or some fields never submits');
  assert.equal(app.backup(), null);
});

test('explicit submit waits for the in-flight draft and publishes the newest complete snapshot', async () => {
  const app = setup(); const e = app.editor;
  e.edit('businessForwardWins', 'first'); const save = e.save();
  for (const [key, value] of Object.entries(complete())) e.edit(key, value);
  const submit = e.submit();
  app.requests[0].finish(); await save; await tick();
  assert.equal(app.requests.length, 2);
  assert.equal(app.requests[1].request.mode, 'submit');
  assert.equal(app.requests[1].request.expectedRevision, 1);
  app.requests[1].finish(); assert.equal(await submit, true);
  assert.equal(e.submitted, true); assert.equal(e.hasUnsubmittedChanges, false);
  e.edit('topicsToDiscuss', 'Not ready to send'); const draft = e.save();
  app.requests[2].finish(); await draft;
  assert.equal(app.state().answers.topicsToDiscuss, 'A thoughtful answer');
  assert.equal(e.hasUnsubmittedChanges, true);
});

test('uncertain saves retry the original snapshot/id before saving more recent input', async () => {
  const app = setup(); const e = app.editor;
  e.edit('businessForwardWins', 'first'); const first = e.save();
  app.requests[0].reject(new Error('network error')); assert.equal(await first, false);
  const original = app.requests[0].request;
  e.edit('businessForwardWins', 'latest'); const retry = e.retry();
  assert.deepEqual(app.requests[1].request, original);
  app.requests[1].finish(); await retry;
  assert.equal(e.dirty, true); assert.equal(e.values.businessForwardWins, 'latest');
  const next = e.save(); app.requests[2].finish(); await next;
  assert.equal(e.dirty, false);
});

test('refresh restores unsaved answers only to the same member and review', async () => {
  const app = setup(); app.editor.edit('topicsToDiscuss', 'Keep this on reload');
  const backup = app.backup();
  const restored = setup(payload(), backup);
  assert.equal(restored.editor.values.topicsToDiscuss, 'Keep this on reload');
  assert.equal(restored.editor.recovered, true);
  assert.equal(setup({ ...payload(), userId: uuid(99) }, backup).editor.values.topicsToDiscuss, '');
  assert.equal(setup({ ...payload(), audit: { id: 99 } }, backup).editor.values.topicsToDiscuss, '');
});

test('submitting after an uncertain earlier submission replays its id then submits the newest edits', async () => {
  const app = setup(); const e = app.editor;
  for (const [key, value] of Object.entries(complete())) e.edit(key, value);
  const first = e.submit();
  app.requests[0].reject(new Error('response was lost'));
  assert.equal(await first, false);
  const original = app.requests[0].request;
  e.edit('topicsToDiscuss', 'New topic after the uncertain submission');
  const submit = e.submit();
  assert.deepEqual(app.requests[1].request, original, 'replay the uncertain request exactly');
  app.requests[1].finish(); await tick();
  assert.equal(app.requests.length, 3, 'explicit submission also sends the newer changes');
  assert.equal(app.requests[2].request.mode, 'submit');
  assert.equal(app.requests[2].request.expectedRevision, 1);
  assert.notEqual(app.requests[2].request.requestId, original.requestId);
  assert.equal(app.requests[2].request.values.topicsToDiscuss, 'New topic after the uncertain submission');
  assert.equal(e.submitting, true);
  app.requests[2].finish(); assert.equal(await submit, true);
  assert.equal(app.state().answers.topicsToDiscuss, 'New topic after the uncertain submission');
  assert.equal(e.dirty, false); assert.equal(e.hasUnsubmittedChanges, false);
});

test('lost response during refresh recognizes the acknowledged request without discarding later typing', async () => {
  const app = setup(); app.editor.edit('topicsToDiscuss', 'sent'); const save = app.editor.save();
  app.editor.edit('topicsToDiscuss', 'typed during save'); const backup = app.backup();
  app.requests[0].finish(); await save;
  const restored = setup(app.state(), backup);
  assert.equal(restored.editor.conflict, null);
  assert.equal(restored.editor.revision, 1);
  assert.equal(restored.editor.values.topicsToDiscuss, 'typed during save');
  assert.equal(restored.editor.dirty, true);
});

test('cross-device conflict preserves both versions and requires an explicit choice', async () => {
  const app = setup(); app.editor.edit('topicsToDiscuss', 'local');
  const remote = { ...payload(), draft: { values: { ...empty(), topicsToDiscuss: 'remote' }, revision: 3, submittedRevision: null, lastRequestId: uuid(90), updatedAt: '2026-10-16T10:00:00Z' } };
  app.replace(remote);
  const save = app.editor.save(); app.requests[0].finish(); assert.equal(await save, false);
  assert.equal(app.editor.values.topicsToDiscuss, 'local');
  assert.equal(app.editor.conflict.draft.values.topicsToDiscuss, 'remote');
  assert.equal(await app.editor.save(), false);
  app.editor.resolveConflict(true);
  const retry = app.editor.save(); assert.equal(app.requests[1].request.expectedRevision, 3);
  app.requests[1].finish(); await retry;
  assert.equal(app.state().draft.values.topicsToDiscuss, 'local');
});

test('a stale local recovery copy cannot silently replace a newer server draft', () => {
  const app = setup(); app.editor.edit('topicsToDiscuss', 'old tab');
  const remote = { ...payload(), draft: { values: { ...empty(), topicsToDiscuss: 'new device' }, revision: 4, submittedRevision: null, lastRequestId: uuid(90), updatedAt: '2026-10-16T10:00:00Z' } };
  const restored = setup(remote, app.backup());
  assert.ok(restored.editor.conflict);
  restored.editor.resolveConflict(false);
  assert.equal(restored.editor.values.topicsToDiscuss, 'new device');
  assert.equal(restored.editor.dirty, false);
});

test('API binds writes to authenticated owner and distinguishes draft from submit validation', async () => {
  const { NextRequest, NextResponse } = require('next/server');
  const writes = [];
  let accessible = true;
  const route = load('../src/app/api/business-audit-preparation/route.ts', {
    'next/server': { NextRequest, NextResponse },
    '@/lib/requireUser': { requireUser: async () => ({ ok: true, user: { id: uuid(1) } }) },
    '@/lib/supabaseAdmin': { getAdminClient: () => ({}) },
    '@/lib/businessAuditPreparationShared': shared,
    '@/lib/businessAuditPreparation': {
      userCanEditBusinessAuditPreparation: async () => accessible,
      saveBusinessAuditPreparation: async (...args) => { writes.push(args); return { draft: {}, answers: null }; },
    },
  });
  const call = (body) => route.PUT(new NextRequest('http://localhost/api/business-audit-preparation', { method: 'PUT', body: JSON.stringify(body) }));
  const request = { businessReviewId: 42, expectedRevision: 0, requestId: uuid(4), mode: 'draft', values: empty(), userId: uuid(99) };
  assert.equal((await call(request)).status, 200);
  assert.equal(writes[0][1], uuid(1)); assert.equal(writes[0][6], false);
  assert.equal((await call({ ...request, mode: 'submit' })).status, 400);
  assert.equal((await call({ ...request, expectedRevision: undefined })).status, 400);
  assert.equal((await call({ ...request, values: { ...empty(), personalRating: 7 } })).status, 400);
  accessible = false;
  assert.equal((await call(request)).status, 404);
  assert.equal(writes.length, 1);
});
