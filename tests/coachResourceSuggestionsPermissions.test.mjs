import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const memberId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1621';
const actorId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1622';
const otherId = 'bb8f369e-c343-4b6a-9c9c-5e15c54c1623';
const activeAssignment = { id: 1, user_id: memberId, coach_id: actorId, is_active: true, ended_at: null };

function apiFor({
  roles = ['implementation_coach'], assignments = [activeAssignment], authenticated = true,
  cycle = { id: 42, user_id: memberId }, rosterError = null,
} = {}) {
  const calls = [];
  const tables = { coaching_notes: cycle ? [cycle] : [], user_coaches: assignments,
    resources: [], coach_resource_suggestions: [] };
  const admin = {
    from(table) {
      assert.ok(Object.hasOwn(tables, table), `Unexpected table: ${table}`);
      const call = { table, operation: 'select' };
      calls.push(call);
      const filters = [];
      let count = Infinity;
      let single = false;
      const query = {
        select() { return query; },
        update() { call.operation = 'update'; return query; },
        eq(column, value) { filters.push(row => row[column] === value); return query; },
        is(column, value) { filters.push(row => row[column] === value); return query; },
        or(expression) {
          const alternatives = expression.split(',').map(part => {
            const [, column, operator, value] = part.match(/^([^.]+)\.([^.]+)\.(.+)$/);
            return row => operator === 'is' && value === 'null' ? row[column] === null
              : operator === 'gt' && row[column] !== null && row[column] > value;
          });
          filters.push(row => alternatives.some(matches => matches(row)));
          return query;
        },
        order() { return query; },
        limit(value) { count = value; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          const rows = tables[table].filter(row => filters.every(matches => matches(row))).slice(0, count);
          return Promise.resolve({ data: single ? rows[0] ?? null : rows,
            error: table === 'user_coaches' ? rosterError : null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const source = ts.transpileModule(fs.readFileSync(new URL('../src/app/api/coach-resource-suggestions/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const api = {};
  vm.runInNewContext(source, {
    exports: api, console: { ...console, error() {} },
    require(name) {
      if (name === '@/lib/requireUser') return { requireUser: async () => authenticated
        ? { ok: true, user: { id: actorId }, roleCodes: roles }
        : { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } };
      if (name === '@/lib/supabaseAdmin') return { getAdminClient: () => admin };
      return require(name);
    },
  });
  return {
    calls,
    get: () => api.GET(new NextRequest(`https://reboot.example/api/coach-resource-suggestions?user_id=${memberId}&coaching_note_id=42`)),
    post: () => api.POST(new NextRequest('https://reboot.example/api/coach-resource-suggestions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'remove', suggestionId: 'suggestion-1', userId: memberId, coachingNoteId: 42 }),
    })),
  };
}

async function assertDenied(options, status) {
  for (const method of ['get', 'post']) {
    const api = apiFor(options);
    assert.equal((await api[method]()).status, status, method);
    assert.ok(api.calls.every(call => ['coaching_notes', 'user_coaches'].includes(call.table)),
      'Denied requests must not read member suggestions, resource options, or mutate suggestions');
  }
}

test('both coach roles can read and change suggestions with an active, unexpired assignment', async () => {
  for (const role of ['coach', 'implementation_coach']) {
    for (const ended_at of [null, '2999-01-01T00:00:00.000Z']) {
      const api = apiFor({ roles: [role], assignments: [{ ...activeAssignment, ended_at }] });
      assert.equal((await api.get()).status, 200);
      assert.equal((await api.post()).status, 200);
      assert.ok(api.calls.some(call => call.table === 'coach_resource_suggestions' && call.operation === 'update'));
    }
  }
});

test('inactive, ended, absent, other-member and other-coach assignments cannot authorize either endpoint', async () => {
  for (const role of ['coach', 'implementation_coach']) {
    for (const assignments of [[],
      [{ ...activeAssignment, is_active: false }],
      [{ ...activeAssignment, ended_at: '2000-01-01T00:00:00.000Z' }],
      [{ ...activeAssignment, user_id: otherId }],
      [{ ...activeAssignment, coach_id: otherId }],
    ]) await assertDenied({ roles: [role], assignments }, 403);
  }
});

test('admin and superadmin keep access without a coach assignment', async () => {
  for (const role of ['admin', 'superadmin']) {
    const api = apiFor({ roles: [role], assignments: [] });
    assert.equal((await api.get()).status, 200);
    assert.equal((await api.post()).status, 200);
    assert.ok(api.calls.every(call => call.table !== 'user_coaches'));
  }
});

test('a roster entry alone does not grant a member or unrelated staff role access', async () => {
  for (const roles of [[], ['member'], ['helper']]) await assertDenied({ roles }, 403);
});

test('authentication, visible cycle ownership and authorization lookup failures fail closed', async () => {
  const unauthenticated = apiFor({ authenticated: false });
  assert.equal((await unauthenticated.get()).status, 401);
  assert.equal((await unauthenticated.post()).status, 401);
  assert.equal(unauthenticated.calls.length, 0);
  for (const cycle of [null, { id: 42, user_id: otherId }, { id: 43, user_id: memberId }]) {
    await assertDenied({ roles: ['admin'], cycle }, 404);
  }
  await assertDenied({ rosterError: { message: 'Roster unavailable' } }, 500);
});
