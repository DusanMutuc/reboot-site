import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/bookingGhlContacts.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contact = (id, overrides = {}) => ({
  id, locationId: 'fixture-location', firstName: ' First ', lastName: ' Last ', email: ' MEMBER@EXAMPLE.INVALID ', ...overrides,
});
const json = (payload) => Response.json(payload);
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture({ batch, get, base = 'https://calendar.example.invalid', environment = 'production', config = {} } = {}) {
  const requests = [];
  const exports = {};
  const GHL = { BASE: base, TOKEN: 'fixture-token', VERSION: '2021-07-28', LOCATION_ID: 'fixture-location', ...config };
  const imports = {
    '@/lib/config': { GHL },
    '@/lib/bookingGhlFetch': {
      async fetchBookingGhl(url, init, timeoutMs) {
        const parsed = new URL(url);
        const body = init.body ? JSON.parse(init.body) : null;
        const call = { url: parsed, init, timeoutMs, body };
        requests.push(call);
        if (parsed.pathname.endsWith('/contacts/search')) {
          const ids = body.filters[0].filters.map((filter) => filter.value);
          return batch ? batch(ids, call) : json({ contacts: ids.map((id) => contact(id)), hasMore: false });
        }
        const id = decodeURIComponent(parsed.pathname.split('/').at(-1));
        return get ? get(id, call) : json({ contact: contact(id) });
      },
    },
  };
  vm.runInNewContext(source, {
    exports, URL, console, process: { env: { NODE_ENV: environment } },
    require(name) { assert.ok(name in imports, `Unexpected import ${name}`); return imports[name]; },
  });
  return { resolve: exports.resolveBookingGhlContacts, requests };
}

test('97 contact IDs resolve in one scoped read-only search request', async () => {
  const env = fixture();
  const ids = Array.from({ length: 97 }, (_item, index) => `contact-${index}`);
  const result = await env.resolve(ids);
  assert.equal(result.size, 97);
  assert.equal(env.requests.length, 1);
  const call = env.requests[0];
  assert.equal(call.url.href, 'https://calendar.example.invalid/contacts/search');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.Authorization, 'Bearer fixture-token');
  assert.equal(call.init.headers.Version, '2021-07-28');
  assert.equal(call.init.headers['Content-Type'], 'application/json');
  assert.equal(call.init.cache, 'no-store');
  assert.equal(call.init.redirect, 'error');
  assert.equal(call.timeoutMs, 8000);
  assert.deepEqual(call.body, {
    locationId: 'fixture-location', page: 1, pageLimit: 500, fastPagination: true,
    filters: [{ group: 'OR', filters: ids.map((id) => ({ field: 'id', operator: 'eq', value: id })) }],
  });
  assert.deepEqual(plain(result.get(ids[0])), { name: 'First Last', email: 'member@example.invalid' });
});

test('contact IDs are deduplicated and requests are chunked at 100', async () => {
  const env = fixture();
  const ids = Array.from({ length: 205 }, (_item, index) => `contact-${index}`);
  const result = await env.resolve([...ids, ids[0], ids[104]]);
  assert.equal(result.size, 205);
  assert.deepEqual(env.requests.map((call) => call.body.filters[0].filters.length), [100, 100, 5]);
  assert.deepEqual(env.requests.flatMap((call) => call.body.filters[0].filters.map((filter) => filter.value)), ids);
});

test('search names retain first/last precedence and support its contactName field', async () => {
  const env = fixture({ batch: () => json({ contacts: [
    contact('joined', { name: 'Other name', contactName: 'Another name' }),
    contact('legacy', { firstName: null, lastName: null, name: ' Legacy Name ', contactName: 'Other name', email: null }),
    contact('search', { firstName: null, lastName: null, contactName: ' Search Name ' }),
    contact('empty', { firstName: null, lastName: null, email: null }),
  ], hasMore: false }) });
  const result = await env.resolve(['joined', 'legacy', 'search', 'empty']);
  assert.equal(result.get('joined').name, 'First Last');
  assert.deepEqual(plain(result.get('legacy')), { name: 'Legacy Name', email: null });
  assert.equal(result.get('search').name, 'Search Name');
  assert.deepEqual(plain(result.get('empty')), { name: null, email: null });
  assert.equal(env.requests.length, 1);
});

test('missing IDs fall back individually even when search says another page exists', async () => {
  const env = fixture({ batch: () => json({ contacts: [contact('found'), contact('unrequested')], hasMore: true }) });
  const result = await env.resolve(['found', 'missing']);
  assert.equal(env.requests.length, 2);
  assert.equal(env.requests[1].url.pathname, '/contacts/missing');
  assert.equal(result.size, 2);
  assert.equal(result.has('unrequested'), false);
  assert.equal(result.get('missing').name, 'First Last');
  const fallback = env.requests[1];
  assert.equal(fallback.init.cache, 'no-store');
  assert.equal(fallback.init.redirect, 'error');
  assert.equal(fallback.init.headers.Version, '2021-07-28');
  assert.equal(fallback.timeoutMs, 8000);
});

test('wrong-location, duplicate and partial search records fall back only for affected IDs', async () => {
  const env = fixture({ batch: () => json({ contacts: [
    contact('valid'),
    contact('wrong-location', { locationId: 'other-location' }),
    contact('duplicate'), contact('duplicate'),
    { id: 'partial', locationId: 'fixture-location' },
    contact('bad-field', { email: { address: 'member@example.invalid' } }),
  ], hasMore: false }) });
  const result = await env.resolve(['valid', 'wrong-location', 'duplicate', 'partial', 'bad-field']);
  assert.deepEqual(env.requests.slice(1).map((call) => call.url.pathname).sort(), [
    '/contacts/bad-field', '/contacts/duplicate', '/contacts/partial', '/contacts/wrong-location',
  ]);
  assert.ok([...result.values()].every((details) => details?.name === 'First Last'));
});

test('partial search identity fields require an exact read instead of treating omissions as null', async () => {
  const env = fixture({ batch: () => json({ contacts: [
    { id: 'first-only', locationId: 'fixture-location', firstName: 'Partial' },
    contact('undefined-email', { email: undefined }),
    contact('undefined-last', { lastName: undefined }),
  ] }), get: (id) => json({ contact: contact(id, { firstName: 'Complete', lastName: 'Identity', email: 'actual@example.invalid' }) }) });
  const result = await env.resolve(['first-only', 'undefined-email', 'undefined-last']);
  assert.equal(env.requests.length, 4);
  for (const details of result.values()) {
    assert.deepEqual(plain(details), { name: 'Complete Identity', email: 'actual@example.invalid' });
  }
});

for (const [label, batch] of [
  ['HTTP failure', () => new Response('upstream failure', { status: 503 })],
  ['network failure', () => { throw new Error('fixture failure'); }],
  ['invalid JSON', () => new Response('not JSON')],
  ['missing contact array', () => json({ total: 2 })],
  ['non-array contact field', () => json({ contacts: {} })],
]) {
  test(`${label} falls back to exact GETs for the whole affected chunk`, async () => {
    const env = fixture({ batch });
    const result = await env.resolve(['one', 'two']);
    assert.equal(env.requests.length, 3);
    assert.deepEqual(env.requests.slice(1).map((call) => call.url.pathname).sort(), ['/contacts/one', '/contacts/two']);
    assert.ok([...result.values()].every((details) => details?.name === 'First Last'));
  });
}

test('a failed later search chunk does not discard contacts from a successful chunk', async () => {
  const ids = Array.from({ length: 101 }, (_item, index) => `contact-${index}`);
  const env = fixture({ batch: (chunk) => chunk.length === 1
    ? new Response('failure', { status: 500 }) : json({ contacts: chunk.map((id) => contact(id)) }) });
  const result = await env.resolve(ids);
  assert.equal(result.size, 101);
  assert.equal(env.requests.length, 3);
  assert.equal(env.requests.at(-1).url.pathname, '/contacts/contact-100');
});

test('exact GET failures and mismatched identities stay unresolved', async () => {
  for (const get of [
    () => new Response('unavailable', { status: 503 }),
    () => { throw new Error('fixture failure'); },
    () => json({ contact: contact('another-id') }),
    (id) => json({ contact: contact(id, { locationId: 'other-location' }) }),
    (id) => json({ contact: contact(id, { firstName: [] }) }),
    (id) => json({ contact: { id, locationId: 'fixture-location' } }),
    () => json({ contacts: [] }),
  ]) {
    const env = fixture({ batch: () => json({ contacts: [] }), get });
    const result = await env.resolve(['wanted']);
    assert.equal(result.get('wanted'), null);
    assert.equal(result.size, 1);
  }
});

test('unresolved contacts are retried on the next report rather than cached', async () => {
  let reads = 0;
  const env = fixture({ batch: () => json({ contacts: [] }), get: (id) => ++reads === 1
    ? new Response('unavailable', { status: 503 }) : json({ contact: contact(id) }) });
  assert.equal((await env.resolve(['wanted'])).get('wanted'), null);
  assert.equal((await env.resolve(['wanted'])).get('wanted').name, 'First Last');
  assert.equal(env.requests.length, 4);
});

test('exact GET fallback concurrency stays at four', async () => {
  let active = 0;
  let maximum = 0;
  const pending = [];
  const env = fixture({ batch: () => json({ contacts: [] }), get: (id) => new Promise((resolve) => {
    active += 1;
    maximum = Math.max(maximum, active);
    pending.push(() => { active -= 1; resolve(json({ contact: contact(id) })); });
  }) });
  const result = env.resolve(Array.from({ length: 9 }, (_item, index) => `contact-${index}`));
  for (let turn = 0; turn < 100; turn += 1) {
    await Promise.resolve();
    const ready = pending.splice(0);
    for (const finish of ready) finish();
  }
  assert.equal((await result).size, 9);
  assert.equal(maximum, 4);
});

test('invalid connections and credential-bearing bases perform no requests', async () => {
  for (const base of [
    'not a URL', 'http://untrusted.example', 'ftp://calendar.example.invalid',
    'https://user:password@calendar.example.invalid', 'http://localhost:3000',
  ]) {
    const env = fixture({ base });
    assert.equal((await env.resolve(['wanted'])).get('wanted'), null);
    assert.equal(env.requests.length, 0);
  }
  for (const config of [{ TOKEN: '' }, { VERSION: '' }, { LOCATION_ID: '' }]) {
    const env = fixture({ config });
    assert.equal((await env.resolve(['wanted'])).get('wanted'), null);
    assert.equal(env.requests.length, 0);
  }
});

test('development loopback connections remain supported', async () => {
  for (const base of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
    const env = fixture({ base, environment: 'development' });
    assert.equal((await env.resolve(['wanted'])).get('wanted').name, 'First Last');
    assert.equal(env.requests.length, 1);
  }
});

test('empty input does not contact GHL', async () => {
  const env = fixture();
  assert.equal((await env.resolve([])).size, 0);
  assert.equal(env.requests.length, 0);
});
