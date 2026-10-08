import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const SOURCE = '00000000-0000-0000-0000-000000000901';
const DEST = '00000000-0000-0000-0000-000000000902';
const ADMIN = '00000000-0000-0000-0000-000000000903';
const REQUEST = '00000000-0000-0000-0000-000000000321';
const COPY_REQUEST = '00000000-0000-0000-0000-000000000322';

test('member merges archive identities and enforce database access boundaries', {
  skip: !process.env.PGLITE_PACKAGE_DIR,
  timeout: 180000,
}, async (t) => {
  const moduleUrl = (file) => pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, file)).href;
  const { PGlite } = await import(moduleUrl('dist/index.js'));
  const { pg_trgm } = await import(moduleUrl('dist/contrib/pg_trgm.js'));
  const db = new PGlite({ extensions: { pg_trgm } });
  const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
  const options = (extra = {}) => ({ dry_run: false, operation: 'merge', request_id: REQUEST,
    actor_user_id: ADMIN, kpi_merge: 'skip', destination_email: 'new@example.test',
    destination_ghl_contact_id: 'verified-new-contact', ...extra });
  const transfer = (extra = {}, source = SOURCE, dest = DEST) => scalar(
    'select public.transfer_user_data_admin_v3($1,$2,$3::jsonb)', [source, dest, JSON.stringify(options(extra))]);
  const replay = (extra = {}, source = SOURCE, dest = DEST) => scalar(
    'select public.get_account_transfer_result_v3($1,$2,$3::jsonb)', [source, dest, JSON.stringify(options(extra))]);
  const snapshot = async () => {
    const data = {};
    for (const table of ['profiles','user_roles','account_merges','user_merge_log','business_reviews',
      'coaching_notes_base','coaching_note_action_steps','implementation_meeting_sessions','implementation_step_notes',
      'general_coaching_notes','user_coaches','user_assistants','ninety_day_cycle_users','smart_doc_responses']) {
      data[table] = await rows(`select to_jsonb(t) as value from public.${table} t order by to_jsonb(t)::text`);
    }
    return data;
  };
  const transactionTest = (name, fn) => t.test(name, async () => {
    await db.exec('begin;');
    try { await fn(); } finally {
      await db.exec('rollback;');
      await db.exec('set session authorization postgres; reset role;');
    }
  });
  const rejected = async (fn, expected) => {
    await db.exec('savepoint expected_failure');
    try { await assert.rejects(fn, expected); } finally { await db.exec('rollback to savepoint expected_failure'); }
  };
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
      grant usage on schema storage,auth to anon,authenticated,service_role;
      grant all on storage.objects,storage.buckets to authenticated,service_role;
      insert into storage.objects values('00000000-0000-0000-0000-000000000001','private-file');
      create function public.previous_request_check() returns void language plpgsql as
        $$ begin perform set_config('test.previous_request_actor',current_user,true); end $$;
      alter role authenticator set pgrst.db_pre_request='public.previous_request_check';`);
    for (const name of [
      '20260826000000_remote_schema.sql', '20260901001000_ninety_day_user_lifecycle.sql',
      '20260901002000_ninety_day_cycles.sql', '20260913010000_member_pauses.sql',
      '20260914000000_legend_foundation_scorecard.sql', '20260922000000_allow_concurrent_ninety_day_cycles.sql',
      '20260922010000_dual_membership_homes.sql', '20260925000000_carry_implementation_completion_to_next_review.sql',
      '20260925010000_system_implementation_guides.sql', '20260925020000_implementation_meeting_workspaces.sql',
      '20260929010000_coaching_notes_history.sql', '20260929020000_manual_implementation_meetings.sql',
      '20260929030000_implementation_next_meeting_booking.sql', '20261008000000_complete_account_transfers.sql',
      '20261008010000_archive_merged_accounts.sql',
    ]) {
      if (name === '20261008010000_archive_merged_accounts.sql') await db.exec('set check_function_bodies=true;');
      await db.exec(await read(`supabase/migrations/${name}`));
    }
    await db.exec('set search_path=public; set check_function_bodies=true; set row_security=on;');
    await db.exec(await read('tests/fixtures/transferBusinessReviews.sql'));
    await db.exec(`begin; ${await read('tests/fixtures/transferAccountData.sql')} commit;`);
    await db.exec(`update auth.users set phone='+15550000901' where id='${SOURCE}';
      insert into user_roles(user_id,role_id) select '${SOURCE}',id from roles where code='user' on conflict do nothing;
      insert into user_roles(user_id,role_id) select '${DEST}',id from roles where code='user' on conflict do nothing;`);

    await transactionTest('merge preview leaves accounts and history unchanged and discloses archive', async () => {
      const before = await snapshot();
      const dry = await transfer({ dry_run: true });
      assert.equal(dry.operation, 'merge');
      assert.equal(dry.archived, false);
      assert.equal(dry.counts.account_archive.archived, 1);
      assert.equal(dry.merge.merged_at, null);
      const after = await snapshot();
      assert.equal(after.user_merge_log.length, before.user_merge_log.length + 1);
      delete before.user_merge_log; delete after.user_merge_log;
      assert.deepEqual(after, before);
    });

    await transactionTest('legacy previews can omit a request ID while live operations require one', async () => {
      const preview = options({dry_run:true}); delete preview.request_id;
      const result = await scalar('select transfer_user_data_admin_v3($1,$2,$3)',[SOURCE,DEST,JSON.stringify(preview)]);
      assert.match(result.request_id,/^[0-9a-f-]{36}$/);
      assert.equal(result.archived,false);
      await rejected(() => transfer({request_id:null}),/request ID/);
    });

    await transactionTest('default merge copies full history then retires source while preserving identity', async () => {
      const sourceBefore = (await rows('select * from profiles where id=$1',[SOURCE]))[0];
      const sourceReviews = await rows('select * from business_reviews where user_id=$1 order by id',[SOURCE]);
      const result = await transfer();
      assert.equal(result.archived, true);
      const sourceAfter = (await rows('select * from profiles where id=$1',[SOURCE]))[0];
      assert.deepEqual({ ...sourceAfter, merged_at:null, merged_into_user_id:null }, sourceBefore);
      assert.equal(sourceAfter.merged_into_user_id, DEST);
      const ledger = (await rows('select * from account_merges where source_user_id=$1',[SOURCE]))[0];
      assert.equal(ledger.source_snapshot.profile.ghl_contact_id, sourceBefore.ghl_contact_id);
      assert.equal(ledger.source_snapshot.auth.phone, '+15550000901');
      assert.equal(ledger.source_email, 'old@example.test');
      assert.equal(ledger.dest_email, 'new@example.test');
      const sourceReviewsAfter = await rows('select * from business_reviews where user_id=$1 order by id',[SOURCE]);
      assert.deepEqual(sourceReviewsAfter.map((r) => ({...r,meeting_id:r.archived_meeting_id ?? r.meeting_id,
        archived_meeting_id:null,updated_at:sourceReviews.find((original) => original.id===r.id).updated_at})),sourceReviews);
      assert.equal(await scalar('select count(*)::int from implementation_meeting_sessions where user_id=$1',[DEST]),2);
      assert.equal(await scalar('select count(*)::int from user_coaches where user_id=$1 and is_active',[SOURCE]),0);
      assert.equal(await scalar('select count(*)::int from ninety_day_cycle_users where user_id=$1 and ended_at is null',[SOURCE]),0);
      assert.equal(await scalar("select outcome from ninety_day_cycle_users where user_id=$1 and cycle_id=902",[SOURCE]),'transferred');
      assert.equal(await scalar('select count(*)::int from get_current_member_ids() where user_id=$1',[SOURCE]),0);
      assert.equal(await scalar('select count(*)::int from get_current_member_ids() where user_id=$1',[DEST]),1);
      assert.equal(await scalar('select merged_at is null from profiles where id=$1',[DEST]),true);
    });

    await transactionTest('exceptional copy leaves the source active and creates no archive ledger', async () => {
      const result = await transfer({ operation:'copy' });
      assert.equal(result.archived,false);
      assert.equal(result.merge,null);
      assert.equal(await scalar('select count(*)::int from account_merges'),0);
      assert.equal(await scalar('select merged_at is null from profiles where id=$1',[SOURCE]),true);
    });

    await transactionTest('archive-only requires exact completed copy evidence and never recopies implementation history', async () => {
      await rejected(() => transfer({ operation:'archive' }), /completed transfer/);
      const copied = await transfer({ operation:'copy',request_id:COPY_REQUEST });
      assert.equal(copied.archived,false);
      await db.query("update business_reviews set review_date=review_date+1 where user_id=$1",[DEST]);
      await db.query("update business_review_preparation_responses set business_forward_wins='Destination edits since the copy' where business_review_id in (select id from business_reviews where user_id=$1)",[DEST]);
      const reviewsBefore = await rows('select id,review_date from business_reviews where user_id=$1 order by id',[DEST]);
      const responsesBefore = await rows('select r.* from business_review_preparation_responses r join business_reviews b on b.id=r.business_review_id where b.user_id=$1 order by r.business_review_id',[DEST]);
      const before = await rows('select * from implementation_meeting_sessions order by id');
      const result = await transfer({ operation:'archive' });
      assert.equal(result.archived,true);
      assert.deepEqual(await rows('select * from implementation_meeting_sessions order by id'),before);
      assert.deepEqual(await rows('select id,review_date from business_reviews where user_id=$1 order by id',[DEST]),reviewsBefore);
      assert.deepEqual(await rows('select r.* from business_review_preparation_responses r join business_reviews b on b.id=r.business_review_id where b.user_id=$1 order by r.business_review_id',[DEST]),responsesBefore);
      assert.equal(await scalar('select count(*)::int from account_merges'),1);
      assert.equal(await scalar('select transfer_log_id from account_merges'), await scalar("select id from user_merge_log where options->>'request_id'=$1",[COPY_REQUEST]));
      await rejected(() => replay({operation:'archive',transfer_log_id:999999}),/different parameters/);
    });

    await transactionTest('merged meetings remain operational for GHL sync and cancellation without changing archived history', async () => {
      await db.query('insert into user_coaches(user_id,coach_id) values($1,$2)',[SOURCE,ADMIN]);
      await db.exec("update meetings set ghl_appointment_id='existing-appointment',ghl_status='confirmed' where id=901");
      const archivedAttendance = await rows('select * from meeting_attendance_base where user_id=$1 and meeting_id=901',[SOURCE]);
      const result = await transfer();
      assert.equal(result.counts.business_reviews.meeting_links_transferred,1);
      const destinationReview = await scalar('select id from business_reviews where user_id=$1 and meeting_id=901',[DEST]);
      assert.ok(destinationReview);
      assert.equal(await scalar('select archived_meeting_id from business_reviews where id=901'),901);
      const sourceReview = await rows('select * from business_reviews where id=901');
      const sync = (cancelled) => rows(`select * from sync_business_audit_appointment(
        'existing-appointment','calendar','2026-09-01T12:00:00Z','2026-09-01T13:00:00Z',
        'America/Edmonton',$1,'Existing appointment',$2,$3,'2026-09-01',$4)`,
        [cancelled ? 'cancelled':'confirmed',DEST,ADMIN,cancelled]);
      for (const cancelled of [false,true]) {
        const synced = (await sync(cancelled))[0];
        assert.equal(synced.business_review_id,destinationReview);
        assert.equal(synced.business_review_created,false);
        assert.deepEqual(await rows('select * from business_reviews where id=901'),sourceReview);
        assert.deepEqual(await rows('select * from meeting_attendance_base where user_id=$1 and meeting_id=901',[SOURCE]),archivedAttendance);
      }
      assert.equal(await scalar('select count(*)::int from meeting_attendance_base where user_id=$1 and meeting_id=901',[DEST]),0);
    });

    await transactionTest('archive-only rejects ambiguous copied meeting lineage atomically', async () => {
      await transfer({operation:'copy',request_id:COPY_REQUEST});
      await db.query('update coaching_notes_base set m2_meeting_id=901 where id=903');
      const before = await snapshot();
      await rejected(() => transfer({operation:'archive'}),/uniquely match/);
      assert.deepEqual(await snapshot(),before);
    });

    await transactionTest('archive-only preview rejects destination review ownership conflicts before writes', async () => {
      await transfer({operation:'copy',request_id:COPY_REQUEST});
      await db.query(`update business_reviews set meeting_id=902 where user_id=$1 and coaching_note_id in
        (select id from coaching_notes_base where user_id=$1 and m2_meeting_id=901)`,[DEST]);
      const before = await snapshot();
      await rejected(() => transfer({operation:'archive',dry_run:true}),/already owns a different meeting/);
      assert.deepEqual(await snapshot(),before);
    });

    await transactionTest('merged members disappear from roster RPCs and periodic attention updates safely skip them', async () => {
      await db.query('insert into user_coaches(user_id,coach_id) values($1,$2)',[SOURCE,ADMIN]);
      await transfer();
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ADMIN]);
      for (const rpc of ['get_all_users()','get_my_users()','get_my_users_with_status()']) {
        assert.equal(await scalar(`select count(*)::int from ${rpc} where user_id=$1`,[SOURCE]),0);
        assert.equal(await scalar(`select count(*)::int from ${rpc} where user_id=$1`,[DEST]),1);
      }
      const before = await rows('select * from profiles where id=$1',[SOURCE]);
      await scalar('select apply_user_attention_auto($1)',[SOURCE]);
      assert.deepEqual(await rows('select * from profiles where id=$1',[SOURCE]),before);
    });

    await transactionTest('trusted system maintenance has explicit null attribution and interactive merges require an active admin', async () => {
      await rejected(() => transfer({actor_user_id:null}),/admin actor/);
      await rejected(() => transfer({actor_user_id:SOURCE}),/admin actor/);
      await rejected(() => transfer({system_actor:true}),/admin actor/);
      await transfer({actor_user_id:null,system_actor:true});
      const ledger = (await rows('select * from account_merges'))[0];
      assert.equal(ledger.actor_user_id,null);
      assert.equal(ledger.source_snapshot.execution_actor,'system');
    });

    await transactionTest('destination GHL identity rejects active collisions but allows source retirement and archived history', async () => {
      await db.query("update profiles set ghl_user_id='verified-new-contact' where id=$1",[ADMIN]);
      await rejected(() => transfer({dry_run:true}),/another active account/);
      await db.query('update profiles set ghl_user_id=null where id=$1',[ADMIN]);
      await rejected(() => transfer({operation:'copy',destination_ghl_contact_id:'source-contact'}),/another active account/);
      assert.equal((await transfer({dry_run:true,destination_ghl_contact_id:'source-contact'})).archived,false);
      await transfer();
      const third = '00000000-0000-0000-0000-000000000905';
      const fourth = '00000000-0000-0000-0000-000000000904';
      await db.query('insert into auth.users(id,email) values($1,$2)',[third,'third@example.test']);
      await db.query('insert into profiles(id) values($1)',[third]);
      const secondMerge = await transfer({request_id:COPY_REQUEST,destination_email:'third@example.test',
        destination_ghl_contact_id:'source-contact'},fourth,third);
      assert.equal(secondMerge.archived,true);
      assert.equal(await scalar('select ghl_contact_id from profiles where id=$1',[third]),'source-contact');
    });

    await transactionTest('archive-only preview cannot use a transfer for another pair or an incomplete log', async () => {
      await db.query(`insert into user_merge_log(source_user_id,dest_user_id,dry_run,options,result_json)
        values($1,$2,false,'{}','{}')`,[SOURCE,DEST]);
      await rejected(() => transfer({operation:'archive',dry_run:true}), /completed transfer/);
    });

    await transactionTest('durable merge replay survives GHL identity/email changes and rejects operation changes', async () => {
      const result = await transfer();
      const before = await snapshot();
      await db.query('update auth.users set email=$2 where id=$1',[DEST,'changed@example.test']);
      assert.deepEqual(await replay({destination_email:'',destination_ghl_contact_id:null}),result);
      assert.deepEqual(await transfer({destination_email:'',destination_ghl_contact_id:null}),result);
      assert.deepEqual(await snapshot(),before);
      await rejected(() => replay({operation:'copy'}), /different parameters/);
      await rejected(() => replay({kpi_merge:'prefer_source'}), /different parameters/);
    });

    await transactionTest('legacy v2 copy results replay only as copy and cannot silently become a merge', async () => {
      const legacy = options({request_id:COPY_REQUEST}); delete legacy.operation; delete legacy.actor_user_id;
      const original = await scalar('select transfer_user_data_admin_v2($1,$2,$3)',[SOURCE,DEST,JSON.stringify(legacy)]);
      assert.deepEqual(await replay({request_id:COPY_REQUEST,operation:'copy'}),{...original,operation:'copy',archived:false});
      await rejected(() => replay({request_id:COPY_REQUEST}), /different parameters/);
    });

    await transactionTest('archive state and ledger cannot be forged or cleared through profile/table writes', async () => {
      await rejected(() => db.query('update profiles set merged_into_user_id=$2,merged_at=now() where id=$1',[SOURCE,DEST]), /managed/);
      await transfer();
      await rejected(() => db.query('update profiles set merged_into_user_id=null,merged_at=null where id=$1',[SOURCE]), /managed/);
      await rejected(() => db.query('update account_merges set dest_user_id=$2 where source_user_id=$1',[SOURCE,ADMIN]), /immutable/);
      await rejected(() => db.query('delete from account_merges where source_user_id=$1',[SOURCE]), /immutable/);
      assert.equal(await scalar("select has_table_privilege('authenticated','account_merges','SELECT')"),false);
      assert.equal(await scalar("select has_table_privilege('service_role','account_merges','INSERT')"),false);
    });

    await transactionTest('existing JWTs are denied before RPCs and through restrictive public/storage RLS', async () => {
      await transfer();
      await db.exec(`set session authorization authenticated; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${SOURCE}';`);
      await rejected(() => scalar('select account_merge_pre_request()'), /Account merged/);
      assert.equal(await scalar('select count(*)::int from profiles'),0);
      assert.equal(await scalar('select count(*)::int from storage.objects'),0);
      await rejected(() => db.query("insert into wins(user_id,added_by,body) values($1,$1,'Blocked')",[SOURCE]), /Account merged|row-level security/);
      for (const rpc of ['transfer_user_data_admin_v3','get_account_transfer_result_v3']) {
        await rejected(() => scalar(`select ${rpc}($1,$2,$3)`,[SOURCE,DEST,JSON.stringify(options())]), /permission denied|admin server/);
      }
    });

    await transactionTest('nonarchived requests retain predecessor hook role and existing Storage grants', async () => {
      await transfer();
      await db.exec(`set session authorization authenticated; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${DEST}';`);
      await scalar('select account_merge_pre_request()');
      assert.equal(await scalar("select current_setting('test.previous_request_actor')"),'authenticated');
      assert.equal(await scalar('select count(*)::int from storage.objects'),1);
    });

    await transactionTest('service-backed writes cannot alter archived member history or reassign its owner', async () => {
      await transfer();
      for (const [sql,args] of [
        ['update profiles set first_name=$2 where id=$1',[SOURCE,'Changed']],
        ["insert into wins(user_id,body) values($1,'New win')",[SOURCE]],
        ["update coaching_note_action_steps set label='Changed' where id=901",[]],
        ['update business_reviews set user_id=$2 where user_id=$1',[SOURCE,DEST]],
        ['delete from general_coaching_notes where user_id=$1',[SOURCE]],
        ['update monthly_kpi_values set value=99 where monthly_kpi_record_id=901',[]],
      ]) await rejected(() => db.query(sql,args),/Account merged/);
    });

    await transactionTest('merged sources, merged destinations and merge chains are rejected', async () => {
      await transfer();
      await rejected(() => transfer({request_id:COPY_REQUEST}), /archived/);
      await rejected(() => transfer({request_id:COPY_REQUEST},DEST,SOURCE), /archived/);
      const third = '00000000-0000-0000-0000-000000000905';
      await db.query('insert into auth.users(id,email) values($1,$2)',[third,'third@example.test']);
      await db.query('insert into profiles(id) values($1)',[third]);
      await rejected(() => transfer({request_id:COPY_REQUEST,destination_email:'third@example.test'},DEST,third), /chains|canonical destination/);
    });

    await transactionTest('archive failure rolls back the copied graph, destination identity and source lifecycle', async () => {
      await db.exec(`create function reject_archive_test() returns trigger language plpgsql as
        $$ begin raise exception 'Injected archive failure'; end $$;
        create trigger reject_archive_test before insert on account_merges for each row execute function reject_archive_test();`);
      const before = await snapshot();
      await rejected(() => transfer(), /Injected archive failure/);
      assert.deepEqual(await snapshot(),before);
    });
  } finally { await db.close(); }
});
