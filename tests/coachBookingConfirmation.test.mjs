import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/coachBookingConfirmation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
vm.runInNewContext(source, { exports, URL });
const { isCoachBookingConfirmation } = exports;
const origin = 'https://api.leadconnectorhq.com';
const embedUrl = `${origin}/widget/bookings/implementation_meeting_with_jelena?full_name=Member`;
const frame = {};
const message = (data, overrides = {}) => ({ data, origin, source: frame, ...overrides });
const confirmation = ['msgsndr-booking-complete', { calendarId: 'As2Okpn9wNDYhLJog6C6', fingerprint: 'provider-fingerprint' }];

test('accepts the current Classic and Neo booking-complete message from the embedded frame', () => {
  assert.equal(isCoachBookingConfirmation(message(confirmation), frame, embedUrl), true);
  assert.equal(isCoachBookingConfirmation(message(['msgsndr-booking-complete', { calendarId: 'business-review-calendar' }]), frame,
    `${origin}/widget/bookings/business-review-rob`), true);
});

test('never interprets loading, resizing, form submissions or serialized strings as booking confirmation', () => {
  for (const data of [
    ['highlevel.setHeight', { height: 600, id: 'msgsndr-calendar' }],
    ['highlevel.closeWindow'], ['fetch-query-params', '', 'location'],
    ['formSubmitted', { calendarId: 'calendar' }], ['on-submit', { calendarId: 'calendar' }],
    ['booking-complete', { calendarId: 'calendar' }], JSON.stringify(confirmation),
    { event: 'msgsndr-booking-complete', calendarId: 'calendar' },
  ]) assert.equal(isCoachBookingConfirmation(message(data), frame, embedUrl), false);
});

test('rejects missing or malformed provider payloads', () => {
  for (const data of [null, undefined, '', 12, [], ['msgsndr-booking-complete'],
    ['msgsndr-booking-complete', null], ['msgsndr-booking-complete', []],
    ['msgsndr-booking-complete', 'calendar'], ['msgsndr-booking-complete', {}],
    ['msgsndr-booking-complete', { calendarId: '' }], ['msgsndr-booking-complete', { calendarId: '  ' }],
    ['msgsndr-booking-complete', { calendarId: 12 }], [...confirmation, 'extra'],
  ]) assert.equal(isCoachBookingConfirmation(message(data), frame, embedUrl), false);
});

test('only the currently embedded window may confirm a booking, including when origin matches', () => {
  for (const source of [null, undefined, {}, 'frame']) {
    assert.equal(isCoachBookingConfirmation(message(confirmation, { source }), frame, embedUrl), false);
  }
  assert.equal(isCoachBookingConfirmation(message(confirmation, { source: null }), null, embedUrl), false);
});

test('rejects wrong, opaque and lookalike message origins', () => {
  for (const candidate of ['null', '', 'http://api.leadconnectorhq.com', 'https://api.leadconnectorhq.com:8443',
    'https://api.leadconnectorhq.com.example.com', 'https://example.com', 'https://app.gohighlevel.com']) {
    assert.equal(isCoachBookingConfirmation(message(confirmation, { origin: candidate }), frame, embedUrl), false);
  }
});

test('the current frame URL must itself be an allowlisted GHL booking page', () => {
  for (const candidate of ['not a url', 'about:blank', '/widget/bookings/test',
    'https://example.com/widget/bookings/test', 'http://api.leadconnectorhq.com/widget/bookings/test',
    'https://api.leadconnectorhq.com:8443/widget/bookings/test', 'https://user@api.leadconnectorhq.com/widget/bookings/test',
    `${origin}/widget/forms/test`, `${origin}/widget/bookings/test/other`, `${origin}/widget/bookings/`]) {
    assert.equal(isCoachBookingConfirmation(message(confirmation), frame, candidate), false);
  }
});
