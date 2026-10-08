import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
function loadModule(path, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, URL, process, console,
    require: (name) => Object.hasOwn(imports, name) ? imports[name] : require(name),
  });
  return exports;
}
const { loadImplementationBookingCoaches } = loadModule('../src/lib/implementationBookingCoaches.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
const memberId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1651';
const otherMemberId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1652';
const coachId = (number) => `bb8f369e-c343-4b6a-9c9c-${String(number).padStart(12, '0')}`;
const now = new Date('2026-09-29T18:00:00.000Z');

function assignment(id, relationship = 'implementation', options = {}) {
  return {
    id, user_id: memberId, coach_id: coachId(id), course_id: 2, relationship_type: relationship,
    is_active: true, assigned_at: '2026-09-01T12:00:00.000Z', ended_at: null, ...options,
  };
}
function profile(id, options = {}) {
  return { id: coachId(id), first_name: 'Coach', last_name: String(id), ...options };
}
function bookingProfile(id, options = {}) {
  return {
    user_id: coachId(id), impl_booking_url: `https://calendar.example/implementation/${id}`,
    m2_booking_url: `https://calendar.example/review/${id}`, ...options,
  };
}

function clientFor({ assignments = [], profiles = [], bookingProfiles = [], failTable = null } = {}) {
  const tables = { user_coaches: assignments, profiles, coach_profiles: bookingProfiles };
  const calls = [];
  return {
    calls,
    from(table) {
      assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
      const filters = [];
      const orders = [];
      const call = { table, filters, orders, columns: null, limit: Infinity };
      calls.push(call);
      const result = (single) => {
        if (table === failTable) return { data: null, error: { code: 'XX000', message: `${table} failed` } };
        const rows = tables[table].filter((row) => filters.every((filter) => {
          if (filter.kind === 'in') return filter.values.includes(row[filter.column]);
          if (filter.kind === 'unexpired') return row.ended_at === null || row.ended_at > filter.now;
          return row[filter.column] === filter.value;
        })).sort((left, right) => {
          for (const { column, ascending } of orders) {
            if (left[column] === right[column]) continue;
            return (left[column] < right[column] ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        }).slice(0, call.limit);
        if (single) assert.ok(rows.length <= 1, 'Single-record lookup must be scoped to one result');
        return { data: single ? rows[0] ?? null : rows, error: null };
      };
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(column, value) { filters.push({ kind: 'eq', column, value }); return query; },
        is(column, value) { filters.push({ kind: 'is', column, value }); return query; },
        in(column, values) { filters.push({ kind: 'in', column, values: [...values] }); return query; },
        or(expression) {
          const prefix = 'ended_at.is.null,ended_at.gt.';
          assert.ok(expression.startsWith(prefix), `Unexpected expiry filter ${expression}`);
          filters.push({ kind: 'unexpired', now: expression.slice(prefix.length) });
          return query;
        },
        order(column, options = {}) { orders.push({ column, ascending: options.ascending !== false }); return query; },
        limit(value) { call.limit = value; return query; },
        maybeSingle: async () => result(true),
        then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
      };
      return query;
    },
  };
}

test('course 2 assignments take priority over newer general assignments and use the correct booking field', async () => {
  const client = clientFor({
    assignments: [
      assignment(10), assignment(20, 'primary'),
      assignment(11, 'implementation', { course_id: null, assigned_at: '2026-09-28T12:00:00.000Z' }),
      assignment(21, 'primary', { course_id: null, assigned_at: '2026-09-28T12:00:00.000Z' }),
      assignment(99, 'implementation', { course_id: 3, assigned_at: '2026-09-29T12:00:00.000Z' }),
    ],
    profiles: [profile(10), profile(20), profile(11), profile(21), profile(99)],
    bookingProfiles: [10, 20, 11, 21, 99].map((id) => bookingProfile(id)),
  });
  assert.deepEqual(plain(await loadImplementationBookingCoaches(client, memberId, now)), {
    implementation: { coachId: coachId(10), name: 'Coach 10', url: 'https://calendar.example/implementation/10' },
    businessReview: { coachId: coachId(20), name: 'Coach 20', url: 'https://calendar.example/review/20' },
  });
  const reads = client.calls.filter((call) => call.table === 'user_coaches');
  assert.equal(reads.length, 2, 'General assignments need not be queried when each course assignment exists');
  for (const read of reads) {
    assert.equal(read.limit, 1);
    assert.ok(read.filters.some((filter) => filter.column === 'user_id' && filter.value === memberId));
    assert.ok(read.filters.some((filter) => filter.column === 'is_active' && filter.value === true));
    assert.ok(read.filters.some((filter) => filter.column === 'course_id' && filter.value === 2));
    assert.ok(read.filters.some((filter) => filter.kind === 'unexpired' && filter.now === now.toISOString()));
  }
});

test('general assignments fill only relationships without an eligible course assignment', async () => {
  const client = clientFor({
    assignments: [
      assignment(10, 'implementation', { is_active: false }),
      assignment(11, 'implementation', { course_id: null }),
      assignment(20, 'primary'), assignment(21, 'primary', { course_id: null }),
    ],
    profiles: [profile(11), profile(20), profile(21)],
    bookingProfiles: [bookingProfile(11), bookingProfile(20), bookingProfile(21)],
  });
  const result = await loadImplementationBookingCoaches(client, memberId, now);
  assert.equal(result.implementation.coachId, coachId(11));
  assert.equal(result.businessReview.coachId, coachId(20));
  const fallbacks = client.calls.filter((call) => call.table === 'user_coaches'
    && call.filters.some((filter) => filter.column === 'course_id' && filter.kind === 'is' && filter.value === null));
  assert.equal(fallbacks.length, 1);
  assert.ok(fallbacks[0].filters.some((filter) => filter.column === 'relationship_type' && filter.value === 'implementation'));
});

test('newest assignment wins within a course tier, with descending ID resolving timestamp ties', async () => {
  for (const course_id of [2, null]) {
    const client = clientFor({
      assignments: [
        assignment(90, 'implementation', { course_id, assigned_at: '2026-09-01T12:00:00.000Z' }),
        assignment(11, 'implementation', { course_id, assigned_at: '2026-09-02T12:00:00.000Z' }),
        assignment(10, 'implementation', { course_id, assigned_at: '2026-09-02T12:00:00.000Z' }),
      ], profiles: [profile(90), profile(10), profile(11)], bookingProfiles: [bookingProfile(11)],
    });
    const result = await loadImplementationBookingCoaches(client, memberId, now);
    assert.equal(result.implementation.coachId, coachId(11));
    assert.equal(result.businessReview, null);
  }
});

test('another member’s, inactive, unrelated-course, and expired assignments cannot supply booking links', async () => {
  const client = clientFor({
    assignments: [
      assignment(1, 'implementation', { ended_at: '2026-09-29T18:00:00.001Z' }),
      assignment(2, 'implementation', { assigned_at: '2026-09-20T12:00:00.000Z', ended_at: now.toISOString() }),
      assignment(3, 'implementation', { assigned_at: '2026-09-21T12:00:00.000Z', ended_at: '2026-09-29T17:59:59.999Z' }),
      assignment(4, 'implementation', { assigned_at: '2026-09-22T12:00:00.000Z', is_active: false }),
      assignment(5, 'implementation', { assigned_at: '2026-09-23T12:00:00.000Z', user_id: otherMemberId }),
      assignment(6, 'implementation', { assigned_at: '2026-09-24T12:00:00.000Z', course_id: 99 }),
    ], profiles: [1, 2, 3, 4, 5, 6].map((id) => profile(id)), bookingProfiles: [1, 2, 3, 4, 5, 6].map((id) => bookingProfile(id)),
  });
  const result = await loadImplementationBookingCoaches(client, memberId, now);
  assert.equal(result.implementation.coachId, coachId(1), 'Expiry is exclusive, including the exact current instant');
  assert.equal(result.businessReview, null);
});

test('unknown relationships and unrelated assignments produce no coach and no profile reads', async () => {
  const client = clientFor({ assignments: [
    assignment(1, null, { course_id: null }), assignment(2, 'secondary'), assignment(3, 'coach', { course_id: null }),
    assignment(4, 'implementation', { course_id: 3 }), assignment(5, 'primary', { user_id: otherMemberId }),
    assignment(6, 'primary', { course_id: null, ended_at: now.toISOString() }),
  ] });
  assert.deepEqual(plain(await loadImplementationBookingCoaches(client, memberId, now)), { implementation: null, businessReview: null });
  assert.ok(client.calls.every((call) => call.table === 'user_coaches'));
});

test('a missing preferred booking link never selects a different coach or a different meeting-type link', async () => {
  const client = clientFor({
    assignments: [assignment(10), assignment(20, 'primary'), assignment(11, 'implementation', { course_id: null }), assignment(21, 'primary', { course_id: null })],
    profiles: [profile(10), profile(20)],
    bookingProfiles: [
      bookingProfile(10, { impl_booking_url: null, booking_url: 'https://legacy.example/generic' }),
      bookingProfile(20, { m2_booking_url: null, booking_url: 'https://legacy.example/generic' }),
      bookingProfile(11), bookingProfile(21),
    ],
  });
  assert.deepEqual(plain(await loadImplementationBookingCoaches(client, memberId, now)), {
    implementation: { coachId: coachId(10), name: 'Coach 10', url: null },
    businessReview: { coachId: coachId(20), name: 'Coach 20', url: null },
  });
  assert.equal(client.calls.filter((call) => call.table === 'user_coaches').length, 2);
});

test('missing coach profiles retain the assignment with an explicit fallback name and no link', async () => {
  const client = clientFor({ assignments: [assignment(10), assignment(20, 'primary')], profiles: [profile(20, { first_name: ' ', last_name: null })] });
  assert.deepEqual(plain(await loadImplementationBookingCoaches(client, memberId, now)), {
    implementation: { coachId: coachId(10), name: 'Assigned coach', url: null },
    businessReview: { coachId: coachId(20), name: 'Assigned coach', url: null },
  });
});

test('an absent public name does not hide the selected coach’s valid booking link', async () => {
  const client = clientFor({ assignments: [assignment(10)], bookingProfiles: [bookingProfile(10)] });
  const result = await loadImplementationBookingCoaches(client, memberId, now);
  assert.deepEqual(plain(result.implementation), {
    coachId: coachId(10), name: 'Assigned coach', url: 'https://calendar.example/implementation/10',
  });
});

test('unsafe, malformed, relative, and credential-bearing URLs are unavailable for both meeting types', async () => {
  for (const url of [null, '', '   ', '/book', '//calendar.example/book', 'calendar.example/book',
    'javascript:alert(1)', 'data:text/html,hello', 'mailto:coach@example.com', 'ftp://calendar.example/book',
    'https://', 'https://[invalid', 'https://calendar.example:invalid/book', 'https:calendar.example/book',
    'http:/calendar.example/book', 'https://user:password@calendar.example/book', 'http://user@calendar.example/book',
    'https://calendar.example/boo\nk', 'https://calen\tdar.example/book', 'https://calendar.example\\@other.example/book']) {
    const client = clientFor({
      assignments: [assignment(10), assignment(20, 'primary')], profiles: [profile(10), profile(20)],
      bookingProfiles: [bookingProfile(10, { impl_booking_url: url }), bookingProfile(20, { m2_booking_url: url })],
    });
    const result = await loadImplementationBookingCoaches(client, memberId, now);
    assert.equal(result.implementation.url, null, `Unsafe implementation URL: ${url}`);
    assert.equal(result.businessReview.url, null, `Unsafe business-review URL: ${url}`);
  }
});

test('absolute HTTP and HTTPS links remain usable, preserving the selected coach and booking path', async () => {
  const client = clientFor({
    assignments: [assignment(10), assignment(20, 'primary')],
    profiles: [profile(10, { first_name: ' Ada ', last_name: 'Coach' }), profile(20, { first_name: null, last_name: 'Rivera' })],
    bookingProfiles: [
      bookingProfile(10, { impl_booking_url: '  https://calendar.example/book?coach=10&type=implementation#schedule  ' }),
      bookingProfile(20, { m2_booking_url: 'http://calendar.example/reviews/20' }),
    ],
  });
  const result = await loadImplementationBookingCoaches(client, memberId, now);
  assert.equal(result.implementation.name, 'Ada Coach');
  assert.equal(result.businessReview.name, 'Rivera');
  assert.equal(new URL(result.implementation.url).href, 'https://calendar.example/book?coach=10&type=implementation#schedule');
  assert.equal(new URL(result.businessReview.url).href, 'http://calendar.example/reviews/20');
});

test('assignment and profile lookup failures reject instead of appearing as absent coach links', async () => {
  for (const failTable of ['user_coaches', 'profiles', 'coach_profiles']) {
    const client = clientFor({ assignments: [assignment(10)], profiles: [profile(10)], bookingProfiles: [bookingProfile(10)], failTable });
    await assert.rejects(() => loadImplementationBookingCoaches(client, memberId, now), (error) => error.message === `${failTable} failed`);
  }
});

test('workspace GET blocks unauthorized link resolution and forwards the selected member for allowed reads', async () => {
  const roles = loadModule('../src/lib/userRoles.ts');
  const businessReviews = loadModule('../src/lib/businessReviews.ts', { '@/lib/userRoles': roles, '@/lib/partnershipScope': {} });
  const implementationApi = loadModule('../src/lib/implementationApi.ts');
  const actorId = coachId(900);
  for (const mode of ['unauthenticated', 'denied', 'allowed', 'notes-only', 'malformed-attendance', 'attendance-error']) {
    const client = clientFor({
      assignments: [assignment(10), assignment(99, 'implementation', { user_id: actorId })],
      profiles: [profile(10), profile(99)], bookingProfiles: [bookingProfile(10), bookingProfile(99)],
    });
    const accessCalls = [];
    const loadCalls = [];
    const attendanceCalls = [];
    const guard = { ok: true, user: { id: actorId }, roleCodes: ['implementation_coach'] };
    const route = loadModule('../src/app/api/implementation-workspace/route.ts', {
      '@/lib/requireUser': { requireUser: async () => mode === 'unauthenticated'
        ? { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
        : guard },
      '@/lib/supabaseAdmin': { getAdminClient: () => client },
      '@/lib/businessReviews': businessReviews,
      '@/lib/implementationApi': { ...implementationApi, implementationActorClient(_request, actualGuard) {
        assert.equal(actualGuard, guard);
        return { async rpc(name, args) {
          assert.equal(name, 'can_manage_coaching_attendance');
          attendanceCalls.push(plain(args));
          return { data: mode === 'allowed' ? true : mode === 'malformed-attendance' ? 'true' : false,
            error: mode === 'attendance-error' ? { code: 'XX000', message: 'Scope read failed' } : null };
        } };
      } },
      '@/lib/implementationWorkspaceServer': {
        async canAccessImplementationWorkspace(actualClient, actualActorId, roleCodes, userId) {
          assert.equal(actualClient, client);
          accessCalls.push({ actorId: actualActorId, roleCodes, userId });
          return mode !== 'denied';
        },
        async loadImplementationWorkspace(actualClient, userId, noteId, options) {
          assert.equal(actualClient, client);
          loadCalls.push({ userId, noteId, options: plain(options) });
          return { bookingCoaches: await loadImplementationBookingCoaches(client, userId, now) };
        },
      },
    });
    const response = await route.GET(new NextRequest(`https://reboot.example/api/implementation-workspace?userId=${memberId}&noteId=42`));
    assert.equal(response.status, mode === 'unauthenticated' ? 401 : mode === 'denied' ? 403 : mode === 'attendance-error' ? 500 : 200);
    if (['unauthenticated', 'denied', 'attendance-error'].includes(mode)) {
      assert.equal(client.calls.length, 0, 'Denied callers must not query assignments or booking profiles');
      assert.equal(loadCalls.length, 0);
      if (mode === 'unauthenticated') assert.equal(accessCalls.length, 0);
      if (mode === 'attendance-error') assert.deepEqual(attendanceCalls, [{ _user_id: memberId }]);
      else assert.equal(attendanceCalls.length, 0, 'Member authorization runs before attendance lookup');
    } else {
      assert.deepEqual(plain(accessCalls), [{ actorId, roleCodes: ['implementation_coach'], userId: memberId }]);
      assert.deepEqual(attendanceCalls, [{ _user_id: memberId }]);
      assert.deepEqual(loadCalls, [{ userId: memberId, noteId: 42, options: { canReadAttendance: mode === 'allowed' } }]);
      assert.equal((await response.json()).bookingCoaches.implementation.coachId, coachId(10));
    }
  }
});
