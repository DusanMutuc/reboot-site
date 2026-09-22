import assert from 'node:assert/strict';
import test from 'node:test';
import { canSwitchMemberViews, fetchMemberHomeContext, resolveHomePathForRoleCodes } from '../src/lib/userRoles.ts';

const dual = ['user', 'ninety-day-user'];
const programmeHome = { default_home: 'ninety-day', has_active_ninety_day_enrollment: true };

test('a dual member can use both views independently of their default', () => {
  assert.equal(resolveHomePathForRoleCodes(dual, programmeHome), '/home/ninety-day');
  assert.equal(canSwitchMemberViews(dual, programmeHome), true);
  const memberHome = { ...programmeHome, default_home: 'member' };
  assert.equal(resolveHomePathForRoleCodes(dual, memberHome), '/dashboard');
  assert.equal(canSwitchMemberViews(dual, memberHome), true);
});

test('draft, completed, ended and absent enrollment fall back to full membership', () => {
  for (const context of [undefined, { ...programmeHome, has_active_ninety_day_enrollment: false }]) {
    assert.equal(resolveHomePathForRoleCodes(dual, context), '/dashboard');
    assert.equal(canSwitchMemberViews(dual, context), false);
  }
});

test('single memberships cannot switch or gain access through a home preference', () => {
  assert.equal(resolveHomePathForRoleCodes(['user'], programmeHome), '/dashboard');
  assert.equal(canSwitchMemberViews(['user'], programmeHome), false);
  assert.equal(resolveHomePathForRoleCodes(['ninety-day-user']), '/home/ninety-day');
  assert.equal(canSwitchMemberViews(['ninety-day-user'], programmeHome), false);
});

test('past member denial and staff landing pages retain precedence', () => {
  assert.equal(resolveHomePathForRoleCodes([...dual, 'past_member'], programmeHome), '/access-removed');
  assert.equal(canSwitchMemberViews([...dual, 'past_member'], programmeHome), false);
  for (const [role, home] of [['admin', '/admin'], ['coach', '/coach'], ['assistant', '/assistant-library']]) {
    assert.equal(resolveHomePathForRoleCodes([...dual, role], programmeHome), home);
  }
});

test('membership context reads only the signed-in user and validates its shape', async () => {
  const client = { rpc: async (...args) => {
    assert.deepEqual(args, ['get_my_member_home_context']);
    return { data: programmeHome, error: null };
  } };
  assert.deepEqual(await fetchMemberHomeContext(client), programmeHome);
  assert.deepEqual(await fetchMemberHomeContext({ rpc: async () => ({ data: {}, error: null }) }), {
    default_home: 'member', has_active_ninety_day_enrollment: false,
  });
  await assert.rejects(fetchMemberHomeContext({ rpc: async () => ({ error: { message: 'offline' } }) }), /offline/);
});
