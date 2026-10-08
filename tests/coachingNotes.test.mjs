import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as businessAuditConfig from '../src/lib/businessAuditConfig.ts';
import * as userRoles from '../src/lib/userRoles.ts';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
function loadModule(path, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, process, console: { ...console, error() {} },
    require: (name) => Object.hasOwn(imports, name) ? imports[name] : require(name),
  });
  return exports;
}
const businessReviews = loadModule('../src/lib/businessReviews.ts', { '@/lib/userRoles': userRoles, '@/lib/partnershipScope': {} });
const implementationApi = loadModule('../src/lib/implementationApi.ts');
const coachingNotesTypes = loadModule('../src/types/coachingNotes.ts');
const { loadCoachingNotes } = loadModule('../src/lib/coachingNotesServer.ts', {
  '@/lib/businessAuditConfig': businessAuditConfig,
  '@/lib/businessReviews': businessReviews,
  '@/lib/partnershipScope': { getNotesScopeUserIds: async (client, userId) => client.sharedMemberIds ?? [userId] },
});

const memberId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1611';
const otherMemberId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1612';
const authorId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1613';
const editorId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1614';
const requestId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1615';
const uuid = (value) => `11111111-1111-4111-8111-${String(value).padStart(12, '0')}`;
const plain = (value) => JSON.parse(JSON.stringify(value));

// Apply the query filters instead of returning canned rows. A server can impose
// a smaller page cap than the client's limit; short pages are not end-of-feed.
function clientFor(rows = {}, { pageCap = 3, failTable = null } = {}) {
  const tables = {
    coaching_notes: [], coaching_note_comments: [], business_reviews: [],
    implementation_meeting_sessions: [], general_coaching_notes: [], meetings: [], profiles: [],
    ...rows,
  };
  const calls = [];
  return {
    calls,
    from(table) {
      assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
      const filters = [];
      const orders = [];
      let limit = Infinity;
      const call = { table, filters, orders, returned: null };
      calls.push(call);
      assert.ok(calls.length < 10000, 'Pagination must advance and terminate');
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(column, value) { filters.push({ kind: 'eq', column, value }); return query; },
        in(column, values) {
          assert.ok(values.length > 0 && values.length <= 100, 'Lookups must use nonempty batches of at most 100 IDs');
          filters.push({ kind: 'in', column, values: [...values] }); return query;
        },
        gt(column, value) { filters.push({ kind: 'gt', column, value }); return query; },
        order(column, options = {}) { orders.push({ column, ascending: options.ascending !== false }); return query; },
        limit(value) { limit = value; return query; },
        then(resolve, reject) {
          if (table === failTable) return Promise.resolve({ data: null, error: { code: 'XX000', message: `${table} failed` } }).then(resolve, reject);
          const result = tables[table].filter((row) => filters.every((filter) => {
            if (filter.kind === 'eq') return row[filter.column] === filter.value;
            if (filter.kind === 'in') return filter.values.some((value) => String(value) === String(row[filter.column]));
            return row[filter.column] > filter.value;
          })).sort((left, right) => {
            for (const { column, ascending } of orders) {
              if (left[column] === right[column]) continue;
              return (left[column] < right[column] ? -1 : 1) * (ascending ? 1 : -1);
            }
            return 0;
          }).slice(0, Math.min(limit, pageCap));
          call.returned = result.length;
          return Promise.resolve({ data: result, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test('the feed combines all note sources while preserving original authors and writing dates', async () => {
  const client = clientFor({
    coaching_notes: [
      { id: 1, user_id: memberId, created_at: '2026-01-01T18:00:00Z', m2_meeting_id: null },
      { id: 2, user_id: memberId, created_at: '2026-01-02T18:00:00Z', m2_meeting_id: 20 },
      { id: 3, user_id: memberId, created_at: '2026-01-03T18:00:00Z', m2_meeting_id: null },
      { id: 4, user_id: otherMemberId, created_at: '2026-01-04T18:00:00Z', m2_meeting_id: null },
    ],
    business_reviews: [{ id: 11, user_id: memberId, coaching_note_id: 1, meeting_id: 10, review_date: '2026-01-05' }],
    coaching_note_comments: [
      { id: 1, coaching_note_id: 1, body: 'Business review note', author_id: authorId, created_at: '2026-01-10T10:00:00Z' },
      { id: 2, coaching_note_id: 2, body: 'M2 note', author_id: authorId, created_at: '2026-01-11T10:00:00Z' },
      { id: 3, coaching_note_id: 3, body: 'Legacy cycle comment', author_id: 'missing-profile', created_at: '2026-01-12T10:00:00Z' },
      { id: 4, coaching_note_id: 1, body: ' \n ', author_id: authorId, created_at: '2026-01-30T10:00:00Z' },
      { id: 5, coaching_note_id: 999, body: 'Deleted cycle comment', author_id: authorId, created_at: '2026-01-30T10:00:00Z' },
      { id: 6, coaching_note_id: 4, body: 'Other member comment', author_id: authorId, created_at: '2026-01-30T10:00:00Z' },
    ],
    implementation_meeting_sessions: [
      { id: uuid(1), user_id: memberId, note_id: 1, meeting_id: 30, notes: 'Implementation note', commitments: 'Send the draft',
        notes_written_at: '2026-01-13T10:00:00Z', notes_author_id: authorId,
        notes_updated_at: '2026-02-01T10:00:00Z', notes_updated_by: editorId },
      { id: uuid(2), user_id: memberId, note_id: 1, meeting_id: 31, notes: ' ', commitments: 'Commitments without a note',
        notes_written_at: '2026-01-14T10:00:00Z', notes_author_id: authorId, notes_updated_at: null, notes_updated_by: null },
      { id: uuid(3), user_id: memberId, note_id: 1, meeting_id: 32, notes: 'Legacy implementation note', commitments: '',
        notes_written_at: null, notes_author_id: null, notes_updated_at: null, notes_updated_by: null,
        updated_by: editorId, updated_at: '2026-03-01T10:00:00Z', started_at: '2026-01-15T10:00:00Z' },
      { id: uuid(4), user_id: memberId, note_id: 1, meeting_id: 33, notes: '\n ', commitments: ' ',
        notes_written_at: '2026-01-30T10:00:00Z', notes_author_id: authorId },
      { id: uuid(5), user_id: memberId, note_id: 999, meeting_id: 34, notes: 'Deleted cycle session', commitments: '',
        notes_written_at: '2026-01-30T10:00:00Z', notes_author_id: authorId },
      { id: uuid(6), user_id: otherMemberId, note_id: 4, meeting_id: 35, notes: 'Other member session', commitments: '',
        notes_written_at: '2026-01-30T10:00:00Z', notes_author_id: authorId },
    ],
    general_coaching_notes: [
      { id: uuid(1), user_id: memberId, author_id: authorId, body: 'General coaching note', created_at: '2026-01-16T10:00:00Z' },
      { id: uuid(2), user_id: memberId, author_id: authorId, body: ' \t', created_at: '2026-01-30T10:00:00Z' },
      { id: uuid(3), user_id: otherMemberId, author_id: authorId, body: 'Other member general note', created_at: '2026-01-30T10:00:00Z' },
    ],
    meetings: [
      { id: 10, date: '2026-01-06' }, { id: 20, date: '2026-01-07' },
      { id: 30, date: '2026-01-08' }, { id: 31, date: '2026-01-09' }, { id: 32, date: '2026-01-15' },
    ],
    profiles: [
      { id: authorId, first_name: 'Ada', last_name: 'Coach' },
      { id: editorId, first_name: 'Eli', last_name: 'Editor' },
    ],
  });
  const { notes } = await loadCoachingNotes(client, memberId);
  assert.deepEqual(plain(notes.map((note) => note.body.trim())), [
    'General coaching note', '', 'Implementation note', 'Legacy cycle comment', 'M2 note', 'Business review note', 'Legacy implementation note',
  ]);
  assert.equal(new Set(notes.map((note) => note.id)).size, notes.length, 'IDs must be unique across sources');
  const review = notes.find((note) => note.body === 'Business review note');
  assert.equal(review.source, 'business_review');
  assert.equal(review.contextKind, 'business_review');
  assert.equal(review.contextDate, '2026-01-05');
  assert.equal(review.authorName, 'Ada Coach');
  const m2 = notes.find((note) => note.body === 'M2 note');
  assert.equal(m2.contextKind, 'm2');
  assert.equal(m2.contextDate, '2026-01-07');
  const legacyComment = notes.find((note) => note.body === 'Legacy cycle comment');
  assert.equal(legacyComment.contextKind, 'legacy');
  assert.equal(legacyComment.authorName, null, 'Missing profiles must not invent an author');
  const implementation = notes.find((note) => note.body === 'Implementation note');
  assert.equal(implementation.source, 'implementation');
  assert.equal(implementation.writtenAt, '2026-01-13T10:00:00Z');
  assert.equal(implementation.authorName, 'Ada Coach');
  assert.equal(implementation.updatedAt, '2026-02-01T10:00:00Z');
  assert.equal(implementation.updatedByName, 'Eli Editor');
  assert.equal(implementation.commitments, 'Send the draft');
  assert.equal(implementation.contextDate, '2026-01-08');
  assert.equal(notes[1].commitments, 'Commitments without a note');
  const legacy = notes.at(-1);
  assert.equal(legacy.writtenAt, null, 'Starting a meeting is not the date its note was written');
  assert.equal(legacy.authorName, null, 'An action updater is not necessarily the note author');
  assert.equal(legacy.updatedAt ?? null, null);
  assert.equal(legacy.updatedByName ?? null, null);
  assert.equal(notes[0].source, 'coaching');
});

test('shared implementation history follows visible cycles regardless of the session owner', async () => {
  const shared = { id: uuid(8), user_id: otherMemberId, note_id: 8, meeting_id: 80,
    notes: 'Shared meeting notes', commitments: '', notes_written_at: '2026-09-10T10:00:00Z',
    notes_author_id: authorId, notes_updated_at: null, notes_updated_by: null };
  for (const visible of [true, false]) {
    const client = clientFor({
      coaching_notes: visible ? [{ id: 8, user_id: memberId, m2_meeting_id: null }] : [],
      implementation_meeting_sessions: [shared, { ...shared, id: uuid(9), note_id: 9, notes: 'Unrelated private meeting' }],
      meetings: [{ id: 80, date: '2026-09-10' }],
      profiles: [{ id: authorId, first_name: 'Shared', last_name: 'Coach' }],
    });
    const { notes } = await loadCoachingNotes(client, memberId);
    assert.deepEqual(plain(notes.map((note) => note.body)), visible ? ['Shared meeting notes'] : []);
    if (visible) assert.equal(notes[0].authorName, 'Shared Coach');
  }
});

test('standalone notes follow active notes-sharing scope in both directions', async () => {
  const rows = { general_coaching_notes: [
    { id: uuid(1), user_id: memberId, author_id: authorId, body: 'First partner', created_at: '2026-09-10T10:00:00Z' },
    { id: uuid(2), user_id: otherMemberId, author_id: authorId, body: 'Second partner', created_at: '2026-09-11T10:00:00Z' },
  ] };
  for (const userId of [memberId, otherMemberId]) {
    const client = clientFor(rows);
    client.sharedMemberIds = [memberId, otherMemberId];
    assert.equal((await loadCoachingNotes(client, userId)).notes.length, 2);
    client.sharedMemberIds = [userId];
    const { notes } = await loadCoachingNotes(client, userId);
    assert.deepEqual(plain(notes.map((note) => note.body)), [userId === memberId ? 'First partner' : 'Second partner']);
  }
});

test('all source and lookup pages survive short server pages and more than one ID batch', async () => {
  const count = 205;
  const rows = {
    coaching_notes: [], coaching_note_comments: [], business_reviews: [],
    implementation_meeting_sessions: [], general_coaching_notes: [], meetings: [], profiles: [],
  };
  for (let id = 1; id <= count; id += 1) {
    const profileId = uuid(id);
    const writtenAt = new Date(Date.UTC(2026, 0, 1, 0, id)).toISOString();
    rows.coaching_notes.push({ id, user_id: memberId, created_at: writtenAt, m2_meeting_id: null });
    rows.business_reviews.push({ id, user_id: memberId, coaching_note_id: id, meeting_id: id, review_date: '2026-01-01' });
    rows.coaching_note_comments.push({ id, coaching_note_id: id, author_id: profileId, body: `Review ${id}`, created_at: writtenAt });
    rows.implementation_meeting_sessions.push({ id: uuid(id), user_id: memberId, note_id: id, meeting_id: id + count,
      notes: `Implementation ${id}`, commitments: '', notes_written_at: writtenAt, notes_author_id: profileId,
      notes_updated_at: null, notes_updated_by: null });
    rows.general_coaching_notes.push({ id: uuid(id), user_id: memberId, author_id: profileId, body: `Coaching ${id}`, created_at: writtenAt });
    rows.meetings.push({ id, date: '2026-01-01' }, { id: id + count, date: '2026-01-02' });
    rows.profiles.push({ id: profileId, first_name: 'Coach', last_name: String(id) });
  }
  // Reversed data prevents insertion order from accidentally satisfying keyset queries.
  for (const values of Object.values(rows)) values.reverse();
  const client = clientFor(rows, { pageCap: 37 });
  const { notes } = await loadCoachingNotes(client, memberId);
  assert.equal(notes.length, count * 3);
  assert.equal(new Set(notes.map((note) => note.id)).size, count * 3);
  for (const source of ['business_review', 'implementation', 'coaching']) {
    assert.equal(notes.filter((note) => note.source === source).length, count);
  }
  for (let id = 1; id <= count; id += 1) {
    for (const label of ['Review', 'Implementation', 'Coaching']) {
      const note = notes.find((item) => item.body === `${label} ${id}`);
      assert.equal(note.authorName, `Coach ${id}`, 'Paginated profile lookups must resolve every author');
      if (label === 'Implementation') assert.equal(note.contextDate, '2026-01-02');
    }
  }
  for (const table of Object.keys(rows)) {
    const calls = client.calls.filter((call) => call.table === table);
    assert.ok(calls.some((call) => call.filters.some((filter) => filter.kind === 'gt')), `${table} must continue after a short page`);
    assert.ok(calls.some((call) => call.returned === 0), `${table} must read through the final page`);
  }
  const timestamps = notes.map((note) => note.writtenAt);
  assert.deepEqual(plain(timestamps), [...timestamps].sort().reverse());
});

test('general notes remain available when a member has no coaching cycle', async () => {
  const client = clientFor({ general_coaching_notes: [
    { id: uuid(1), user_id: memberId, author_id: authorId, body: 'First conversation', created_at: '2026-01-01T12:00:00Z' },
  ] });
  const { notes } = await loadCoachingNotes(client, memberId);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].source, 'coaching');
  assert.equal(notes[0].authorName, null);
});

test('a member with no notes has an empty feed', async () => {
  assert.deepEqual(plain(await loadCoachingNotes(clientFor(), memberId)), { notes: [] });
});

test('source and author lookup failures reject rather than silently returning an incomplete feed', async () => {
  for (const failTable of ['general_coaching_notes', 'profiles']) {
    const client = clientFor({ general_coaching_notes: [
      { id: uuid(1), user_id: memberId, author_id: authorId, body: 'A note', created_at: '2026-01-01T12:00:00Z' },
    ] }, { failTable });
    await assert.rejects(() => loadCoachingNotes(client, memberId), (error) => error.message === `${failTable} failed`);
  }
});

function apiFor({ authenticated = true, allowed = true, rpcError = null, loadError = null } = {}) {
  const calls = [];
  const admin = {};
  const feed = { notes: [{ id: 'coaching:fixture', source: 'coaching', body: 'Saved note', writtenAt: '2026-01-01T12:00:00Z', authorName: 'Ada Coach' }] };
  const guard = { ok: true, user: { id: authorId }, roleCodes: ['implementation_coach'], supabase: {} };
  const actor = { rpc: async (name, args) => { calls.push({ kind: 'rpc', name, args }); return { data: uuid(1), error: rpcError }; } };
  const api = loadModule('../src/app/api/coaching-notes/route.ts', {
    '@/lib/requireUser': { requireUser: async () => authenticated ? guard : { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } },
    '@/lib/supabaseAdmin': { getAdminClient() { calls.push({ kind: 'admin' }); return admin; } },
    '@/lib/businessReviews': businessReviews,
    '@/types/coachingNotes': coachingNotesTypes,
    '@/lib/implementationApi': { ...implementationApi, implementationActorClient(request, actualGuard) {
      assert.equal(actualGuard, guard);
      calls.push({ kind: 'actor', authorization: request.headers.get('authorization') });
      return actor;
    } },
    '@/lib/implementationWorkspaceServer': { canAccessImplementationWorkspace: async (client, actorId, roles, userId) => {
      assert.equal(client, admin);
      calls.push({ kind: 'access', actorId, roles, userId });
      return allowed;
    } },
    '@/lib/coachingNotesServer': { loadCoachingNotes: async (client, userId) => {
      assert.equal(client, admin);
      calls.push({ kind: 'load', userId });
      if (loadError) throw loadError;
      return feed;
    } },
  });
  return {
    calls, feed,
    get: (query = `userId=${memberId}`) => api.GET(new NextRequest(`https://reboot.example/api/coaching-notes?${query}`)),
    post: (body, raw = false) => api.POST(new NextRequest('https://reboot.example/api/coaching-notes', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer actor-token' },
      body: raw ? body : JSON.stringify(body),
    })),
  };
}

test('unauthenticated and unauthorized requests cannot read notes or invoke the mutation RPC', async () => {
  for (const options of [{ authenticated: false }, { allowed: false }]) {
    const api = apiFor(options);
    const expected = options.authenticated === false ? 401 : 403;
    assert.equal((await api.get()).status, expected);
    assert.equal((await api.post({ userId: memberId, body: 'Private note', requestId })).status, expected);
    assert.ok(api.calls.every((call) => !['load', 'actor', 'rpc'].includes(call.kind)));
    if (options.authenticated === false) assert.equal(api.calls.length, 0);
  }
});

test('GET authorizes the requested member before loading the complete feed', async () => {
  const api = apiFor();
  const response = await api.get();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), api.feed);
  assert.deepEqual(plain(api.calls), [
    { kind: 'admin' },
    { kind: 'access', actorId: authorId, roles: ['implementation_coach'], userId: memberId },
    { kind: 'load', userId: memberId },
  ]);
});

test('GET rejects absent and malformed member IDs before accessing the database', async () => {
  const api = apiFor();
  for (const query of ['', 'userId=', 'userId=not-a-uuid']) assert.equal((await api.get(query)).status, 400);
  assert.equal(api.calls.length, 0);
});

test('POST enforces an exact payload, a valid request ID, and nonempty text no longer than 30000 characters', async () => {
  const api = apiFor();
  const valid = { userId: memberId, body: 'A note', requestId };
  for (const body of [
    null, [], 'note', {}, { ...valid, userId: 'invalid' }, { ...valid, body: '' }, { ...valid, body: ' \n\t' },
    { ...valid, body: 42 }, { ...valid, body: null }, { ...valid, body: 'x'.repeat(30001) },
    { userId: memberId, body: 'A note' }, { ...valid, requestId: 'invalid' },
    { ...valid, authorId: editorId }, { ...valid, createdAt: '2026-01-01T00:00:00Z' },
  ]) assert.equal((await api.post(body)).status, 400);
  assert.equal((await api.post('{invalid', true)).status, 400);
  assert.equal(api.calls.length, 0, 'Invalid content must not reach authorization queries or writes');
});

test('POST trims text, preserves internal line breaks, and forwards the actor and idempotency key', async () => {
  const api = apiFor();
  const body = { userId: memberId, body: '  First paragraph\n\nSecond paragraph  ', requestId };
  const response = await api.post(body);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), api.feed);
  assert.deepEqual(plain(api.calls), [
    { kind: 'admin' },
    { kind: 'access', actorId: authorId, roles: ['implementation_coach'], userId: memberId },
    { kind: 'actor', authorization: 'Bearer actor-token' },
    { kind: 'rpc', name: 'add_general_coaching_note', args: {
      _user_id: memberId, _body: 'First paragraph\n\nSecond paragraph', _request_id: requestId,
    } },
    { kind: 'load', userId: memberId },
  ]);
  await api.post(body);
  const rpcCalls = api.calls.filter((call) => call.kind === 'rpc');
  assert.equal(rpcCalls.length, 2);
  assert.deepEqual(plain(rpcCalls[1].args), plain(rpcCalls[0].args), 'Retries must retain the same database idempotency key');
});

test('POST accepts the maximum note length', async () => {
  const api = apiFor();
  assert.equal((await api.post({ userId: memberId, body: 'x'.repeat(30000), requestId })).status, 200);
  assert.equal(api.calls.find((call) => call.kind === 'rpc').args._body.length, 30000);
});

test('database failures remain errors and unsuccessful writes do not reload a success feed', async () => {
  for (const [code, status] of [['42501', 403], ['22023', 400], ['40001', 409], ['PGRST202', 503]]) {
    const api = apiFor({ rpcError: { code, message: 'Mutation failed' } });
    assert.equal((await api.post({ userId: memberId, body: 'A note', requestId })).status, status);
    assert.ok(!api.calls.some((call) => call.kind === 'load'));
  }
  const api = apiFor({ loadError: { code: '42P01', message: 'Missing table' } });
  assert.equal((await api.get()).status, 503);
});
