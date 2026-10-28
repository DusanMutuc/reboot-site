import assert from 'node:assert/strict';
import test from 'node:test';
import { renderComponent } from './helpers/componentHarness.mjs';
import { EMPTY_PREPARATION } from '../src/lib/businessAuditPreparationShared.ts';

const clone = (v) => JSON.parse(JSON.stringify(v));
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = () => ({ userId: uuid(1), audit: { id: 42, reviewDate: '2026-10-20', startsAt: null, timing: 'upcoming', timezone: 'America/Edmonton' }, answers: null, draft: null });

async function mount({ initial = base(), storage = new Map() } = {}) {
  let server = clone(initial); const writes = []; const timers = new Map(); const listeners = new Map();
  let seq = 10;
  const fetch = async (_url, init = {}) => {
    if (init.method !== 'PUT') return { ok: true, status: 200, json: async () => clone(server) };
    const request = JSON.parse(init.body); const write = { request }; writes.push(write);
    return new Promise((resolve) => {
      write.finish = (status = 200) => {
        if (status !== 200) { resolve({ ok: false, status, json: async () => ({ error: 'Could not save your draft.' }) }); return; }
        server.draft = { values: clone(request.values), revision: request.expectedRevision + 1,
          submittedRevision: request.mode === 'submit' ? request.expectedRevision + 1 : server.draft?.submittedRevision ?? null,
          updatedAt: '2026-10-16T10:00:00Z', lastRequestId: request.requestId };
        if (request.mode === 'submit') server.answers = { ...clone(request.values), submittedAt: server.draft.updatedAt, updatedAt: server.draft.updatedAt };
        resolve({ ok: true, status: 200, json: async () => ({ businessReviewId: 42, draft: clone(server.draft), answers: clone(server.answers) }) });
      };
    });
  };
  const window = {
    setTimeout(fn) { const id = ++seq; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
  };
  const document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  const ui = renderComponent('src/components/businessAuditPreparation/BusinessAuditPreparationForm.tsx', {}, {
    'next/link': { __esModule: true, default: 'Link' },
  }, { fetch, window, document, crypto: { randomUUID: () => uuid(++seq) }, sessionStorage: {
    getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key),
  } });
  await ui.flush();
  return {
    ui, writes, storage, listeners, server: () => clone(server),
    fields: () => ui.all((node) => typeof node.props.onChange === 'function' && typeof node.props.label === 'string'),
    async change(index, value) {
      const field = this.fields()[index]; assert.ok(field); await ui.act(() => field.props.onChange(value));
    },
    async debounce() { const waiting = [...timers.values()]; timers.clear(); waiting.forEach((fn) => fn()); await ui.flush(); },
    async finish(index, status) { writes[index].finish(status); await ui.flush(); },
    async submit() { await ui.act(() => ui.all((node) => node.props.component === 'form')[0].props.onSubmit({ preventDefault() {} })); },
  };
}

test('student form debounces partial saves, displays progress, and preserves typing during saves', async () => {
  const app = await mount();
  assert.match(app.ui.text(), /0 of 8 questions answered/);
  await app.change(0, 'First win'); assert.equal(app.writes.length, 0);
  assert.match(app.ui.text(), /1 of 8 questions answered/);
  await app.debounce(); assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].request.mode, 'draft');
  await app.change(1, 'Personal win');
  await app.finish(0);
  assert.equal(app.fields()[1].props.value, 'Personal win');
  assert.match(app.ui.text(), /Unsaved changes/);
  await app.debounce(); await app.finish(1);
  assert.match(app.ui.text(), /Draft saved/);
  assert.match(app.ui.text(), /Not submitted yet/);
  assert.match(app.ui.text(), /2 of 8 questions answered/);
  assert.equal(app.server().answers, null);
  app.ui.unmount();
});

test('unfinished answers survive refresh and navigation protection covers pending writes', async () => {
  const first = await mount(); await first.change(0, 'Resume this');
  let prevented = false;
  first.listeners.get('beforeunload')({ preventDefault() { prevented = true; }, returnValue: '' });
  assert.equal(prevented, true);
  const second = await mount({ storage: first.storage });
  assert.equal(second.fields()[0].props.value, 'Resume this');
  assert.match(second.ui.text(), /unfinished answers have been restored/);
  await first.debounce(); await first.finish(0);
  first.ui.unmount();
  await second.debounce(); await second.finish(0); second.ui.unmount();
});

test('submitting early shows errors but later partial edits still autosave', async () => {
  const app = await mount();
  await app.submit(); assert.equal(app.writes.length, 0);
  assert.match(app.ui.text(), /Please answer all eight questions/);
  await app.change(0, 'I will finish later');
  await app.debounce(); assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].request.mode, 'draft');
  await app.finish(0); app.ui.unmount();
});

test('a retired editor cannot erase newer recovery text when its delayed save finishes', async () => {
  const first = await mount();
  await first.change(0, 'Earlier text'); await first.debounce();
  first.ui.unmount();
  const second = await mount({ storage: first.storage });
  await second.change(0, 'Newer text after navigating back');
  const recoveryBefore = [...first.storage.entries()];
  await first.finish(0);
  assert.deepEqual([...first.storage.entries()], recoveryBefore, 'late acknowledgement must not clear the active recovery copy');
  const restored = await mount({ initial: first.server(), storage: first.storage });
  assert.equal(restored.fields()[0].props.value, 'Newer text after navigating back');
  await restored.debounce(); await restored.finish(0); restored.ui.unmount();
  await second.debounce(); await second.finish(0);
  await second.debounce(); await second.finish(1); second.ui.unmount();
});

test('save failures show retry, preserve answers, and reuse the same request', async () => {
  const app = await mount(); await app.change(0, 'Please keep this'); await app.debounce();
  await app.finish(0, 500);
  assert.match(app.ui.text(), /Draft could not be saved/);
  assert.equal(app.fields()[0].props.value, 'Please keep this');
  const retry = app.ui.all((node) => node.props.children === 'Retry save')[0];
  await app.ui.act(() => retry.props.onClick());
  assert.deepEqual(app.writes[1].request, app.writes[0].request);
  await app.finish(1); assert.match(app.ui.text(), /Draft saved/); app.ui.unmount();
});

test('draft changes to submitted answers remain clearly unsubmitted until the explicit submit button', async () => {
  const answers = { ...EMPTY_PREPARATION, businessForwardWins: 'one', personalForwardWins: 'two',
    greatestBusinessChallenge: 'three', greatestPersonalChallenge: 'four', desiredCallOutcome: 'five', topicsToDiscuss: 'six',
    businessRating: 8, personalRating: 6, submittedAt: '2026-10-15T10:00:00Z', updatedAt: '2026-10-15T10:00:00Z' };
  const app = await mount({ initial: { ...base(), answers } });
  await app.change(0, 'New win'); await app.debounce(); await app.finish(0);
  assert.match(app.ui.text(), /Submitted · draft changes not sent/);
  assert.equal(app.server().answers.businessForwardWins, 'one');
  await app.submit(); assert.equal(app.writes[1].request.mode, 'submit');
  assert.equal(app.ui.all((node) => node.props.component === 'fieldset')[0].props.disabled, true);
  await app.finish(1);
  assert.equal(app.server().answers.businessForwardWins, 'New win');
  assert.match(app.ui.text(), /submitted to your coach/); app.ui.unmount();
});
