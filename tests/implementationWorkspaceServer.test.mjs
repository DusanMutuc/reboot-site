import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { getContentNodeHref } from '../src/lib/contentNodeLinks.ts';
import { implementationLocalDate, selectImplementationMeeting } from '../src/lib/implementationMeetingSelection.ts';

function loadModule(path, imports) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => {
    assert.ok(name in imports, `Unexpected module ${name}`);
    return imports[name];
  } });
  return exports;
}
const cycle = { id: 'business_audit:9', noteId: 1, kind: 'business_audit', cycleDate: '2026-09-15', businessReviewId: 9, cancelled: false };
const nextReview = { reviewId: 10, meetingId: 103, date: '2026-10-13', startsAt: null, timezone: 'America/Edmonton', title: 'Next review', isToday: false };
const bookingCoaches = { implementation: { coachId: 'implementation-coach', name: 'Implementation Coach', url: 'https://booking.example/implementation' },
  businessReview: { coachId: 'review-coach', name: 'Review Coach', url: null } };
const partnershipScope = loadModule('../src/lib/partnershipScope.ts', {});
function fixture({ cycleList = [cycle], activeCycleId = cycle.id, selectedMember = 'member', scope = ['member'] } = {}) {
  const frozenAction = { actionStepId: 10, label: 'Historical label', status: 'complete', priorityPosition: 1,
    systemKey: 'system', audience: 'foundation', guideRevision: 1,
    steps: [{ id: 'step', title: 'Pinned historical step', resources: [] }], progress: { step: { completed: true } } };
  const tables = {
    meeting_attendance: [{ meeting_id: 101, user_id: 'member', attended: false }, { meeting_id: 102, user_id: 'member', attended: true }],
    profiles: scope.map((id) => ({ id, merged_at: null })), user_coaches: [],
    implementation_meeting_sessions: [
      { id: 'history', note_id: 1, meeting_id: 101, user_id: 'member', status: 'completed', revision: 4,
        started_at: '2026-09-20T10:00:00Z', updated_at: '2026-09-20T11:00:00Z', completed_at: '2026-09-20T11:00:00Z', notes: 'Old notes', commitments: '', next_meeting_booked: true, progress_snapshot: [frozenAction] },
      { id: 'live', note_id: 1, meeting_id: 102, user_id: 'member', status: 'open', revision: 1,
        started_at: '2026-09-29T10:00:00Z', updated_at: '2026-09-29T10:00:00Z', completed_at: null, notes: '', commitments: '', next_meeting_booked: false, progress_snapshot: [] },
    ],
    meeting_types: [{ id: 1, code: 'IMPLEMENTATION_MEETING' }],
    meetings: [101, 102].map((id) => ({ id, date: id === 101 ? '2026-09-20' : '2026-09-29', title: 'Implementation', starts_at: null,
      meeting_timezone: 'America/Edmonton', ghl_status: null, meeting_type_id: 1 })),
    coaching_note_action_steps: [
      { id: 10, coaching_note_id: 1, label: 'Current label', status: 'in_progress', library_item_id: 20 },
      { id: 11, coaching_note_id: 1, label: 'Guide-less training', status: 'not_started', library_item_id: 21 },
      { id: 12, coaching_note_id: 1, label: 'Manual action', status: 'not_started', library_item_id: null },
    ],
    implementation_action_checklists: [{ action_step_id: 10, guide_revision: 1, steps: frozenAction.steps, progress: { step: { completed: false } } }],
    business_review_system_priorities: [], implementation_step_notes: [], system_scorecard_templates: [],
    content_nodes: [{ id: 20, title: 'Training item', slug: 'training-item', node_type: 'lesson' },
      { id: 21, title: 'Full course', slug: 'full-course', node_type: 'course' }],
  };
  const reads = [];
  const client = { async rpc(name, args) {
    assert.equal(name, 'view_user_ids_for_owner');
    assert.equal(args._owner, selectedMember); assert.equal(args._domain, 'notes');
    return { data: scope.map((user_id) => ({ user_id })), error: null };
  }, from(table) {
    assert.ok(table in tables, `Unexpected table ${table}`);
    const filters = [];
    let count = Infinity;
    let orderBy = null;
    const query = {
      select(columns) { reads.push({ table, columns }); return query; },
      eq(key, value) { filters.push((row) => String(row[key]) === String(value)); return query; },
      in(key, values) { filters.push((row) => values.some((value) => String(row[key]) === String(value))); return query; },
      gt(key, value) { filters.push((row) => row[key] > value); return query; },
      order(key, options = {}) { orderBy = { key, ascending: options.ascending !== false }; return query; },
      limit(value) { count = value; return query; },
      or(expression) {
        const prefix = 'ended_at.is.null,ended_at.gt.';
        assert.ok(expression.startsWith(prefix));
        filters.push((row) => row.ended_at == null || row.ended_at > expression.slice(prefix.length));
        return query;
      },
      then(resolve, reject) {
        let data = tables[table].filter((row) => filters.every((filter) => filter(row)));
        if (orderBy) data.sort((left, right) => {
          const direction = orderBy.ascending ? 1 : -1;
          return left[orderBy.key] < right[orderBy.key] ? -direction : left[orderBy.key] > right[orderBy.key] ? direction : 0;
        });
        return Promise.resolve({ data: data.slice(0, count), error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const server = loadModule('../src/lib/implementationWorkspaceServer.ts', {
    '@/lib/coachingCycles': { loadCoachingCycles: async () => ({ cycles: cycleList, activeCycleId, nextAuditDate: null }) },
    '@/lib/businessReviews': { isCancelledGhlStatus: () => false },
    '@/lib/implementationGuidesServer': { loadImplementationGuides: async () => new Map() },
    '@/lib/implementationMeetingSelection': { implementationLocalDate, selectImplementationMeeting },
    '@/lib/upcomingBusinessReview': { loadUpcomingBusinessReview: async (_client, memberId, _cycles, selected) => {
      assert.equal(memberId, selectedMember); assert.equal(selected?.noteId ?? null, activeCycleId ? 1 : null); return nextReview;
    } },
    '@/lib/implementationBookingCoaches': { loadImplementationBookingCoaches: async (_client, memberId) => {
      assert.equal(memberId, selectedMember); return bookingCoaches;
    } },
    '@/lib/contentNodeLinks': { getContentNodeHref },
    '@/lib/implementationApi': { invalidImplementationRequest: (message) => { throw new Error(message); }, isImplementationAdmin: (roles) => roles.includes('admin') },
    '@/lib/partnershipScope': partnershipScope,
  });
  return { tables, client, reads, frozenAction, load: server.loadImplementationWorkspace, canAccess: server.canAccessImplementationWorkspace };
}

test('workspace includes the scheduled review and preserves existing course/library links even without checklist guides', async () => {
  const { load, client, reads } = fixture();
  const result = await load(client, 'member', 1);
  assert.deepEqual(result.upcomingBusinessReview, nextReview);
  assert.deepEqual(result.bookingCoaches, bookingCoaches);
  assert.equal(result.actions.find((action) => action.actionStepId === 10).libraryItemHref, '/library/training-item?libraryView=all');
  const guideLess = result.actions.find((action) => action.actionStepId === 11);
  assert.equal(guideLess.steps.length, 0);
  assert.equal(guideLess.libraryItemId, 21);
  assert.equal(guideLess.libraryItemTitle, 'Full course');
  assert.equal(guideLess.libraryItemHref, '/courses/full-course');
  assert.equal(result.actions.find((action) => action.actionStepId === 12).libraryItemHref, null);
  assert.ok(reads.some((read) => read.table === 'content_nodes'));
  assert.ok(!reads.some((read) => read.table === 'resources'), 'Content-node IDs must never be treated as resource IDs');
});

test('historical actions gain link metadata without changing their stored labels, steps, statuses or progress', async () => {
  const { load, client, frozenAction } = fixture();
  const before = structuredClone(frozenAction);
  const result = await load(client, 'member', 1);
  const historical = result.meetings.find((meeting) => meeting.id === 101).session.actions[0];
  assert.equal(historical.libraryItemHref, '/library/training-item?libraryView=all');
  assert.equal(historical.label, 'Historical label');
  assert.equal(historical.status, 'complete');
  assert.equal(historical.progress.step.completed, true);
  assert.deepEqual(frozenAction, before, 'Read-time enrichment leaves stored JSON snapshot unchanged');
  assert.equal(result.meetings.find((meeting) => meeting.id === 102).session.actions[0].progress.step.completed, false);
});

test('each meeting loads its own next-meeting booking state independently of attendance and other sessions', async () => {
  const { load, client } = fixture();
  const result = await load(client, 'member', 1);
  const historical = result.meetings.find((meeting) => meeting.id === 101);
  const current = result.meetings.find((meeting) => meeting.id === 102);
  assert.equal(historical.session.nextMeetingBooked, true);
  assert.equal(historical.attended, false);
  assert.equal(current.session.nextMeetingBooked, false);
  assert.equal(current.attended, true);
});

test('booking coaches remain available before any cycle or active cycle exists', async () => {
  for (const cycleList of [[], [cycle]]) {
    const { load, client } = fixture({ cycleList, activeCycleId: null });
    const result = await load(client, 'member');
    assert.equal(result.selectedNoteId, null);
    assert.equal(result.meetings.length, 0);
    assert.deepEqual(result.bookingCoaches, bookingCoaches);
  }
});

test('a secondary partner sees shared sessions, actions and attendance while retaining their own booking identity', async () => {
  const { tables, client, load, reads } = fixture({ selectedMember: 'partner', scope: ['member', 'partner'] });
  tables.meeting_attendance.push(...tables.meeting_attendance.map((row) => ({ ...row, user_id: 'partner' })));
  const result = await load(client, 'partner', 1);
  assert.equal(result.meetings.length, 2);
  assert.equal(result.meetings.find((meeting) => meeting.id === 101).session.notes, 'Old notes');
  assert.equal(result.meetings.find((meeting) => meeting.id === 102).attended, true);
  assert.ok(result.meetings.every((meeting) => meeting.attendanceAvailable));
  assert.equal(result.latestSessionId, 'live');
  assert.equal(result.actions.length, 3);
  assert.deepEqual(result.bookingCoaches, bookingCoaches);
  assert.ok(reads.some((read) => read.table === 'meeting_attendance'));
  assert.ok(!reads.some((read) => read.table === 'meeting_attendance_base'));
});

test('shared session history survives independent attendance sharing without borrowing another member’s attendance', async () => {
  const { tables, client, load } = fixture({ selectedMember: 'partner', scope: ['member', 'partner'] });
  tables.meeting_attendance.push({ user_id: 'member', meeting_id: 103, attended: true });
  tables.meetings.push({ ...tables.meetings[0], id: 103 });
  const result = await load(client, 'partner', 1);
  assert.equal(result.meetings.length, 2, 'A partner-only unsessioned appointment is not shared through notes');
  assert.ok(result.meetings.every((meeting) => !meeting.attendanceAvailable && !meeting.attended));
  assert.equal(result.meetings.find((meeting) => meeting.id === 101).session.notes, 'Old notes');
});

test('historical duplicate shared attendance is combined deterministically instead of trusting the first row', async () => {
  const { tables, client, load } = fixture();
  tables.meeting_attendance.push({ meeting_id: 101, user_id: 'member', attended: true });
  for (let pass = 0; pass < 2; pass += 1) {
    const result = await load(client, 'member', 1);
    assert.equal(result.meetings.filter((meeting) => meeting.id === 101).length, 1);
    const meeting = result.meetings.find((meeting) => meeting.id === 101);
    assert.equal(meeting.attended, true);
    assert.equal(meeting.attendanceAvailable, true);
    tables.meeting_attendance.reverse();
  }
});

test('notes-only coach access omits attendance reads and unstarted appointments while preserving shared session history', async () => {
  const { tables, client, load, reads } = fixture();
  tables.meeting_attendance.push({ meeting_id: 103, user_id: 'member', attended: true });
  tables.meetings.push({ ...tables.meetings[0], id: 103 });
  const result = await load(client, 'member', 1, { canReadAttendance: false });
  assert.equal(result.canManageAttendance, false, 'The UI must not offer meeting creation without attendance access');
  assert.equal(result.meetings.length, 2);
  assert.ok(result.meetings.every((meeting) => !meeting.attendanceAvailable && !meeting.attended));
  assert.equal(result.meetings.find((meeting) => meeting.id === 101).session.notes, 'Old notes');
  assert.ok(!reads.some((read) => read.table === 'meeting_attendance'));
});

test('sessions outside the visible note scope never enter the workspace even for the same stored user', async () => {
  const { tables, client, load } = fixture();
  tables.implementation_meeting_sessions.push({ ...tables.implementation_meeting_sessions[0], id: 'unshared', note_id: 999, meeting_id: 999, notes: 'Private partner note' });
  tables.meetings.push({ ...tables.meetings[0], id: 999 });
  const result = await load(client, 'member', 1);
  assert.equal(result.meetings.length, 2);
  assert.ok(!JSON.stringify(result).includes('Private partner note'));
  await assert.rejects(() => load(client, 'member', 999), /does not belong to the member/);
});

test('workspace access follows active notes-sharing assignments and rejects unrelated, expired and archived targets', async () => {
  const { tables, client, canAccess } = fixture({ selectedMember: 'partner', scope: ['member', 'partner'] });
  tables.user_coaches.push({ id: 1, coach_id: 'coach', user_id: 'member', is_active: true, ended_at: null });
  assert.equal(await canAccess(client, 'coach', ['coach'], 'partner'), true);
  assert.equal(await canAccess(client, 'other-coach', ['coach'], 'partner'), false);
  assert.equal(await canAccess(client, 'coach', ['user'], 'partner'), false);
  tables.user_coaches[0].ended_at = '2000-01-01T00:00:00Z';
  assert.equal(await canAccess(client, 'coach', ['coach'], 'partner'), false);
  tables.user_coaches[0].ended_at = null;
  tables.profiles.find((row) => row.id === 'partner').merged_at = '2026-10-01T00:00:00Z';
  assert.equal(await canAccess(client, 'coach', ['coach'], 'partner'), false);
});

test('a partner relationship without active notes sharing grants no coach access', async () => {
  const { tables, client, canAccess } = fixture({ selectedMember: 'partner', scope: ['partner'] });
  tables.user_coaches.push({ id: 1, coach_id: 'coach', user_id: 'member', is_active: true, ended_at: null });
  assert.equal(await canAccess(client, 'coach', ['coach'], 'partner'), false);
});
