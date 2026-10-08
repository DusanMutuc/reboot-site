import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Optional multi-session test, independent of PGlite's single backend. Provision
// an EMPTY local database named reboot_partnership_test_... and set
// PARTNERSHIP_TEST_POSTGRES_URL plus PSQL_BIN if psql is not on PATH.
// Never point this at the application database: the name/host/empty checks below
// run before installing fixtures or cleaning up this dedicated test schema.
const url = process.env.PARTNERSHIP_TEST_POSTGRES_URL;
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const firstId = '00000000-0000-0000-0000-000000000001';
const secondId = '00000000-0000-0000-0000-000000000002';
const thirdId = '00000000-0000-0000-0000-000000000003';

test('concurrent PostgreSQL sessions cannot establish overlapping partnerships', {
  skip: !url, timeout: 30000,
}, async (t) => {
  const connection = new URL(url);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(connection.hostname), 'Only an isolated local PostgreSQL server is permitted');
  assert.match(connection.pathname, /^\/reboot_partnership_test_[a-z0-9_]+$/i);
  const env = { ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || '5432',
    PGDATABASE: connection.pathname.slice(1), PGUSER: decodeURIComponent(connection.username),
    PGPASSWORD: decodeURIComponent(connection.password), PGCONNECT_TIMEOUT: '5' };
  const start = (sql, marker) => {
    const child = spawn(process.env.PSQL_BIN || 'psql', ['-X','-qAt','-v','ON_ERROR_STOP=1','-f','-'],
      { env, windowsHide:true, stdio:['pipe','pipe','pipe'] });
    let stdout = ''; let stderr = ''; let readyResolve; let readyReject;
    const ready = new Promise((resolve,reject) => { readyResolve=resolve; readyReject=reject; });
    // A child can fail before a caller awaits the marker.
    ready.catch(() => {});
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (marker && stdout.includes(marker)) readyResolve();
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const done = new Promise((resolve,reject) => {
      child.on('error', (error) => { readyReject(error); reject(error); });
      child.on('close', (code) => {
        if (marker && !stdout.includes(marker)) readyReject(new Error('Test session exited before acquiring the write lock'));
        resolve({ code, stdout, stderr });
      });
    });
    child.stdin.end(`set statement_timeout='10s';\n${sql}`);
    return { ready, done };
  };
  const run = async (sql) => {
    const result = await start(sql).done;
    assert.equal(result.code,0,result.stderr);
    return result.stdout.trim();
  };
  const saveSql = (changes,id=null) => `select public.save_partnership_admin(${id ? `'${id}'` : 'null'},'${JSON.stringify(changes)}'::jsonb)`;
  const count = async () => Number(await run('select count(*) from public.partnerships;'));
  const emptyCount = await run(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth') and c.relkind in ('r','p','v','m','S');`);
  assert.equal(emptyCount,'0','Dedicated test database must be empty');
  let installed = false;
  try {
    let fixture = await read('tests/fixtures/partnershipManagement.sql');
    fixture = fixture.replace(/create role (\w+)( bypassrls)?;/g, (_,role,options='') =>
      `do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}${options}; end if; end $$;`);
    const baseline = await read('supabase/migrations/20260826000000_remote_schema.sql');
    const definitions = ['canonical_owner_for','is_admin','has_role','enforce_single_active_partnership_per_domain'].map((name) => {
      const found=baseline.match(new RegExp(`CREATE OR REPLACE FUNCTION "public"\\."${name}"[\\s\\S]*?\\$\\$;`,'i'));
      assert.ok(found); return found[0];
    }).join('\n');
    await run(`begin; ${fixture} ${definitions}
      create trigger trg_enforce_single_active_partnership_per_domain before insert or update on public.partnership_users
        for each row execute function public.enforce_single_active_partnership_per_domain(); commit;`);
    installed = true;
    await run(await read('supabase/migrations/20261008022000_atomic_partnership_management.sql'));

    await t.test('two creates sharing a member serialize; loser leaves no orphan', async () => {
      const first = start(`begin; ${saveSql({shared_kpis:true,user_ids:[firstId,secondId]})};
        select 'HOLDING_CREATE'; select pg_sleep(0.8); commit;`, 'HOLDING_CREATE');
      await first.ready;
      const second = start(`${saveSql({shared_kpis:true,user_ids:[firstId,thirdId]})};`);
      const [one,two] = await Promise.all([first.done,second.done]);
      assert.equal(one.code,0,one.stderr);
      assert.notEqual(two.code,0);
      assert.match(two.stderr,/active partnership/);
      assert.equal(await count(),1);
      assert.equal(Number(await run('select count(*) from partnership_users;')),2);
    });

    await run('delete from public.partnerships;');
    await t.test('concurrent parent reactivations enforce shared-domain ownership', async () => {
      const one = JSON.parse(await run(`${saveSql({shared_notes:true,is_active:false,user_ids:[firstId,secondId]})};`));
      const two = JSON.parse(await run(`${saveSql({shared_notes:true,is_active:false,user_ids:[firstId,thirdId]})};`));
      const first = start(`begin; update public.partnerships set is_active=true where id='${one.id}';
        select 'HOLDING_PARENT'; select pg_sleep(0.8); commit;`, 'HOLDING_PARENT');
      await first.ready;
      const second = start(`update public.partnerships set is_active=true where id='${two.id}';`);
      const results = await Promise.all([first.done,second.done]);
      assert.equal(results[0].code,0,results[0].stderr);
      assert.notEqual(results[1].code,0);
      assert.match(results[1].stderr,/active partnership/);
      assert.equal(Number(await run('select count(*) from public.partnerships where is_active;')),1);
    });

    await run('delete from public.partnerships;');
    await t.test('a stale repeatable-read editor must retry after another writer commits', async () => {
      const stale = start(`begin isolation level repeatable read; select revision from public.partnership_write_guard;
        select 'SNAPSHOT_READY'; select pg_sleep(0.8);
        ${saveSql({shared_attendance:true,user_ids:[firstId,thirdId]})}; commit;`, 'SNAPSHOT_READY');
      await stale.ready;
      await run(`${saveSql({shared_attendance:true,user_ids:[firstId,secondId]})};`);
      const result = await stale.done;
      assert.notEqual(result.code,0);
      assert.match(result.stderr,/could not serialize access/);
      assert.equal(await count(),1);
    });
  } finally {
    if (installed) await run('drop schema public cascade; create schema public; drop schema auth cascade;');
  }
});
