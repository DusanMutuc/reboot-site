import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ids = Array.from({ length: 6 }, (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`);
const migrationPath = 'supabase/migrations/20261008022000_atomic_partnership_management.sql';
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const definition = (sql, name) => {
  const expression = new RegExp(`CREATE OR REPLACE FUNCTION "public"\\."${name}"[\\s\\S]*?\\$\\$;`, 'i');
  const found = sql.match(expression);
  assert.ok(found, `missing baseline function ${name}`);
  return found[0];
};

test('partnership edits and sharing invariants execute atomically in PostgreSQL', {
  skip: !process.env.PGLITE_PACKAGE_DIR, timeout: 180000,
}, async (t) => {
  const moduleUrl = pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, 'dist/index.js')).href;
  const { PGlite } = await import(moduleUrl);
  const db = new PGlite();
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
  const save = (changes, id = null) => scalar('select public.save_partnership_admin($1,$2::jsonb)', [id, JSON.stringify(changes)]);
  const snapshot = async () => {
    const state = {};
    for (const table of ['partnerships','partnership_users','partnership_domain_claims','partnership_write_guard']) {
      state[table] = await rows(`select to_jsonb(t) as value from public.${table} t order by to_jsonb(t)::text`);
    }
    return state;
  };
  const rejected = async (fn, expected = /active partnership/) => {
    await db.exec('savepoint expected_failure');
    try { await assert.rejects(fn, expected); } finally { await db.exec('rollback to savepoint expected_failure'); }
  };
  const isolated = (name, fn) => t.test(name, async () => {
    await db.exec('begin');
    try { await fn(); } finally { await db.exec('rollback; reset role;'); }
  });
  try {
    await db.exec(await read('tests/fixtures/partnershipManagement.sql'));
    const baseline = await read('supabase/migrations/20260826000000_remote_schema.sql');
    await db.exec(definition(baseline, 'canonical_owner_for'));
    await db.exec(definition(baseline, 'is_admin'));
    await db.exec(definition(baseline, 'has_role'));
    await db.exec(definition(baseline, 'enforce_single_active_partnership_per_domain'));
    await db.exec(`create trigger trg_enforce_single_active_partnership_per_domain before insert or update
      on partnership_users for each row execute function enforce_single_active_partnership_per_domain();`);
    // Use the shipped archive trigger rather than approximating its write behavior.
    const archive = await read('supabase/migrations/20261008010000_archive_merged_accounts.sql');
    const trigger = archive.match(/create function public\.reject_merged_member_write\(\)[\s\S]*?\$\$;/i)?.[0];
    assert.ok(trigger);
    await db.exec(trigger);
    await db.exec(`create trigger reject_merged_member_write before insert or update or delete on public.partnership_users
      for each row execute function public.reject_merged_member_write('user_id');`);
    await db.exec(await read(migrationPath));

    await isolated('create returns full member shape and deduplicates member IDs', async () => {
      const created = await save({ name: '  Partners  ', shared_kpis: true, user_ids: [ids[0],ids[1],ids[0]] });
      assert.equal(created.name, 'Partners');
      assert.equal(created.shared_attendance, false);
      assert.equal(created.is_active, true);
      assert.deepEqual(created.members, ids.slice(0,2).map((id,i) => ({ user_id:id, full_name:`Member ${i+1}`,email:`member${i+1}@example.test` })));
      assert.equal(await scalar('select count(*) from partnership_domain_claims'), 2);
    });

    await isolated('a failed create leaves no orphan or claims', async () => {
      await save({ shared_notes: true, user_ids: [ids[0],ids[1]] });
      const before = await snapshot();
      await rejected(() => save({ name: 'Must roll back', shared_notes: true, user_ids: [ids[2],ids[0]] }));
      assert.deepEqual(await snapshot(), before);
    });

    await isolated('a failed replacement restores removed members and original settings', async () => {
      const original = await save({ name: 'Original', shared_kpis: true, user_ids: [ids[0],ids[1]] });
      await save({ shared_notes: true, user_ids: [ids[2],ids[3]] });
      const before = await snapshot();
      await rejected(() => save({ name: 'Must roll back', shared_kpis: false, shared_notes: true,
        user_ids: [ids[0],ids[2]] }, original.id));
      assert.deepEqual(await snapshot(), before);
    });

    for (const flag of ['shared_kpis','shared_attendance','shared_notes']) {
      await isolated(`${flag} activation and reactivation validate unchanged memberships`, async () => {
        await save({ [flag]: true, user_ids: [ids[0],ids[1]] });
        const inactive = await save({ [flag]: true, is_active: false, user_ids: [ids[0],ids[2]] });
        const unshared = await save({ user_ids: [ids[0],ids[3]] });
        const before = await snapshot();
        await rejected(() => save({ is_active: true }, inactive.id));
        await rejected(() => save({ [flag]: true }, unshared.id));
        await rejected(() => db.query(`update partnerships set ${flag}=true where id=$1`, [unshared.id]));
        assert.deepEqual(await snapshot(), before);
      });
    }

    await isolated('changing only membership user_id still enforces overlap', async () => {
      await save({ shared_kpis: true, user_ids: [ids[0],ids[1]] });
      const other = await save({ shared_kpis: true, user_ids: [ids[2],ids[3]] });
      const before = await snapshot();
      await rejected(() => db.query('update partnership_users set user_id=$1 where partnership_id=$2 and user_id=$3', [ids[0],other.id,ids[2]]),
        /active partnership|partnership_domain_claims_pkey/);
      assert.deepEqual(await snapshot(), before);
    });

    await isolated('different domains remain independent and choose their own canonical owners', async () => {
      await save({ shared_kpis: true, user_ids: [ids[0],ids[2]] });
      await save({ shared_notes: true, user_ids: [ids[1],ids[2]] });
      await save({ user_ids: [ids[2],ids[3]] });
      assert.equal(await scalar("select canonical_owner_for($1,'kpis')", [ids[2]]), ids[0]);
      assert.equal(await scalar("select canonical_owner_for($1,'notes')", [ids[2]]), ids[1]);
      assert.equal(await scalar("select canonical_owner_for($1,'attendance')", [ids[2]]), ids[2]);
    });

    await isolated('replace outgoing member and enable a domain in one successful edit', async () => {
      await save({ shared_notes: true, user_ids: [ids[0],ids[1]] });
      const editable = await save({ shared_kpis: true, user_ids: [ids[0],ids[2]] });
      const changed = await save({ shared_notes: true, user_ids: [ids[2],ids[3]] }, editable.id);
      assert.deepEqual(changed.members.map((member) => member.user_id), [ids[2],ids[3]]);
      assert.equal(changed.shared_notes, true);
    });

    await isolated('settings-only edits preserve members and removing/deactivating/deleting releases domains', async () => {
      const first = await save({ shared_attendance: true, user_ids: [ids[0],ids[1]] });
      const renamed = await save({ name: 'Renamed' }, first.id);
      assert.equal(renamed.members.length, 2);
      await save({ user_ids: [ids[1]] }, first.id);
      const second = await save({ shared_attendance: true, user_ids: [ids[0],ids[2]] });
      await save({ is_active: false }, second.id);
      const third = await save({ shared_attendance: true, user_ids: [ids[0],ids[3]] });
      await db.query('delete from partnerships where id=$1', [third.id]);
      assert.equal(await scalar('select count(*) from partnership_domain_claims where user_id=$1', [ids[0]]), 0);
    });

    await isolated('archived members and archived partnership history remain protected', async () => {
      const inactive = await save({ is_active: false, user_ids: [ids[0],ids[1]] });
      await db.query('update profiles set merged_at=now(),merged_into_user_id=$1 where id=$2', [ids[2],ids[0]]);
      const before = await snapshot();
      await rejected(() => save({ user_ids: [ids[0]] }), /Account merged/);
      await rejected(() => save({ is_active:true }, inactive.id), /read-only/);
      await rejected(() => db.query('delete from partnerships where id=$1', [inactive.id]), /read-only/);
      assert.deepEqual(await snapshot(), before);
    });

    await isolated('legacy archived membership in an unshared partnership does not block unrelated edits', async () => {
      const historical = await save({ user_ids:[ids[0],ids[1]] });
      await db.query('update profiles set merged_at=now(),merged_into_user_id=$1 where id=$2', [ids[2],ids[0]]);
      const unrelated = await save({ shared_notes:true,user_ids:[ids[3],ids[4]] });
      assert.equal(unrelated.members.length,2);
      await rejected(() => save({ shared_notes:true },historical.id), /read-only/);
      assert.equal(await scalar('select count(*) from partnership_domain_claims'),2);
    });

    await isolated('RPC rejects invalid payloads and missing targets without mutation', async () => {
      const before = await snapshot();
      for (const changes of [null, [], { is_active:'false' }, { user_ids:null }, { user_ids:[3] }, { bogus:true }]) {
        await rejected(() => save(changes), /must be|Unsupported/);
      }
      await rejected(() => save({ user_ids:['bad'] }), /uuid/);
      await rejected(() => save({},ids[5]), /not found/);
      assert.deepEqual(await snapshot(), before);
    });

    await isolated('new RPC and derived tables are inaccessible to unprivileged callers', async () => {
      for (const role of ['anon','authenticated']) {
        await db.exec(`set local role ${role}`);
        await rejected(() => save({ user_ids:[ids[0]] }), /permission denied/);
        await rejected(() => db.exec('select * from partnership_domain_claims'), /permission denied/);
        await rejected(() => db.exec('update partnership_write_guard set revision=0'), /permission denied/);
        await db.exec('reset role');
      }
      await db.exec('set local role service_role');
      assert.equal((await save({ name:'Service', user_ids:[ids[0]] })).members.length, 1);
    });

    await isolated('direct writes require an admin while existing reads remain available', async () => {
      const existing = await save({ name:'Protected',user_ids:[ids[0]] });
      for (const role of ['anon','authenticated']) {
        await db.exec(`set local role ${role}`);
        assert.equal(await scalar('select count(*) from partnerships'), 1);
        await rejected(() => db.exec("insert into partnerships(name) values('Denied')"), /row-level security/);
        await rejected(() => db.query('insert into partnership_users(partnership_id,user_id) values($1,$2)', [existing.id,ids[1]]), /row-level security/);
        assert.deepEqual(await rows("update partnerships set name='Denied' returning id"), []);
        assert.deepEqual(await rows('delete from partnership_users returning user_id'), []);
        await db.exec('reset role');
      }
      assert.equal(await scalar('select name from partnerships'), 'Protected');
      assert.equal(await scalar('select count(*) from partnership_users'), 1);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids[5]]);
      await db.exec('set local role authenticated');
      assert.equal((await rows("update partnerships set name='Allowed' returning name"))[0].name,'Allowed');
    });

    await isolated('past-member status overrides admin for all direct partnership writes', async () => {
      const existing = await save({ name:'Protected',user_ids:[ids[0]] });
      await db.exec(`insert into roles(id,code) values(2,'past_member');
        insert into user_roles(user_id,role_id) values('${ids[5]}',2);`);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids[5]]);
      await db.exec('set local role authenticated');
      assert.equal(await scalar('select is_admin()'),true);
      await rejected(() => db.exec("insert into partnerships(name) values('Denied')"), /row-level security/);
      await rejected(() => db.query('insert into partnership_users(partnership_id,user_id) values($1,$2)', [existing.id,ids[1]]), /row-level security/);
      assert.deepEqual(await rows("update partnerships set name='Denied' returning id"), []);
      assert.deepEqual(await rows(`update partnership_users set user_id='${ids[1]}' returning user_id`), []);
      assert.deepEqual(await rows('delete from partnership_users returning user_id'), []);
      assert.deepEqual(await rows('delete from partnerships returning id'), []);
      await db.exec('reset role');
      assert.equal(await scalar('select name from partnerships'),'Protected');
      assert.equal(await scalar('select user_id from partnership_users'),ids[0]);
    });

    await t.test('overlapping calls cannot both succeed', async () => {
      const results = await Promise.allSettled([
        save({ name:'One', shared_notes:true, user_ids:[ids[0],ids[1]] }),
        save({ name:'Two', shared_notes:true, user_ids:[ids[0],ids[2]] }),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length,1);
      assert.equal(results.filter((result) => result.status === 'rejected').length,1);
      assert.equal(await scalar('select count(*) from partnerships'),1);
      assert.equal(await scalar('select count(*) from partnership_users'),2);
    });
  } finally { await db.close(); }
});

test('installation refuses legacy overlapping owners without partial schema changes', {
  skip: !process.env.PGLITE_PACKAGE_DIR, timeout: 180000,
}, async () => {
  const { PGlite } = await import(pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, 'dist/index.js')).href);
  const db = new PGlite();
  try {
    await db.exec(await read('tests/fixtures/partnershipManagement.sql'));
    const baseline = await read('supabase/migrations/20260826000000_remote_schema.sql');
    for (const name of ['canonical_owner_for','is_admin','has_role','enforce_single_active_partnership_per_domain']) {
      await db.exec(definition(baseline,name));
    }
    await db.exec(`create trigger trg_enforce_single_active_partnership_per_domain before insert or update
      on partnership_users for each row execute function enforce_single_active_partnership_per_domain();
      insert into partnerships(id,shared_kpis,is_active) values
        ('10000000-0000-0000-0000-000000000001',true,false),('10000000-0000-0000-0000-000000000002',true,false);
      insert into partnership_users(partnership_id,user_id)
        select id,'${ids[0]}'::uuid from partnerships;
      update partnerships set is_active=true;`);
    const before = (await db.query('select to_jsonb(p) as value from partnerships p order by id')).rows;
    const migration = await read(migrationPath);
    await assert.rejects(() => db.exec(migration), /active partnership/);
    await db.exec('rollback');
    assert.deepEqual((await db.query('select to_jsonb(p) as value from partnerships p order by id')).rows,before);
    assert.equal((await db.query("select to_regclass('public.partnership_write_guard') as relation")).rows[0].relation,null);
    assert.equal((await db.query("select count(*) as count from pg_trigger where tgname='trg_enforce_single_active_partnership_per_domain'")).rows[0].count,1);
    assert.equal((await db.query("select count(*) as count from pg_policies where tablename in ('partnerships','partnership_users')")).rows[0].count,2);
  } finally { await db.close(); }
});
