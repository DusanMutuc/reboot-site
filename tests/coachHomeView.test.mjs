import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as luxon from 'luxon';
import * as homeView from '../src/lib/coachHomeView.ts';

const { weeklyPriorities, bookingFollowUpQueue, followUpReason, isUpcomingCoachMeeting } = homeView;
const plain = value => JSON.parse(JSON.stringify(value));
const priority = (id, label) => ({ id, label, guideHref: `/library/${id}` });
const meeting = (id, memberId, priorities = []) => ({ id, member: memberId ? { id: memberId, name: memberId } : null, priorities, prioritiesState: 'ready' });
const followUp = (userId, options = {}) => ({
  userId, memberIds: [userId], people: [{ userId, name: userId, email: null }], name: userId,
  pauseStartedAt: null, dataComplete: true, isNewMember: false, needsImplementation: true, needsM2: false,
  ...options,
});
const report = (...members) => ({ generatedAt: '2026-10-09T12:00:00Z', groups: [{ coachId: 'coach', dataComplete: true, members }] });

test('weekly preparation counts each member once across repeated meetings and preserves all appointment IDs', () => {
  const sales = priority(1, 'Sales'), hiring = priority(2, 'Hiring');
  const result = weeklyPriorities([
    meeting('a', 'alice', [sales, hiring]), meeting('b', 'alice', [sales]), meeting('c', 'bob', [sales]),
    { ...meeting('d', 'carol', [hiring]), prioritiesState: 'unavailable' }, meeting('e', null, [hiring]),
  ]);
  assert.deepEqual(plain(result), [
    { ...sales, memberIds: ['alice', 'bob'], meetingIds: ['a', 'b', 'c'] },
    { ...hiring, memberIds: ['alice'], meetingIds: ['a'] },
  ]);
});

test('follow-up queue excludes paused, uncertain and already-booked members and prioritizes new members', () => {
  const incompleteGroup = { coachId: 'other', dataComplete: false, members: [followUp('uncertain-coach')] };
  const input = report(followUp('paused', { pauseStartedAt: '2026-10-01' }), followUp('uncertain', { dataComplete: false }),
    followUp('booked', { needsImplementation: false }), followUp('Alice'), followUp('Zoe', { isNewMember: true }));
  input.groups.push(incompleteGroup);
  assert.deepEqual(bookingFollowUpQueue(input).map(member => member.name), ['Zoe', 'Alice']);
});

test('a shared business receives one follow-up even if accounts and coach groups arrive in different orders', () => {
  const first = followUp('alice:bob', { memberIds: ['alice', 'bob'] });
  const second = followUp('alice:bob', { memberIds: ['bob', 'alice'] });
  assert.equal(bookingFollowUpQueue({ groups: [report(first).groups[0], report(second).groups[0]] }).length, 1);
});

test('follow-up reasons distinguish new members from missing implementation and review bookings', () => {
  assert.equal(followUpReason(followUp('a', { isNewMember: true })), 'New member · No meetings booked');
  assert.equal(followUpReason(followUp('a', { needsM2: true })), 'Implementation and Business Review bookings missing');
  assert.equal(followUpReason(followUp('a', { needsImplementation: false, needsM2: true })), 'Business Review booking missing');
});

test('the next-meeting window includes meetings in progress and excludes meetings that ended', () => {
  const now = Date.parse('2026-10-09T12:00:00Z');
  assert.equal(isUpcomingCoachMeeting({ start: '2026-10-09T11:30:00Z', end: '2026-10-09T12:30:00Z' }, now), true);
  assert.equal(isUpcomingCoachMeeting({ start: '2026-10-09T10:30:00Z', end: '2026-10-09T11:30:00Z' }, now), false);
  assert.equal(isUpcomingCoachMeeting({ start: '2026-10-09T12:30:00Z', end: null }, now), true);
});

function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function elements(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(item => elements(item, predicate));
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}

function homeEnvironment() {
  let active;
  const requests = [], instances = [];
  const changed = (left, right) => !left || left.length !== right.length || left.some((value, index) => !Object.is(value, right[index]));
  const react = {
    useState(initial) {
      const instance = active, index = instance.index++;
      const slot = instance.hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, value => {
        if (!instance.mounted) return;
        const next = typeof value === 'function' ? value(slot.value) : value;
        if (!Object.is(next, slot.value)) { slot.value = next; instance.dirty = true; }
      }];
    },
    useMemo(callback, dependencies) {
      const instance = active, index = instance.index++, previous = instance.hooks[index];
      if (!previous || changed(previous.dependencies, dependencies)) instance.hooks[index] = { value: callback(), dependencies };
      return instance.hooks[index].value;
    },
    useEffect(effect, dependencies) {
      const instance = active, index = instance.index++, previous = instance.hooks[index];
      if (!previous || changed(previous.dependencies, dependencies)) instance.effects.push(() => {
        previous?.cleanup?.(); instance.hooks[index] = { dependencies, cleanup: effect() };
      });
    },
  };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, luxon,
    'next/link': { default: 'Link' }, '@mui/material': new Proxy({}, { get: (_target, name) => name }),
    '@/components/coach/CoachShell': { default: 'CoachShell', COACH_MAX_WIDTH: 1200 },
    '@/lib/homeTheme': { brand: {} }, '@/lib/coachHomeView': homeView,
  };
  for (const name of ['ArrowBackRounded', 'ArrowForwardRounded', 'ChevronLeftRounded', 'ChevronRightRounded', 'ExpandMoreRounded', 'OpenInNewRounded', 'RefreshRounded', 'VideocamRounded']) imports[`@mui/icons-material/${name}`] = { default: name };
  const source = ts.transpileModule(fs.readFileSync(new URL('../src/components/coach/home/CoachHome.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  class FixedDate extends Date { static now() { return Date.parse('2026-10-09T12:00:00Z'); } }
  vm.runInNewContext(source, { exports, Date: FixedDate, URLSearchParams, AbortController,
    window: { setInterval() { return 1; }, clearInterval() {} },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'UTC' }) }) },
    fetch(url, options) { const work = deferred(); requests.push({ url, options, work }); return work.promise; },
    require(name) { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; },
  });
  function render(instance) {
    instance.index = 0; instance.dirty = false; instance.effects = []; active = instance;
    instance.value = instance.component(instance.options); active = undefined;
    for (const effect of instance.effects) effect();
  }
  return {
    requests,
    mount(options = {}, component = exports.default) {
      const instance = { component, options, hooks: [], effects: [], index: 0, mounted: true, dirty: true,
        update(options) { instance.options = options; instance.dirty = true; },
      };
      instances.push(instance); render(instance); return instance;
    },
    async flush() {
      for (let turn = 0; turn < 30; turn++) {
        for (const instance of instances) if (instance.mounted && instance.dirty) render(instance);
        await Promise.resolve();
      }
      assert.ok(!instances.some(instance => instance.mounted && instance.dirty), 'State should settle');
    },
  };
}
const homePayload = (options = {}) => ({
  timezone: 'UTC', weekStart: '2026-10-05', weekEnd: '2026-10-12', generatedAt: '2026-10-09T12:00:00Z',
  coach: { id: 'coach', name: 'Coach', responsibilities: ['implementation'] }, meetings: [], groupSessions: [],
  groupCalendarUrl: 'https://calendar.example', sources: { schedule: { status: 'ready' }, priorities: { status: 'ready' }, groups: { status: 'ready' } },
  ...options,
});
const resolve = (request, payload) => request.work.resolve({ ok: true, json: async () => payload });

test('Home drops an older refresh response after navigation to another week', async () => {
  const env = homeEnvironment(), home = env.mount(); await env.flush();
  resolve(env.requests[0], homePayload()); await env.flush();
  elements(home.value, item => item.props?.['aria-label'] === 'Next week')[0].props.onClick(); await env.flush();
  const nextWeek = env.requests[1];
  assert.equal(new URL(nextWeek.url, 'http://localhost').searchParams.get('week'), '2026-10-12');
  // Simulate a second navigation while the first request is pending, as with
  // closely queued interactions before the disabled button is painted.
  elements(home.value, item => item.props?.['aria-label'] === 'Next week')[0].props.onClick(); await env.flush();
  assert.equal(nextWeek.options.signal.aborted, true);
  resolve(env.requests[2], homePayload({ weekStart: '2026-10-19', weekEnd: '2026-10-26', coach: { id: 'coach', name: 'Newest response', responsibilities: [] } })); await env.flush();
  resolve(nextWeek, homePayload({ coach: { id: 'coach', name: 'Stale response', responsibilities: [] } })); await env.flush();
  assert.equal(home.value.props.coachName, 'Newest response');
});

test('shared-business follow-up links target real people, never the composite scheduling identity', async () => {
  const env = homeEnvironment(), home = env.mount(); await env.flush();
  resolve(env.requests[0], homePayload()); await env.flush();
  const queueElement = elements(home.value, item => typeof item.type === 'function' && item.type.name === 'FollowUpQueue')[0];
  const queue = env.mount(queueElement.props, queueElement.type); await env.flush();
  resolve(env.requests[1], report(followUp('alice:bob', { memberIds: ['alice', 'bob'], people: [{ userId: 'alice', name: 'Alice' }, { userId: 'bob', name: 'Bob' }], name: 'Alice & Bob' }))); await env.flush();
  const links = elements(queue.value, item => item.props?.href?.startsWith('/coach/students-overview?'));
  assert.ok(links.length > 0);
  for (const link of links) assert.ok(['alice', 'bob'].includes(new URL(link.props.href, 'http://localhost').searchParams.get('userId')), link.props.href);
});

test('a stale follow-up response cannot replace a refreshed queue', async () => {
  const env = homeEnvironment(), home = env.mount(); await env.flush();
  resolve(env.requests[0], homePayload()); await env.flush();
  const queueElement = elements(home.value, item => typeof item.type === 'function' && item.type.name === 'FollowUpQueue')[0];
  const queue = env.mount(queueElement.props, queueElement.type); await env.flush();
  queue.update({ refresh: 1 }); await env.flush();
  assert.equal(env.requests[1].options.signal.aborted, true);
  resolve(env.requests[2], report(followUp('new'))); await env.flush();
  resolve(env.requests[1], report(followUp('stale'))); await env.flush();
  const links = elements(queue.value, item => item.props?.href?.startsWith('/coach/students-overview?'));
  assert.equal(links.length, 1);
  assert.equal(new URL(links[0].props.href, 'http://localhost').searchParams.get('userId'), 'new');
});

function visibleText(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree || typeof tree !== 'object') return '';
  return Array.isArray(tree) ? tree.map(visibleText).join(' ') : visibleText(tree.props?.children);
}

test('rolling group sessions are not mislabeled as this week and link to session details when no join URL exists', async () => {
  const env = homeEnvironment(), home = env.mount(); await env.flush();
  resolve(env.requests[0], homePayload({ groupSessions: [{ id: 'later-group', title: 'Next month session',
    start: '2026-11-02T12:00:00Z', end: '2026-11-02T13:00:00Z', audience: 'REBOOT group calendar',
    joinUrl: null, detailsUrl: 'https://calendar.example/session' }] })); await env.flush();
  const section = elements(home.value, item => item.props?.['aria-label'] === 'All group sessions')[0];
  assert.doesNotMatch(visibleText(section), /this week/i);
  assert.ok(elements(section, item => item.props?.href === 'https://calendar.example/session').length > 0);
});
