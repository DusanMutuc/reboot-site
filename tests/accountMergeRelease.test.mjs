import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrationPath, releasePath, renderAccountMergeRelease } from '../tools/build-account-merge-release.mjs';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('merged-account SQL Editor release matches its canonical migration and generator', async () => {
  const [migration, release] = await Promise.all([read(migrationPath), read(releasePath)]);
  assert.equal(release.replaceAll('\r\n', '\n'), renderAccountMergeRelease(migration));
});

test('merged-account release installs and records history only after atomic access verification', {
  skip: !process.env.PGLITE_PACKAGE_DIR,
  timeout: 180000,
}, async (t) => {
  const moduleUrl = (file) => pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, file)).href;
  const { PGlite } = await import(moduleUrl('dist/index.js'));
  const { pg_trgm } = await import(moduleUrl('dist/contrib/pg_trgm.js'));
  const db = new PGlite({ extensions: { pg_trgm } });
  const release = renderAccountMergeRelease(await read(migrationPath));
  const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
  const rejectedRelease = async (pattern) => {
    try { await assert.rejects(() => db.exec(release), pattern); }
    finally { await db.exec('rollback;'); }
  };
  const historyCount = () => scalar("select count(*)::int from supabase_migrations.schema_migrations where version='20261008010000'");
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
      create schema auth;
      create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb,
        raw_app_meta_data jsonb,created_at timestamptz,last_sign_in_at timestamptz);
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql as
        $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
      create schema storage;
      create table storage.objects(id uuid primary key,name text);
      create table storage.buckets(id text primary key);
      create function public.previous_request_check() returns void language sql as $$ select $$;
      alter role authenticator set pgrst.db_pre_request='public.previous_request_check';
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
    for (const name of [
      '20260826000000_remote_schema.sql', '20260901001000_ninety_day_user_lifecycle.sql',
      '20260901002000_ninety_day_cycles.sql', '20260913010000_member_pauses.sql',
      '20260914000000_legend_foundation_scorecard.sql', '20260922000000_allow_concurrent_ninety_day_cycles.sql',
      '20260922010000_dual_membership_homes.sql', '20260925000000_carry_implementation_completion_to_next_review.sql',
      '20260925010000_system_implementation_guides.sql', '20260925020000_implementation_meeting_workspaces.sql',
      '20260929010000_coaching_notes_history.sql', '20260929020000_manual_implementation_meetings.sql',
      '20260929030000_implementation_next_meeting_booking.sql', '20261008000000_complete_account_transfers.sql',
    ]) await db.exec(await read(`supabase/migrations/${name}`));

    await t.test('missing predecessor registration fails before archive schema changes', async () => {
      await rejectedRelease(/complete account-transfer release must be installed and registered first/);
      assert.equal(await scalar("select to_regclass('public.account_merges')::text"), null);
      assert.equal(await historyCount(), 0);
      await db.exec("insert into supabase_migrations.schema_migrations values('20261008000000','complete_account_transfers',array[]::text[]);");
    });
    await t.test('partial archive projection is rejected without changing predecessor schema', async () => {
      await db.exec('alter table public.profiles add column merged_at timestamptz;');
      await rejectedRelease(/Unexpected partial merged-account release/);
      assert.equal(await scalar("select to_regclass('public.account_merges')::text"), null);
      assert.equal(await historyCount(), 0);
      await db.exec('alter table public.profiles drop column merged_at;');
    });
    await t.test('an existing dynamic request configuration fails safely instead of replacing security', async () => {
      await db.exec("alter role authenticator set pgrst.db_pre_config='public.existing_configuration';");
      await rejectedRelease(/existing PostgREST pre-config hook/);
      assert.equal(await scalar("select to_regclass('public.account_merges')::text"), null);
      assert.equal(await historyCount(), 0);
      await db.exec('alter role authenticator reset pgrst.db_pre_config;');
    });
    await t.test('a browser-accessible v3 RPC fails verification and rolls back schema, policies, hook and history', async () => {
      const originalFunction = await scalar("select pg_get_functiondef('public.get_current_member_ids()'::regprocedure)");
      const originalPolicies = await scalar('select count(*)::int from pg_policy');
      const originalStorageRls = await scalar("select relrowsecurity from pg_class where oid='storage.objects'::regclass");
      await db.exec(`create function public.break_merge_release_acl() returns event_trigger language plpgsql as $$
        begin
          if to_regprocedure('public.transfer_user_data_admin_v3(uuid,uuid,jsonb)') is not null then
            alter event trigger break_merge_release_acl disable;
            grant execute on function public.transfer_user_data_admin_v3(uuid,uuid,jsonb) to authenticated;
            alter event trigger break_merge_release_acl enable;
          end if;
        end $$;
        create event trigger break_merge_release_acl on ddl_command_end when tag in ('GRANT','REVOKE')
          execute function public.break_merge_release_acl();`);
      await rejectedRelease(/must be service-only SECURITY DEFINER/);
      assert.equal(await scalar("select to_regprocedure('public.transfer_user_data_admin_v3(uuid,uuid,jsonb)')::text"), null);
      assert.equal(await scalar("select to_regclass('public.account_merges')::text"), null);
      assert.equal(await scalar("select count(*)::int from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='merged_at'"), 0);
      assert.equal(await scalar("select pg_get_functiondef('public.get_current_member_ids()'::regprocedure)"), originalFunction);
      assert.equal(await scalar('select count(*)::int from pg_policy'), originalPolicies);
      assert.equal(await scalar("select relrowsecurity from pg_class where oid='storage.objects'::regclass"), originalStorageRls);
      assert.equal(await scalar("select count(*)::int from pg_db_role_setting where setrole=(select oid from pg_roles where rolname='authenticator') and setdatabase<>0"), 0);
      assert.equal(await historyCount(), 0);
      await db.exec('drop event trigger break_merge_release_acl; drop function public.break_merge_release_acl();');
    });
    await t.test('successful release installs protections, preserves predecessor hook and registers exact canonical SQL', async () => {
      await db.exec(release);
      assert.equal(await scalar("select statements[1] from supabase_migrations.schema_migrations where version='20261008010000'"), (await read(migrationPath)).replaceAll('\r\n', '\n'));
      for (const role of ['anon', 'authenticated']) {
        assert.equal(await scalar(`select has_function_privilege('${role}','public.transfer_user_data_admin_v3(uuid,uuid,jsonb)','EXECUTE')`), false);
        assert.equal(await scalar(`select has_table_privilege('${role}','public.account_merges','SELECT,INSERT,UPDATE,DELETE')`), false);
      }
      assert.equal(await scalar("select has_function_privilege('service_role','public.transfer_user_data_admin_v3(uuid,uuid,jsonb)','EXECUTE')"), true);
      assert.equal(await scalar("select has_table_privilege('service_role','public.account_merges','INSERT,UPDATE,DELETE,TRUNCATE')"), false);
      assert.equal(await scalar('select previous_pre_request from public.account_merge_access_settings'), 'public.previous_request_check');
      assert.equal(await scalar("select count(*)::int from pg_policy where polrelid='storage.objects'::regclass and polname='account_merge_subject_guard' and not polpermissive"), 1);
      assert.equal(await scalar('select count(*)::int from public.account_merges'), 0, 'Installation must not merge any member');
      assert.equal(await scalar('select count(*)::int from public.user_merge_log'), 0);
    });
    await t.test('registered release cannot be replayed or duplicate migration history', async () => {
      await rejectedRelease(/already registered/);
      assert.equal(await historyCount(), 1);
      assert.equal(await scalar('select count(*)::int from public.account_merge_access_settings'), 1);
    });
  } finally { await db.close(); }
});
