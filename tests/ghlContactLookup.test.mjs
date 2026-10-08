import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/ghlContactLookup.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const email = 'destination@example.invalid';
const contact = (id = 'new-contact', overrides = {}) => ({ id, email, locationId: 'location', ...overrides });
const success = (contacts, total = contacts.length) => ({ ok: true, json: async () => ({ contacts, total }) });

function fixture({ responses = [success([contact()])], config = {}, fetchImpl } = {}) {
  const calls = [];
  let abort;
  let cleared = false;
  const exports = {};
  vm.runInNewContext(source, {
    exports, URL, AbortController,
    require(name) {
      assert.equal(name, '@/lib/config');
      return { GHL: { BASE: 'https://ghl.example.invalid/', TOKEN: 'secret-fixture', VERSION: '2021-07-28', LOCATION_ID: 'location', ...config } };
    },
    setTimeout(fn, delay) { assert.equal(delay, 10_000); abort = fn; return 'timer'; },
    clearTimeout(timer) { assert.equal(timer, 'timer'); cleared = true; },
    fetch: async (url, options) => {
      calls.push({ url, ...options, body: JSON.parse(options.body) });
      if (fetchImpl) return fetchImpl(url, options, () => abort());
      assert.ok(responses.length, 'Unexpected extra request');
      return responses.shift();
    },
  });
  return { resolve: exports.resolveGhlContactIdByEmail, calls, wasCleared: () => cleared };
}

test('resolves the normalized destination email using a read-only exact search in the configured location', async () => {
  const { resolve, calls, wasCleared } = fixture({ responses: [success([contact('destination-ghl-id', { email: ' Destination@Example.Invalid ' })])] });
  const result = await resolve(' Destination@Example.Invalid ');
  assert.equal(result.ok, true);
  assert.equal(result.contactId, 'destination-ghl-id');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://ghl.example.invalid/contacts/search');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { locationId: 'location', page: 1, pageLimit: 100, filters: [{ field: 'email', operator: 'eq', value: email }] });
  assert.equal(calls[0].headers.Authorization, 'Bearer secret-fixture');
  assert.equal(calls[0].headers.Version, '2021-07-28');
  assert.equal(calls[0].cache, 'no-store');
  assert.equal(calls[0].redirect, 'error');
  assert.equal(wasCleared(), true);
});

test('does not fall back to a different contact or additional email', async () => {
  const { resolve } = fixture({ responses: [success([contact('unrelated', { email: 'other@example.invalid', additionalEmails: [{ email }] })])] });
  const result = await resolve(email);
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error, /No GHL contact/);
});

test('no matching contact requires fixing GHL before transfer', async () => {
  const { resolve } = fixture({ responses: [success([])] });
  const result = await resolve(email);
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error, /Add or correct/);
});

test('duplicate exact matches block the transfer', async () => {
  const { resolve } = fixture({ responses: [success([contact('one'), contact('two')])] });
  const result = await resolve(email);
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error, /duplicate contacts/);
});

test('checks subsequent pages before accepting a unique contact', async () => {
  const firstPage = Array.from({ length: 100 }, (_, i) => contact(String(i), { email: `unrelated-${i}@example.invalid` }));
  firstPage[0] = contact('first');
  const { resolve, calls } = fixture({ responses: [success(firstPage, 101), success([contact('second')], 101)] });
  const result = await resolve(email);
  assert.equal(result.status, 409);
  assert.deepEqual(calls.map((call) => call.body.page), [1, 2]);
  assert.equal(calls[0].signal, calls[1].signal);
});

test('can find the single exact contact on a later page', async () => {
  const firstPage = Array.from({ length: 100 }, (_, i) => contact(String(i), { email: `unrelated-${i}@example.invalid` }));
  const { resolve } = fixture({ responses: [success(firstPage, 101), success([contact()], 101)] });
  const result = await resolve(email);
  assert.equal(result.ok, true);
  assert.equal(result.contactId, 'new-contact');
});

test('rejects invalid destination emails without a request', async () => {
  for (const value of ['', 'no-email', 'two@example.invalid other@example.invalid', null, undefined]) {
    const { resolve, calls } = fixture();
    assert.equal((await resolve(value)).status, 400);
    assert.equal(calls.length, 0);
  }
});

test('missing config or invalid API URL blocks the lookup without leaking credentials', async () => {
  for (const config of [
    { BASE: '' }, { TOKEN: '' }, { VERSION: '' }, { LOCATION_ID: ' ' },
    { BASE: 'not-a-url' }, { BASE: 'http://ghl.example.invalid' },
    { BASE: 'https://user:secret-fixture@ghl.example.invalid' },
    { BASE: 'https://ghl.example.invalid?token=secret-fixture' },
    { BASE: 'https://ghl.example.invalid#secret-fixture' },
  ]) {
    const { resolve, calls } = fixture({ config });
    const result = await resolve(email);
    assert.equal(result.status, 503);
    assert.equal(calls.length, 0);
    assert.doesNotMatch(result.error, /secret-fixture/);
  }
});

test('malformed, inconsistent or wrong-location search results fail closed', async () => {
  for (const payload of [
    null, [], {}, { contacts: [contact()] }, { contacts: [], total: -1 },
    { contacts: [], total: '0' }, { contacts: [], total: 0.5 },
    { contacts: [null], total: 1 }, { contacts: [contact('', {})], total: 1 },
    { contacts: [contact('id', { email: null })], total: 1 },
    { contacts: [contact('id', { locationId: 'another-location' })], total: 1 },
    { contacts: [contact('id', { locationId: undefined })], total: 1 },
    { contacts: [contact(), contact()], total: 2 },
    { contacts: [contact()], total: 0 }, { contacts: [], total: 1 },
  ]) {
    const { resolve, wasCleared } = fixture({ responses: [{ ok: true, json: async () => payload }] });
    assert.equal((await resolve(email)).status, 502);
    assert.equal(wasCleared(), true);
  }
});

test('repeated pages and changing totals cannot produce a successful match', async () => {
  for (const responses of [
    [success([contact()], 2), success([contact()], 2)],
    [success([contact()], 2), success([], 1)],
  ]) {
    const { resolve } = fixture({ responses });
    assert.equal((await resolve(email)).status, 502);
  }
});

test('stops excessively broad search results after the page limit', async () => {
  const responses = Array.from({ length: 10 }, (_, page) => success(
    Array.from({ length: 100 }, (_, index) => contact(`${page}-${index}`, { email: `${page}-${index}@example.invalid` })), 1001,
  ));
  const { resolve, calls } = fixture({ responses });
  const result = await resolve(email);
  assert.equal(result.status, 502);
  assert.equal(calls.length, 10);
});

test('upstream errors do not expose response bodies or credentials', async () => {
  for (const status of [401, 403, 429, 500]) {
    const { resolve, wasCleared } = fixture({ responses: [{ ok: false, status, text: async () => { throw new Error('Response body must not be read'); } }] });
    const result = await resolve(email);
    assert.equal(result.status, 502);
    assert.doesNotMatch(result.error, /secret-fixture/);
    if (status === 401 || status === 403) assert.match(result.error, /contacts.readonly/);
    assert.equal(wasCleared(), true);
  }
});

test('network failures and malformed JSON fail closed without surfacing upstream details', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('secret-fixture'); },
    async () => ({ ok: true, json: async () => { throw new SyntaxError('secret-fixture'); } }),
  ]) {
    const { resolve, wasCleared } = fixture({ fetchImpl });
    const result = await resolve(email);
    assert.equal(result.status, 502);
    assert.doesNotMatch(result.error, /secret-fixture/);
    assert.equal(wasCleared(), true);
  }
});

test('the timeout aborts the request and returns an actionable failure', async () => {
  const { resolve, wasCleared } = fixture({ fetchImpl: async (_url, options, abort) => {
    abort();
    assert.equal(options.signal.aborted, true);
    throw new Error('aborted');
  } });
  const result = await resolve(email);
  assert.equal(result.status, 504);
  assert.match(result.error, /timed out/);
  assert.equal(wasCleared(), true);
});

test('the timeout also covers reading the response body', async () => {
  const { resolve } = fixture({ fetchImpl: async (_url, _options, abort) => ({
    ok: true,
    json: async () => { abort(); throw new Error('aborted body'); },
  }) });
  assert.equal((await resolve(email)).status, 504);
});
