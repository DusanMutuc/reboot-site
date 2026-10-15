import assert from 'node:assert/strict';
import test from 'node:test';
import { coachResourceGroups, getCoachProfileLinks, sharedCoachResourceLinks } from '../src/lib/coachResourceLinks.ts';

test('the resources redesign preserves every existing shared link and label', () => {
  assert.deepEqual(sharedCoachResourceLinks.map(({ label, href }) => [label, href]), [
    ['Training, tools & courses', '/resources'],
    ['Reboot calendar', 'https://www.addevent.com/calendar/ez616853'],
    ['Reboot coaching room', 'https://zoom.us/j/93233351653'],
    ['Assistant workroom', 'https://zoom.us/j/99652221215'],
    ['Assistant onboarding', 'https://api.leadconnectorhq.com/widget/bookings/assistant_on'],
    ['Systems explainers', 'https://vimeo.com/showcase/11715034'],
    ['Reboot Facebook group', 'https://www.facebook.com/groups/realestatereboot'],
    ['Agent referral directory', 'https://rebootmembers.com/legends'],
  ]);
});

test('the task groups include each existing shared destination exactly once', () => {
  assert.deepEqual(coachResourceGroups.flatMap(({ links }) => links).sort(), sharedCoachResourceLinks.map(({ label }) => label).sort());
});

test('personal booking and implementation notes links retain their distinct account fields', () => {
  const links = getCoachProfileLinks({
    m2_booking_url: 'https://booking.example/review?coach=momentum',
    impl_booking_url: 'https://booking.example/implementation?coach=implementation',
    call15_url: 'https://booking.example/legacy',
    coaching_notes_url: 'https://notes.example/implementation',
  });
  assert.deepEqual(links.map(({ label, href }) => [label, href]), [
    ['Business Review booking link', 'https://booking.example/review?coach=momentum'],
    ['Implementation booking link', 'https://booking.example/implementation?coach=implementation'],
    ['Implementation notes', 'https://notes.example/implementation'],
  ]);
});

test('the existing implementation fallback and URL normalization are preserved', () => {
  assert.equal(getCoachProfileLinks({ impl_booking_url: null, call15_url: 'booking.example/legacy' })[1].href, 'https://booking.example/legacy');
  // An explicitly empty implementation field has never selected the legacy field.
  assert.equal(getCoachProfileLinks({ impl_booking_url: '', call15_url: 'https://booking.example/legacy' })[1].href, null);
});

test('unconfigured and unsafe personal links remain unavailable', () => {
  assert.ok(getCoachProfileLinks(null).every(({ href }) => href === null));
  assert.ok(getCoachProfileLinks({ m2_booking_url: 'javascript:alert(1)', impl_booking_url: 'data:text/html,hello', coaching_notes_url: 123 }).every(({ href }) => href === null));
});
