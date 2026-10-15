import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { selectLinkedWorkspaceItem } from '../src/lib/workspaceLinkedSelection.ts';

const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};
const member = (id, full_name) => ({ id, full_name, email: `${id}@example.com` });
const ada = member('ada', 'Ada Adams');
const ben = member('ben', 'Ben Brown');

// Execute the actual hooks with batched state, effect cleanup and delayed fetches.
// No live member data or external requests are involved.
function environment(path, exportName, imports = {}, globals = {}) {
  let active;
  const changed = (left, right) => !left || left.length !== right.length || left.some((value, index) => !Object.is(value, right[index]));
  const react = {
    useState(initial) {
      const instance = active, index = instance.index++;
      if (!instance.hooks[index]) instance.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = instance.hooks[index];
      return [slot.value, value => {
        if (!instance.mounted) return;
        const next = typeof value === 'function' ? value(slot.value) : value;
        if (!Object.is(next, slot.value)) { slot.value = next; instance.dirty = true; }
      }];
    },
    useRef(initial) { return active.hooks[active.index++] ??= { current: initial }; },
    useMemo(callback, dependencies) {
      const instance = active, index = instance.index++, previous = instance.hooks[index];
      if (!previous || changed(previous.dependencies, dependencies)) instance.hooks[index] = { value: callback(), dependencies };
      return instance.hooks[index].value;
    },
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies); },
    useEffect(effect, dependencies) {
      const instance = active, index = instance.index++, previous = instance.hooks[index];
      if (!previous || changed(previous.dependencies, dependencies)) instance.effects.push(() => {
        previous?.cleanup?.();
        instance.hooks[index] = { dependencies, cleanup: effect() };
      });
    },
  };
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require(name) {
    if (name === 'react') return react;
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, URLSearchParams, AbortController, console, ...globals });
  const instances = [];
  function render(instance) {
    instance.index = 0; instance.dirty = false; instance.effects = []; active = instance;
    instance.value = exports[exportName](instance.options);
    active = undefined;
    for (const effect of instance.effects) effect();
  }
  return {
    mount(options) {
      const instance = { hooks: [], effects: [], index: 0, dirty: true, mounted: true, options,
        update(options) { instance.options = options; instance.dirty = true; },
        unmount() { instance.mounted = false; for (const slot of instance.hooks) slot?.cleanup?.(); },
      };
      instances.push(instance); render(instance); return instance;
    },
    async flush() {
      for (let turn = 0; turn < 30; turn++) {
        for (const instance of instances) if (instance.mounted && instance.dirty) render(instance);
        await Promise.resolve();
      }
      assert.ok(!instances.some(instance => instance.mounted && instance.dirty), 'State must settle');
    },
  };
}

function searchEnvironment() {
  return environment('../src/components/student/workspace/useWorkspaceMemberSearch.ts', 'useWorkspaceMemberSearch');
}

test('search typed before the roster loads survives first-member selection and MUI reset', async () => {
  const env = searchEnvironment(), hook = env.mount(null);
  hook.value.onInputChange(null, 'ben', 'input'); await env.flush();
  hook.update(ada); await env.flush();
  hook.value.onInputChange(null, 'Ada Adams', 'reset'); await env.flush();
  assert.equal(hook.value.inputValue, 'ben');
});

test('reloads, loading gaps, blur and selected-member label updates never erase a search', async () => {
  const env = searchEnvironment(), hook = env.mount(ada);
  hook.value.onInputChange(null, 'ben@', 'input'); await env.flush();
  for (const update of [null, { ...ada }, { ...ada, full_name: 'Ada Updated' }]) {
    hook.update(update); await env.flush();
    hook.value.onInputChange(null, update?.full_name ?? '', 'reset');
    hook.value.onInputChange(null, update?.full_name ?? '', 'blur'); await env.flush();
    assert.equal(hook.value.inputValue, 'ben@');
  }
});

test('clearing preserves the empty search through asynchronous value resets', async () => {
  const env = searchEnvironment(), hook = env.mount(ada);
  hook.value.onInputChange(null, '', 'clear'); await env.flush();
  hook.update({ ...ada }); await env.flush();
  hook.value.onInputChange(null, ada.full_name, 'reset'); await env.flush();
  assert.equal(hook.value.inputValue, '');
});

test('an approved selection updates the label immediately and settles when navigation catches up', async () => {
  const env = searchEnvironment(), hook = env.mount(ada);
  hook.value.onInputChange(null, 'ben', 'input'); await env.flush();
  hook.value.selectionApplied(ben); await env.flush();
  assert.equal(hook.value.inputValue, ben.full_name);
  hook.update(null); await env.flush();
  assert.equal(hook.value.inputValue, ben.full_name);
  hook.update(ben); await env.flush();
  assert.equal(hook.value.inputValue, ben.full_name);
  hook.update({ ...ben, full_name: 'Ben Updated' }); await env.flush();
  assert.equal(hook.value.inputValue, 'Ben Updated');
});

test('new typing after selecting a member survives that selection finishing in the background', async () => {
  const env = searchEnvironment(), hook = env.mount(ada);
  hook.value.selectionApplied(ben); await env.flush();
  hook.value.onInputChange(null, 'carol', 'input'); await env.flush();
  hook.update(ben); await env.flush();
  hook.value.onInputChange(null, ben.full_name, 'reset'); await env.flush();
  assert.equal(hook.value.inputValue, 'carol');
});

test('the current member label tracks loading when no search is in progress', async () => {
  const env = searchEnvironment(), hook = env.mount(null);
  hook.update(ada); await env.flush();
  assert.equal(hook.value.inputValue, ada.full_name);
  hook.update(ben); await env.flush();
  assert.equal(hook.value.inputValue, ben.full_name);
});

test('roster fetches ignore stale responses and do not restart when tabs or course queries change', async () => {
  const requests = [], patches = [];
  const env = environment('../src/components/student/workspace/useStudentWorkspaceState.ts', 'useStudentWorkspaceState', {
    '@/lib/supabaseClient': { supabase: {} },
    '@/lib/studentOverview': { fetchStudentProgressCourses: async () => [] },
  }, { fetch(url, options) { const work = deferred(); requests.push({ url, options, work }); return work.promise; } });
  const options = { mode: 'coach', tab: 'overview', selectedStudentId: 'ada', selectedCourseId: null, setQuery: patch => patches.push(patch) };
  const hook = env.mount(options); await env.flush();
  hook.update({ ...options, selectedStudentId: 'ben' }); await env.flush();
  assert.equal(requests[0].options.signal.aborted, true);
  requests[1].work.resolve({ ok: true, json: async () => ({ items: [ben], resolved_user_id: 'ben' }) }); await env.flush();
  requests[0].work.resolve({ ok: true, json: async () => ({ items: [ada], resolved_user_id: 'ada' }) }); await env.flush();
  assert.equal(hook.value.selectedStudent.id, 'ben');
  hook.update({ ...options, selectedStudentId: 'ben', tab: 'notes', selectedCourseId: 11 }); await env.flush();
  assert.equal(requests.length, 2);
  assert.equal(patches.length, 0);
});

test('an unavailable member clears appointment identifiers before selecting a fallback', async () => {
  const patches = [];
  const env = environment('../src/components/student/workspace/useStudentWorkspaceState.ts', 'useStudentWorkspaceState', {
    '@/lib/supabaseClient': { supabase: {} }, '@/lib/studentOverview': { fetchStudentProgressCourses: async () => [] },
  }, { fetch: async () => ({ ok: true, json: async () => ({ items: [ada], resolved_user_id: null }) }) });
  env.mount({ mode: 'coach', tab: 'notes', selectedStudentId: 'deleted', selectedCourseId: null, setQuery: patch => patches.push(patch) });
  await env.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(patches)), [{ userId: 'ada', noteId: null, meetingId: null, reviewId: null }]);
});

test('appointment links choose the exact requested record and stale links never open a different appointment', () => {
  const items = [{ id: 12 }, { id: 34 }];
  assert.equal(selectLinkedWorkspaceItem(items, 12, 34), 12);
  assert.equal(selectLinkedWorkspaceItem(items, 999, 34), null);
  assert.equal(selectLinkedWorkspaceItem(items, null, 34), 34);
  assert.equal(selectLinkedWorkspaceItem([], 12, null), null);
});

function implementationEnvironment() {
  const requests = [], router = {};
  const ui = new Proxy({}, { get: (_target, name) => name });
  const jsx = (type, props) => ({ type, props });
  const env = environment('../src/components/student/workspace/ImplementationTab.tsx', 'default', {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/navigation': { useRouter: () => router },
    '@mui/material': ui, '@mui/icons-material': ui,
    '@/components/coach/coaching-notes/CoachResourceSuggestionPanel': { default: 'CoachResourceSuggestionPanel' },
    '@/components/coach/UserWinsPanel': { default: 'UserWinsPanel' },
    './ImplementationMeetings': { default: 'ImplementationMeetings', implementationMeetingStatus: () => 'Not started' },
    './ImplementationBookingPanel': { default: 'ImplementationBookingPanel' },
    '@/lib/implementationMeetingSelection': { implementationLocalDate: () => '2026-10-09' },
    '@/lib/implementationNextMeeting': { getImplementationNextMeeting: () => null },
    '@/lib/implementationBookingConfirmation': {},
    '@/lib/workspaceLinkedSelection': { selectLinkedWorkspaceItem },
  }, {
    fetch(url, options) { const work = deferred(); requests.push({ url, options, work }); return work.promise; },
    window: { addEventListener() {}, removeEventListener() {}, location: { href: 'http://localhost/coach/students-overview' }, history: { state: null } },
    document: { addEventListener() {}, removeEventListener() {} },
  });
  return { ...env, requests };
}
const fixtureWorkspace = (noteId = 7) => ({
  selectedNoteId: noteId, suggestedMeetingId: 34, latestSessionId: null,
  activeCycleId: 'cycle', cycles: [{ id: 'cycle', noteId, cycleDate: '2026-10-01', kind: 'business_audit', cancelled: false }],
  meetings: [12, 34].map(id => ({ id, date: '2026-10-10', startsAt: null, timezone: 'America/Edmonton', session: null, cancelled: false, isFuture: true })),
  resources: [], actions: [], stepNotes: [], upcomingBusinessReview: null, canManageAttendance: true, bookingCoaches: {},
});
function findElement(tree, type) {
  if (!tree || typeof tree !== 'object') return null;
  if (Array.isArray(tree)) return tree.map(item => findElement(item, type)).find(Boolean) ?? null;
  return tree.type === type ? tree : findElement(tree.props?.children, type);
}

test('opening an implementation link loads its exact cycle and meeting without starting a session', async () => {
  const env = implementationEnvironment();
  const component = env.mount({ selectedStudentId: 'ada', requestedNoteId: 7, requestedMeetingId: 12 });
  await env.flush();
  assert.equal(env.requests.length, 1);
  assert.equal(env.requests[0].url, '/api/implementation-workspace?userId=ada&noteId=7');
  env.requests[0].work.resolve({ ok: true, json: async () => fixtureWorkspace() }); await env.flush();
  assert.equal(findElement(component.value, 'ImplementationMeetings').props.selectedMeetingId, 12);
  assert.equal(env.requests.length, 1, 'Previewing must not issue a POST or start a meeting');
});

test('a newer appointment link cancels the old request and ignores its late response', async () => {
  const env = implementationEnvironment();
  const component = env.mount({ selectedStudentId: 'ada', requestedNoteId: 7, requestedMeetingId: 12 });
  await env.flush();
  component.update({ selectedStudentId: 'ada', requestedNoteId: 8, requestedMeetingId: 34 }); await env.flush();
  assert.equal(env.requests[0].options.signal.aborted, true);
  env.requests[1].work.resolve({ ok: true, json: async () => fixtureWorkspace(8) }); await env.flush();
  env.requests[0].work.resolve({ ok: true, json: async () => fixtureWorkspace(7) }); await env.flush();
  assert.equal(findElement(component.value, 'ImplementationMeetings').props.selectedMeetingId, 34);
  assert.equal(findElement(component.value, 'ImplementationBookingPanel').props.noteId, 8);
  assert.equal(env.requests.length, 2);
});

test('an unavailable implementation appointment displays no selected meeting instead of another appointment', async () => {
  const env = implementationEnvironment();
  const component = env.mount({ selectedStudentId: 'ada', requestedNoteId: 7, requestedMeetingId: 999 });
  env.requests[0].work.resolve({ ok: true, json: async () => fixtureWorkspace() }); await env.flush();
  assert.equal(findElement(component.value, 'ImplementationMeetings').props.selectedMeetingId, null);
  assert.equal(findElement(component.value, 'ImplementationBookingPanel'), null);
  assert.match(JSON.stringify(component.value), /linked meeting is unavailable/);
  assert.equal(env.requests.length, 1);
});

function reviewEnvironment() {
  const requests = [];
  const jsx = (type, props) => ({ type, props });
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '@mui/material': new Proxy({}, { get: (_target, name) => name }),
    '@/lib/businessAuditConfig': { getBusinessAuditLocalDate: () => '2026-10-09' },
    '@/lib/businessReviews': { getBusinessReviewScorecards: () => [] },
    '@/lib/workspaceLinkedSelection': { selectLinkedWorkspaceItem },
  };
  for (const path of ['@mui/icons-material/AddRounded', '@mui/icons-material/CalendarMonth', '@mui/icons-material/CheckCircleRounded', '@mui/icons-material/ExpandMoreRounded', '@mui/icons-material/ReplayRounded', '@/components/KpiTracker', '@/components/coach/CoachingNotesPanel', '@/components/coach/coaching-notes/CoachResourceSuggestionPanel', '@/components/coach/UserWinsPanel', '@/components/coach/business-audit/FocusFinderChart', '@/components/coach/business-audit/SystemsScorecard']) {
    imports[path] = { default: path.split('/').at(-1) };
  }
  const env = environment('../src/components/student/workspace/BusinessAuditTab.tsx', 'default', imports, {
    fetch(url, options) { const work = deferred(); requests.push({ url, options, work }); return work.promise; },
  });
  return { ...env, requests };
}
const fixtureReviews = () => ({ dimensions: [], reviews: [12, 34].map(id => ({
  id, coachingNoteId: id + 100, reviewDate: id === 34 ? '2026-10-09' : '2026-09-01',
  createdAt: '2026-09-01T12:00:00Z', focusValues: [], additionalScorecards: [], status: 'draft',
})) });

test('a Business Review link selects its exact review instead of the default without writing', async () => {
  const env = reviewEnvironment();
  const component = env.mount({ selectedStudentId: 'ada', requestedReviewId: 12 });
  env.requests[0].work.resolve({ ok: true, json: async () => fixtureReviews() }); await env.flush();
  assert.equal(findElement(component.value, 'CoachingNotesPanel').props.fixedNoteId, 112);
  assert.equal(env.requests.length, 1);
  assert.equal(env.requests[0].options.method, undefined);
});

test('a member-form link opens the exact review’s preparation while ordinary workspace links keep it collapsed', async () => {
  const env = reviewEnvironment();
  const component = env.mount({ selectedStudentId: 'ada', requestedReviewId: 12, openPreparation: true });
  env.requests[0].work.resolve({ ok: true, json: async () => fixtureReviews() }); await env.flush();
  assert.equal(findElement(component.value, 'Accordion').props.expanded, true);
  assert.equal(findElement(component.value, 'CoachingNotesPanel').props.fixedNoteId, 112);
  assert.equal(env.requests.length, 1, 'Opening a member form must not write or create a review');
  component.update({ selectedStudentId: 'ada', requestedReviewId: 12, openPreparation: false }); await env.flush();
  assert.equal(findElement(component.value, 'Accordion').props.expanded, false);
  assert.equal(env.requests.length, 1);
});

test('same-member Business Review navigation ignores an older request even when it resolves last', async () => {
  const env = reviewEnvironment();
  const component = env.mount({ selectedStudentId: 'ada', requestedReviewId: 12 });
  component.update({ selectedStudentId: 'ada', requestedReviewId: 34 }); await env.flush();
  assert.equal(env.requests[0].options.signal.aborted, true);
  env.requests[1].work.resolve({ ok: true, json: async () => fixtureReviews() }); await env.flush();
  env.requests[0].work.resolve({ ok: true, json: async () => fixtureReviews() }); await env.flush();
  assert.equal(findElement(component.value, 'CoachingNotesPanel').props.fixedNoteId, 134);
});
