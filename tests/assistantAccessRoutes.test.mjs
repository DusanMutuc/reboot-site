import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const root = fileURLToPath(new URL('../', import.meta.url));
const assistantId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';

function fixture({ isAdmin = true, archivedStatus = null, restoreError = null, assignments = false } = {}) {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ operation: 'rpc', name, args: JSON.parse(JSON.stringify(args)) });
      return { data: null, error: restoreError };
    },
    from() { throw new Error('Restoration must use one database transaction, not direct role/tombstone writes.'); },
  };
  const imports = {
    'next/server': { NextRequest, NextResponse },
    '@/lib/requireAdmin': { async requireAdmin() {
      calls.push({ operation: 'authorize' });
      return isAdmin ? { ok: true, user: { id: 'admin' } }
        : { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    } },
    '@/lib/supabaseAdmin': { getAdminClient() { calls.push({ operation: 'client' }); return client; } },
    '@/lib/adminUserDirectory': { invalidateAdminUserDirectory() { calls.push({ operation: 'invalidate-directory' }); } },
    '@/lib/adminAccountGuard': { async archivedAccountWriteResponse(actualClient, id) {
      assert.equal(actualClient, client);
      calls.push({ operation: 'account-guard', id });
      return archivedStatus ? NextResponse.json({ error: 'Account unavailable' }, { status: archivedStatus }) : null;
    } },
  };
  const route = assignments ? 'assistant-assignments' : 'assign-assistant-role';
  const filename = path.join(root, `src/app/api/admin/${route}/route.ts`);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(`(function(exports,require){${code}\n})`, { URL }, { filename })(exports, (name) => {
    if (name in imports) return imports[name];
    throw new Error(`Unexpected import: ${name}`);
  });
  const post = (body = { user_id: assistantId }) => exports.POST(new NextRequest(`https://hub.example.invalid/api/admin/${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  const remove = (params = { user_id: memberId, assistant_id: assistantId }) => exports.DELETE(new NextRequest(
    `https://hub.example.invalid/api/admin/${route}?${new URLSearchParams(params)}`, { method: 'DELETE' },
  ));
  return { calls, post, remove };
}

test('an explicit admin grant restores assistant access through one atomic RPC after account checks', async () => {
  const env = fixture();
  const response = await env.post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(env.calls, [
    { operation: 'authorize' }, { operation: 'client' }, { operation: 'account-guard', id: assistantId },
    { operation: 'rpc', name: 'restore_assistant_access', args: { p_assistant_id: assistantId } },
  ]);
});

test('assistant restoration requires admin authorization before inspecting the target', async () => {
  const env = fixture({ isAdmin: false });
  assert.equal((await env.post()).status, 403);
  assert.deepEqual(env.calls, [{ operation: 'authorize' }]);
});

test('archived or unverifiable target accounts cannot have assistant access restored', async () => {
  for (const archivedStatus of [409, 503]) {
    const env = fixture({ archivedStatus });
    assert.equal((await env.post()).status, archivedStatus);
    assert.equal(env.calls.some((call) => call.operation === 'rpc'), false);
  }
});

test('missing assistant id is rejected before any database access', async () => {
  for (const body of [{}, { user_id: '' }, null]) {
    const env = fixture();
    assert.equal((await env.post(body)).status, 400);
    assert.deepEqual(env.calls, [{ operation: 'authorize' }]);
  }
});

test('a failed atomic restoration reports failure and does not fall back to direct role writes', async () => {
  const env = fixture({ restoreError: { message: 'Assistant role not found' } });
  const response = await env.post();
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Assistant role not found' });
  assert.equal(env.calls.filter((call) => call.operation === 'rpc').length, 1);
});

test('assistant assignment and replacement use one atomic RPC with the authorized actor', async () => {
  for (const replace of [undefined, true, false]) {
    const env = fixture({ assignments: true });
    const response = await env.post({ user_id: memberId, assistant_id: assistantId, ...(replace === undefined ? {} : { replace }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(env.calls, [
      { operation: 'authorize' }, { operation: 'client' },
      { operation: 'rpc', name: 'set_member_assistant_assignment', args: {
        p_member_id: memberId, p_assistant_id: assistantId, p_active: true,
        p_replace: replace !== false, p_assigned_by: 'admin',
      } },
      { operation: 'invalidate-directory' },
    ]);
  }
});

test('assistant removal atomically ends only the selected member relationship', async () => {
  const env = fixture({ assignments: true });
  assert.equal((await env.remove()).status, 200);
  assert.deepEqual(env.calls, [
    { operation: 'authorize' }, { operation: 'client' },
    { operation: 'rpc', name: 'set_member_assistant_assignment', args: {
      p_member_id: memberId, p_assistant_id: assistantId, p_active: false, p_replace: false,
    } },
    { operation: 'invalidate-directory' },
  ]);
});

test('assistant assignment writes require admin authorization before any database access', async () => {
  for (const method of ['post', 'remove']) {
    const env = fixture({ assignments: true, isAdmin: false });
    assert.equal((await env[method]({ user_id: memberId, assistant_id: assistantId })).status, 403);
    assert.deepEqual(env.calls, [{ operation: 'authorize' }]);
  }
});

test('incomplete assignment targets are rejected before any database write', async () => {
  for (const method of ['post', 'remove']) {
    for (const params of [{}, { user_id: memberId }, { assistant_id: assistantId }]) {
      const env = fixture({ assignments: true });
      assert.equal((await env[method](params)).status, 400);
      assert.deepEqual(env.calls, [{ operation: 'authorize' }]);
    }
  }
});

test('failed atomic assignment writes preserve the error and never invalidate or fall back to partial writes', async () => {
  for (const method of ['post', 'remove']) {
    const env = fixture({ assignments: true, restoreError: { message: 'Member access removed' } });
    const response = await env[method]({ user_id: memberId, assistant_id: assistantId });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Member access removed' });
    assert.deepEqual(env.calls.map((call) => call.operation), ['authorize', 'client', 'rpc']);
  }
});
