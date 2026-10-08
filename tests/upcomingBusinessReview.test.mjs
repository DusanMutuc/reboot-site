import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadModule(path, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, process, console,
    require: (name) => Object.hasOwn(imports, name) ? imports[name] : require(name),
  });
  return exports;
}
const userRoles = loadModule('../src/lib/userRoles.ts');
const businessReviews = loadModule('../src/lib/businessReviews.ts', { '@/lib/userRoles': userRoles, '@/lib/partnershipScope': {} });
const businessAuditConfig = loadModule('../src/lib/businessAuditConfig.ts');
const meetingSelection = loadModule('../src/lib/implementationMeetingSelection.ts');
const { loadUpcomingBusinessReview } = loadModule('../src/lib/upcomingBusinessReview.ts', {
  '@/lib/businessReviews': businessReviews,
  '@/lib/businessAuditConfig': businessAuditConfig,
  '@/lib/implementationMeetingSelection': meetingSelection,
});
const plain = (value) => JSON.parse(JSON.stringify(value));
const memberId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1631';
const otherMemberId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1632';
const now = new Date('2026-09-29T18:00:00Z');
const midnight = new Date('2026-09-30T01:00:00Z');

function cycle(reviewId, date, options = {}) {
  return {
    id: `business_audit:${reviewId}`, noteId: reviewId + 1000, kind: 'business_audit',
    cycleDate: date, businessReviewId: reviewId, cancelled: false, isFuture: date > '2026-09-29', ...options,
  };
}
function m2(date, options = {}) {
  return cycle(null, date, { id: 'm2:1', noteId: 1, kind: 'm2', businessReviewId: null, ...options });
}
function review(id, date, options = {}) {
  return { id, user_id: memberId, coaching_note_id: id + 1000, meeting_id: null, review_date: date, status: 'draft', ...options };
}
function meeting(id, date, options = {}) {
  return { id, date, title: 'Business review', starts_at: null, meeting_timezone: 'America/Edmonton', ghl_status: null, ...options };
}

function clientFor({ reviews = [], meetings = [], failTable = null } = {}) {
  const tables = { business_reviews: reviews, meetings };
  const calls = [];
  return {
    calls,
    from(table) {
      assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
      const filters = [];
      const call = { table, filters, columns: null };
      calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(column, value) { filters.push({ column, value }); return query; },
        maybeSingle: async () => {
          if (failTable === table) return { data: null, error: { code: 'XX000', message: `${table} failed` } };
          const rows = tables[table].filter((row) => filters.every(({ column, value }) => row[column] === value));
          assert.ok(rows.length <= 1, 'Each lookup must identify a single review or meeting');
          return { data: rows[0] ?? null, error: null };
        },
      };
      return query;
    },
  };
}

test('the selected cycle uses its next review and fetches that member’s actual meeting details', async () => {
  const selected = cycle(10, '2026-09-01');
  const cycles = [cycle(40, '2026-11-01'), cycle(20, '2026-09-15', { cancelled: true }),
    m2('2026-09-20'), cycle(30, '2026-09-30'), selected, cycle(5, '2026-08-01')];
  const before = plain(cycles);
  const client = clientFor({
    reviews: [review(30, '2026-09-30', { meeting_id: 300 })],
    meetings: [meeting(300, '2026-10-03', {
      starts_at: '2026-10-03T16:00:00Z', meeting_timezone: 'Europe/Belgrade', title: 'Rescheduled review',
    })],
  });
  assert.deepEqual(plain(await loadUpcomingBusinessReview(client, memberId, cycles, selected, now)), {
    reviewId: 30, meetingId: 300, date: '2026-10-03', startsAt: '2026-10-03T16:00:00Z',
    timezone: 'Europe/Belgrade', title: 'Rescheduled review', isToday: false,
  });
  assert.deepEqual(plain(cycles), before, 'Selecting a boundary must not reorder the caller’s cycles');
  assert.deepEqual(plain(client.calls.map(({ table, filters }) => ({ table, filters }))), [
    { table: 'business_reviews', filters: [{ column: 'id', value: 30 }, { column: 'coaching_note_id', value: 1030 }] },
    { table: 'meetings', filters: [{ column: 'id', value: 300 }] },
  ]);
});

test('business reviews on the same date advance by review ID, not note ID or input order', async () => {
  const selected = cycle(20, '2026-09-29', { noteId: 9999 });
  const client = clientFor({ reviews: [review(21, '2026-09-29', { coaching_note_id: 2 }), review(22, '2026-09-29', { coaching_note_id: 1 })] });
  const result = await loadUpcomingBusinessReview(client, memberId, [
    cycle(22, '2026-09-29', { noteId: 1 }), selected, cycle(19, '2026-09-29'),
    cycle(21, '2026-09-29', { noteId: 2 }), cycle(30, '2026-10-01'),
  ], selected, now);
  assert.equal(result.reviewId, 21);
  assert.equal(result.isToday, true);
});

test('an M2 cycle only advances to a business review on a strictly later date', async () => {
  const selected = m2('2026-09-29');
  const client = clientFor({ reviews: [review(20, '2026-09-29'), review(21, '2026-09-30')] });
  const result = await loadUpcomingBusinessReview(client, memberId, [
    cycle(21, '2026-09-30'), cycle(20, '2026-09-29'), selected,
  ], selected, now);
  assert.equal(result.reviewId, 21);
  assert.equal(client.calls[0].filters.find((filter) => filter.column === 'id').value, 21);
});

test('a completed, missing, cancelled, or past next boundary never exposes a later cycle’s review', async () => {
  const selected = cycle(10, '2026-09-01');
  const boundary = cycle(20, '2026-09-15');
  const farFuture = cycle(30, '2026-11-01');
  const cases = [
    { label: 'completed review', review: review(20, '2026-09-30', { status: 'completed' }) },
    { label: 'missing review', review: null },
    { label: 'review belonging to another coaching cycle', review: review(20, '2026-09-30', { coaching_note_id: 99999 }) },
    { label: 'missing linked meeting', review: review(20, '2026-09-30', { meeting_id: 200 }) },
    { label: 'cancelled linked meeting', review: review(20, '2026-09-30', { meeting_id: 200 }), meeting: meeting(200, '2026-09-30', { ghl_status: 'No_Show' }) },
    { label: 'past linked meeting', review: review(20, '2026-10-01', { meeting_id: 200 }), meeting: meeting(200, '2026-09-28') },
    { label: 'past manual review', review: review(20, '2026-09-28') },
  ];
  for (const scenario of cases) {
    const client = clientFor({
      reviews: [review(30, '2026-11-01'), ...(scenario.review ? [scenario.review] : [])],
      meetings: scenario.meeting ? [scenario.meeting] : [],
    });
    assert.equal(await loadUpcomingBusinessReview(client, memberId, [farFuture, boundary, selected], selected, now), null, scenario.label);
    assert.equal(client.calls.filter((call) => call.table === 'business_reviews').length, 1, scenario.label);
    assert.ok(!client.calls.some((call) => call.table === 'business_reviews'
      && call.filters.some((filter) => filter.column === 'id' && filter.value === 30)), scenario.label);
  }
});

test('normalized cancellation statuses exclude the actual linked meeting', async () => {
  const selected = cycle(10, '2026-09-01');
  const next = cycle(20, '2026-09-30');
  for (const ghl_status of ['cancelled', ' CANCELED ', 'no_show', 'No - Show', 'deleted', 'INVALID']) {
    const client = clientFor({
      reviews: [review(20, '2026-09-30', { meeting_id: 200 })],
      meetings: [meeting(200, '2026-09-30', { ghl_status })],
    });
    assert.equal(await loadUpcomingBusinessReview(client, memberId, [selected, next], selected, now), null, ghl_status);
  }
});

test('a rescheduled meeting’s actual date can make an older review boundary upcoming', async () => {
  const selected = cycle(10, '2026-09-01');
  const next = cycle(20, '2026-09-15');
  const client = clientFor({
    reviews: [review(20, '2026-09-15', { meeting_id: 200 })],
    meetings: [meeting(200, '2026-10-02', { starts_at: '2026-10-02T16:00:00Z' })],
  });
  const result = await loadUpcomingBusinessReview(client, memberId, [next, selected], selected, now);
  assert.equal(result.date, '2026-10-02');
  assert.equal(result.reviewId, 20);
});

test('meeting dates use their own timezone at midnight and invalid zones fall back to Edmonton', async () => {
  const selected = cycle(10, '2026-09-01');
  const next = cycle(20, '2026-09-30');
  for (const meeting_timezone of ['America/Edmonton', 'Invalid/Zone', '', null, '   ']) {
    const client = clientFor({
      reviews: [review(20, '2026-09-30', { meeting_id: 200 })],
      meetings: [meeting(200, '2026-09-29', { meeting_timezone })],
    });
    const result = await loadUpcomingBusinessReview(client, memberId, [selected, next], selected, midnight);
    assert.equal(result.date, '2026-09-29');
    assert.equal(result.isToday, true);
    assert.equal(result.timezone, 'America/Edmonton');
    assert.equal(result.startsAt, null, 'A date-only meeting must not invent an appointment time');
  }
  for (const [date, qualifies] of [['2026-09-29', false], ['2026-09-30', true]]) {
    const client = clientFor({
      reviews: [review(20, '2026-09-30', { meeting_id: 200 })],
      meetings: [meeting(200, date, { meeting_timezone: 'Europe/Belgrade' })],
    });
    const result = await loadUpcomingBusinessReview(client, memberId, [selected, next], selected, midnight);
    if (qualifies) {
      assert.equal(result.isToday, true);
      assert.equal(result.timezone, 'Europe/Belgrade');
    } else assert.equal(result, null);
  }
});

test('a manual review uses its explicit date without fabricating a meeting, title, or time', async () => {
  const selected = cycle(10, '2026-09-01');
  const next = cycle(20, '2026-09-30');
  const client = clientFor({ reviews: [review(20, '2026-09-29')] });
  assert.deepEqual(plain(await loadUpcomingBusinessReview(client, memberId, [selected, next], selected, midnight)), {
    reviewId: 20, meetingId: null, date: '2026-09-29', startsAt: null,
    timezone: 'America/Edmonton', title: null, isToday: true,
  });
  assert.ok(client.calls.every((call) => call.table === 'business_reviews'));
});

test('without a selected cycle, ineligible candidates can be skipped to the first upcoming review', async () => {
  const cycles = [cycle(80, '2026-11-01'), cycle(70, '2026-09-27'), cycle(60, '2026-09-26'),
    cycle(50, '2026-09-25'), cycle(40, '2026-09-24'), cycle(30, '2026-09-23'),
    cycle(20, '2026-09-22'), cycle(10, '2026-09-21'), cycle(5, '2026-09-20', { cancelled: true }), m2('2026-09-01')];
  const client = clientFor({
    reviews: [
      review(10, '2026-09-30', { status: 'completed' }),
      // Review 20 is missing; review 30 does not belong to its visible cycle.
      review(30, '2026-09-30', { coaching_note_id: 99999 }),
      review(40, '2026-09-30', { meeting_id: 400 }),
      review(50, '2026-09-30', { meeting_id: 500 }),
      review(60, '2026-09-28'),
      review(70, '2026-09-27', { meeting_id: 700 }),
      review(80, '2026-11-01'),
    ],
    meetings: [meeting(500, '2026-09-30', { ghl_status: 'cancelled' }), meeting(700, '2026-10-01')],
  });
  const result = await loadUpcomingBusinessReview(client, memberId, cycles, null, now);
  assert.equal(result.reviewId, 70, 'A rescheduled eligible review precedes the later review cycle');
  assert.equal(result.date, '2026-10-01');
  assert.deepEqual(client.calls.filter((call) => call.table === 'business_reviews')
    .map((call) => call.filters.find((filter) => filter.column === 'id').value), [10, 20, 30, 40, 50, 60, 70]);
});

test('empty, M2-only, cancelled-only, and final-cycle selections have no upcoming review', async () => {
  const last = cycle(20, '2026-09-30');
  for (const [cycles, selected] of [
    [[], null], [[m2('2026-09-01')], null], [[cycle(10, '2026-10-01', { cancelled: true })], null],
    [[cycle(10, '2026-09-01'), last], last],
  ]) {
    const client = clientFor();
    assert.equal(await loadUpcomingBusinessReview(client, memberId, cycles, selected, now), null);
    assert.equal(client.calls.length, 0);
  }
});

test('database errors reject instead of quietly hiding an upcoming review', async () => {
  const selected = cycle(10, '2026-09-01');
  const next = cycle(20, '2026-09-30');
  for (const failTable of ['business_reviews', 'meetings']) {
    const client = clientFor({
      reviews: [review(20, '2026-09-30', { meeting_id: 200 })], meetings: [meeting(200, '2026-09-30')], failTable,
    });
    await assert.rejects(() => loadUpcomingBusinessReview(client, memberId, [selected, next], selected, now),
      (error) => error.message === `${failTable} failed`);
  }
});

test('a partner-owned upcoming review remains visible through its shared coaching cycle', async () => {
  const selected = cycle(10, '2026-09-01');
  const next = cycle(20, '2026-09-30');
  const client = clientFor({ reviews: [review(20, '2026-09-30', { user_id: otherMemberId })] });
  const result = await loadUpcomingBusinessReview(client, memberId, [selected, next], selected, now);
  assert.equal(result.reviewId, 20);
  assert.equal(result.date, '2026-09-30');
  assert.ok(client.calls.every((call) => call.filters.every((filter) => filter.column !== 'user_id')));
});
