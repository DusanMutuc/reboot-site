import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { cloneResponse } = require('next/dist/server/lib/clone-response');
const origin = 1_700_000_000_000;
const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/bookingGhlFetch.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const response = (status = 200, headers = {}) => new Response('fixture response', { status, headers });

function fixture(onFetch = () => response()) {
  let now = origin;
  let nextTimerId = 0;
  const timers = new Map();
  const starts = [];
  const timeouts = [];
  const exports = {};
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const flush = async () => { for (let turn = 0; turn < 1024; turn += 1) await Promise.resolve(); };
  const nextTimer = () => [...timers.entries()].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
  const advanceTo = async (elapsed) => {
    const target = origin + elapsed;
    assert.ok(target >= now, 'The test clock cannot move backwards');
    await flush();
    for (;;) {
      const timer = nextTimer();
      if (!timer || timer[1].at > target) break;
      now = timer[1].at;
      timers.delete(timer[0]);
      timer[1].callback();
      await flush();
    }
    now = target;
    await flush();
  };
  const settle = async (promise) => {
    let result;
    let failure;
    let finished = false;
    promise.then((value) => { result = value; finished = true; }, (error) => { failure = error; finished = true; });
    for (let turn = 0; !finished && turn < 100; turn += 1) {
      await flush();
      if (finished) break;
      const timer = nextTimer();
      assert.ok(timer, 'Request is pending without a scheduled timer');
      await advanceTo(timer[1].at - origin);
    }
    assert.ok(finished, 'Request did not finish within the bounded fake-clock run');
    if (failure) throw failure;
    return result;
  };
  vm.runInNewContext(source, {
    exports, Date: ClockDate, console, AbortController,
    setTimeout(callback, delay) {
      const id = ++nextTimerId;
      timers.set(id, { at: now + Math.max(0, Number(delay)), callback });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    AbortSignal: {
      any: AbortSignal.any.bind(AbortSignal),
      timeout(duration) {
        const signal = new AbortController().signal;
        timeouts.push({ at: now - origin, duration, signal });
        return signal;
      },
    },
    fetch(url, init) {
      const call = { url, init, at: now - origin };
      starts.push(call);
      return onFetch(call, starts.length);
    },
  });
  return { request: exports.fetchBookingGhl, starts, timeouts, flush, advanceTo, settle };
}

test('calendar and contact requests share a burst budget while responses can overlap', async () => {
  const pending = Array.from({ length: 81 }, deferred);
  const env = fixture((_call, index) => pending[index - 1].promise);
  const requests = pending.map((_item, index) => env.request(
    `https://example.invalid/${index % 2 ? 'contacts' : 'calendars/events'}/${index}`,
    { cache: 'no-store' },
  ));
  await env.flush();
  assert.equal(env.starts.length, 80);
  assert.ok(env.starts.every((call) => call.at === 0));
  await env.advanceTo(9999);
  assert.equal(env.starts.length, 80);
  await env.advanceTo(10_000);
  assert.equal(env.starts.length, 81);
  assert.equal(env.starts.at(-1).at, 10_000);
  for (const item of pending) item.resolve(response());
  await env.settle(Promise.all(requests));
  assert.equal(env.timeouts.length, 0);
});

test('129 requests can start within ten seconds without exceeding the burst budget', async () => {
  const env = fixture();
  await env.settle(Promise.all(Array.from({ length: 129 }, (_item, index) =>
    env.request(`https://example.invalid/${index}`, {}))));
  assert.equal(env.starts.length, 129);
  assert.equal(env.starts.filter((call) => call.at === 0).length, 80);
  assert.equal(env.starts.filter((call) => call.at === 10_000).length, 49);
});

test('the budget uses a rolling window rather than resetting a fixed ten-second bucket', async () => {
  const env = fixture();
  const requests = Array.from({ length: 40 }, (_item, index) => env.request(`https://example.invalid/early/${index}`, {}));
  await env.advanceTo(5000);
  requests.push(...Array.from({ length: 40 }, (_item, index) => env.request(`https://example.invalid/later/${index}`, {})));
  await env.flush();
  requests.push(...Array.from({ length: 41 }, (_item, index) => env.request(`https://example.invalid/queued/${index}`, {})));
  await env.advanceTo(9999);
  assert.equal(env.starts.length, 80);
  await env.advanceTo(10_000);
  assert.equal(env.starts.length, 120);
  await env.advanceTo(14_999);
  assert.equal(env.starts.length, 120);
  await env.settle(Promise.all(requests));
  assert.equal(env.starts.at(-1).at, 15_000);
  for (const call of env.starts) {
    assert.ok(env.starts.filter((other) => other.at > call.at - 10_000 && other.at <= call.at).length <= 80);
  }
});

test('a 429 extends the cooldown for the 81st request already waiting for budget', async () => {
  const firstResponse = deferred();
  const env = fixture((_call, index) => index === 1 ? firstResponse.promise : response());
  const requests = Array.from({ length: 81 }, (_item, index) => env.request(`https://example.invalid/${index}`, {}));
  await env.advanceTo(50);
  firstResponse.resolve(response(429));
  await env.flush();
  await env.advanceTo(10_000);
  assert.equal(env.starts.length, 80, 'A waiter must recheck the cooldown after its original sleep');
  await env.advanceTo(10_049);
  assert.equal(env.starts.length, 80);
  await env.settle(Promise.all(requests));
  assert.deepEqual(env.starts.slice(80).map((call) => call.at), [10_050, 10_050]);
  assert.equal(env.starts.at(-1).url, 'https://example.invalid/0');
});

test('concurrent 429 responses cannot shorten an existing shared cooldown', async () => {
  const early = deferred();
  const later = deferred();
  const env = fixture((_call, index) => index === 1 ? early.promise : index === 2 ? later.promise : response());
  const requests = ['one', 'two'].map((name) => env.request(`https://example.invalid/${name}`, {}));
  await env.advanceTo(250);
  early.resolve(response(429, { 'X-RateLimit-Interval-Milliseconds': '20000' }));
  await env.flush();
  requests.push(env.request('https://example.invalid/three', {}));
  await env.advanceTo(350);
  later.resolve(response(429, { 'X-RateLimit-Interval-Milliseconds': '10000' }));
  await env.flush();
  await env.advanceTo(20_249);
  assert.equal(env.starts.length, 2);
  await env.settle(Promise.all(requests));
  assert.deepEqual(env.starts.map((call) => call.at), [0, 0, 20_250, 20_250, 20_250]);
});

test('temporary throttling has at most two retries and keeps the final response readable', async () => {
  const responses = [];
  const env = fixture(() => { const result = response(429); responses.push(result); return result; });
  const result = await env.settle(env.request('https://example.invalid/contact', {}));
  assert.equal(env.starts.length, 3);
  assert.deepEqual(env.starts.map((call) => call.at), [0, 10_000, 20_000]);
  assert.equal(result, responses[2]);
  assert.equal(await result.text(), 'fixture response');
  assert.equal(responses[0].bodyUsed, true);
  assert.equal(responses[1].bodyUsed, true);
});

for (const [header, expectedDelay] of [['20000', 20_000], ['5000', 10_000], ['invalid', 10_000], ['-1', 10_000]]) {
  test(`the upstream interval ${header} respects the ten-second minimum`, async () => {
    const env = fixture((_call, index) => index === 1
      ? response(429, { 'X-RateLimit-Interval-Milliseconds': header }) : response());
    const result = await env.settle(env.request('https://example.invalid/contact', {}));
    assert.equal(result.status, 200);
    assert.deepEqual(env.starts.map((call) => call.at), [0, expectedDelay]);
  });
}

for (const headers of [
  { 'X-RateLimit-Daily-Remaining': '0' },
  { 'X-RateLimit-Interval-Milliseconds': '30001' },
]) {
  test(`daily or excessive throttling is returned without retry: ${JSON.stringify(headers)}`, async () => {
    const upstream = response(429, headers);
    const env = fixture(() => upstream);
    assert.equal(await env.settle(env.request('https://example.invalid/contact', {})), upstream);
    assert.equal(env.starts.length, 1);
    assert.equal(await upstream.text(), 'fixture response');
  });
}

test('successful and non-429 error responses pass through without retry or body consumption', async () => {
  for (const status of [200, 400, 401, 403, 404, 500, 503]) {
    const upstream = response(status);
    const env = fixture(() => upstream);
    assert.equal(await env.settle(env.request('https://example.invalid/contact', {})), upstream);
    assert.equal(env.starts.length, 1);
    assert.equal(await upstream.text(), 'fixture response');
  }
});

test('a network failure is not retried and does not block the next queued request', async () => {
  const failure = new Error('fixture network failure');
  const env = fixture((_call, index) => index === 1 ? Promise.reject(failure) : response());
  const rejected = env.request('https://example.invalid/first', {}).catch((error) => error);
  const next = env.request('https://example.invalid/second', {});
  assert.equal(await env.settle(rejected), failure);
  assert.equal((await env.settle(next)).status, 200);
  assert.deepEqual(env.starts.map((call) => call.at), [0, 0]);
});

test('contact timeout starts after the pacing wait and is fresh after every 429 retry', async () => {
  const env = fixture((call, index) => call.url.endsWith('/contact') && index === 81 ? response(429) : response());
  const calendars = Array.from({ length: 80 }, (_item, index) => env.request(`https://example.invalid/calendar/${index}`, {}));
  const contact = env.request('https://example.invalid/contact', { cache: 'no-store', redirect: 'error' }, 8000);
  await env.advanceTo(9999);
  assert.equal(env.timeouts.length, 0, 'Queue time must not consume the contact timeout');
  await env.settle(Promise.all([...calendars, contact]));
  assert.deepEqual(env.timeouts.map(({ at, duration }) => ({ at, duration })), [
    { at: 10_000, duration: 8000 },
    { at: 20_000, duration: 8000 },
  ]);
  assert.notEqual(env.timeouts[0].signal, env.timeouts[1].signal);
  for (const [index, call] of env.starts.slice(80).entries()) {
    assert.equal(call.init.signal, env.timeouts[index].signal);
    assert.equal(call.init.cache, 'no-store');
    assert.equal(call.init.redirect, 'error');
  }
});

test('calendar attempts receive fresh explicit signals so Next cannot memoize a 429', async () => {
  const env = fixture((_call, index) => index === 1 ? response(429) : response());
  assert.equal((await env.settle(env.request('https://example.invalid/calendar', { cache: 'no-store' }))).status, 200);
  assert.ok(env.starts.every((call) => call.init.signal instanceof AbortSignal));
  assert.notEqual(env.starts[0].init.signal, env.starts[1].init.signal);
  assert.equal(env.timeouts.length, 0, 'Calendar calls do not acquire a new timeout');
});

test('caller cancellation is preserved with and without a contact timeout', async () => {
  for (const timeout of [undefined, 8000]) {
    const caller = new AbortController();
    const env = fixture();
    await env.settle(env.request('https://example.invalid/contact', { signal: caller.signal }, timeout));
    const actual = env.starts[0].init.signal;
    caller.abort();
    assert.equal(actual.aborted, true);
  }
});

test('a teed Next 429 body cannot block the retry while its hidden sibling is unread', async () => {
  const [returned, hidden] = cloneResponse(response(429));
  const env = fixture((_call, index) => index === 1 ? returned : response());
  assert.equal((await env.settle(env.request('https://example.invalid/calendar', {}))).status, 200);
  assert.deepEqual(env.starts.map((call) => call.at), [0, 10_000]);
  await hidden.text();
});
