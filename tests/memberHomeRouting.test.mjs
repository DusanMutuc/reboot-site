import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHomePathForRoleCodes } from '../src/lib/userRoles.ts';

test('members and Legends use the redesigned home', () => {
  assert.equal(resolveHomePathForRoleCodes(['user']), '/home');
  assert.equal(resolveHomePathForRoleCodes(['user', 'legend']), '/home');
});

test('staff and assistant landing pages keep their existing precedence', () => {
  assert.equal(resolveHomePathForRoleCodes(['admin', 'coach', 'user']), '/admin');
  assert.equal(resolveHomePathForRoleCodes(['coach', 'user']), '/coach');
  assert.equal(resolveHomePathForRoleCodes(['assistant', 'user']), '/assistant-library');
});

test('90-day members stay in their programme and full membership still wins', () => {
  assert.equal(resolveHomePathForRoleCodes(['ninety-day-user']), '/home/ninety-day');
  assert.equal(resolveHomePathForRoleCodes(['ninety-day-user', 'user']), '/home');
});

test('removed access takes precedence over every landing page', () => {
  for (const role of ['user', 'legend', 'ninety-day-user', 'assistant', 'coach', 'admin']) {
    assert.equal(resolveHomePathForRoleCodes([role, 'past_member']), '/access-removed');
  }
});
