import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const source = '00000000-0000-4000-8000-000000000901';
const dest = '00000000-0000-4000-8000-000000000902';
const requestId = '00000000-0000-4000-8000-000000000903';
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/app/api/admin/transfer-user-data/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function load({ deniedStatus, identityError, email = ' Destination@Example.test ', lookup = { ok: true, contactId: 'destination-contact' }, rpcError, rpcData, replayData = null, replayError } = {}) {
  const calls = { clients: 0, identity: [], lookup: [], rpc: [], replay: [], invalidations: 0 };
  const client = {
    auth: { admin: { async getUserById(id) {
      calls.identity.push(id);
      return { data: { user: { id, email } }, error: identityError ?? null };
    } } },
    async rpc(name, args) {
      if (name === 'get_account_transfer_result_v2') {
        calls.replay.push({ name, args: JSON.parse(JSON.stringify(args)) });
        return { data: replayData, error: replayError ?? null };
      }
      calls.rpc.push({ name, args: JSON.parse(JSON.stringify(args)) });
      return { data: rpcData === undefined ? { dry_run: args._options.dry_run, counts: {} } : rpcData, error: rpcError ?? null };
    },
  };
  const imports = {
    '@/lib/requireAdmin': { async requireAdmin() {
      return deniedStatus ? { ok: false, res: NextResponse.json({ error: 'Denied' }, { status: deniedStatus }) } : { ok: true };
    } },
    '@/lib/supabaseAdmin': { getAdminClient() { calls.clients++; return client; } },
    '@/lib/adminUserDirectory': { invalidateAdminUserDirectory() { calls.invalidations++; } },
    '@/lib/ghlContactLookup': { async resolveGhlContactIdByEmail(value) { calls.lookup.push(value); return lookup; } },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, console, require: (name) => imports[name] ?? require(name) });
  return {
    calls,
    post(body = { source, dest }) {
      return exports.POST(new NextRequest('https://reboot.example/api/admin/transfer-user-data', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }));
    },
  };
}

for (const deniedStatus of [401, 403, 500]) {
  test(`transfer rejects guard ${deniedStatus} before identity/GHL/database access`, async () => {
    const route = load({ deniedStatus });
    assert.equal((await route.post()).status, deniedStatus);
    assert.equal(route.calls.clients, 0);
    assert.deepEqual(route.calls.lookup, []);
  });
}

for (const body of [null, [], { source: 42, dest }, { source, dest: source }, { source, dest: 'bad-id' },
  { source, dest, options: [] }, { source, dest, options: { dry_run: 'false' } },
  { source, dest, options: { reassign_authorship: 1 } }, { source, dest, options: { kpi_merge: 'delete' } },
  { source, dest, options: { smart_doc_conflict: 'invented' } }, { source, dest, options: { request_id: 'bad' } },
  { source, dest, options: { destination_ghl_contact_id: 'forged' } },
  { source, dest, options: { destination_email: 'forged@example.test' } },
  { source, dest, options: { dry_run: false } }]) {
  test(`transfer rejects invalid or client-supplied trusted options: ${JSON.stringify(body)}`, async () => {
    const route = load();
    assert.equal((await route.post(body)).status, 400);
    assert.equal(route.calls.clients, 0);
    assert.deepEqual(route.calls.rpc, []);
  });
}

test('dry run resolves Auth email and passes trusted contact to versioned RPC without invalidating cache', async () => {
  const route = load();
  const result = await route.post();
  assert.equal(result.status, 200);
  assert.deepEqual(route.calls.identity, [dest]);
  assert.deepEqual(route.calls.lookup, ['destination@example.test']);
  assert.deepEqual(route.calls.rpc, [{ name: 'transfer_user_data_admin_v2', args: {
    _source: source, _dest: dest, _options: {
      dry_run: true, kpi_merge: 'prefer_source', smart_doc_conflict: 'keep_latest_submitted', reassign_authorship: false,
      destination_email: 'destination@example.test', destination_ghl_contact_id: 'destination-contact',
    },
  } }]);
  assert.equal(route.calls.invalidations, 0);
});

test('live request preserves the retry ID and invalidates cached membership data after success', async () => {
  const route = load();
  const options = { dry_run: false, request_id: requestId, kpi_merge: 'skip', smart_doc_conflict: 'keep_dest', reassign_authorship: true };
  assert.equal((await route.post({ source, dest, options })).status, 200);
  assert.equal(route.calls.rpc[0].args._options.request_id, requestId);
  assert.equal(route.calls.rpc[0].args._options.kpi_merge, 'skip');
  assert.equal(route.calls.invalidations, 1);
  assert.equal(route.calls.replay[0].args._options.request_id, requestId);
});

for (const status of [409, 502, 503, 504]) {
  test(`GHL failure ${status} prevents all transfer writes`, async () => {
    const route = load({ lookup: { ok: false, status, error: 'Contact lookup failed' } });
    const response = await route.post({ source, dest, options: { dry_run: false, request_id: requestId } });
    assert.equal(response.status, status);
    assert.deepEqual(route.calls.rpc, []);
    assert.equal(route.calls.invalidations, 0);
  });
}

test('missing destination email blocks the lookup and copy', async () => {
  const route = load({ email: null });
  assert.equal((await route.post()).status, 409);
  assert.deepEqual(route.calls.lookup, []);
  assert.deepEqual(route.calls.rpc, []);
});

test('Auth service failure blocks the lookup and copy', async () => {
  const route = load({ identityError: { status: 503 } });
  assert.equal((await route.post()).status, 502);
  assert.deepEqual(route.calls.lookup, []);
  assert.deepEqual(route.calls.rpc, []);
});

for (const code of ['PGRST202', '42883']) {
  test(`missing migration ${code} reports update required without legacy fallback`, async () => {
    const route = load({ rpcError: { code, message: 'function missing' } });
    const response = await route.post();
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /database update/);
    assert.equal(route.calls.rpc.length, 1);
  });
}

test('SQL conflict is reported without claiming success or invalidating cache', async () => {
  const route = load({ rpcError: { code: 'P0001', message: 'Destination email changed' } });
  const response = await route.post({ source, dest, options: { dry_run: false, request_id: requestId } });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Destination email changed');
  assert.equal(route.calls.invalidations, 0);
});

for (const rpcData of [null, { ok: true }, { dry_run: true }]) {
  test(`unconfirmed live RPC outcome does not claim success: ${JSON.stringify(rpcData)}`, async () => {
    const route = load({ rpcData });
    assert.equal((await route.post({ source, dest, options: { dry_run: false, request_id: requestId } })).status, 502);
    assert.equal(route.calls.invalidations, 0);
  });
}

test('completed attempts replay despite unavailable Auth/GHL without running another copy', async () => {
  const replayData = { dry_run: false, request_id: requestId, counts: { general_coaching_notes: { copied: 2 } } };
  const route = load({ replayData, identityError: { status: 503 }, lookup: { ok: false, status: 504, error: 'GHL unavailable' } });
  const response = await route.post({ source, dest, options: { dry_run: false, request_id: requestId } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), replayData);
  assert.deepEqual(route.calls.identity, []);
  assert.deepEqual(route.calls.lookup, []);
  assert.deepEqual(route.calls.rpc, []);
  assert.equal(route.calls.invalidations, 1);
});

for (const replayError of [{ code: 'PGRST202', message: 'Function missing' }, { code: '22023', message: 'Request parameters differ' }]) {
  test(`unverifiable replay fails before lookup or copy: ${replayError.code}`, async () => {
    const route = load({ replayError });
    const response = await route.post({ source, dest, options: { dry_run: false, request_id: requestId } });
    assert.equal(response.status, replayError.code === 'PGRST202' ? 503 : 400);
    assert.deepEqual(route.calls.identity, []);
    assert.deepEqual(route.calls.lookup, []);
    assert.deepEqual(route.calls.rpc, []);
  });
}
