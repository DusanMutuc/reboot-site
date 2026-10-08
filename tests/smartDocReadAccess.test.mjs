import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('Smart Doc staff RPCs enforce owner, assignment and live account access in PostgreSQL', {
  skip: !process.env.PGLITE_PACKAGE_DIR, timeout: 180000,
}, async (t) => {
  const moduleUrl = (file) => pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, file)).href;
  const { PGlite } = await import(moduleUrl('dist/index.js'));
  const { pg_trgm } = await import(moduleUrl('dist/contrib/pg_trgm.js'));
  const db = new PGlite({ extensions: { pg_trgm } });
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
  const assume = async (id, role = 'authenticated') => {
    await db.exec('reset role');
    await rows("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id ? uid(id) : '', role]);
    await db.exec(`set role ${role}`);
  };
  const answers = (owner = 1, block = 300) => rows('select * from get_user_smartdoc_answers($1,$2)', [uid(owner), block]);
  const instances = (owner = 1, submitted = false) => rows('select * from list_user_smartdoc_instances($1,100,$2)', [uid(owner), submitted]);
  const reset = (owner = 1) => rows('select coach_reset_doc(300,$1)', [uid(owner)]);
  const clear = (prompt = 210) => rows('select coach_clear_field(300,$1,$2)', [uid(1), prompt]);
  const rejected = async (fn, pattern) => {
    await db.exec('savepoint expected_error');
    try { await assert.rejects(fn, pattern); } finally { await db.exec('rollback to savepoint expected_error'); }
  };
  const check = (name, body) => t.test(name, async () => {
    await db.exec('reset role; begin');
    try { await body(); } finally { await db.exec('rollback; reset role'); }
  });
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
    const migrationDir = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(migrationDir)).sort()) {
      if (name > '20261008010000_archive_merged_accounts.sql' || name.includes('seed_system_implementation_guides')
        || name === '20260916000000_transfer_business_reviews.sql') continue;
      await db.exec(await readFile(new URL(name, migrationDir), 'utf8'));
    }
    await db.exec('set search_path=public;set check_function_bodies=true;set row_security=on');
    for (const name of ['20261008019000_secure_onboarding.sql', '20261008020000_content_access_and_progress.sql',
      '20261008021000_smartdoc_submission_integrity.sql']) {
      await db.exec(await readFile(new URL(name, migrationDir), 'utf8'));
    }
    await db.exec(`insert into roles(code) values('user'),('admin'),('coach'),('past_member') on conflict do nothing;
      insert into auth.users(id) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,10) n;
      insert into profiles(id) select id from auth.users;
      insert into user_roles(user_id,role_id) select u.id,r.id from auth.users u cross join roles r
        where (u.id in ('${uid(1)}','${uid(2)}') and r.code='user')
           or (u.id in ('${uid(3)}','${uid(5)}','${uid(6)}','${uid(7)}','${uid(8)}','${uid(9)}') and r.code='coach')
           or (u.id in ('${uid(4)}','${uid(5)}','${uid(7)}','${uid(8)}','${uid(10)}') and r.code='admin')
           or (u.id='${uid(5)}' and r.code='past_member');
      insert into user_coaches(user_id,coach_id,is_active) select '${uid(1)}',id,id<>'${uid(6)}' from auth.users
        where id in ('${uid(3)}','${uid(5)}','${uid(6)}','${uid(7)}','${uid(8)}');
      update auth.users set raw_app_meta_data='{"must_reset_password":true}' where id='${uid(8)}';
      insert into content_nodes(id,node_type,title,slug,state,sequential_unlock) values
        (100,'course','Course','course','published',false),(110,'lesson','Published','published','published',false),
        (111,'lesson','Retired','retired','draft',false),(112,'lesson','New draft','new-draft','draft',false);
      insert into node_edge_rules(parent_type,child_kind,child_type) values('course','node','lesson');
      insert into node_children(parent_id,child_id,position) values(100,110,1),(100,111,2),(100,112,3);
      insert into smart_docs(id,title,is_published) values(200,'Shared doc',true);
      insert into smart_doc_prompts(id,doc_id,label,required,position) values(210,200,'Required question',true,1);
      insert into content_blocks(id,node_id,block_type,smart_doc_id) values
        (300,110,'smart_doc',200),(301,111,'smart_doc',200),(302,112,'smart_doc',200);
      insert into smart_doc_responses(id,content_block_id,user_id,status,submitted_at) values
        (400,300,'${uid(1)}','submitted',now()),(401,300,'${uid(2)}','submitted',now()),
        (402,301,'${uid(1)}','submitted',now());
      insert into smart_doc_response_values(response_id,prompt_id,value_json) values
        (400,210,'"Owner answer"'),(401,210,'"Other answer"'),(402,210,'"Historical answer"');
      insert into user_merge_log(id,source_user_id,dest_user_id,dry_run) values(500,'${uid(7)}','${uid(10)}',false);
      insert into account_merges(source_user_id,dest_user_id,actor_user_id,request_id,transfer_log_id,source_snapshot)
        values('${uid(7)}','${uid(10)}','${uid(4)}','${uid(500)}',500,'{}');
      update profiles p set merged_into_user_id=m.dest_user_id,merged_at=m.merged_at from account_merges m where p.id=m.source_user_id;`);

    await check('anonymous callers cannot execute any of the four RPCs', async () => {
      await assume(null, 'anon');
      for (const fn of [answers, instances, reset, clear]) await rejected(() => fn(), /permission denied for function/);
    });
    await check('members read only their own answers through accessible published placements', async () => {
      await assume(1);
      assert.deepEqual((await answers()).map((r) => r.value_text), ['Owner answer']);
      assert.deepEqual((await instances()).map((r) => r.content_block_id), [300]);
      assert.deepEqual(await answers(1, 301), []);
      assert.deepEqual(await answers(2), []);
      assert.deepEqual(await instances(2), []);
      await rejected(() => reset(), /Permission denied/);
      await rejected(() => clear(), /Permission denied/);
    });
    await check('assigned coaches see the selected owner and existing retired history only', async () => {
      await assume(3);
      assert.deepEqual((await answers()).map((r) => r.value_text), ['Owner answer']);
      assert.deepEqual((await answers(1, 301)).map((r) => r.value_text), ['Historical answer']);
      assert.deepEqual((await instances()).map((r) => r.content_block_id).sort(), [300, 301]);
      assert.deepEqual(await answers(1, 302), []);
      assert.deepEqual(await answers(2), []);
      assert.deepEqual(await instances(2), []);
      await rejected(() => reset(2), /Permission denied/);
    });
    await check('inactive and unassigned coaches receive no answers or metadata', async () => {
      for (const id of [6, 9]) {
        await assume(id);
        assert.deepEqual(await answers(), []); assert.deepEqual(await instances(), []);
        await rejected(() => reset(), /Permission denied/); await rejected(() => clear(), /Permission denied/);
      }
    });
    await check('active admins retain historical and draft review access for the requested owner', async () => {
      await assume(4);
      assert.deepEqual((await answers(2)).map((r) => r.value_text), ['Other answer']);
      assert.deepEqual((await instances()).map((r) => r.content_block_id).sort(), [300, 301, 302]);
      assert.deepEqual((await instances(1, true)).map((r) => r.content_block_id).sort(), [300, 301]);
      await reset();
      assert.equal((await answers())[0].status, 'draft');
      assert.equal((await answers())[0].value_text, 'Owner answer');
    });
    await check('past, merged and pending staff cannot read or mutate even with admin roles and assignments', async () => {
      for (const id of [5, 7, 8]) {
        await assume(id);
        assert.deepEqual(await answers(), []); assert.deepEqual(await instances(), []);
        await rejected(() => reset(), /Permission denied/); await rejected(() => clear(), /Permission denied/);
      }
      await db.exec('reset role');
      assert.equal(await scalar('select count(*)::int from smart_doc_response_values'), 3);
      assert.equal(await scalar("select count(*)::int from smart_doc_responses where status='submitted'"), 3);
    });
    await check('service reads retain the exact requested owner without a browser session', async () => {
      await assume(null, 'service_role');
      assert.deepEqual((await answers(2)).map((r) => r.value_text), ['Other answer']);
      assert.equal((await instances()).length, 3);
    });
    await check('clearing a field invalidates submitted status atomically and does not affect another owner', async () => {
      await assume(3); await clear();
      assert.equal((await answers())[0].value_text, null);
      assert.equal((await answers())[0].status, 'draft');
      assert.equal((await answers())[0].submitted_at, null);
      await assume(2); assert.equal((await answers(2))[0].value_text, 'Other answer');
      await assume(1);
      await rejected(() => rows('select * from submit_smart_doc(300,$1)', [uid(1)]), /every required question/);
    });
    await check('clearing an unrelated prompt is a no-op and keeps a valid submission intact', async () => {
      await assume(3); await clear(999);
      assert.equal((await answers())[0].status, 'submitted');
      assert.equal((await answers())[0].value_text, 'Owner answer');
    });
    await check('losing the owner entitlement blocks owner reads while assigned staff retain existing history', async () => {
      await db.exec(`insert into user_roles(user_id,role_id) select '${uid(1)}',id from roles where code='past_member'`);
      await assume(1); assert.deepEqual(await answers(), []); assert.deepEqual(await instances(), []);
      await assume(3); assert.equal((await answers())[0].value_text, 'Owner answer');
    });
  } finally { await db.close(); }
});
