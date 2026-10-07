import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/coachBookingEmbed.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
vm.runInNewContext(source, { exports, URL });
const { getCoachBookingEmbedUrl } = exports;
const host = 'https://api.leadconnectorhq.com';

test('saved implementation and primary calendar slugs need no embed URL rewrite', () => {
  for (const slug of ['implementation_meeting_with_jelena', 'business-review-rob', 'AbC123_xYz-9']) {
    const url = `${host}/widget/bookings/${slug}`;
    assert.equal(getCoachBookingEmbedUrl(url), url);
    assert.equal(getCoachBookingEmbedUrl(`${url}/`), `${url}/`);
  }
});

test('valid options and fragment are preserved without adding member data or changing the calendar', () => {
  const url = `${host}/widget/bookings/business-review-rob?timezone=America%2FEdmonton&locale=en&source=a%20b#calendar`;
  assert.equal(getCoachBookingEmbedUrl(url), url);
  assert.equal(getCoachBookingEmbedUrl(`  ${url}  `), url);
  assert.equal(getCoachBookingEmbedUrl('HTTPS://API.LEADCONNECTORHQ.COM:443/widget/bookings/test'), `${host}/widget/bookings/test`);
});

test('the selected member name is encoded without changing the calendar or other booking options', () => {
  const raw = `${host}/widget/bookings/implementation_meeting_with_jelena?locale=en#calendar`;
  const url = new URL(getCoachBookingEmbedUrl(raw, '  Renée O’Neil & Co  '));
  assert.equal(url.origin, host);
  assert.equal(url.pathname, '/widget/bookings/implementation_meeting_with_jelena');
  assert.equal(url.searchParams.get('full_name'), 'Renée O’Neil & Co');
  assert.equal(url.searchParams.get('locale'), 'en');
  assert.equal(url.searchParams.has('email'), false);
  assert.equal(url.hash, '#calendar');
  assert.equal(new URL(getCoachBookingEmbedUrl(`${raw.split('#')[0]}&full_name=Previous+Member`, 'Selected Member')).searchParams.getAll('full_name').length, 1);
  assert.equal(new URL(getCoachBookingEmbedUrl(`${raw.split('#')[0]}&full_name=Previous+Member`, 'Selected Member')).searchParams.get('full_name'), 'Selected Member');
});

test('the selected member email is encoded once, preserving aliases and replacing stale values', () => {
  const raw = `${host}/widget/bookings/implementation_meeting_with_jelena?locale=en&email=old%40example.com&email=older%40example.com#calendar`;
  const url = new URL(getCoachBookingEmbedUrl(raw, 'Selected Member', '  member+coaching@example.com  '));
  assert.equal(url.pathname, '/widget/bookings/implementation_meeting_with_jelena');
  assert.deepEqual(url.searchParams.getAll('email'), ['member+coaching@example.com']);
  assert.equal(url.searchParams.get('full_name'), 'Selected Member');
  assert.equal(url.searchParams.get('locale'), 'en');
  assert.equal(url.hash, '#calendar');
  assert.ok(url.href.includes('member%2Bcoaching%40example.com'));
  assert.equal(new URL(getCoachBookingEmbedUrl(raw, null, 'next@example.com')).searchParams.get('email'), 'next@example.com');
});

test('prefill never adds member details to an unverified provider or empty values', () => {
  assert.equal(getCoachBookingEmbedUrl('https://example.com/widget/bookings/test', 'Member Name', 'member@example.com'), null);
  const url = `${host}/widget/bookings/test`;
  for (const name of [null, undefined, '', '  ']) assert.equal(getCoachBookingEmbedUrl(url, name), url);
  for (const email of [null, undefined, '', '  ']) assert.equal(getCoachBookingEmbedUrl(url, null, email), url);
});

test('missing, relative, insecure and executable URLs cannot become iframe sources', () => {
  for (const value of [null, undefined, '', '  ', '/widget/bookings/test',
    '//api.leadconnectorhq.com/widget/bookings/test', 'api.leadconnectorhq.com/widget/bookings/test',
    'https:api.leadconnectorhq.com/widget/bookings/test', 'http://api.leadconnectorhq.com/widget/bookings/test',
    'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'about:blank', 'https://']) {
    assert.equal(getCoachBookingEmbedUrl(value), null, String(value));
  }
});

test('only the verified exact provider host is embedded', () => {
  for (const hostname of ['example.com', 'leadconnectorhq.com', 'app.gohighlevel.com',
    'api.leadconnectorhq.com.example.com', 'example.api.leadconnectorhq.com',
    'api-leadconnectorhq.com', 'api.leadconnectorhq.com.', 'localhost', '127.0.0.1']) {
    assert.equal(getCoachBookingEmbedUrl(`https://${hostname}/widget/bookings/test`), null, hostname);
  }
});

test('credentials, alternate ports, backslashes and hidden whitespace are rejected', () => {
  for (const value of [`https://user@api.leadconnectorhq.com/widget/bookings/test`,
    `https://user:password@api.leadconnectorhq.com/widget/bookings/test`,
    `https://api.leadconnectorhq.com@example.com/widget/bookings/test`,
    `https://api.leadconnectorhq.com:8443/widget/bookings/test`,
    'https://api.leadconnectorhq.com\\widget\\bookings\\test',
    'https://api.leadconnectorhq.com/\nwidget/bookings/test',
    'https://api.leadconnectorhq.com/widget/bookings/te\tst']) {
    assert.equal(getCoachBookingEmbedUrl(value), null, value);
  }
});

test('arbitrary provider pages, alternate widget types and malformed slugs stay external', () => {
  for (const path of ['/', '/widget/bookings', '/widget/bookings/', '/widget/bookings/test/next',
    '/widget/forms/test', '/widget/booking/test', '/widget/groups/test', '/widget/bookings//test',
    '/widget/bookings/test.html', '/widget/bookings/test%2Fnext', '/widget/bookings/test%20slug',
    '/widget/bookings/%2F%2Fexample.com', '/widget/bookings/..']) {
    assert.equal(getCoachBookingEmbedUrl(`${host}${path}`), null, path);
  }
});
