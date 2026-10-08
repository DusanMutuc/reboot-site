import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OLD = '00000000-0000-0000-0000-000000000901';
const CURRENT = '00000000-0000-0000-0000-000000000902';
const ADMIN = '00000000-0000-0000-0000-000000000903';
const REQUIRED_AT = '2026-10-08T10:00:00.500Z';
const COMPLETED_AT = '2026-10-08T10:30:00.750Z';
const REQUIRED_SECOND = Math.floor(Date.parse(REQUIRED_AT) / 1000);
const COMPLETED_SECOND = Math.floor(Date.parse(COMPLETED_AT) / 1000);

test('onboarding database gate enforces live metadata and preserves archive protections', {
  skip: !process.env.PGLITE_PACKAGE_DIR, timeout: 180000,
}, async (t) => {
  const moduleUrl = (file) => pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, file)).href;
  const { PGlite } = await import(moduleUrl('dist/index.js'));
  const { pg_trgm } = await import(moduleUrl('dist/contrib/pg_trgm.js'));
  const db = new PGlite({ extensions: { pg_trgm } });
  const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
  const assume = async (id, role = 'authenticated', claims = {}) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false),set_config('request.jwt.claims',$3,false)", [id, role, JSON.stringify({ sub: id, iat: COMPLETED_SECOND + 60, ...claims })]);
    await db.exec(`set role ${role}`);
  };
  const rejected = async (fn, expected) => {
    await db.exec('savepoint expected_failure');
    try { await assert.rejects(fn, expected); } finally { await db.exec('rollback to savepoint expected_failure'); }
  };
  const check = (name, body) => t.test(name, async () => {
    await db.exec('begin');
    try { await body(); } finally { await db.exec('rollback; reset role'); }
  });
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
      create schema auth;
      create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb,
        raw_app_meta_data jsonb,created_at timestamptz,last_sign_in_at timestamptz);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
      create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create schema storage; create table storage.objects(id uuid primary key,name text); create table storage.buckets(id text primary key);
      grant usage on schema storage,auth to anon,authenticated,service_role;
      grant all on storage.objects,storage.buckets to authenticated,service_role;
      insert into storage.objects values('00000000-0000-0000-0000-000000000001','private-file');
      insert into storage.buckets values('private');
      create table public.onboarding_probe(id integer primary key, value text);
      insert into public.onboarding_probe values(1,'protected');
      grant all on public.onboarding_probe to authenticated,service_role;
      create function public.previous_request_check() returns void language plpgsql as
        $$ begin perform set_config('test.previous_request_actor',current_user,true); end $$;
      alter role authenticator set pgrst.db_pre_request='public.previous_request_check';`);
    for (const name of [
      '20260826000000_remote_schema.sql','20260901001000_ninety_day_user_lifecycle.sql',
      '20260901002000_ninety_day_cycles.sql','20260913010000_member_pauses.sql',
      '20260914000000_legend_foundation_scorecard.sql','20260922000000_allow_concurrent_ninety_day_cycles.sql',
      '20260922010000_dual_membership_homes.sql','20260925000000_carry_implementation_completion_to_next_review.sql',
      '20260925010000_system_implementation_guides.sql','20260925020000_implementation_meeting_workspaces.sql',
      '20260929010000_coaching_notes_history.sql','20260929020000_manual_implementation_meetings.sql',
      '20260929030000_implementation_next_meeting_booking.sql','20261008000000_complete_account_transfers.sql',
      '20261008010000_archive_merged_accounts.sql',
    ]) await db.exec(await read(`supabase/migrations/${name}`));
    await db.exec('set search_path=public;set check_function_bodies=true;set row_security=on');
    await db.exec(await read('tests/fixtures/transferBusinessReviews.sql'));
    await db.exec(`begin; ${await read('tests/fixtures/transferAccountData.sql')} commit;`);
    await scalar('select transfer_user_data_admin_v3($1,$2,$3::jsonb)', [OLD,CURRENT,JSON.stringify({
      dry_run:false,operation:'merge',request_id:'00000000-0000-0000-0000-000000009321',actor_user_id:ADMIN,
      kpi_merge:'skip',destination_email:'new@example.test',destination_ghl_contact_id:'verified-new-contact',
    })]);
    const migration = (await read('supabase/migrations/20261008019000_secure_onboarding.sql'))
      .replace(/^begin;\s*$/mi,'').replace(/^commit;\s*$/mi,'');

    await check('unexpected configured request hook aborts the installation without replacing it', async () => {
      await db.exec(`do $$ begin execute format('alter role authenticator in database %I set pgrst.db_pre_request=%L',current_database(),'public.previous_request_check'); end $$`);
      await rejected(() => db.exec(migration), /Expected the archived-account API guard/);
      assert.equal(await scalar("select to_regprocedure('public.account_setup_complete(uuid)')::text"), null);
      assert.equal(await scalar("select split_part(setting,'=',2) from pg_db_role_setting s cross join lateral unnest(s.setconfig) setting where setrole='authenticator'::regrole and setdatabase<>0 and setting like 'pgrst.db_pre_request=%'"), 'public.previous_request_check');
    });
    for (const scope of ['role', 'runtime']) {
      await check(`${scope} dynamic pre-config hook aborts installation without leaving new functions`, async () => {
        if (scope === 'role') await db.exec("alter role authenticator set pgrst.db_pre_config='public.dynamic_config'");
        else await db.query("select set_config('pgrst.db_pre_config',$1,true)",['public.dynamic_config']);
        await rejected(() => db.exec(migration), /existing PostgREST pre-config hook/);
        assert.equal(await scalar("select to_regprocedure('public.account_setup_complete(uuid)')::text"), null);
      });
    }
    await check('runtime request-hook drift aborts installation instead of overwriting a hidden guard', async () => {
      await db.query("select set_config('pgrst.db_pre_request',$1,true)",['public.previous_request_check']);
      await rejected(() => db.exec(migration), /Multiple PostgREST request guards/);
      assert.equal(await scalar("select to_regprocedure('public.account_setup_complete(uuid)')::text"), null);
    });
    await db.exec(`begin;${migration}commit;`);

    await check('live pending metadata blocks stale JWTs in hooks, public tables, and Storage', async () => {
      await db.query('update auth.users set raw_app_meta_data=$1::jsonb where id=$2', [JSON.stringify({must_reset_password:true}),CURRENT]);
      await assume(CURRENT, 'authenticated', { app_metadata: { must_reset_password: false } });
      assert.equal(await scalar('select account_setup_complete(auth.uid())'), false);
      await rejected(() => scalar('select account_setup_pre_request()'), /Complete password setup using an email link/);
      assert.equal(await scalar('select count(*) from public.onboarding_probe'), 0);
      assert.equal(await scalar('select count(*) from storage.objects'), 0);
      assert.equal(await scalar('select count(*) from storage.buckets'), 0);
      assert.equal(await scalar('select count(*) from profiles where id=$1', [CURRENT]), 0);
      await rejected(() => db.exec("insert into public.onboarding_probe values(2,'must fail')"), /row-level security/);
      await rejected(() => db.exec("insert into storage.objects values('00000000-0000-0000-0000-000000000002','must-fail')"), /row-level security/);
    });
    await check('legacy accounts without a cutoff use the live setup flag instead of stale JWT metadata', async () => {
      await db.query("update auth.users set raw_app_meta_data=$1::jsonb where id=$2", [JSON.stringify({must_reset_password:false}),CURRENT]);
      await assume(CURRENT, 'authenticated', { app_metadata: { must_reset_password: true } });
      assert.equal(await scalar('select account_setup_complete(auth.uid())'), true);
      await scalar('select account_setup_pre_request()');
      assert.equal(await scalar("select current_setting('test.previous_request_actor',true)"), 'authenticated');
      assert.equal(await scalar('select count(*) from public.onboarding_probe'), 1);
      assert.equal(await scalar('select count(*) from storage.objects'), 1);
    });
    await check('rotated access tokens remain blocked after the owner completes password setup', async () => {
      await db.query('update auth.users set raw_app_meta_data=$1::jsonb where id=$2', [JSON.stringify({
        must_reset_password:true,setup_required_at:REQUIRED_AT,
      }),CURRENT]);
      await assume(CURRENT,'authenticated',{iat:REQUIRED_SECOND-1,app_metadata:{must_reset_password:false}});
      assert.equal(await scalar('select account_setup_complete(auth.uid())'),false);
      await db.exec('reset role');
      await db.query('update auth.users set raw_app_meta_data=$1::jsonb where id=$2', [JSON.stringify({
        must_reset_password:false,setup_required_at:REQUIRED_AT,setup_completed_at:COMPLETED_AT,
      }),CURRENT]);
      // Clearing the live flag must not restore the already-issued legacy JWT.
      for (const iat of [REQUIRED_SECOND-1, REQUIRED_SECOND, COMPLETED_SECOND-1, COMPLETED_SECOND]) {
        await assume(CURRENT,'authenticated',{iat,app_metadata:{must_reset_password:false}});
        assert.equal(await scalar('select account_setup_complete(auth.uid())'),false);
        await rejected(() => scalar('select account_setup_pre_request()'),/sign in again/);
        assert.equal(await scalar('select count(*) from public.onboarding_probe'),0);
        assert.equal(await scalar('select count(*) from storage.objects'),0);
      }
      await assume(CURRENT,'authenticated',{iat:COMPLETED_SECOND+1});
      assert.equal(await scalar('select account_setup_complete(auth.uid())'),true);
      await scalar('select account_setup_pre_request()');
      assert.equal(await scalar('select count(*) from public.onboarding_probe'),1);
      assert.equal(await scalar('select count(*) from storage.objects'),1);
    });
    await check('cutoff uses the latest required or completed timestamp and rejects the entire cutoff second', async () => {
      // Required can be newer if an administrator requests another password reset.
      await db.query('update auth.users set raw_app_meta_data=$1::jsonb where id=$2',[JSON.stringify({
        must_reset_password:false,setup_required_at:COMPLETED_AT,setup_completed_at:REQUIRED_AT,
      }),CURRENT]);
      await assume(CURRENT,'authenticated',{iat:COMPLETED_SECOND});
      assert.equal(await scalar('select account_setup_complete(auth.uid())'),false);
      await assume(CURRENT,'authenticated',{iat:COMPLETED_SECOND+1});
      assert.equal(await scalar('select account_setup_complete(auth.uid())'),true);
    });
    await check('a cutoff fails closed for missing, malformed, or noninteger issued-at claims', async () => {
      await db.query('update auth.users set raw_app_meta_data=$1::jsonb where id=$2',[JSON.stringify({
        must_reset_password:false,setup_completed_at:COMPLETED_AT,
      }),CURRENT]);
      for (const iat of [undefined,null,'invalid',String(COMPLETED_SECOND+60),-1,1.5,{}]) {
        await assume(CURRENT,'authenticated',{iat});
        assert.equal(await scalar('select account_setup_complete(auth.uid())'),false);
        assert.equal(await scalar('select count(*) from public.onboarding_probe'),0);
      }
    });
    await check('invalid live cutoff metadata fails closed without raising casting errors', async () => {
      await db.query('update auth.users set raw_app_meta_data=$1::jsonb where id=$2',[JSON.stringify({
        must_reset_password:false,setup_completed_at:'not-a-timestamp',
      }),CURRENT]);
      await assume(CURRENT);
      assert.equal(await scalar('select account_setup_complete(auth.uid())'),false);
      await rejected(() => scalar('select account_setup_pre_request()'),/sign in again/);
    });
    await check('token-age checks only apply to the current subject and never to service-role lookups', async () => {
      await db.query('update auth.users set raw_app_meta_data=$1::jsonb where id=$2',[JSON.stringify({
        must_reset_password:false,setup_completed_at:COMPLETED_AT,
      }),CURRENT]);
      await assume(ADMIN,'authenticated',{iat:undefined});
      assert.equal(await scalar('select account_setup_complete($1)',[CURRENT]),true);
      await assume(CURRENT,'service_role',{iat:undefined});
      assert.equal(await scalar('select account_setup_complete(auth.uid())'),true);
      await scalar('select account_setup_pre_request()');
      assert.equal(await scalar('select count(*) from storage.objects'),1);
    });
    await check('previously completed accounts and missing metadata remain usable', async () => {
      await db.query('update auth.users set raw_app_meta_data=null where id=$1',[CURRENT]);
      await assume(CURRENT,'authenticated',{iat:undefined});
      await scalar('select account_setup_pre_request()');
      assert.equal(await scalar('select account_setup_complete(auth.uid())'), true);
      assert.equal(await scalar('select count(*) from public.onboarding_probe'),1);
    });
    await check('account setup does not override an archived account restriction', async () => {
      await db.query("update auth.users set raw_app_meta_data=$1::jsonb where id=$2",[JSON.stringify({must_reset_password:false}),OLD]);
      await assume(OLD);
      assert.equal(await scalar('select account_setup_complete(auth.uid())'),true);
      await rejected(() => scalar('select account_setup_pre_request()'),/Account merged/);
      assert.equal(await scalar('select count(*) from public.onboarding_probe'),0);
      assert.equal(await scalar('select count(*) from storage.objects'),0);
    });
    await check('service-role maintenance retains its intentional bypass and predecessor hook', async () => {
      await db.query("update auth.users set raw_app_meta_data=$1::jsonb where id=$2",[JSON.stringify({must_reset_password:true}),OLD]);
      await assume(OLD,'service_role');
      await scalar('select account_setup_pre_request()');
      assert.equal(await scalar("select current_setting('test.previous_request_actor',true)"),'service_role');
      assert.equal(await scalar('select count(*) from public.onboarding_probe'),1);
      assert.equal(await scalar('select count(*) from storage.objects'),1);
    });
    await check('missing identities fail closed while ordinary unauthenticated request hooks still work', async () => {
      await assume('00000000-0000-0000-0000-000000009999');
      assert.equal(await scalar('select account_setup_complete(auth.uid())'),false);
      await rejected(() => scalar('select account_setup_pre_request()'),/Complete password setup/);
      await assume('', 'anon');
      await scalar('select account_setup_pre_request()');
      assert.equal(await scalar('select account_setup_complete(auth.uid())'),true);
    });
    await check('every existing archive-protected table also has the restrictive setup policy', async () => {
      assert.equal(await scalar(`select count(*) from pg_policies p where p.policyname='account_merge_subject_guard'
        and p.schemaname in ('public','storage') and not exists (
          select 1 from pg_policies s where s.schemaname=p.schemaname and s.tablename=p.tablename
            and s.policyname='account_setup_subject_guard' and s.permissive='RESTRICTIVE')`),0);
      assert.equal(await scalar("select split_part(setting,'=',2) from pg_db_role_setting s cross join lateral unnest(s.setconfig) setting where setrole='authenticator'::regrole and setdatabase<>0 and setting like 'pgrst.db_pre_request=%'"),'public.account_setup_pre_request');
    });
  } finally { await db.close(); }
});
