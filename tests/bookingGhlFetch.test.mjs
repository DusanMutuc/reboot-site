import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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
  const flush = async () => { for (let turn = 0; turn < 40; turn += 1) await Promise.resolve(); };
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
    exports, Date: ClockDate, console,
    setTimeout(callback, delay) {
      const id = ++nextTimerId;
      timers.set(id, { at: now + Math.max(0, Number(delay)), callback });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    AbortSignal: {
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

test('calendar and contact requests share pacing while their responses can overlap', async () => {
  const pending = [deferred(), deferred(), deferred()];
  const env = fixture((_call, index) => pending[index - 1].promise);
  const requests = [
    env.request('https://example.invalid/calendars/events', { cache: 'no-store' }),
    env.request('https://example.invalid/contacts/one', { cache: 'no-store' }),
    env.request('https://example.invalid/contacts/two', { cache: 'no-store' }),
  ];
  await env.flush();
  assert.deepEqual(env.starts.map((call) => call.at), [0]);
  await env.advanceTo(199);
  assert.equal(env.starts.length, 1);
  await env.advanceTo(400);
  assert.deepEqual(env.starts.map((call) => call.at), [0, 200, 400]);
  for (const item of pending) item.resolve(response());
  await env.settle(Promise.all(requests));
  assert.equal(env.timeouts.length, 0);
});

test('a 429 extends the cooldown for a request already waiting for its paced start', async () => {
  const firstResponse = deferred();
  const env = fixture((_call, index) => index === 1 ? firstResponse.promise : response());
  const requests = ['first', 'second', 'third'].map((name) => env.request(`https://example.invalid/${name}`, {}));
  await env.advanceTo(50);
  firstResponse.resolve(response(429));
  await env.flush();
  await env.advanceTo(200);
  assert.equal(env.starts.length, 1, 'A waiter must recheck the cooldown after its original sleep');
  await env.advanceTo(10_049);
  assert.equal(env.starts.length, 1);
  await env.settle(Promise.all(requests));
  assert.deepEqual(env.starts.map((call) => call.at), [0, 10_050, 10_250, 10_450]);
  assert.equal(env.starts.at(-1).url, 'https://example.invalid/first');
});

test('concurrent 429 responses cannot shorten an existing shared cooldown', async () => {
  const early = deferred();
  const later = deferred();
  const env = fixture((_call, index) => index === 1 ? early.promise : index === 2 ? later.promise : response());
  const requests = ['one', 'two', 'three'].map((name) => env.request(`https://example.invalid/${name}`, {}));
  await env.advanceTo(250);
  early.resolve(response(429, { 'X-RateLimit-Interval-Milliseconds': '20000' }));
  await env.flush();
  await env.advanceTo(350);
  later.resolve(response(429, { 'X-RateLimit-Interval-Milliseconds': '10000' }));
  await env.flush();
  await env.advanceTo(20_249);
  assert.equal(env.starts.length, 2);
  await env.settle(Promise.all(requests));
  assert.deepEqual(env.starts.map((call) => call.at), [0, 200, 20_250, 20_450, 20_650]);
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
  assert.deepEqual(env.starts.map((call) => call.at), [0, 200]);
});

test('contact timeout starts after the pacing wait and is fresh after every 429 retry', async () => {
  const env = fixture((call, index) => call.url.endsWith('/contact') && index === 2 ? response(429) : response());
  const calendar = env.request('https://example.invalid/calendar', {});
  const contact = env.request('https://example.invalid/contact', { cache: 'no-store', redirect: 'error' }, 8000);
  await env.advanceTo(199);
  assert.equal(env.timeouts.length, 0, 'Queue time must not consume the contact timeout');
  await env.settle(Promise.all([calendar, contact]));
  assert.deepEqual(env.timeouts.map(({ at, duration }) => ({ at, duration })), [
    { at: 200, duration: 8000 },
    { at: 10_200, duration: 8000 },
  ]);
  assert.notEqual(env.timeouts[0].signal, env.timeouts[1].signal);
  for (const [index, call] of env.starts.slice(1).entries()) {
    assert.equal(call.init.signal, env.timeouts[index].signal);
    assert.equal(call.init.cache, 'no-store');
    assert.equal(call.init.redirect, 'error');
  }
});
