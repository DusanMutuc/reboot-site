import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseResourceId,
  resolveResourceRedirectTarget,
} from '../src/lib/resourceRedirect.ts';

const requestUrl = 'https://reboot.example/r/42?download=1';

test('resource IDs accept positive safe integers and reject invalid numeric values', () => {
  assert.equal(parseResourceId('42'), 42);
  assert.equal(parseResourceId('0042'), 42);
  assert.equal(parseResourceId(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
  for (const value of [undefined, '', ' ', 'abc', '0', '-1', '1.5', 'Infinity', '9007199254740992']) {
    assert.equal(parseResourceId(value), null, String(value));
  }
});

test('normal web destinations preserve query strings and support relative links', () => {
  assert.equal(resolveResourceRedirectTarget('https://video.example/watch?v=12#start', requestUrl),
    'https://video.example/watch?v=12#start');
  assert.equal(resolveResourceRedirectTarget('http://docs.example/guide', requestUrl),
    'http://docs.example/guide');
  assert.equal(resolveResourceRedirectTarget('/library/hiring', requestUrl),
    'https://reboot.example/library/hiring');
  assert.equal(resolveResourceRedirectTarget('/r/43', requestUrl), 'https://reboot.example/r/43');
});

test('missing, malformed, and non-web destinations are unavailable', () => {
  for (const value of [null, undefined, '', '   ', 'http://[', 'https://',
    'javascript:alert(1)', 'data:text/html,test', 'file:///example.pdf', 'mailto:team@example.com']) {
    assert.equal(resolveResourceRedirectTarget(value, requestUrl), null, String(value));
  }
});

test('same-route destinations cannot loop through query, fragment, or trailing-slash changes', () => {
  for (const value of [requestUrl, '/r/42', '/r/42/', '/r/42?download=other.pdf',
    '/r/42#top', '#top', '?download=other.pdf']) {
    assert.equal(resolveResourceRedirectTarget(value, requestUrl), null, value);
  }
});
