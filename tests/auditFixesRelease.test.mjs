import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { auditMigrations, renderAuditRelease } from '../tools/build-audit-fixes-release.mjs';

const read = (name) => readFile(new URL(`../${name}`,import.meta.url),'utf8');
const sources = async () => Object.fromEntries(await Promise.all(auditMigrations.map(async(name)=>[
  name,await read(`supabase/migrations/${name}.sql`),
])));

test('combined audit release matches the canonical four migrations and records exact LF SQL',async()=>{
  const canonical=await sources();
  const hash=(sql)=>createHash('sha256').update(sql.replaceAll('\r\n','\n')).digest('hex');
  assert.equal(hash(await read('sql/2026-10-08_audit_fixes_release.sql')),hash(renderAuditRelease(canonical)),
    'Release bundle is stale; regenerate with node tools/build-audit-fixes-release.mjs');
  assert.equal(auditMigrations.length,4);
  for(const name of auditMigrations) {
    const malformed={...canonical,[name]:canonical[name].replace(/^begin;$/m,'')};
    assert.throws(()=>renderAuditRelease(malformed),/outer transaction/);
  }
});

test('combined audit release installs all four migrations atomically and preserves existing archives',{
  skip:!process.env.PGLITE_PACKAGE_DIR,timeout:180000,
},async(t)=>{
  const moduleUrl=(file)=>pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR,file)).href;
  const { PGlite }=await import(moduleUrl('dist/index.js'));
  const { pg_trgm }=await import(moduleUrl('dist/contrib/pg_trgm.js'));
  const db=new PGlite({extensions:{pg_trgm}});
  const canonical=await sources();
  const release=renderAuditRelease(canonical);
  const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
  const scalar=async(sql,args=[]) => Object.values((await rows(sql,args))[0])[0];
  const history=()=>rows("select version,name,statements from supabase_migrations.schema_migrations where version>='20261008019000' order by version");
  const rejectedRelease=async(pattern)=>{
    try {await assert.rejects(()=>db.exec(release),pattern);} finally {await db.exec('rollback; reset role;');}
  };
  const uid=(id)=>`00000000-0000-0000-0000-${String(id).padStart(12,'0')}`;
  const asUser=async(id)=>{
    await db.exec('reset role;');
    await rows("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[uid(id)]);
    await db.exec('set role authenticated; set row_security=on;');
  };
  const asService=async()=>{
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false);");
  };
  const rejected=async(fn,pattern)=>{
    await db.exec('savepoint expected_failure');
    try {await assert.rejects(fn,pattern);} finally {await db.exec('rollback to savepoint expected_failure');}
  };
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role authenticator;
      create schema auth;create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb,
        raw_app_meta_data jsonb,created_at timestamptz,last_sign_in_at timestamptz);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
      create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
      create schema storage;create table storage.objects(id uuid primary key,bucket_id text,name text);
      create table storage.buckets(id text primary key);
      grant usage on schema auth,storage to anon,authenticated,service_role;
      grant all on storage.objects,storage.buckets to authenticated,service_role;
      create function public.original_request_check() returns void language plpgsql as
        $$begin perform set_config('test.original_request_checked','yes',true);end$$;
      alter role authenticator set pgrst.db_pre_request='public.original_request_check';
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
    for(const name of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort()) {
      if(name>'20261008010000_archive_merged_accounts.sql'||name.includes('seed_system_implementation_guides')
        ||name==='20260916000000_transfer_business_reviews.sql')continue;
      await db.exec(await read(`supabase/migrations/${name}`));
    }
    await db.exec('set search_path=public;set check_function_bodies=true;set row_security=on;');
    await db.exec(await read('tests/fixtures/transferBusinessReviews.sql'));
    await db.exec(`begin;${await read('tests/fixtures/transferAccountData.sql')}commit;`);
    await asService();
    await db.exec(`insert into user_roles(user_id,role_id) select '${uid(902)}',id from roles where code='user' on conflict do nothing;
      update auth.users set raw_app_meta_data='{"must_reset_password":true}' where id='${uid(902)}';
      insert into user_merge_log(id,source_user_id,dest_user_id,dry_run) values(999,'${uid(901)}','${uid(902)}',false);
      insert into account_merges(source_user_id,dest_user_id,request_id,transfer_log_id,source_snapshot)
        values('${uid(901)}','${uid(902)}',gen_random_uuid(),999,'{"historical":"preserved"}');
      update profiles set merged_into_user_id='${uid(902)}',merged_at=(select merged_at from account_merges where source_user_id='${uid(901)}')
        where id='${uid(901)}';
      insert into content_nodes(id,node_type,title,slug,state) values(8888,'collection','Release test library','library','published');`);
    const archivesBefore=await rows('select to_jsonb(m) as row from account_merges m');
    const historyBefore=await scalar('select count(*)::int from user_merge_log');

    await t.test('missing predecessor and partially registered releases refuse before any changes',async()=>{
      await rejectedRelease(/Archive migration must be registered/);
      assert.equal(await scalar("select to_regprocedure('public.account_setup_complete(uuid)')::text"),null);
      await db.exec("insert into supabase_migrations.schema_migrations values('20261008010000','archive_merged_accounts',array[]::text[])");
      await rows('insert into supabase_migrations.schema_migrations values($1,$2,array[]::text[])',[auditMigrations[2].slice(0,14),'partial']);
      await rejectedRelease(/already registered/);
      await rows('delete from supabase_migrations.schema_migrations where version=$1',[auditMigrations[2].slice(0,14)]);
    });
    await t.test('late privilege failure rolls back all four migrations, grants, policies, hook and history',async()=>{
      const priorPolicies=await scalar('select count(*)::int from pg_policy');
      const priorFunction=await scalar("select pg_get_functiondef('public.can_user_access_course(uuid,bigint)'::regprocedure)");
      const priorAcl=await scalar("select relacl::text from pg_class where oid='public.roles'::regclass");
      const priorConfig=await rows('select setrole,setdatabase,setconfig from pg_db_role_setting order by setrole,setdatabase');
      await db.exec(`create function public.break_audit_release_acl() returns event_trigger language plpgsql as $$
        begin
          if to_regprocedure('public.save_partnership_admin(uuid,jsonb)') is not null then
            alter event trigger break_audit_release_acl disable;
            grant execute on function public.save_partnership_admin(uuid,jsonb) to authenticated;
            alter event trigger break_audit_release_acl enable;
          end if;
        end $$;
        create event trigger break_audit_release_acl on ddl_command_end when tag in ('GRANT','REVOKE')
          execute function public.break_audit_release_acl();`);
      await rejectedRelease(/Audit release RPC privilege verification failed/);
      assert.deepEqual(await history(),[]);
      assert.equal(await scalar("select to_regprocedure('public.account_setup_complete(uuid)')::text"),null);
      assert.equal(await scalar("select to_regprocedure('public.save_partnership_admin(uuid,jsonb)')::text"),null);
      assert.equal(await scalar('select count(*)::int from pg_policy'),priorPolicies);
      assert.equal(await scalar("select pg_get_functiondef('public.can_user_access_course(uuid,bigint)'::regprocedure)"),priorFunction);
      assert.equal(await scalar("select relacl::text from pg_class where oid='public.roles'::regclass"),priorAcl);
      assert.deepEqual(await rows('select setrole,setdatabase,setconfig from pg_db_role_setting order by setrole,setdatabase'),priorConfig);
      assert.deepEqual(await rows('select to_jsonb(m) as row from account_merges m'),archivesBefore);
      await db.exec('drop event trigger break_audit_release_acl;drop function public.break_audit_release_acl();');
    });
    await t.test('successful release records exactly four canonical migrations and preserves existing archive history',async()=>{
      await db.exec(release);
      const installed=await history();
      assert.equal(installed.length,4);
      for(let i=0;i<4;i++) {
        assert.equal(installed[i].version,auditMigrations[i].slice(0,14));
        assert.deepEqual(installed[i].statements,[canonical[auditMigrations[i]].replaceAll('\r\n','\n')]);
      }
      assert.deepEqual(await rows('select to_jsonb(m) as row from account_merges m'),archivesBefore);
      assert.equal(await scalar('select count(*)::int from user_merge_log'),historyBefore);
      assert.equal(await scalar('select previous_pre_request from account_merge_access_settings'),'public.original_request_check');
      assert.equal(await scalar("select count(*)::int from pg_policies where policyname='account_merge_subject_guard'"),
        await scalar("select count(*)::int from pg_policies where policyname='account_setup_subject_guard'"));
      for(const signature of ['set_node_state(bigint,text)','set_course_order(bigint[])','enforce_strict_sequence(bigint,boolean)']) {
        for(const role of ['anon','authenticated','service_role']) {
          assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\')',[role,`public.${signature}`]),role==='service_role',
            `${signature} privileges must survive every subsequent replacement`);
        }
      }
    });
    await t.test('setup and archive restrictions compose with content access and protected role assignments',async()=>{
      await db.exec('begin;');
      try {
        await asUser(902);
        assert.equal(await scalar('select count(*)::int from content_nodes'),0,'pending member hidden by setup policy');
        await rejected(()=>db.exec('select account_setup_pre_request()'),/Complete password setup/);
        await asService();await db.exec(`update auth.users set raw_app_meta_data='{}' where id='${uid(902)}'`);
        await asUser(902);await db.exec('select account_setup_pre_request()');
        assert.equal(await scalar("select current_setting('test.original_request_checked',true)"),'yes');
        assert.equal(await scalar('select count(*)::int from content_nodes where id=8888'),1);
        await rejected(()=>db.exec("insert into user_roles(user_id,role_id) select auth.uid(),id from roles where code='admin'"),/row-level security/);
        await asUser(901);
        assert.equal(await scalar('select count(*)::int from content_nodes'),0);
        await rejected(()=>db.exec('select account_setup_pre_request()'),/Account merged/);
      } finally {await db.exec('rollback;');await asService();}
    });
    await t.test('repeated application refuses without duplicating schema or history',async()=>{
      const policies=await scalar('select count(*)::int from pg_policy');
      await rejectedRelease(/already registered/);
      assert.equal((await history()).length,4);
      assert.equal(await scalar('select count(*)::int from pg_policy'),policies);
    });
  } finally {await db.close();}
});
