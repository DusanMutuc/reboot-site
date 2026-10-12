import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as luxon from 'luxon';

function loadModule(path, imports, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, URL, URLSearchParams, AbortSignal, Date, console, process: { env: { NODE_ENV: 'test' } }, ...globals,
    require(name) { assert.ok(name in imports, `Unexpected module ${name}`); return imports[name]; } });
  return exports;
}

const shared = loadModule('../src/lib/coachHomeShared.ts', { luxon });
const groups = loadModule('../src/lib/coachHomeGroups.ts', { luxon, '@/lib/coachHomeShared': shared });
const { DateTime } = luxon;
const range = shared.coachHomeRange('America/Edmonton', '2026-10-05');

test('week bounds respect viewer timezone, Monday boundaries and daylight-saving transitions', () => {
  const spring = shared.coachHomeRange('America/Edmonton', '2026-03-08');
  assert.equal(spring.weekStart, '2026-03-02');
  assert.equal(spring.weekEnd, '2026-03-09');
  assert.equal((spring.endMs - spring.startMs) / 3_600_000, 167);
  const autumn = shared.coachHomeRange('America/Edmonton', '2026-11-01');
  assert.equal((autumn.endMs - autumn.startMs) / 3_600_000, 169);
  assert.throws(() => shared.coachHomeRange('fake/timezone', '2026-10-05'));
  assert.throws(() => shared.coachHomeRange('UTC', '2026-02-31'));
  assert.throws(() => shared.coachHomeRange('UTC', '2026-10-05T12:00:00'));
});

test('calendar normalization recognizes 1on1s, removes cancellations/no-shows and deduplicates stale records', () => {
  const base = { startTime: '2026-10-07T18:00:00Z', endTime: '2026-10-07T19:00:00Z', contactId: 'contact', title: 'Member Implementation Meeting with Coach' };
  const events = shared.normalizeCoachCalendar({ events: [
    { ...base, id: 'duplicate' }, { ...base, id: 'duplicate' },
    { ...base, id: 'canceled' }, { ...base, id: 'canceled', appointmentStatus: 'cancelled' },
    { ...base, id: 'missed', appointmentStatus: 'No_Show' },
    { ...base, id: 'deleted', deleted: true },
    { ...base, id: 'review', title: 'Member Business Review with Coach', meetingLocation: 'https://zoom.us/j/example' },
    { ...base, id: 'group', title: 'Implementation Group Meeting' },
    { ...base, id: 'outside', startTime: '2026-10-13T18:00:00Z' },
    { ...base, id: 'unsafe', meetingLocation: 'javascript:alert(1)' },
  ] }, range);
  assert.deepEqual(Array.from(events, (event) => event.id), ['duplicate', 'review', 'unsafe']);
  assert.equal(events[1].kind, 'business_review');
  assert.equal(events[1].joinUrl, 'https://zoom.us/j/example');
  assert.equal(events[2].joinUrl, null);
  assert.throws(() => shared.normalizeCoachCalendar({ message: 'upstream failed' }, range));
  assert.throws(() => shared.normalizeCoachCalendar({ events: [null] }, range));
});

test('only an unambiguous exact contact identity matches, and workspace links preserve exact meeting context', () => {
  const members = [{ id: 'a', contactIds: ['1'] }, { id: 'b', contactIds: ['2'] }];
  assert.equal(shared.matchCoachHomeMember('1', members), 'a');
  assert.equal(shared.matchCoachHomeMember(null, members), null);
  assert.equal(shared.matchCoachHomeMember('unknown', members), null);
  assert.equal(shared.matchCoachHomeMember('1', [...members, { id: 'c', contactIds: ['1'] }]), null);
  assert.equal(shared.coachWorkspaceHref(), '/coach/students-overview');
  assert.equal(shared.coachWorkspaceHref('a', 'implementation', { noteId: 10, meetingId: 20 }), '/coach/students-overview?userId=a&tab=notes&noteId=10&meetingId=20');
  assert.equal(shared.coachWorkspaceHref('a', 'business_review', { reviewId: 30 }), '/coach/students-overview?userId=a&tab=audit&reviewId=30');
});

function publishedPage(items) {
  return `<div id="timezone-dropdown" data-timezone="Europe/Belgrade"></div><div class="lst-t1 eventslist">${items.map(({ id, title, date }) =>
    `<div class="row"><p class="it tit evtlink"><a href="/event/${id}" target="_blank">${title}</a></p><p class="it dat">${date}</p><div class="it loc"><span class="lbl">https://zoom.us/j/group</span></div></div>`).join('')}</div>`;
}

test('published group sessions preserve recurrence occurrences, DST, source links and safe plain-text titles', () => {
  const page = publishedPage([
    { id: 'recurring', title: 'Members &amp; Assistants', date: 'Friday 16 October ⋅ 19:00 – 20:00 (CEST)' },
    { id: 'recurring', title: 'Members &amp; Assistants', date: 'Friday 30 October ⋅ 18:00 – 19:00 (CET)' },
    { id: 'later', title: 'Later session', date: 'Friday 13 November ⋅ 18:00 – 19:00 (CET)' },
  ]);
  const sessions = groups.parsePublishedCoachGroups(page, DateTime.fromISO('2026-10-09T00:00:00Z'));
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].title, 'Members & Assistants');
  assert.equal(sessions[0].start, '2026-10-16T17:00:00.000Z');
  assert.equal(sessions[1].start, '2026-10-30T17:00:00.000Z');
  assert.notEqual(sessions[0].id, sessions[1].id);
  assert.equal(sessions[0].detailsUrl, 'https://www.addevent.com/event/recurring');
  assert.throws(() => groups.parsePublishedCoachGroups('<html>Unavailable</html>'));
});

test('published group sessions resolve an upcoming January date across the year boundary', () => {
  const sessions = groups.parsePublishedCoachGroups(publishedPage([
    { id: 'january', title: 'January', date: 'Friday 8 January ⋅ 18:00 – 19:00 (CET)' },
  ]), DateTime.fromISO('2026-12-28T00:00:00Z'));
  assert.equal(sessions[0].start, '2027-01-08T17:00:00.000Z');
});

function fakeClient(tables, failedTable = null) {
  return { from(table) {
    assert.ok(table in tables, `Unexpected table ${table}`);
    let values = tables[table];
    let maximum = Infinity;
    const query = {
      select() { return query; },
      eq(key, value) { values = values.filter((row) => row[key] === value); return query; },
      in(key, allowed) { values = values.filter((row) => allowed.some((value) => String(row[key]) === String(value))); return query; },
      is(key, value) { values = values.filter((row) => (row[key] ?? null) === value); return query; },
      or() { return query; },
      gte(key, value) { values = values.filter((row) => row[key] >= value); return query; },
      lt(key, value) { values = values.filter((row) => row[key] < value); return query; },
      order() { return query; },
      limit(value) { maximum = value; return query; },
      then(resolve, reject) { return Promise.resolve({ data: values.slice(0, maximum), error: failedTable === table ? { message: 'Unavailable' } : null }).then(resolve, reject); },
    };
    return query;
  } };
}

function serviceFixture({ failedTable = null, calendarFailure = false } = {}) {
  const tables = {
    profiles: [
      { id: 'coach', first_name: 'Coach', last_name: 'Example', ghl_user_id: 'ghl-coach' },
      { id: 'member', first_name: 'Visible', last_name: 'Member', ghl_contact_id: 'contact-member' },
      { id: 'partner', first_name: 'Shared', last_name: 'Partner', ghl_contact_id: 'contact-partner' },
      { id: 'outsider', first_name: 'Private', last_name: 'Person', ghl_contact_id: 'contact-outsider' },
    ],
    user_coaches: [{ user_id: 'member', coach_id: 'coach', relationship_type: 'implementation', is_active: true }],
    ninety_day_cycle_meetings: [],
    meetings: [
      { id: 101, ghl_appointment_id: 'implementation', date: '2026-10-07' },
      { id: 102, ghl_appointment_id: 'review', date: '2026-10-08' },
    ],
    business_reviews: [{ id: 10, coaching_note_id: 1, meeting_id: null }, { id: 20, coaching_note_id: 2, meeting_id: 102 }],
    business_review_system_priorities: [{ business_review_id: 10, system_id: 11, position: 1 }, { business_review_id: 20, system_id: 22, position: 1 }],
    system_scorecard_systems: [{ id: 11, label: 'Current priority', library_item_id: 51 }, { id: 22, label: 'Future priority', library_item_id: null }],
    content_nodes: [{ id: 51, slug: 'current-priority', node_type: 'library' }],
    meeting_attendance: [{ user_id: 'member', meeting_id: 101 }],
    implementation_meeting_sessions: [],
    business_review_preparation_responses: [{ business_review_id: 20, submitted_at: '2026-10-05T18:00:00Z' }],
  };
  const client = fakeClient(tables, failedTable);
  const calendarEvents = [
    { id: 'implementation', contactId: 'contact-member', title: 'Member Implementation Meeting with Coach' },
    { id: 'review', contactId: 'contact-member', title: 'Member Business Review with Coach' },
    { id: 'shared', contactId: 'contact-partner', title: 'Partner Implementation Meeting with Coach' },
    { id: 'unknown', contactId: 'contact-outsider', title: 'Private Person Implementation Meeting with Coach' },
  ].map((event) => ({ ...event, startTime: '2026-10-07T18:00:00Z', endTime: '2026-10-07T19:00:00Z' }));
  const cycles = [
    { id: 'business_audit:10', noteId: 1, businessReviewId: 10, kind: 'business_audit', cycleDate: '2026-09-01', cancelled: false },
    { id: 'business_audit:20', noteId: 2, businessReviewId: 20, kind: 'business_audit', cycleDate: '2026-10-08', cancelled: false },
  ];
  const service = loadModule('../src/lib/coachHome.ts', {
    'server-only': {}, luxon,
    '@/lib/config': { GHL: { BASE: 'https://example.com', TOKEN: 'test-token', VERSION: 'test', LOCATION_ID: 'test' } },
    '@/lib/currentMembers': { fetchCoachingWorkspaceUserIdSet: async () => new Set(['member', 'partner', 'outsider']) },
    '@/lib/coachingCycles': {
      loadCoachingCycles: async () => ({ cycles, activeCycleId: 'business_audit:10' }),
      selectActiveCoachingCycle: (values, date) => values.filter((cycle) => cycle.cycleDate <= date).at(-1),
    },
    '@/lib/partnershipScope': { getNotesScopeUserIds: async (_client, id) => id === 'partner' ? ['partner', 'member'] : [id] },
    '@/lib/contentNodeLinks': { getContentNodeHref: (node) => `/library/${node.slug}` },
    '@/lib/supabaseAdmin': { getAdminClient: () => client },
    '@/lib/coachHomeShared': shared,
    '@/lib/coachHomeGroups': { COACH_GROUP_CALENDAR_URL: groups.COACH_GROUP_CALENDAR_URL, loadPublishedCoachGroups: async () => [] },
  }, { fetch: async () => {
    if (calendarFailure) throw new Error('Offline');
    return { ok: true, json: async () => ({ events: calendarEvents }) };
  } });
  return service;
}

test('coach home uses assignment responsibilities, current priorities, exact workspace links and authorized shared member context', async () => {
  const home = await serviceFixture().buildCoachHome('coach', ['coach'], range);
  assert.deepEqual(Array.from(home.coach.responsibilities), ['implementation']);
  const implementation = home.meetings.find((event) => event.id === 'implementation');
  assert.equal(implementation.member.id, 'member');
  assert.equal(implementation.priorities[0].label, 'Current priority');
  assert.match(implementation.workspaceHref, /noteId=1&meetingId=101$/);
  const review = home.meetings.find((event) => event.id === 'review');
  assert.equal(review.priorities[0].label, 'Current priority');
  assert.match(review.workspaceHref, /reviewId=20$/);
  assert.equal(review.prepSubmitted, true);
  assert.equal(home.meetings.find((event) => event.id === 'shared').member.id, 'member');
  const unknown = home.meetings.find((event) => event.id === 'unknown');
  assert.equal(unknown.member, null);
  assert.equal(unknown.prioritiesState, 'unavailable');
  assert.equal(unknown.workspaceHref, '/coach/students-overview');
  assert.ok(!JSON.stringify(home).includes('Private Person'));
  assert.ok(!JSON.stringify(home).includes('Future priority'));
});

test('a failed priorities source remains explicitly unavailable while appointments continue to render', async () => {
  const home = await serviceFixture({ failedTable: 'business_review_system_priorities' }).buildCoachHome('coach', ['coach'], range);
  assert.equal(home.sources.schedule.status, 'ready');
  assert.equal(home.sources.priorities.status, 'partial');
  assert.equal(home.meetings.length, 4);
  assert.equal(home.meetings[0].prioritiesState, 'unavailable');
  assert.equal(home.meetings[0].prepSubmitted, null);
});

test('a failed calendar never returns a successful empty schedule', async () => {
  const home = await serviceFixture({ calendarFailure: true }).buildCoachHome('coach', ['coach'], range);
  assert.equal(home.sources.schedule.status, 'unavailable');
  assert.equal(home.meetings.length, 0);
});

test('home endpoint enforces authenticated coach authorization before using privileged data', async () => {
  let built = false;
  let guard = { ok: false, res: { status: 401 } };
  const route = loadModule('../src/app/api/coach/home/route.ts', {
    'next/server': { NextResponse: { json: (data, options = {}) => ({ data, status: options.status ?? 200 }) } },
    '@/lib/requireUser': { requireUser: async () => guard },
    '@/lib/coachHomeShared': shared,
    '@/lib/coachHome': { buildCoachHome: async () => { built = true; return {}; } },
  });
  const request = { nextUrl: new URL('https://app.test/api/coach/home?tz=UTC') };
  assert.equal((await route.GET(request)).status, 401);
  guard = { ok: true, roleCodes: ['member'], user: { id: 'member' } };
  assert.equal((await route.GET(request)).status, 403);
  assert.equal(built, false);
  guard = { ok: true, roleCodes: ['coach'], user: { id: 'coach' } };
  assert.equal((await route.GET({ nextUrl: new URL('https://app.test/api/coach/home?week=invalid') })).status, 400);
  assert.equal(built, false);
});
