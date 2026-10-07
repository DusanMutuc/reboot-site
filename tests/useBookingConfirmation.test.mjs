import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/components/student/workspace/useBookingConfirmation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
const target = { userId: 'bb8f369e-c343-4b6a-9c9c-5e15c54c1641', noteId: 42, meetingId: 123, sessionId: 'original-session' };
const otherTarget = { userId: 'bb8f369e-c343-4b6a-9c9c-5e15c54c1642', noteId: 43, meetingId: 124, sessionId: 'other-session' };
const key = value => `implementation-booking-confirmed:${value.userId}:${value.noteId}:${value.meetingId}`;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// A deliberately small hook runner: state updates are batched, effects clean up
// on dependency changes, and unmounted components ignore local state updates.
// The hook itself runs unchanged; no DOM, API request or GHL booking is involved.
function environment({ storageFails = false } = {}) {
  const storage = new Map();
  let active;
  const changed = (left, right) => !left || !right || left.length !== right.length || left.some((value, index) => !Object.is(value, right[index]));
  const react = {
    useState(initial) {
      const instance = active, index = instance.index++;
      if (!instance.hooks[index]) instance.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = instance.hooks[index];
      return [slot.value, value => {
        if (!instance.mounted) return;
        const next = typeof value === 'function' ? value(slot.value) : value;
        if (!Object.is(next, slot.value)) { slot.value = next; instance.dirty = true; }
      }];
    },
    useRef(initial) {
      const instance = active, index = instance.index++;
      return instance.hooks[index] ??= { current: initial };
    },
    useCallback(callback, dependencies) {
      const instance = active, index = instance.index++;
      const previous = instance.hooks[index];
      if (!previous || changed(previous.dependencies, dependencies)) instance.hooks[index] = { callback, dependencies };
      return instance.hooks[index].callback;
    },
    useEffect(effect, dependencies) {
      const instance = active, index = instance.index++;
      const previous = instance.hooks[index];
      if (!previous || changed(previous.dependencies, dependencies)) {
        instance.effects.push(() => {
          previous?.cleanup?.();
          instance.hooks[index] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  const exports = {};
  const sessionStorage = Object.fromEntries(['getItem', 'setItem', 'removeItem'].map(operation => [operation, (storageKey, value) => {
    if (storageFails) throw new Error('Storage unavailable');
    if (operation === 'getItem') return storage.get(storageKey) ?? null;
    if (operation === 'setItem') storage.set(storageKey, value);
    if (operation === 'removeItem') storage.delete(storageKey);
  }]));
  vm.runInNewContext(source, { exports, require(name) { assert.equal(name, 'react'); return react; }, window: { sessionStorage }, console });
  const instances = [];
  function mount(options = {}) {
    const instance = {
      hooks: [], effects: [], index: 0, dirty: true, mounted: true, value: null,
      options: { target: { ...target }, booked: false, cancelled: false, disabled: false, onSave: async () => 'saved', ...options },
      update(patch) { Object.assign(instance.options, patch); instance.dirty = true; },
      unmount() { instance.mounted = false; for (const slot of instance.hooks) slot?.cleanup?.(); },
    };
    instances.push(instance);
    render(instance);
    return instance;
  }
  function render(instance) {
    instance.dirty = false; instance.index = 0; instance.effects = []; active = instance;
    instance.value = exports.default(instance.options);
    active = undefined;
    for (const effect of instance.effects) effect();
  }
  async function flush() {
    // Promise chains can queue state after the render/effect phase; leave enough
    // microtask turns to settle them without timers or a real React renderer.
    for (let turn = 0; turn < 30; turn += 1) {
      for (const instance of instances) if (instance.mounted && instance.dirty) render(instance);
      await Promise.resolve();
    }
    assert.ok(!instances.some(instance => instance.mounted && instance.dirty), 'Hook state should settle without an automatic retry loop');
  }
  return { mount, flush, storage };
}

test('duplicate booking confirmations save only once and clear persisted pending state', async () => {
  const env = environment(), work = deferred(), calls = [];
  const hook = env.mount({ onSave: value => { calls.push(plain(value)); return work.promise; } });
  await env.flush();
  hook.value.confirm(); hook.value.confirm();
  await env.flush();
  assert.deepEqual(calls, [target]);
  assert.equal(hook.value.saving, true);
  assert.deepEqual(JSON.parse(env.storage.get(key(target))), target);
  work.resolve('saved');
  await env.flush();
  assert.equal(hook.value.saving, false);
  assert.equal(hook.value.error, null);
  assert.equal(env.storage.size, 0);
});

test('a delayed duplicate after success is ignored before the booked prop catches up', async () => {
  const env = environment(), calls = [];
  const hook = env.mount({ onSave: async value => { calls.push(plain(value)); return 'saved'; } });
  await env.flush(); hook.value.confirm(); await env.flush();
  assert.equal(calls.length, 1);
  assert.equal(hook.options.booked, false, 'Simulate a parent whose booked state has not updated yet');
  hook.value.confirm(); await env.flush();
  assert.deepEqual(calls, [target]);
  assert.equal(env.storage.size, 0);
});

test('a confirmation received during another save waits until the workspace is available', async () => {
  const env = environment(), calls = [];
  const hook = env.mount({ disabled: true, onSave: async value => { calls.push(plain(value)); return 'saved'; } });
  await env.flush(); hook.value.confirm(); await env.flush();
  assert.equal(calls.length, 0);
  assert.ok(env.storage.has(key(target)));
  hook.update({ disabled: false }); await env.flush();
  assert.deepEqual(calls, [target]);
  assert.equal(env.storage.size, 0);
});

test('a busy callback retains confirmation without spinning and retries after a workspace update', async () => {
  const env = environment(), calls = [];
  const hook = env.mount({ onSave: async value => { calls.push(plain(value)); return calls.length === 1 ? 'busy' : 'saved'; } });
  await env.flush(); hook.value.confirm(); await env.flush();
  assert.equal(calls.length, 1);
  assert.ok(env.storage.has(key(target)));
  hook.update({ disabled: true }); await env.flush();
  hook.update({ disabled: false }); await env.flush();
  assert.deepEqual(calls, [target, target]);
  assert.equal(env.storage.size, 0);
});

test('failed saves remain pending until an explicit retry and never create an automatic loop', async () => {
  const env = environment(), calls = [];
  const onSave = async value => { calls.push(plain(value)); if (calls.length === 1) throw new Error('Network down'); return 'saved'; };
  const hook = env.mount({ onSave });
  await env.flush(); hook.value.confirm(); await env.flush();
  assert.equal(calls.length, 1);
  assert.match(hook.value.error, /do not book the appointment again/i);
  assert.ok(env.storage.has(key(target)));
  hook.update({ onSave: value => onSave(value) }); await env.flush();
  assert.equal(calls.length, 1);
  hook.value.retry(); await env.flush();
  assert.deepEqual(calls, [target, target]);
  assert.equal(hook.value.error, null);
  assert.equal(env.storage.size, 0);
});

test('an already-booked source does not save again and clears restored confirmation', async () => {
  const env = environment(), calls = [];
  env.storage.set(key(target), JSON.stringify(target));
  const hook = env.mount({ booked: true, onSave: async value => { calls.push(value); return 'saved'; } });
  await env.flush(); hook.value.confirm(); await env.flush();
  assert.equal(calls.length, 0);
  assert.equal(env.storage.size, 0);
});

test('an unstarted source keeps confirmation pending until the coach starts its session', async () => {
  const env = environment(), calls = [], unstarted = { ...target, sessionId: null };
  const hook = env.mount({ target: unstarted, onSave: async value => { calls.push(plain(value)); return 'saved'; } });
  await env.flush(); hook.value.confirm(); await env.flush();
  assert.equal(calls.length, 0);
  assert.equal(hook.value.waitingForSession, true);
  hook.update({ target: { ...target, sessionId: 'new-session' } }); await env.flush();
  assert.deepEqual(calls, [unstarted], 'The save helper receives the original unstarted source and verifies the acquired session');
  assert.equal(hook.value.waitingForSession, false);
});

test('confirmation pins the member, cycle, meeting and original session across prop updates', async () => {
  const env = environment(), calls = [];
  const hook = env.mount({ disabled: true, onSave: async value => { calls.push(plain(value)); return 'saved'; } });
  await env.flush(); hook.value.confirm(); await env.flush();
  hook.update({ target: { ...target, sessionId: 'unexpected-replacement' }, disabled: false }); await env.flush();
  assert.deepEqual(calls, [target], 'A later prop change must not rewrite the identity captured by GHL confirmation');
});

test('changing to another member does not save or clear the previous member’s pending confirmation', async () => {
  const env = environment(), calls = [];
  const hook = env.mount({ disabled: true, onSave: async value => { calls.push(plain(value)); return 'saved'; } });
  await env.flush(); hook.value.confirm(); await env.flush();
  hook.update({ target: { ...otherTarget }, booked: true, disabled: false }); await env.flush();
  assert.equal(calls.length, 0);
  assert.deepEqual(JSON.parse(env.storage.get(key(target))), target);
  hook.update({ target: { ...target }, booked: false }); await env.flush();
  assert.deepEqual(calls, [target]);
  assert.equal(env.storage.size, 0);
});

test('pending confirmation restores for the same source after unmount and never transfers to another source', async () => {
  const env = environment(), calls = [];
  const original = env.mount({ disabled: true });
  await env.flush(); original.value.confirm(); await env.flush(); original.unmount();
  env.mount({ target: { ...otherTarget }, onSave: async value => { calls.push(plain(value)); return 'saved'; } });
  await env.flush();
  assert.equal(calls.length, 0);
  env.mount({ onSave: async value => { calls.push(plain(value)); return 'saved'; } });
  await env.flush();
  assert.deepEqual(calls, [target]);
  assert.equal(env.storage.size, 0);
});

test('remounting while an earlier save is in flight does not duplicate it or retain stale pending state', async () => {
  const env = environment(), work = deferred(), calls = [];
  const onSave = value => { calls.push(plain(value)); return work.promise; };
  const first = env.mount({ onSave });
  await env.flush(); first.value.confirm(); await env.flush(); first.unmount();
  const second = env.mount({ onSave });
  await env.flush();
  assert.equal(calls.length, 1, 'The original in-flight save belongs to the source even after its component unmounts');
  work.resolve('saved'); await env.flush();
  assert.equal(second.value.saving, false);
  assert.equal(second.value.error, null);
  assert.equal(env.storage.size, 0);
  second.update({ onSave: value => onSave(value) }); await env.flush();
  assert.equal(calls.length, 1, 'A stale restored pending object must not be resubmitted after the original save finishes');
});

test('an in-flight failure after remount keeps its receipt and permits an explicit retry', async () => {
  const env = environment(), work = deferred(), calls = [];
  const onSave = value => { calls.push(plain(value)); return calls.length === 1 ? work.promise : Promise.resolve('saved'); };
  const first = env.mount({ onSave });
  await env.flush(); first.value.confirm(); await env.flush(); first.unmount();
  const second = env.mount({ onSave });
  await env.flush();
  work.reject(new Error('Connection lost after navigation')); await env.flush();
  assert.equal(calls.length, 1);
  assert.match(second.value.error, /do not book the appointment again/i);
  assert.ok(env.storage.has(key(target)));
  second.update({ onSave: value => onSave(value) }); await env.flush();
  assert.equal(calls.length, 1, 'Rerendering must not automatically retry the failed confirmation');
  second.value.retry(); await env.flush();
  assert.deepEqual(calls, [target, target]);
  assert.equal(second.value.error, null);
  assert.equal(env.storage.size, 0);
});

test('an old source’s async success cannot clear the newly selected source’s receipt', async () => {
  const env = environment(), work = deferred(), calls = [];
  const onSave = value => { calls.push(plain(value)); return value.userId === target.userId ? work.promise : Promise.resolve('saved'); };
  const hook = env.mount({ onSave });
  await env.flush(); hook.value.confirm(); await env.flush();
  hook.update({ target: { ...otherTarget }, disabled: true }); await env.flush();
  hook.value.confirm(); await env.flush();
  assert.deepEqual(JSON.parse(env.storage.get(key(otherTarget))), otherTarget);
  work.resolve('saved'); await env.flush();
  assert.deepEqual(calls, [target]);
  assert.equal(env.storage.has(key(target)), false);
  assert.deepEqual(JSON.parse(env.storage.get(key(otherTarget))), otherTarget);
  hook.update({ disabled: false }); await env.flush();
  assert.deepEqual(calls, [target, otherTarget]);
  assert.equal(env.storage.size, 0);
});

test('blocked session storage does not prevent an in-memory confirmation from saving', async () => {
  const env = environment({ storageFails: true }), calls = [];
  const hook = env.mount({ onSave: async value => { calls.push(plain(value)); return 'saved'; } });
  await env.flush(); hook.value.confirm(); await env.flush();
  assert.deepEqual(calls, [target]);
  assert.equal(hook.value.error, null);
  assert.equal(hook.value.saving, false);
});

test('cancelled sources retain the receipt without attempting an invalid save', async () => {
  const env = environment(), calls = [];
  env.storage.set(key(target), JSON.stringify(target));
  const hook = env.mount({ cancelled: true, onSave: async value => { calls.push(plain(value)); return 'saved'; } });
  await env.flush();
  assert.equal(calls.length, 0);
  assert.equal(hook.value.cancelledConfirmation, true);
  assert.ok(env.storage.has(key(target)));
});

test('a stored receipt with another source identity is ignored', async () => {
  const env = environment(), calls = [];
  env.storage.set(key(target), JSON.stringify(otherTarget));
  env.mount({ onSave: async value => { calls.push(plain(value)); return 'saved'; } });
  await env.flush();
  assert.equal(calls.length, 0);
});
