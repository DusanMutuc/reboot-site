import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const migration = 'supabase/migrations/20261009133612_revoke_past_member_assistant_access.sql';
const baselineFunction = (sql, name) => {
  const found = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION "public"\\."${name}"[\\s\\S]*?\\$\\$;`, 'i'));
  assert.ok(found, `Missing shipped function: ${name}`);
  return found[0];
};
const functionDefinition = (sql, name) => {
  const found = sql.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'));
  assert.ok(found, `Missing shipped function: ${name}`);
  return found[0];
};

// Run with PGLITE_PACKAGE_DIR pointing to an installed @electric-sql/pglite.
// One isolated PostgreSQL instance keeps this usable without Docker or live data.
test('past-member assistant removal and service access workflows execute atomically in PostgreSQL', {
  skip: !process.env.PGLITE_PACKAGE_DIR, timeout: 180000,
}, async (t) => {
  const { PGlite } = await import(pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, 'dist/index.js')).href);
  const db = new PGlite();
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
  const grant = (id, code) => rows('insert into user_roles(user_id,role_id) select $1,id from roles where code=$2 on conflict do nothing', [uid(id), code]);
  const has = (id, code) => scalar('select exists(select 1 from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=$1 and r.code=$2)', [uid(id), code]);
  const revoked = (id) => scalar('select exists(select 1 from assistant_access_revocations where assistant_id=$1)', [uid(id)]);
  const subject = async (id, codes = []) => {
    await rows('insert into auth.users(id,email) values($1,$2)', [uid(id), `test-${id}@example.invalid`]);
    await rows('insert into profiles(id,first_name) values($1,$2)', [uid(id), `Test ${id}`]);
    for (const code of codes) await grant(id, code);
  };
  const assign = (member, assistant, active = true, endedAt = null) => scalar(`insert into user_assistants
    (user_id,assistant_id,is_active,assigned_at,ended_at,notes) values($1,$2,$3,'2025-01-01',$4,'History must survive') returning id`,
  [uid(member), uid(assistant), active, endedAt]);
  const assignment = async (id) => (await rows('select * from user_assistants where id=$1', [id]))[0];
  const markMerged = async (id) => {
    await rows('insert into account_merges(source_user_id) values($1)', [uid(id)]);
    await rows('update profiles set merged_at=now() where id=$1', [uid(id)]);
  };
  const restore = (id) => scalar('select public.restore_assistant_access($1)', [uid(id)]);
  const autoGrant = (id) => scalar('select public.grant_assistant_access_if_allowed($1)', [uid(id)]);
  const setAssignment = (member, assistant, active = true, replace = false) => scalar(
    'select public.set_member_assistant_assignment($1,$2,$3,$4,$5)', [uid(member), uid(assistant), active, replace, uid(900)]);
  const as = async (role, id = null) => {
    await db.exec('reset role');
    await rows("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false)", [role, id === null ? '' : uid(id)]);
    await db.exec(`set role ${role}; set row_security=on;`);
  };
  const asOwner = async () => {
    await db.exec('reset role');
    await rows("select set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claim.sub','',false)");
  };
  const rejected = async (fn, expected) => {
    await db.exec('savepoint expected_failure');
    try { await assert.rejects(fn, expected); }
    finally { await db.exec('rollback to savepoint expected_failure; release savepoint expected_failure'); }
  };
  const isolated = (name, fn) => t.test(name, async () => {
    await asOwner(); await db.exec('begin');
    try { await fn(); }
    finally { await db.exec('rollback; reset role'); }
  });
  const state = async () => {
    const result = {};
    for (const table of ['user_roles', 'user_assistants', 'assistant_access_revocations']) {
      result[table] = await rows(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`);
    }
    return result;
  };
  try {
    await db.exec(await read('tests/fixtures/pastMemberAssistantAccess.sql'));
    const baseline = await read('supabase/migrations/20260826000000_remote_schema.sql');
    for (const fn of ['is_admin', 'has_role', 'is_assistant', 'user_has_role', 'enforce_user_assistants_assistant_role']) {
      await db.exec(baselineFunction(baseline, fn));
    }
    await db.exec(`create trigger trg_user_assistants_assistant_role before insert or update of assistant_id,is_active
      on user_assistants for each row execute function enforce_user_assistants_assistant_role();`);
    const archive = await read('supabase/migrations/20261008010000_archive_merged_accounts.sql');
    for (const fn of ['account_is_not_merged', 'reject_merged_member_write']) await db.exec(functionDefinition(archive, fn));
    for (const table of ['user_roles', 'user_assistants']) {
      await db.exec(`create trigger reject_merged_member_write before insert or update or delete on ${table}
        for each row execute function reject_merged_member_write('user_id');`);
    }
    const access = await read('supabase/migrations/20261008020000_content_access_and_progress.sql');
    await db.exec(functionDefinition(access, 'content_membership_kind'));
    const priorPolicies = access.match(/revoke insert,update,delete,truncate,references,trigger on public\.roles[\s\S]*?end \$role_writes\$;/i)?.[0];
    assert.ok(priorPolicies, 'Use the shipped prior entitlement policies');
    await db.exec(priorPolicies);

    // Seed legacy cases before the migration installs its assignment guards.
    await asOwner();
    await subject(900, ['admin']);
    await subject(901, ['user']);
    await subject(800, ['user', 'past_member']);
    await subject(801, ['user']);
    await subject(810, ['assistant']);
    await subject(811, ['assistant']);
    await subject(812, ['assistant']);
    await subject(813, ['assistant']);
    const backfillLive = await assign(800, 810);
    const backfillEnded = await assign(800, 811, false, '2025-04-01');
    const backfillExpired = await assign(800, 812, true, '2025-04-01');
    const backfillShared = await assign(800, 813);
    const backfillOther = await assign(801, 813);
    const historicalBefore = [await assignment(backfillEnded), await assignment(backfillExpired)];
    await db.exec(await read(migration));

    await isolated('backfill removes only live past-member assignments and preserves other current sponsors', async () => {
      for (const id of [backfillLive, backfillShared]) {
        const row = await assignment(id);
        assert.equal(row.is_active, false);
        assert.ok(row.ended_at);
        assert.equal(row.notes, 'History must survive');
      }
      assert.equal(await has(810, 'assistant'), false);
      assert.equal(await revoked(810), true);
      assert.deepEqual([await assignment(backfillEnded), await assignment(backfillExpired)],
        historicalBefore.map((row) => ({ ...row, is_active: false })));
      for (const id of [811, 812, 813]) {
        assert.equal(await has(id, 'assistant'), true);
        assert.equal(await revoked(id), false);
      }
      assert.equal((await assignment(backfillOther)).is_active, true);
    });

    await isolated('adding past_member ends every live assignment while preserving history and unrelated roles', async () => {
      await subject(1, ['user', 'legend']);
      await subject(2, ['assistant', 'coach']);
      await subject(3, ['assistant']);
      const ids = [await assign(1, 2), await assign(1, 3, true, '2100-01-01')];
      const before = await Promise.all(ids.map(assignment));
      await grant(1, 'past_member');
      for (const [index, id] of ids.entries()) {
        const after = await assignment(id);
        assert.equal(after.is_active, false);
        assert.ok(after.ended_at);
        assert.ok(new Date(after.ended_at).getTime() < Date.now() + 10000);
        assert.deepEqual({ ...after, is_active: before[index].is_active, ended_at: before[index].ended_at }, before[index]);
      }
      for (const id of [2, 3]) {
        assert.equal(await has(id, 'assistant'), false);
        assert.equal(await has(id, 'past_member'), false);
        assert.equal(await revoked(id), true);
        assert.equal(await scalar('select member_id from assistant_access_revocations where assistant_id=$1', [uid(id)]), uid(1));
        assert.equal(await scalar('select count(*)::int from auth.users where id=$1', [uid(id)]), 1);
      }
      assert.equal(await has(2, 'coach'), true);
      assert.equal(await has(1, 'legend'), true);
      const after = await state();
      await grant(1, 'past_member');
      assert.deepEqual(await state(), after, 'Retrying a past-member assignment is idempotent');
    });

    await isolated('changing an existing role to past_member invokes the same removal', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']);
      const id = await assign(1, 2);
      await rows(`update user_roles set role_id=(select id from roles where code='past_member')
        where user_id=$1 and role_id=(select id from roles where code='user')`, [uid(1)]);
      assert.equal((await assignment(id)).is_active, false);
      assert.equal(await has(2, 'assistant'), false);
    });

    await isolated('moving a past-member role row to another account removes that account assistants', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']); await subject(3, ['past_member']);
      const id = await assign(1, 2);
      await rows('update user_roles set user_id=$1 where user_id=$2', [uid(1), uid(3)]);
      assert.equal((await assignment(id)).is_active, false);
      assert.equal(await revoked(2), true);
    });

    await isolated('a second current paused sponsor with a future end retains access until the last sponsor leaves', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']); await subject(3, ['user']);
      await assign(1, 2); const retained = await assign(3, 2, true, '2100-01-01');
      await rows("insert into member_pauses(user_id,starts_on,ends_on) values($1,current_date-1,current_date+30)", [uid(3)]);
      await grant(1, 'past_member');
      assert.equal(await has(2, 'assistant'), true);
      assert.equal(await revoked(2), false);
      assert.equal((await assignment(retained)).is_active, true);
      await grant(3, 'past_member');
      assert.equal(await has(2, 'assistant'), false);
      assert.equal(await revoked(2), true);
    });

    for (const other of ['expired', 'nonmember', 'merged']) {
      await isolated(`another ${other} sponsor does not keep assistant access`, async () => {
        await subject(1, ['user']); await subject(2, ['assistant']); await subject(3, ['user']);
        await assign(1, 2);
        await assign(3, 2, true, other === 'expired' ? '2025-01-02' : null);
        if (other === 'nonmember') await rows('delete from user_roles where user_id=$1', [uid(3)]);
        if (other === 'merged') await markMerged(3);
        await grant(1, 'past_member');
        assert.equal(await has(2, 'assistant'), false);
        assert.equal(await revoked(2), true);
      });
    }

    await isolated('historical relationship dates survive and expired links do not revoke historical assistants', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']); await subject(3, ['assistant']);
      const ids = [await assign(1, 2, false, '2025-01-02'), await assign(1, 3, true, '2025-01-03')];
      const before = await Promise.all(ids.map(assignment));
      await grant(1, 'past_member');
      assert.deepEqual(await Promise.all(ids.map(assignment)), before.map((row) => ({ ...row, is_active: false })));
      for (const id of [2, 3]) { assert.equal(await has(id, 'assistant'), true); assert.equal(await revoked(id), false); }
    });

    await isolated('automation cannot restore a removed assistant, while a new assistant can receive access', async () => {
      await subject(1, ['user']); await subject(2, ['assistant', 'coach']); await subject(3, ['assistant']);
      await assign(1, 2); await grant(1, 'past_member');
      await subject(4);
      await as('service_role');
      assert.equal(await autoGrant(2), false);
      assert.equal(await autoGrant(2), false, 'Webhook retries remain blocked');
      assert.equal(await autoGrant(4), true);
      assert.equal(await has(4, 'assistant'), true);
      assert.equal(await has(2, 'assistant'), false);
      assert.equal(await has(2, 'coach'), true);
    });

    await isolated('sponsor reactivation never restores assistant access; explicit admin restoration does', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']);
      const oldAssignment = await assign(1, 2); await grant(1, 'past_member');
      await rows(`delete from user_roles where user_id=$1 and role_id=(select id from roles where code='past_member')`, [uid(1)]);
      assert.equal(await has(2, 'assistant'), false); assert.equal(await revoked(2), true);
      await as('service_role');
      assert.equal(await autoGrant(2), false);
      await restore(2);
      assert.equal(await has(2, 'assistant'), true);
      await asOwner();
      assert.equal(await revoked(2), false);
      assert.equal((await assignment(oldAssignment)).is_active, false);
      await as('service_role'); await setAssignment(1, 2);
      assert.equal(await scalar('select count(*)::int from user_assistants where user_id=$1 and assistant_id=$2 and is_active', [uid(1), uid(2)]), 1);
    });

    await isolated('new active assignments reject past, nonmember, and merged sponsors', async () => {
      await subject(1, ['user', 'past_member']); await subject(2, ['assistant']);
      await subject(3, ['coach']); await subject(4, ['user']); await markMerged(4);
      await subject(5, ['ninety-day-user']);
      await as('service_role');
      for (const id of [1, 3, 4, 5]) await rejected(() => setAssignment(id, 2), /member|merged|sponsor/i);
    });

    await isolated('reactivation and sponsor reassignment validate eligibility, and revoked assistants cannot be assigned', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']); await subject(3, ['user']);
      const live = await assign(1, 2);
      const historical = await assign(3, 2, false, '2025-01-02');
      await grant(3, 'past_member');
      await as('service_role');
      await rejected(() => setAssignment(3, 2), /member|sponsor/i);
      assert.equal((await assignment(live)).is_active, true);
      assert.equal((await assignment(historical)).is_active, false);
      await asOwner();
      await grant(1, 'past_member');
      await subject(4, ['user']);
      await as('service_role');
      await rejected(() => setAssignment(4, 2), /assistant|restor|revok/i);
    });

    await isolated('an archived assistant keeps immutable history without blocking their sponsor offboarding', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']); await subject(3, ['assistant']);
      const archivedLink = await assign(1, 2); const ordinaryLink = await assign(1, 3);
      await markMerged(2);
      await grant(1, 'past_member');
      assert.equal((await assignment(archivedLink)).is_active, false);
      assert.equal((await assignment(ordinaryLink)).is_active, false);
      assert.equal(await has(2, 'assistant'), true, 'Archived role history is immutable and account access is already removed');
      assert.equal(await has(3, 'assistant'), false);
      assert.equal(await revoked(2), false);
    });

    await isolated('assignment replacement is atomic, preserves prior history, and repeated assignments are idempotent', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']); await subject(3, ['assistant']);
      await subject(4, ['user']);
      const previousId = await assign(1, 2);
      const previous = await assignment(previousId);
      await as('service_role');
      await rejected(() => setAssignment(1, 4, true, true), /assistant/i);
      assert.deepEqual(await assignment(previousId), previous);
      await setAssignment(1, 3, true, true);
      const ended = await assignment(previousId);
      assert.equal(ended.is_active, false); assert.ok(ended.ended_at);
      assert.equal(ended.notes, previous.notes);
      assert.equal(ended.assigned_at.getTime(), previous.assigned_at.getTime());
      const activeId = await scalar('select id from user_assistants where user_id=$1 and assistant_id=$2 and is_active', [uid(1), uid(3)]);
      await setAssignment(1, 3, true, true);
      assert.equal(await scalar('select count(*)::int from user_assistants where user_id=$1 and assistant_id=$2', [uid(1), uid(3)]), 1);
      assert.equal(await scalar('select assigned_by from user_assistants where id=$1', [activeId]), uid(900));
      await setAssignment(1, 3, false);
      assert.equal((await assignment(activeId)).is_active, false);
      assert.equal(await has(3, 'assistant'), true, 'Routine assignment removal is separate from past-member offboarding');
    });

    await isolated('failed restoration retains the revocation marker and cannot restore past or archived assistant accounts', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']); await assign(1, 2);
      await grant(1, 'past_member'); await grant(2, 'past_member');
      await as('service_role');
      await rejected(() => restore(2), /eligible/i);
      assert.equal(await revoked(2), true);
      assert.equal(await has(2, 'assistant'), false);
      await asOwner();
      await rows(`delete from user_roles where user_id=$1 and role_id=(select id from roles where code='past_member')`, [uid(2)]);
      await markMerged(2); await as('service_role');
      await rejected(() => restore(2), /eligible/i);
      assert.equal(await revoked(2), true);
    });

    await isolated('a failed assistant-role deletion rolls the member change and every side effect back', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']); await assign(1, 2);
      const before = await state();
      await db.exec(`create function reject_test_assistant_removal() returns trigger language plpgsql as $$
        begin if old.user_id='${uid(2)}' then raise exception 'Synthetic downstream failure'; end if; return old; end $$;
        create trigger reject_test_assistant_removal before delete on user_roles
          for each row execute function reject_test_assistant_removal();`);
      await rejected(() => grant(1, 'past_member'), /Synthetic downstream failure/);
      assert.deepEqual(await state(), before);
      assert.equal(await has(1, 'past_member'), false);
    });

    await isolated('ordinary authenticated clients retain existing reads but cannot call service access workflows or mutate markers', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']); const id = await assign(1, 2);
      await subject(3, ['user']); await subject(4, ['assistant']); await assign(3, 4); await grant(3, 'past_member');
      const before = await state();
      await as('authenticated', 901);
      assert.equal(await has(1, 'user'), true);
      assert.ok(await assignment(id));
      await rejected(() => autoGrant(4), /permission|policy|denied|admin/i);
      await rejected(() => setAssignment(1, 2, false), /permission|policy|denied|admin/i);
      await rejected(() => restore(4), /permission|policy|denied|admin/i);
      await rejected(() => rows('delete from assistant_access_revocations where assistant_id=$1', [uid(4)]), /permission|policy|denied/i);
      await rejected(() => rows('update assistant_access_revocations set revoked_at=now() where assistant_id=$1', [uid(4)]), /permission|policy|denied/i);
      await rejected(() => rows('insert into assistant_access_revocations(assistant_id,member_id) values($1,$2)', [uid(2), uid(1)]), /permission|policy|denied/i);
      await asOwner(); assert.deepEqual(await state(), before);
    });

    await isolated('anonymous and authenticated clients cannot forge, move, or delete sponsor assignments but retain reads', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']); await subject(3, ['user']);
      const id = await assign(1, 2);
      const before = await state();
      for (const [role, actor] of [['anon', null], ['authenticated', 901]]) {
        await as(role, actor);
        assert.equal((await assignment(id)).user_id, uid(1), `${role} retains its existing SELECT access`);
        await rejected(() => assign(3, 2), /permission denied for table user_assistants/i);
        await rejected(() => rows('update user_assistants set user_id=$1 where id=$2', [uid(3), id]), /permission denied for table user_assistants/i);
        await rejected(() => rows('delete from user_assistants where id=$1', [id]), /permission denied for table user_assistants/i);
        await rejected(() => db.exec('truncate user_assistants'), /permission denied for table user_assistants/i);
        for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
          assert.equal(await scalar('select has_table_privilege($1,\'public.user_assistants\',$2)', [role, privilege]), false);
        }
      }
      await asOwner(); assert.deepEqual(await state(), before, 'Forged requests have no assignment or entitlement side effects');
      await as('service_role');
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        assert.equal(await scalar('select has_table_privilege(\'service_role\',\'public.user_assistants\',$1)', [privilege]), true);
      }
      await setAssignment(3, 2);
      assert.equal(await scalar('select count(*)::int from user_assistants where user_id=$1 and assistant_id=$2 and is_active', [uid(3), uid(2)]), 1);
      await setAssignment(3, 2, false);
      assert.equal(await scalar('select count(*)::int from user_assistants where user_id=$1 and assistant_id=$2 and is_active', [uid(3), uid(2)]), 0);
      assert.equal((await assignment(id)).is_active, true);
    });

    await isolated('trusted service workflows work while even signed-in admin and anonymous RPC calls are denied', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']); await assign(1, 2);
      await as('service_role'); await grant(1, 'past_member');
      assert.equal(await has(2, 'assistant'), false);
      for (const [role, id] of [['anon', null], ['authenticated', 900]]) {
        await as(role, id);
        await rejected(() => restore(2), /permission|policy|denied|admin/i);
        await rejected(() => autoGrant(2), /permission|policy|denied|admin/i);
        await rejected(() => setAssignment(1, 2), /permission|policy|denied|admin/i);
      }
      await as('service_role'); await restore(2);
      assert.equal(await has(2, 'assistant'), true);
    });

    await isolated('past or merged admins cannot restore or grant access through direct database requests', async () => {
      await subject(1, ['user']); await subject(2, ['assistant']); await assign(1, 2); await grant(1, 'past_member');
      await subject(3, ['admin', 'past_member']); await subject(4, ['admin']); await markMerged(4);
      for (const id of [3, 4]) {
        await as('authenticated', id);
        await rejected(() => restore(2), /permission|policy|denied|admin|merged/i);
        await rejected(() => autoGrant(2), /permission|policy|denied|admin/i);
      }
      await asOwner(); assert.equal(await revoked(2), true);
    });
  } finally { await db.close(); }
});

test('assistant offboarding composes with the complete shipped schema and existing content entitlement checks', {
  skip: !process.env.PGLITE_PACKAGE_DIR, timeout: 180000,
}, async () => {
  const moduleUrl = (file) => pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, file)).href;
  const { PGlite } = await import(moduleUrl('dist/index.js'));
  const { pg_trgm } = await import(moduleUrl('dist/contrib/pg_trgm.js'));
  const db = new PGlite({ extensions: { pg_trgm } });
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
      create schema auth; create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb,
        raw_app_meta_data jsonb,created_at timestamptz,last_sign_in_at timestamptz);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
      create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
      create schema storage; create table storage.objects(id uuid primary key,bucket_id text,name text);
      create table storage.buckets(id text primary key);
      grant usage on schema auth,storage to anon,authenticated,service_role;
      grant all on storage.objects,storage.buckets to authenticated,service_role;`);
    const dir = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(dir)).sort()) {
      // Match the existing full-schema harness: the older transfer draft is
      // superseded; content guide seeds require a production content library.
      if (name >= path.basename(migration) || name.includes('seed_system_implementation_guides')
        || name === '20260916000000_transfer_business_reviews.sql') continue;
      try { await db.exec(await readFile(new URL(name, dir), 'utf8')); }
      catch (error) { throw new Error(`Prior migration ${name}: ${error.message}`, { cause: error }); }
    }
    await db.exec('set search_path=public; set check_function_bodies=true; set row_security=on');
    const existingSecurity = async () => ({
      policies: await rows(`select * from pg_policies where schemaname='public'
        and tablename in ('user_roles','user_assistants') order by tablename,policyname`),
      grants: await rows(`select c.oid::regclass::text as relation,c.relrowsecurity,
        grantor.rolname as grantor,grantee.rolname as grantee,a.privilege_type,a.is_grantable
        from pg_class c cross join lateral aclexplode(c.relacl) a
        left join pg_roles grantor on grantor.oid=a.grantor left join pg_roles grantee on grantee.oid=a.grantee
        where c.oid in ('public.user_roles'::regclass,'public.user_assistants'::regclass)
        order by relation,grantor,grantee,a.privilege_type,a.is_grantable`),
    });
    const securityBefore = await existingSecurity();
    await db.exec(`insert into roles(code) values('user'),('assistant'),('past_member'),('coach') on conflict do nothing;
      insert into auth.users(id) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(9701,9706)n;
      insert into profiles(id) select id from auth.users;
      insert into user_roles(user_id,role_id) select u.id,r.id from auth.users u cross join roles r
        where (u.id in ('${uid(9701)}','${uid(9702)}','${uid(9703)}') and r.code='user')
          or (u.id in ('${uid(9704)}','${uid(9705)}','${uid(9706)}') and r.code='assistant')
          or (u.id='${uid(9705)}' and r.code='coach')
          or (u.id='${uid(9703)}' and r.code='past_member');
      insert into user_assistants(user_id,assistant_id) values
        ('${uid(9701)}','${uid(9704)}'),('${uid(9702)}','${uid(9704)}'),
        ('${uid(9701)}','${uid(9705)}'),('${uid(9703)}','${uid(9706)}');`);
    await db.exec(await read(migration));
    const removedPrivileges = new Set(['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']);
    const expectedSecurity = {
      ...securityBefore,
      grants: securityBefore.grants.filter((row) => !(row.relation === 'user_assistants'
        && ['anon', 'authenticated'].includes(row.grantee) && removedPrivileges.has(row.privilege_type))),
    };
    assert.deepEqual(await existingSecurity(), expectedSecurity,
      'Only public-client assignment mutations are revoked; SELECT, service grants, role-table grants and all policies stay unchanged');
    assert.equal(await scalar('select count(*)::int from assistant_access_revocations where assistant_id=$1', [uid(9706)]), 1);
    const kind = (id) => scalar('select public.content_membership_kind($1)', [uid(id)]);
    const assistantRole = (id) => scalar('select public.user_has_role($1,\'assistant\')', [uid(id)]);
    await db.exec("select set_config('request.jwt.claim.role','service_role',false); set role service_role;");
    for (const [member, assistant] of [[9701, 9704], [9702, 9704]]) {
      await rows("insert into user_roles(user_id,role_id) select $1,id from roles where code='past_member'", [uid(member)]);
      assert.equal(await assistantRole(assistant), member === 9701);
      assert.equal(await kind(assistant), member === 9701 ? 'full' : 'none');
    }
    assert.equal(await assistantRole(9705), false);
    assert.equal(await kind(9705), 'full', 'Independent staff entitlement is preserved');
    assert.equal(await scalar('select public.grant_assistant_access_if_allowed($1)', [uid(9704)]), false);
    await rows('select public.restore_assistant_access($1)', [uid(9704)]);
    assert.equal(await kind(9704), 'full');
    assert.equal(await scalar('select count(*)::int from user_assistants where assistant_id=$1 and is_active', [uid(9704)]), 0);
    await db.exec('reset role');
    for (const signature of ['revoke_past_member_assistants(uuid)', 'grant_assistant_access_if_allowed(uuid)',
      'restore_assistant_access(uuid)', 'set_member_assistant_assignment(uuid,uuid,boolean,boolean,uuid)']) {
      assert.equal(await scalar('select prosecdef from pg_proc where oid=$1::regprocedure', [`public.${signature}`]), false);
      for (const role of ['anon', 'authenticated']) {
        assert.equal(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')', [role, `public.${signature}`]), false);
      }
      assert.equal(await scalar('select has_function_privilege(\'service_role\',$1,\'EXECUTE\')', [`public.${signature}`]), true);
    }
  } finally { await db.close(); }
});
