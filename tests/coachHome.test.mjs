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
    let values = [...tables[table]], maximum = Infinity, offset = 0;
    const ordering = [];
    const query = {
      select() { return query; },
      eq(key, value) { values = values.filter((row) => row[key] === value); return query; },
      in(key, allowed) { values = values.filter((row) => allowed.some((value) => String(row[key]) === String(value))); return query; },
      is(key, value) { values = values.filter((row) => (row[key] ?? null) === value); return query; },
      or(filter) {
        if (filter.startsWith('ended_at.')) values = values.filter((row) => !row.ended_at || Date.parse(row.ended_at) > Date.now());
        return query;
      },
      gte(key, value) { values = values.filter((row) => row[key] >= value); return query; },
      lt(key, value) { values = values.filter((row) => row[key] < value); return query; },
      order(key) { ordering.push(key); return query; },
      limit(value) { maximum = value; return query; },
      range(first, last) { offset = first; maximum = last - first + 1; return query; },
      then(resolve, reject) {
        const sorted = [...values].sort((a, b) => {
          for (const key of ordering) { if (a[key] < b[key]) return -1; if (a[key] > b[key]) return 1; }
          return 0;
        });
        return Promise.resolve({ data: sorted.slice(offset, offset + maximum), error: failedTable === table ? { message: 'Unavailable' } : null }).then(resolve, reject);
      },
    };
    return query;
  } };
}

const savedMeeting = (id, meeting_type_id = 1, options = {}) => ({
  id, meeting_type_id, date: '2026-10-07', starts_at: '2026-10-07T18:00:00Z', ends_at: '2026-10-07T19:00:00Z',
  created_by: 'coach', ghl_appointment_id: null, ghl_status: null, title: 'A title without any GHL naming pattern', ...options,
});
const assignment = (user_id, relationship_type = 'implementation', options = {}) => ({ user_id, coach_id: 'coach', relationship_type, course_id: 2, is_active: true, ended_at: null, ...options });

function serviceFixture({ failedTable = null, eligible = ['member', 'partner', 'reviewer'], change = () => {}, publishedSessions = [], publishedFailure = false } = {}) {
  const tables = {
    // GHL profile IDs are intentionally absent: the agenda must not depend on them.
    profiles: [
      { id: 'coach', first_name: 'Coach', last_name: 'Example' },
      { id: 'member', first_name: 'Visible', last_name: 'Member' },
      { id: 'partner', first_name: 'Shared', last_name: 'Partner' },
      { id: 'reviewer', first_name: 'Review', last_name: 'Member' },
      { id: 'outsider', first_name: 'Private', last_name: 'Person' },
    ],
    user_coaches: [assignment('member'), assignment('partner'), assignment('reviewer', 'primary'), assignment('outsider')],
    meeting_types: [{ id: 1, code: 'IMPLEMENTATION_MEETING' }, { id: 2, code: 'M2_MEETING' }],
    ninety_day_cycle_meetings: [],
    meetings: [savedMeeting(101), savedMeeting(102, 2), savedMeeting(103), savedMeeting(104), savedMeeting(105, 2)],
    business_reviews: [{ id: 10, coaching_note_id: 1, meeting_id: null }, { id: 20, coaching_note_id: 2, meeting_id: 102 }],
    business_review_system_priorities: [{ business_review_id: 10, system_id: 11, position: 1 }, { business_review_id: 20, system_id: 22, position: 1 }],
    system_scorecard_systems: [{ id: 11, label: 'Current priority', library_item_id: 51 }, { id: 22, label: 'Future priority', library_item_id: null }],
    content_nodes: [{ id: 51, slug: 'current-priority', node_type: 'library' }],
    meeting_attendance: [
      { user_id: 'member', meeting_id: 101, attended: false }, { user_id: 'reviewer', meeting_id: 102, attended: false },
      { user_id: 'member', meeting_id: 103, attended: false }, { user_id: 'partner', meeting_id: 103, attended: false },
      { user_id: 'outsider', meeting_id: 104, attended: false }, { user_id: 'member', meeting_id: 105, attended: false },
    ],
    implementation_meeting_sessions: [],
    business_review_preparation_responses: [{ business_review_id: 20, submitted_at: '2026-10-05T18:00:00Z' }],
  };
  change(tables);
  const queryClient = fakeClient(tables, failedTable);
  const requestedTables = [];
  const client = { from(table) { requestedTables.push(table); return queryClient.from(table); } };
  const cycles = [
    { id: 'business_audit:10', noteId: 1, businessReviewId: 10, kind: 'business_audit', cycleDate: '2026-09-01', cancelled: false },
    { id: 'business_audit:20', noteId: 2, businessReviewId: 20, kind: 'business_audit', cycleDate: '2026-10-08', cancelled: false },
  ];
  const schedule = loadModule('../src/lib/coachSchedule.ts', {
    'server-only': {}, luxon,
    '@/lib/currentMembers': { fetchCoachingWorkspaceUserIdSet: async () => new Set(eligible) },
  });
  const service = loadModule('../src/lib/coachHome.ts', {
    'server-only': {}, luxon, '@/lib/coachSchedule': schedule,
    '@/lib/coachingCycles': {
      loadCoachingCycles: async () => ({ cycles, activeCycleId: 'business_audit:10' }),
      selectActiveCoachingCycle: (values, date) => values.filter((cycle) => cycle.cycleDate <= date).at(-1),
    },
    '@/lib/contentNodeLinks': { getContentNodeHref: (node) => `/library/${node.slug}` },
    '@/lib/supabaseAdmin': { getAdminClient: () => client },
    '@/lib/coachHomeShared': shared,
    '@/lib/coachHomeGroups': { COACH_GROUP_CALENDAR_URL: groups.COACH_GROUP_CALENDAR_URL, loadPublishedCoachGroups: async () => {
      if (publishedFailure) throw new Error('Public calendar unavailable');
      return publishedSessions;
    } },
  }, { fetch: async () => { throw new Error('The saved agenda must never request GHL.'); } });
  return { ...service, schedule, client, tables, requestedTables };
}

test('coach group sessions use only AddEvent and never query 90-day programme sessions', async () => {
  const sessions = [{ id: 'addevent:public:occurrence', title: 'Public REBOOT session', start: '2026-10-08T18:00:00Z', end: null, joinUrl: null, audience: 'REBOOT group calendar' }];
  const env = serviceFixture({ publishedSessions: sessions });
  const home = await env.buildCoachHome('coach', ['coach'], range);
  assert.equal(home.groupSessions[0].id, sessions[0].id);
  assert.equal(home.groupSessions.length, 1);
  assert.equal(home.sources.groups.status, 'ready');
  assert.equal(env.requestedTables.includes('ninety_day_cycle_meetings'), false);
});

test('an AddEvent outage reports unavailable without falling back to programme sessions', async () => {
  const env = serviceFixture({ publishedFailure: true });
  const home = await env.buildCoachHome('coach', ['coach'], range);
  assert.equal(home.groupSessions.length, 0);
  assert.equal(home.sources.groups.status, 'unavailable');
  assert.equal(home.sources.schedule.status, 'ready');
  assert.equal(home.groupCalendarUrl, groups.COACH_GROUP_CALENDAR_URL);
  assert.equal(env.requestedTables.includes('ninety_day_cycle_meetings'), false);
});

test('saved agenda uses each member relationship and stored attendees without GHL IDs or title matching', async () => {
  const home = await serviceFixture().buildCoachHome('coach', ['coach'], range);
  assert.deepEqual(Array.from(home.coach.responsibilities), ['implementation', 'primary']);
  assert.deepEqual(Array.from(home.meetings, (meeting) => meeting.id), ['101', '102', '103']);
  const implementation = home.meetings[0];
  assert.equal(implementation.member.id, 'member');
  assert.equal(implementation.priorities[0].label, 'Current priority');
  assert.match(implementation.workspaceHref, /noteId=1&meetingId=101$/);
  const review = home.meetings[1];
  assert.equal(review.kind, 'business_review');
  assert.equal(review.priorities[0].label, 'Current priority');
  assert.match(review.workspaceHref, /reviewId=20$/);
  assert.equal(review.prepSubmitted, true);
  assert.ok(!JSON.stringify(home).includes('Private Person'));
  assert.ok(!JSON.stringify(home).includes('Future priority'));
});

test('shared attendee identities produce one appointment with real member links', async () => {
  const home = await serviceFixture().buildCoachHome('coach', ['coach'], range);
  const sharedMeeting = home.meetings.find((meeting) => meeting.id === '103');
  assert.equal(home.meetings.filter((meeting) => meeting.id === '103').length, 1);
  assert.equal(sharedMeeting.member.name, 'Visible Member & Shared Partner');
  assert.deepEqual(Array.from(sharedMeeting.people, (person) => person.id), ['member', 'partner']);
  assert.match(sharedMeeting.people[1].workspaceHref, /userId=partner.*meetingId=103$/);
});

test('inactive, ended, ineligible and other-course assignments do not supply calendar meetings', async () => {
  for (const options of [{ is_active: false }, { ended_at: '2000-01-01T00:00:00Z' }, { course_id: 99 }]) {
    const home = await serviceFixture({ change: (tables) => { tables.user_coaches = [assignment('member', 'implementation', options)]; } }).buildCoachHome('coach', ['coach'], range);
    assert.equal(home.meetings.length, 0);
  }
  assert.equal((await serviceFixture({ eligible: [] }).buildCoachHome('coach', ['coach'], range)).meetings.length, 0);
});

test('cancellations and a stand-in coach booking are excluded while manually entered meetings remain valid', async () => {
  const env = serviceFixture({ change(tables) {
    tables.meetings = [
      savedMeeting(101, 1, { ghl_status: 'No_Show' }), savedMeeting(103, 1, { ghl_status: 'cancelled' }),
      savedMeeting(201, 1, { ghl_appointment_id: 'with-stand-in', created_by: 'other-coach' }),
      savedMeeting(202, 1, { created_by: 'admin' }),
    ];
    tables.meeting_attendance.push({ meeting_id: 201, user_id: 'member' }, { meeting_id: 202, user_id: 'member' });
  } });
  const home = await env.buildCoachHome('coach', ['coach'], range);
  assert.deepEqual(Array.from(home.meetings, (meeting) => meeting.id), ['202']);
});

test('date-only records retain their date, no-show normalization and selected-week boundaries', async () => {
  const home = await serviceFixture({ change(tables) {
    tables.meetings = [savedMeeting(101, 1, { starts_at: null, ends_at: null }), savedMeeting(103, 1, { starts_at: '2026-10-12T18:00:00Z' })];
  } }).buildCoachHome('coach', ['coach'], range);
  assert.equal(home.meetings.length, 1);
  assert.equal(home.meetings[0].dateOnly, true);
  assert.equal(home.meetings[0].start, '2026-10-07T06:00:00.000Z');
  assert.equal(home.meetings[0].end, '2026-10-08T05:59:59.999Z');
});

test('pagination retains every saved meeting and its attendee beyond one response page', async () => {
  const env = serviceFixture({ change(tables) {
    tables.user_coaches = [assignment('member')];
    tables.meetings = Array.from({ length: 450 }, (_, index) => savedMeeting(1000 + index));
    tables.meeting_attendance = tables.meetings.map((meeting) => ({ user_id: 'member', meeting_id: meeting.id, attended: false }));
  } });
  const assignments = await env.schedule.loadCoachAssignments(env.client, 'coach');
  const meetings = await env.schedule.loadCoachSchedule(env.client, 'coach', assignments, range);
  assert.equal(meetings.length, 450);
  assert.equal(meetings[449].meeting.id, 1449);
});

test('a failed priorities source preserves the saved schedule and exact member identity', async () => {
  const home = await serviceFixture({ failedTable: 'business_review_system_priorities' }).buildCoachHome('coach', ['coach'], range);
  assert.equal(home.sources.schedule.status, 'ready');
  assert.equal(home.sources.priorities.status, 'partial');
  assert.equal(home.meetings.length, 3);
  assert.equal(home.meetings[0].prioritiesState, 'unavailable');
});

test('failed saved-meeting or attendee queries are unavailable rather than a successful empty schedule', async () => {
  for (const failedTable of ['meetings', 'meeting_attendance', 'meeting_types']) {
    const home = await serviceFixture({ failedTable }).buildCoachHome('coach', ['coach'], range);
    assert.equal(home.sources.schedule.status, 'unavailable');
    assert.equal(home.meetings.length, 0);
  }
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
