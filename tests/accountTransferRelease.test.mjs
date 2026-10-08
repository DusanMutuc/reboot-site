import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrationPath, releasePath, renderAccountTransferRelease } from '../tools/build-account-transfer-release.mjs';

test('account-transfer SQL Editor release matches its canonical migration and generator', async () => {
  const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const [migration, release] = await Promise.all([read(migrationPath), read(releasePath)]);
  assert.equal(release.replaceAll('\r\n', '\n'), renderAccountTransferRelease(migration));
});

test('account-transfer SQL Editor release preflight, application and history are atomic', {
  skip: !process.env.PGLITE_PACKAGE_DIR,
  timeout: 120000,
}, async (t) => {
  const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const moduleUrl = (file) => pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, file)).href;
  const { PGlite } = await import(moduleUrl('dist/index.js'));
  const { pg_trgm } = await import(moduleUrl('dist/contrib/pg_trgm.js'));
  const db = new PGlite({ extensions: { pg_trgm } });
  const release = await read(releasePath);
  const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
  const rejectedRelease = async (pattern) => {
    await assert.rejects(() => db.exec(release), pattern);
    await db.exec('rollback;');
  };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb,
        raw_app_meta_data jsonb, created_at timestamptz, last_sign_in_at timestamptz);
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.role() returns text language sql as
        $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
    `);
    for (const name of [
      '20260826000000_remote_schema.sql',
      '20260901001000_ninety_day_user_lifecycle.sql',
      '20260901002000_ninety_day_cycles.sql',
      '20260913010000_member_pauses.sql',
      '20260914000000_legend_foundation_scorecard.sql',
      '20260922000000_allow_concurrent_ninety_day_cycles.sql',
      '20260922010000_dual_membership_homes.sql',
      '20260925000000_carry_implementation_completion_to_next_review.sql',
      '20260925010000_system_implementation_guides.sql',
      '20260925020000_implementation_meeting_workspaces.sql',
      '20260929010000_coaching_notes_history.sql',
      '20260929020000_manual_implementation_meetings.sql',
      '20260929030000_implementation_next_meeting_booking.sql',
    ]) await db.exec(await read(`supabase/migrations/${name}`));

    await t.test('missing implementation prerequisite fails before release changes', async () => {
      await db.exec('alter table public.implementation_meeting_sessions rename column next_meeting_booked to missing_booking_column;');
      await rejectedRelease(/Missing or incompatible implementation session column next_meeting_booked/);
      assert.equal(await scalar("select to_regprocedure('public.transfer_user_data_admin_v2(uuid,uuid,jsonb)')::text"), null);
      assert.equal(await scalar('select count(*)::int from supabase_migrations.schema_migrations'), 0);
      await db.exec('alter table public.implementation_meeting_sessions rename column missing_booking_column to next_meeting_booked;');
    });
    await t.test('partially applied release is rejected without registering history', async () => {
      await db.exec("create function public.get_account_transfer_result_v2(uuid,uuid,jsonb) returns jsonb language sql as $$select null::jsonb$$;");
      await rejectedRelease(/Unexpected existing release function/);
      assert.equal(await scalar('select count(*)::int from supabase_migrations.schema_migrations'), 0);
      await db.exec('drop function public.get_account_transfer_result_v2(uuid,uuid,jsonb);');
    });
    await t.test('postcondition failure rolls back all function, trigger, index and history changes', async () => {
      const previousFunction = await scalar("select pg_get_functiondef('public.transfer_user_data(uuid,uuid,jsonb)'::regprocedure)");
      await db.exec(`
        create function public.break_transfer_release_acl() returns event_trigger language plpgsql as $$
        begin
          if to_regprocedure('public.transfer_user_data_admin_v2(uuid,uuid,jsonb)') is not null then
            -- Avoid recursively invoking this injection with its own GRANT.
            alter event trigger break_transfer_release_acl disable;
            grant execute on function public.transfer_user_data_admin_v2(uuid,uuid,jsonb) to authenticated;
            alter event trigger break_transfer_release_acl enable;
          end if;
        end; $$;
        create event trigger break_transfer_release_acl on ddl_command_end
          when tag in ('GRANT','REVOKE') execute function public.break_transfer_release_acl();
      `);
      await rejectedRelease(/not service-role-only/);
      assert.equal(await scalar("select pg_get_functiondef('public.transfer_user_data(uuid,uuid,jsonb)'::regprocedure)"), previousFunction);
      assert.equal(await scalar("select to_regprocedure('public.transfer_user_data_admin_v2(uuid,uuid,jsonb)')::text"), null);
      assert.equal(await scalar("select to_regclass('public.user_merge_log_applied_request_id_idx')::text"), null);
      assert.equal(await scalar("select count(*)::int from pg_trigger where tgname='zzz_account_transfer_metadata'"), 0);
      assert.equal(await scalar('select count(*)::int from supabase_migrations.schema_migrations'), 0);
      await db.exec('drop event trigger break_transfer_release_acl; drop function public.break_transfer_release_acl();');
    });
    await t.test('successful release registers exact canonical SQL after its privilege checks', async () => {
      await db.exec(release);
      assert.equal(await scalar("select statements[1] from supabase_migrations.schema_migrations where version='20261008000000'"), (await read(migrationPath)).replaceAll('\r\n', '\n'));
      assert.equal(await scalar("select has_function_privilege('service_role','public.transfer_user_data_admin_v2(uuid,uuid,jsonb)','EXECUTE')"), true);
      assert.equal(await scalar("select has_function_privilege('authenticated','public.transfer_user_data_admin_v2(uuid,uuid,jsonb)','EXECUTE')"), false);
      assert.equal(await scalar('select count(*)::int from public.user_merge_log'), 0, 'Installation does not run a member transfer');
    });
    await t.test('a registered release cannot be rerun and its history stays intact', async () => {
      await rejectedRelease(/already registered/);
      assert.equal(await scalar('select count(*)::int from supabase_migrations.schema_migrations'), 1);
    });
  } finally { await db.close(); }
});
