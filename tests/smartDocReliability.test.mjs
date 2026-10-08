import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createSmartDocSaveQueue } from '../src/lib/smartDocSaves.ts';
import { renderComponent } from './helpers/componentHarness.mjs';
const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

function route(name, { rpcData, rpcError, deniedStatus } = {}) {
  const calls = [];
  const imports = {
    'next/server': { NextResponse },
    '@/lib/requireUser': { requireUser: async () => deniedStatus
      ? { ok: false, res: NextResponse.json({}, { status: deniedStatus }) }
      : { ok: true, user: { id: 'owner' }, supabase: { rpc: async (name, args) => { calls.push({ name, args }); return { data: rpcData, error: rpcError }; } } } },
  };
  const modules = new Map();
  const load = (file) => {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    const compiled = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(compiled, { exports, console, require: (name) => imports[name] ?? (name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`) : require(name)) });
    modules.set(file, exports);
    return exports;
  };
  const handler = load(`src/app/api/smartdoc/${name}/route.ts`);
  return { calls, post: (body) => handler.POST(new NextRequest('https://example.test/api/smartdoc/' + name, {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  })) };
}

test('submit is one validated RPC and preserves its table-returned progress', async () => {
  const r = route('submit', { rpcData: [{ fields_total: 3, fields_completed: 3, status: 'submitted', submitted_at: '2026-10-08T12:00:00Z' }] });
  const res = await r.post({ content_block_id: 12 });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { result: { fields_total: 3, fields_completed: 3, status: 'submitted', submitted_at: '2026-10-08T12:00:00Z' } });
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].name, 'submit_smart_doc');
  assert.equal(r.calls[0].args._user_id, 'owner');
});
for (const name of ['submit', 'upsert', 'progress']) {
  test(`${name} rejects malformed ids and failed authentication before RPC`, async () => {
    for (const id of [null, 0, -3, 2.5, '1', {}]) {
      const r = route(name);
      assert.equal((await r.post({ content_block_id: id, prompt_id: 1, value: 'answer' })).status, 400);
      assert.equal(r.calls.length, 0);
    }
    const r = route(name, { deniedStatus: 403 });
    assert.equal((await r.post({ content_block_id: 1 })).status, 403);
    assert.equal(r.calls.length, 0);
  });
}
for (const name of ['submit', 'upsert']) {
  test(`${name} refuses drafts retained from another signed-in account`, async () => {
    const r = route(name);
    assert.equal((await r.post({ content_block_id: 1, prompt_id: 1, value: 'answer', expected_user_id: 'previous-owner' })).status, 409);
    assert.equal(r.calls.length, 0);
  });
  test(`${name} exposes required-field failures as validation errors`, async () => {
    const r = route(name, { rpcError: { code: '22023', message: 'Please answer every question' } });
    const res = await r.post({ content_block_id: 1, prompt_id: 1, value: '' });
    assert.equal(res.status, 422);
    assert.match((await res.json()).details, /answer every/);
  });
}
test('progress API unwraps a single table row and rejects invalid RPC results', async () => {
  const r = route('progress', { rpcData: [{ fields_total: 3, fields_completed: 1 }] });
  assert.deepEqual(await (await r.post({ content_block_id: 1 })).json(), { progress: { fields_total: 3, fields_completed: 1 } });
  for (const rpcData of [[], null, [{ fields_total: 1, fields_completed: 3 }]]) {
    assert.equal((await route('progress', { rpcData }).post({ content_block_id: 1 })).status, 502);
  }
});
test('legacy field endpoint supplies verified owner instead of null', async () => {
  const r = route('field', { rpcData: [] });
  assert.equal((await r.post({ content_block_id: 1, prompt_id: 1, value: 'answer' })).status, 200);
  assert.equal(r.calls[0].args._user_id, 'owner');
});

test('serialized saves coalesce debounced typing and persist edits made during a request', async () => {
  const first = deferred(); const writes = [];
  const queue = createSmartDocSaveQueue(async (id, value) => { writes.push([id, value]); if (writes.length === 1) await first.promise; }, 100000);
  queue.edit(1, 'first'); queue.edit(1, 'before flush');
  const saving = queue.flush(); await tick();
  queue.edit(1, 'newer'); queue.edit(2, 'other answer');
  const secondFlush = queue.flush(); await tick();
  assert.deepEqual(writes, [[1, 'before flush']]);
  assert.deepEqual(queue.draftValues(), { 1: 'newer', 2: 'other answer' });
  first.resolve(); await Promise.all([saving, secondFlush]);
  assert.deepEqual(writes, [[1, 'before flush'], [1, 'newer'], [2, 'other answer']]);
  assert.equal(queue.state().pending, false);
});
test('failed saves retain latest drafts and retry exactly those fields', async () => {
  let fail = true; const writes = [];
  const queue = createSmartDocSaveQueue(async (id, value) => { writes.push([id, value]); if (fail) throw new Error('Offline'); }, 100000);
  queue.edit(1, 'draft');
  await assert.rejects(queue.flush(), /Offline/);
  assert.equal(queue.state().pending, true);
  assert.equal(queue.state().error, 'Offline');
  assert.deepEqual(queue.draftValues(), { 1: 'draft' });
  queue.edit(1, 'revised'); fail = false;
  await queue.flush();
  assert.deepEqual(writes, [[1, 'draft'], [1, 'revised']]);
  assert.equal(queue.state().error, null);
});

function editor({ owner = 'member', otherResponses = 2, responseError = false, valuesError = false, statusError = false } = {}) {
  const filters = []; const writes = []; let controller; let failSave = false;
  const ownValues = [{ prompt_id: 1, value_json: 'My answer' }];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    from(table) {
      const query = { select() { return this; }, eq(key, value) { filters.push([table, key, value]); return this; },
        single: async () => ({ data: { id: 3, title: 'Review', is_published: true, smart_doc_prompts: [{ id: 1, position: 1, label: 'Answer', required: true, prompt_type: 'text' }] }, error: null }),
        maybeSingle: async () => {
          const scoped = filters.some(([t, key, value]) => t === table && key === 'user_id' && value === owner);
          return { data: { id: scoped ? 11 : 99 }, error: responseError || (!scoped && otherResponses > 1) ? { message: 'load failed' } : null };
        },
        then(resolve) { resolve({ data: ownValues, error: valuesError ? { message: 'failed values' } : null }); },
      }; return query;
    },
  };
  const props = { docId: 3, contentBlockId: 4, fallbackLabel: null, onReady: (_id, value) => { controller = value; } };
  const rendered = renderComponent('src/components/course/BlockRenderer.tsx', props, {
    '@/lib/supabaseClient': { supabase: client }, dompurify: { sanitize: (text) => text },
  }, { fetch: async (url, init) => {
    if (url.endsWith('/status')) return response({ status: 'draft', submitted_at: null }, statusError ? 500 : 200);
    writes.push(JSON.parse(init.body));
    return response(failSave ? { error: 'Connection failed' } : {}, failSave ? 500 : 200);
  } }, 'SmartDocPreview');
  return { ...rendered, filters, writes, controller: () => controller, failSave: (value) => { failSave = value; },
    field: () => rendered.all((node) => node.type?.name === 'SmartDocPromptField')[0] };
}
for (const owner of ['member', 'coach', 'admin']) {
  for (const otherResponses of [0, 1, 3]) {
    test(`${owner} loads only own answers when ${otherResponses} other responses are visible`, async () => {
      const r = editor({ owner, otherResponses }); await r.flush();
      assert.ok(r.filters.some(([table, key, value]) => table === 'smart_doc_responses' && key === 'user_id' && value === owner));
      assert.equal(r.field().props.value, 'My answer');
      assert.equal(r.controller().ownerId, owner);
      r.unmount();
    });
  }
}
for (const failure of ['responseError', 'valuesError', 'statusError']) {
  test(`failed ${failure} does not enable blank answer editing`, async () => {
    const r = editor({ [failure]: true }); await r.flush();
    assert.match(r.text(), /Failed to load/); assert.equal(r.field(), undefined);
    assert.equal(r.controller(), undefined); assert.equal(r.writes.length, 0); r.unmount();
  });
}
test('actual editor flushes the last keystroke, surfaces HTTP errors, and retains failed draft', async () => {
  const r = editor(); await r.flush();
  r.failSave(true);
  await r.act(() => r.field().props.onChange('Unsent answer'));
  await assert.rejects(r.controller().flush(), /Connection failed/);
  await r.flush();
  assert.equal(r.field().props.value, 'Unsent answer');
  assert.match(r.text(), /Your edits are still here/);
  assert.equal(r.writes[0].expected_user_id, 'member');
  r.failSave(false); await r.controller().flush(); await r.flush();
  assert.equal(r.writes.at(-1).value, 'Unsent answer'); r.unmount();
});
test('unmount sends a pending debounce instead of discarding it', async () => {
  const r = editor(); await r.flush();
  await r.act(() => r.field().props.onChange('Just typed'));
  assert.equal(r.writes.length, 0);
  r.unmount(); await tick();
  assert.equal(r.writes.length, 1); assert.equal(r.writes[0].value, 'Just typed');
});

function lesson({ savePromise = Promise.resolve(), statusResponse = response({ status: 'draft', submitted_at: null }), submitResponse = response({ result: { fields_total: 1, fields_completed: 1, status: 'submitted', submitted_at: 'now' } }) } = {}) {
  const calls = []; const completed = [];
  const BlockRenderer = () => null;
  const globals = {
    fetch: async (url) => {
      calls.push(url);
      if (url.includes('/blocks')) return response({ blocks: [{ id: 4, block_type: 'smart_doc', smart_doc_id: 3, position: 1 }] });
      if (url.endsWith('/progress')) return response({ progress: { fields_total: 1, fields_completed: 1 } });
      if (url.endsWith('/status')) return statusResponse;
      return submitResponse;
    },
    setInterval: () => 1, clearInterval() {},
    document: { addEventListener() {}, removeEventListener() {}, documentElement: { scrollHeight: 100, clientHeight: 100 } },
    window: { addEventListener() {}, removeEventListener() {} },
  };
  const rendered = renderComponent('src/components/course/LessonContent.tsx', { lesson: { node: { id: 1, node_type: 'lesson', title: 'Lesson' }, children: [] }, loading: false }, {
    '@/components/course/BlockRenderer': { BlockRenderer }, '@/lib/supabaseClient': { supabase: {} },
    '@/hooks/useNodeProgress': { useNodeProgress: () => ({ markStarted() {}, markCompleted: async () => { completed.push(1); } }) },
  }, globals);
  return { ...rendered, calls, completed, ready: () => {
    rendered.all((node) => node.type === BlockRenderer)[0].props.onSmartDocReady(4, { ownerId: 'owner', flush: () => savePromise });
  }, submit: () => rendered.all((node) => node.type === 'Button' && node.props.children === 'Submit')[0] };
}
test('actual lesson awaits field writes before submit and completion', async () => {
  const pending = deferred(); const r = lesson({ savePromise: pending.promise });
  await r.flush(); r.ready(); await r.act(() => r.submit().props.onClick());
  assert.equal(r.calls.includes('/api/smartdoc/submit'), false); assert.equal(r.completed.length, 0);
  pending.resolve(); await r.flush();
  assert.equal(r.calls.includes('/api/smartdoc/submit'), true); assert.equal(r.completed.length, 1); r.unmount();
});
test('actual lesson refuses submit after save failure and makes error visible', async () => {
  const pending = deferred(); const r = lesson({ savePromise: pending.promise });
  await r.flush(); r.ready(); await r.act(() => r.submit().props.onClick());
  pending.reject(new Error('Answer save failed')); await r.flush();
  assert.equal(r.calls.includes('/api/smartdoc/submit'), false); assert.equal(r.completed.length, 0);
  assert.match(r.text(), /Answer save failed/); r.unmount();
});
test('a late initial status read cannot undo a successful submission', async () => {
  const pending = deferred(); const r = lesson({ statusResponse: pending.promise });
  await r.flush(); r.ready(); await r.act(() => r.submit().props.onClick());
  assert.equal(r.completed.length, 1);
  pending.resolve(response({ status: 'draft', submitted_at: null })); await r.flush();
  assert.match(r.text(), /Submitted/); assert.equal(r.submit(), undefined); r.unmount();
});

function courseNavigation(flushSaves) {
  const pushed = []; const StudentCourseTree = () => null;
  const node = { node: { id: 2, node_type: 'lesson', slug: 'lesson', title: 'Lesson' }, children: [] };
  const course = { node: { id: 1, node_type: 'course', slug: 'course', title: 'Course' }, children: [{ edge: { child_id: 2 }, subtree: node }] };
  const rendered = renderComponent('src/components/course/CourseViewer.tsx', { courseSlug: 'course', slugParts: ['lesson'] }, {
    'next/navigation': { useRouter: () => ({ push: (href) => pushed.push(href), replace() {} }) },
    './StudentCourseTree': { default: StudentCourseTree, __esModule: true },
    './LessonContent': { default: () => null, __esModule: true },
    '@/lib/smartDocSaves': { flushPendingSmartDocSaves: flushSaves },
  }, { process: { env: { NODE_ENV: 'production' } }, fetch: async () => response({ course, unlockStatuses: {} }) });
  return { ...rendered, pushed, node, tree: () => rendered.all((element) => element.type === StudentCourseTree)[0] };
}
test('actual course waits for pending saves before lesson navigation and back to courses', async () => {
  const pending = deferred(); let count = 0; const r = courseNavigation(() => { count++; return pending.promise; });
  await r.flush(); await r.act(() => r.tree().props.onSelectContent(r.node, undefined));
  assert.equal(count, 1); assert.deepEqual(r.pushed, []);
  pending.resolve(); await r.flush(); assert.deepEqual(r.pushed, ['/courses/course/lesson']);
  await r.act(() => r.tree().props.onBackToCourses());
  assert.equal(count, 2); assert.equal(r.pushed.at(-1), '/courses'); r.unmount();
});
test('actual course stays on the lesson when a draft save fails', async () => {
  const r = courseNavigation(async () => { throw new Error('Your answers could not be saved.'); });
  await r.flush(); await r.act(() => r.tree().props.onSelectContent(r.node, undefined));
  assert.deepEqual(r.pushed, []); assert.match(r.text(), /answers could not be saved/); r.unmount();
});
