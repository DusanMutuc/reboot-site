import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { renderComponent } from './helpers/componentHarness.mjs';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const root = fileURLToPath(new URL('../', import.meta.url));
const old = '00000000-0000-4000-8000-000000000001';
const middle = '00000000-0000-4000-8000-000000000002';
const current = '00000000-0000-4000-8000-000000000003';
const past = '00000000-0000-4000-8000-000000000004';
const programme = '00000000-0000-4000-8000-000000000005';
const actor = '00000000-0000-4000-8000-000000000006';
const mergedAt = '2026-10-10T10:00:00Z';

function fixture() {
  const profile = (id, first_name, merged_into_user_id = null) => ({
    id, first_name, last_name: 'Member', ghl_user_id: null, introduced_at: null, created_at: null,
    merged_into_user_id, merged_at: merged_into_user_id ? mergedAt : null,
  });
  const profiles = [profile(old, 'Original', middle), profile(middle, 'Previous', current), profile(current, 'Current'), profile(past, 'Past'), profile(programme, 'Programme'), profile(actor, 'Admin')];
  const merge = (source_user_id, dest_user_id, source_email) => ({
    source_user_id, dest_user_id, actor_user_id: actor, source_email, dest_email: `${dest_user_id}@example.test`, merged_at: mergedAt,
    source_snapshot: { profile: { first_name: 'Original', last_name: 'Member', ghl_user_id: 'old-ghl-user', ghl_contact_id: 'old-ghl-contact' }, auth: { phone: '1234' }, private_internal_field: 'do not expose' },
  });
  return {
    profiles,
    roles: [{ id: 1, code: 'user' }, { id: 2, code: 'ninety-day-user' }, { id: 3, code: 'legend' }, { id: 4, code: 'past_member' }],
    user_roles: [{ user_id: current, role_id: 1 }, { user_id: past, role_id: 1 }, { user_id: past, role_id: 4 }, { user_id: programme, role_id: 2 }],
    user_coaches: [], user_assistants: [], partnership_users: [], partnerships: [],
    account_merges: [merge(old, middle, 'old-email@example.test'), merge(middle, current, 'middle-email@example.test')],
    authUsers: profiles.map((item) => ({ id: item.id, email: item.id === current ? 'current@example.test' : `${item.first_name.toLowerCase()}@example.test`, phone: null })),
  };
}

function load({ tables = fixture(), deniedStatus = null, failMerges = false } = {}) {
  const calls = { clients: 0, mergePages: [] };
  const client = {
    from(table) {
      const filters = [];
      let start = 0; let end = Infinity;
      const result = () => {
        if (table === 'account_merges' && failMerges) return { data: null, error: { message: 'History unavailable' } };
        return { data: (tables[table] ?? []).filter((row) => filters.every((predicate) => predicate(row))).slice(start, end + 1), error: null };
      };
      const builder = {
        select() { return builder; },
        eq(field, value) { filters.push((row) => row[field] === value); return builder; },
        in(field, values) { filters.push((row) => values.includes(row[field])); return builder; },
        order() { return builder; },
        range(first, last) { start = first; end = last; if (table === 'account_merges') calls.mergePages.push([first, last]); return builder; },
        maybeSingle() { const value = result(); return Promise.resolve({ ...value, data: value.data?.[0] ?? null }); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return builder;
    },
    auth: { admin: {
      async listUsers({ page, perPage }) { return { data: { users: tables.authUsers.slice((page - 1) * perPage, page * perPage) }, error: null }; },
      async getUserById(id) { return { data: { user: tables.authUsers.find((user) => user.id === id) ?? null }, error: null }; },
    } },
  };
  const mocks = {
    '@/lib/supabaseAdmin': { getAdminClient() { calls.clients++; return client; } },
    '@/lib/currentMembers': { async fetchCurrentMemberUserIdSet() { return new Set([current, old]); } },
    '@/lib/memberPauses': { async loadMemberPauses() { return new Map(); }, activePause() { return null; } },
    '@/lib/requireAdmin': { async requireAdmin() { return deniedStatus ? { ok: false, res: NextResponse.json({ error: 'Denied' }, { status: deniedStatus }) } : { ok: true }; } },
    'next/server': { NextRequest, NextResponse },
  };
  const modules = new Map();
  const context = vm.createContext({ console, Error, URL });
  function moduleFor(filename) {
    if (modules.has(filename)) return modules.get(filename);
    const output = ts.transpileModule(fs.readFileSync(path.join(root, filename), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const exports = {};
    modules.set(filename, exports);
    const dependencies = (name) => mocks[name] ?? (name.startsWith('@/') ? moduleFor(`src/${name.slice(2)}.ts`) : require(name));
    vm.runInContext(`(function(exports, require) { ${output}\n})`, context)(exports, dependencies);
    return exports;
  }
  return { calls, tables, client, moduleFor };
}

test('directory keeps merged separate from past membership and hides archives by default', async () => {
  const { moduleFor } = load();
  const { getAdminUserDirectoryPage: page } = moduleFor('src/lib/adminUserDirectory.ts');
  assert.deepEqual(Array.from((await page('', 1, 100)).items, (row) => row.id).sort(), [current, past, programme].sort());
  assert.deepEqual(Array.from((await page('', 1, 100, { membership: 'current' })).items, (row) => row.id), [current]);
  assert.deepEqual(Array.from((await page('', 1, 100, { membership: 'past' })).items, (row) => row.id), [past]);
  const archived = (await page('', 1, 100, { membership: 'merged' })).items;
  assert.equal(archived.length, 2, 'sources remain discoverable after their roles are removed');
  assert.ok(archived.every((row) => !row.is_past_member && !row.is_current_member && row.merged_at));
  assert.equal((await page('', 1, 100, { membership: 'all' })).total, 5);
});

test('historical email and GHL searches resolve chained merges to the current profile without replacing its login email', async () => {
  const { moduleFor } = load();
  const { getAdminUserDirectoryPage: page } = moduleFor('src/lib/adminUserDirectory.ts');
  for (const query of ['OLD-EMAIL@example.test', 'middle-email@example.test', 'old-ghl-contact']) {
    const result = await page(query, 1, 100, { membership: 'current' });
    assert.equal(result.total, 1);
    assert.equal(result.items[0].id, current);
    assert.equal(result.items[0].email, 'current@example.test');
  }
});

test('merge ledger reads every page and refuses an unavailable history source', async () => {
  const tables = fixture();
  tables.account_merges = Array.from({ length: 501 }, (_, index) => ({ ...tables.account_merges[0], source_user_id: String(index) }));
  const app = load({ tables });
  const helpers = app.moduleFor('src/lib/adminAccountMerges.ts');
  assert.equal((await helpers.fetchAdminAccountMerges()).length, 501);
  assert.deepEqual(app.calls.mergePages, [[0, 499], [500, 999]]);
  const broken = load({ failMerges: true }).moduleFor('src/lib/adminUserDirectory.ts');
  await assert.rejects(broken.getAdminUserDirectoryPage('', 1, 100), /History unavailable/);
});

test('history API authorizes before reading private merge snapshots', async () => {
  for (const deniedStatus of [401, 403, 500]) {
    const app = load({ deniedStatus });
    const route = app.moduleFor('src/app/api/admin/users/[userId]/merge-history/route.ts');
    const response = await route.GET(new NextRequest('https://reboot.example/api/admin/users/x/merge-history'), { params: Promise.resolve({ userId: old }) });
    assert.equal(response.status, deniedStatus);
    assert.equal(app.calls.clients, 0);
  }
});

test('history API returns archived source, current destination, prior identifiers and admin, never full snapshots', async () => {
  const app = load();
  const route = app.moduleFor('src/app/api/admin/users/[userId]/merge-history/route.ts');
  const response = await route.GET(new NextRequest('https://reboot.example/api/admin/users/x/merge-history'), { params: Promise.resolve({ userId: old }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.profile.merged_at, mergedAt);
  assert.equal(body.profile.is_past_member, false);
  assert.equal(body.current_account.id, current);
  assert.equal(body.history.length, 2);
  assert.equal(body.history[0].source_ghl_user_id, 'old-ghl-user');
  assert.equal(body.history[0].source_ghl_contact_id, 'old-ghl-contact');
  assert.equal(body.history[0].actor.name, 'Admin Member');
  assert.equal(body.history[0].actor.email, 'admin@example.test');
  assert.doesNotMatch(JSON.stringify(body), /source_snapshot|private_internal_field/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('users list only includes archives on explicit merged or all selection', async () => {
  const app = load();
  const route = app.moduleFor('src/app/api/admin/users/route.ts');
  for (const [membership, expected] of [['', 3], ['nonsense', 3], ['merged', 2], ['all', 5]]) {
    const response = await route.GET(new NextRequest(`https://reboot.example/api/admin/users?membership=${membership}`));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).total, expected);
  }
});

function descendants(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => descendants(child, predicate));
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [...(predicate(node) ? [node] : []), ...Object.values(node.props).flatMap((child) => descendants(child, predicate))];
}

async function mountDirectory(options = {}) {
  const app = load(options);
  const directory = app.moduleFor('src/lib/adminUserDirectory.ts');
  const historyRoute = app.moduleFor('src/app/api/admin/users/[userId]/merge-history/route.ts');
  const requests = [];
  const ui = renderComponent('src/components/admin/UserProfilesAdmin.tsx', {}, {
    './MemberProgrammeSettings': { default: 'MemberProgrammeSettings' },
  }, {
    URL,
    window: { location: { origin: 'https://reboot.example' }, setTimeout(callback) { queueMicrotask(callback); return 1; }, clearTimeout() {} },
    async fetch(url, options = {}) {
      requests.push({ url: String(url), method: options.method ?? 'GET' });
      const parsed = new URL(url, 'https://reboot.example');
      if (parsed.pathname === '/api/admin/users') {
        const result = await directory.getAdminUserDirectoryPage(parsed.searchParams.get('query') ?? '', 1, 100, { membership: parsed.searchParams.get('membership') });
        return { ok: true, async json() { return result; } };
      }
      const match = /^\/api\/admin\/users\/([^/]+)\/merge-history$/.exec(parsed.pathname);
      assert.ok(match, `Unexpected fetch: ${url}`);
      return historyRoute.GET(new NextRequest(parsed), { params: Promise.resolve({ userId: match[1] }) });
    },
  });
  await ui.flush();
  return { ui, requests };
}

test('merged profile drawer is read-only and navigates to the current account with historical identities', async () => {
  const { ui, requests } = await mountDirectory();
  const filter = ui.all((node) => node.type === 'ToggleButtonGroup' && node.props['aria-label'] === 'Membership filter')[0];
  await ui.act(() => filter.props.onChange(null, 'merged'));
  const row = ui.all((node) => node.type === 'TableRow' && node.props.onClick)[0];
  await ui.act(() => row.props.onClick());
  let drawer = ui.all((node) => node.type === 'Drawer')[0];
  const namedButton = (name) => descendants(drawer, (node) => (node.type === 'Button' || node.type === 'LoadingButton') && node.props.children === name);
  const inputs = descendants(drawer, (node) => node.type === 'TextField');
  assert.ok(inputs.length >= 5);
  assert.ok(inputs.every((node) => node.props.slotProps?.input?.readOnly));
  assert.equal(namedButton('Save changes').length, 0);
  assert.equal(namedButton('Send password recovery').length, 0);
  assert.equal(namedButton('Delete member').length, 0);
  assert.equal(descendants(drawer, (node) => node.type === 'MemberProgrammeSettings').length, 0);
  assert.match(ui.text(), /Merged into Current Member/);
  const firstName = inputs.find((node) => node.props.label === 'First name');
  await ui.act(() => firstName.props.onChange({ target: { value: 'Forbidden change' } }));
  assert.doesNotMatch(ui.text(), /Forbidden change/);
  await ui.act(() => namedButton('Open current account')[0].props.onClick());
  drawer = ui.all((node) => node.type === 'Drawer')[0];
  const email = descendants(drawer, (node) => node.type === 'TextField' && node.props.label === 'Email')[0];
  assert.equal(email.props.value, 'current@example.test');
  assert.equal(namedButton('Save changes').length, 1);
  assert.match(ui.text(), /old-email@example.test/);
  assert.match(ui.text(), /old-ghl-user/);
  assert.match(ui.text(), /old-ghl-contact/);
  assert.match(ui.text(), /Admin Member/);
  assert.equal(namedButton('View old profile').length, 2);
  await ui.act(() => namedButton('View old profile')[0].props.onClick());
  drawer = ui.all((node) => node.type === 'Drawer')[0];
  assert.equal(namedButton('Save changes').length, 0);
  assert.ok(requests.every((request) => request.method === 'GET'), 'inspection must not issue a write');
});

test('history distinguishes system maintenance from a former administrator without exposing snapshot metadata', async () => {
  const tables = fixture();
  tables.account_merges[0].actor_user_id = null;
  tables.account_merges[0].source_snapshot.execution_actor = 'system';
  tables.account_merges[1].actor_user_id = null;
  tables.account_merges[1].source_snapshot.execution_actor = 'private unknown value';
  const app = load({ tables });
  const route = app.moduleFor('src/app/api/admin/users/[userId]/merge-history/route.ts');
  const response = await route.GET(new NextRequest('https://reboot.example/api/admin/users/x/merge-history'), { params: Promise.resolve({ userId: current }) });
  const body = await response.json();
  assert.equal(body.history.find((item) => item.source_user_id === old).execution_actor, 'system');
  assert.equal(body.history.find((item) => item.source_user_id === middle).execution_actor, 'administrator');
  assert.doesNotMatch(JSON.stringify(body), /source_snapshot|private unknown value|private_internal_field/);
  const { ui } = await mountDirectory({ tables });
  const filter = ui.all((node) => node.type === 'ToggleButtonGroup' && node.props['aria-label'] === 'Membership filter')[0];
  await ui.act(() => filter.props.onChange(null, 'merged'));
  const row = ui.all((node) => node.type === 'TableRow' && node.props.onClick)[0];
  await ui.act(() => row.props.onClick());
  assert.match(ui.text(), /By System maintenance/);
  assert.match(ui.text(), /By Former administrator/);
});
