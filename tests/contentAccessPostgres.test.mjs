import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('content entitlements and published progress execute against PostgreSQL with real RLS', {
  skip: !process.env.PGLITE_PACKAGE_DIR, timeout: 180000,
}, async (t) => {
  const moduleUrl = (file) => pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR,file)).href;
  const { PGlite } = await import(moduleUrl('dist/index.js'));
  const { pg_trgm } = await import(moduleUrl('dist/contrib/pg_trgm.js'));
  const db = new PGlite({extensions:{pg_trgm}});
  const rows = async (sql,args=[]) => (await db.query(sql,args)).rows;
  const scalar = async (sql,args=[]) => Object.values((await rows(sql,args))[0])[0];
  const asUser = async (id) => {
    await db.exec('reset role;');
    await rows("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[uid(id)]);
    await db.exec('set role authenticated; set row_security=on;');
  };
  const asService = async () => {
    await db.exec('reset role;');
    await db.exec("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false);");
  };
  const subtest = (name,fn) => t.test(name,async () => {
    await asService(); await db.exec('begin;');
    try { await fn(); } finally { await db.exec('rollback; reset role;'); }
  });
  const rejected = async (fn,pattern) => {
    await db.exec('savepoint expected_error');
    try { await assert.rejects(fn,pattern); } finally { await db.exec('rollback to savepoint expected_error'); }
  };
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
    const migrationDir = new URL('../supabase/migrations/',import.meta.url);
    for (const name of (await readdir(migrationDir)).sort()) {
      if (name > '20261008010000_archive_merged_accounts.sql' || name.includes('seed_system_implementation_guides')
        || name === '20260916000000_transfer_business_reviews.sql') continue;
      try { await db.exec(await readFile(new URL(name,migrationDir),'utf8')); }
      catch(error) { throw new Error(`Migration ${name}: ${error.message}`,{cause:error}); }
    }
    await db.exec('set search_path=public; set check_function_bodies=true; set row_security=on;');
    await db.exec(await readFile(new URL('20261008020000_content_access_and_progress.sql',migrationDir),'utf8'));
    await asService();
    await db.exec(`insert into roles(code) values('user'),('past_member'),('assistant'),('legend'),('admin'),('coach') on conflict do nothing;
      insert into auth.users(id) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,10) n;
      insert into profiles(id) select id from auth.users;
      insert into user_roles(user_id,role_id) select '${uid(1)}',id from roles where code='user';
      insert into user_roles(user_id,role_id) select '${uid(2)}',id from roles where code in ('user','past_member','admin');
      insert into user_roles(user_id,role_id) select '${uid(3)}',id from roles where code='ninety-day-user';
      insert into user_roles(user_id,role_id) select '${uid(4)}',id from roles where code='ninety-day-user';
      insert into user_roles(user_id,role_id) select '${uid(5)}',id from roles where code in ('user','ninety-day-user');
      insert into user_roles(user_id,role_id) select '${uid(6)}',id from roles where code='assistant';
      insert into user_roles(user_id,role_id) select '${uid(7)}',id from roles where code='legend';
      insert into user_roles(user_id,role_id) select '${uid(8)}',id from roles where code='admin';
      insert into user_roles(user_id,role_id) select '${uid(9)}',id from roles where code='coach';
      insert into content_nodes(id,node_type,title,slug,state,sequential_unlock) values
        (100,'collection','Main','library','published',false),
        (101,'collection','Assistant','assistant-library','published',false),
        (102,'collection','Legends','legends-library','published',false),
        (110,'lesson','Assigned system','assigned','published',false),
        (111,'chapter','Assigned chapter','assigned-chapter','published',false),
        (112,'lesson','Other system','other','published',false),
        (113,'lesson','Draft guide','draft-guide','draft',false),
        (114,'chapter','Hidden by parent','hidden-chapter','published',false),
        (115,'chapter','Shared chapter','shared-chapter','published',false),
        (116,'lesson','Assistant guide','assistant-guide','published',false),
        (117,'lesson','Legends guide','legend-guide','published',false),
        (120,'course','Compass','set-your-compass','published',true),
        (121,'lesson','Draft prerequisite','draft-prerequisite','draft',false),
        (122,'lesson','Visible lesson','visible-lesson','published',false),
        (123,'chapter','Draft required chapter','draft-required','draft',false),
        (124,'chapter','Visible required chapter','visible-required','published',false),
        (125,'chapter','Archived required chapter','archived-required','archived',false),
        (126,'lesson','Next lesson','next','published',false),
        (130,'course','Other course','other-course','published',false),
        (131,'course','Limited course','limited','published',false);
      update content_nodes set visibility='limited' where id=131;
      insert into node_edge_rules(parent_type,child_kind,child_type) values
        ('collection','node','lesson'),('lesson','node','chapter'),('course','node','lesson'),
        ('lesson','asset','asset'),('chapter','asset','asset');
      insert into node_children(parent_id,child_id,position,is_required) values
        (100,110,1,true),(110,111,1,true),(100,112,2,true),(100,113,3,true),(113,114,1,true),
        (113,115,2,true),(110,115,2,false),(101,116,1,true),(102,117,1,true),
        (120,121,1,true),(120,122,2,true),(120,126,3,true),(122,123,1,true),(122,124,2,true),(122,125,3,true);
      insert into resources(id,title,type,url,storage_bucket,storage_path,is_discoverable,discovery_open_mode) values
        (200,'Assigned asset','pdf','https://example.test/assigned','private','assigned.pdf',true,'direct'),
        (201,'Other asset','pdf','https://example.test/other','private','other.pdf',true,'direct'),
        (202,'Legends asset','pdf','https://example.test/legend','private','legend.pdf',true,'direct'),
        (203,'Standalone asset','pdf','https://example.test/standalone','private','standalone.pdf',true,'direct'),
        (204,'Draft ancestor asset','pdf','https://example.test/hidden','private','hidden.pdf',true,'direct');
      update resources set state='published';
      insert into content_blocks(id,node_id,block_type,position,resource_id) values
        (300,111,'asset',1,200),(301,112,'asset',1,201),(302,117,'asset',1,202),(304,114,'asset',1,204);
      insert into storage.objects(id,bucket_id,name) select gen_random_uuid(),storage_bucket,storage_path from resources;
      alter table ninety_day_cycles disable trigger ninety_day_cycles_validate_activation;
      insert into ninety_day_cycles(id,name,starts_on,ends_on,status) values(400,'Test cycle','2026-09-01','2026-11-29','active');
      insert into ninety_day_cycle_systems(cycle_id,node_id,position) values(400,110,1);
      insert into ninety_day_cycle_users(cycle_id,user_id) values(400,'${uid(3)}'),(400,'${uid(5)}');
      insert into ninety_day_cycle_users(cycle_id,user_id,ended_at,outcome) values(400,'${uid(4)}',now(),'removed');`);
    await db.exec('alter table ninety_day_cycles enable trigger ninety_day_cycles_validate_activation;');

    await subtest('past_member overrides admin and direct content, RPC, storage reads return nothing',async () => {
      await asUser(2);
      for (const table of ['content_nodes','content_blocks','resources','node_children','storage.objects'])
        assert.equal(await scalar(`select count(*)::int from ${table}`),0,table);
      assert.equal(await scalar('select can_user_access_course(auth.uid(),120)'),false);
      assert.equal(await scalar('select count(*)::int from accessible_discovery_nodes()'),0);
      assert.equal(await scalar('select count(*)::int from search_discovery_catalogue()'),0);
      await assert.rejects(() => db.exec('select set_node_progress(124)'),/Content is not available/);
    });
    await subtest('full, dual, assistant, legend, coach, admin retain their intended access',async () => {
      for (const id of [1,5,6,7,8,9]) {
        await asUser(id);
        assert.equal(await scalar('select can_user_access_course(auth.uid(),130)'),true,`course ${id}`);
        assert.equal(await scalar('select can_access_discovery_resource(auth.uid(),203)'),true,`standalone ${id}`);
      }
      await asUser(6); assert.equal(await scalar('select can_access_discovery_node(auth.uid(),116)'),true);
      await asUser(1); assert.equal(await scalar('select can_access_discovery_node(auth.uid(),116)'),false);
      assert.equal(await scalar('select can_user_access_course(auth.uid(),131)'),false);
    });
    await subtest('only enrolled programme members get assigned systems and Compass',async () => {
      await asUser(3);
      assert.equal(await scalar('select can_user_access_course(auth.uid(),120)'),true);
      assert.equal(await scalar('select can_user_access_course(auth.uid(),130)'),false);
      assert.equal(await scalar('select can_access_discovery_node(auth.uid(),111)'),true);
      assert.equal(await scalar('select can_access_discovery_node(auth.uid(),112)'),false);
      assert.equal(await scalar('select can_access_discovery_resource(auth.uid(),200)'),true);
      for (const id of [201,202,203,204]) assert.equal(await scalar('select can_access_discovery_resource(auth.uid(),$1)',[id]),false);
      assert.deepEqual((await rows('select name from storage.objects order by name')).map((r)=>r.name),['assigned.pdf']);
      assert.equal(await scalar('select count(*)::int from resources'),1);
      await asUser(4);
      assert.equal(await scalar('select count(*)::int from content_nodes'),0);
      assert.equal(await scalar('select can_user_access_course(auth.uid(),120)'),false);
      await asUser(10); assert.equal(await scalar('select count(*)::int from resources'),0);
    });
    await subtest('Legends-only placement authorizes legends and yields the correct path',async () => {
      await asUser(7);
      assert.equal(await scalar('select can_access_discovery_resource(auth.uid(),202)'),true);
      assert.equal(await scalar('select open_path from accessible_discovery_nodes() where node_id=117'),'/legends-library/legend-guide');
      assert.equal(await scalar("select count(*)::int from storage.objects where name='legend.pdf'"),1);
      for (const id of [1,6]) { await asUser(id); assert.equal(await scalar('select can_access_discovery_resource(auth.uid(),202)'),false); }
      await asUser(8); assert.equal(await scalar('select count(*)::int from resources where id=202'),1,'admin preview');
    });
    await subtest('publication applies to every ancestor, with shared published placements surviving',async () => {
      await asUser(1);
      for (const id of [113,114,121,123,125]) assert.equal(await scalar('select can_access_discovery_node(auth.uid(),$1)',[id]),false);
      assert.equal(await scalar('select can_access_discovery_node(auth.uid(),115)'),true);
      assert.equal(await scalar('select can_user_access_node_via_course(auth.uid(),123)'),false);
      assert.equal(await scalar('select count(*)::int from resources where id=204'),0);
      await asUser(8); assert.equal(await scalar('select count(*)::int from content_nodes where id=113'),1,'explicit admin builder preview');
      assert.equal(await scalar('select count(*)::int from accessible_discovery_nodes() where node_id=113'),0,'member inventory stays published');
    });
    await subtest('required drafts and archives cannot block unlock, completion or progress denominators',async () => {
      await asUser(1);
      const unlocks = await rows('select * from get_child_unlock_status(120)');
      assert.deepEqual(unlocks.map((r)=>r.child_id),[122,126]);
      assert.equal(unlocks[0].locked,false); assert.equal(unlocks[1].locked,true);
      assert.equal(await scalar('select total_leaves from get_user_course_progress(auth.uid(),120)'),2);
      await db.exec('select mark_completed_and_cascade(124)');
      assert.equal(await scalar("select status::text from user_node_progress where user_id=auth.uid() and node_id=122"),'completed');
      assert.equal(await scalar('select locked from get_child_unlock_status(120) where child_id=126'),false);
      assert.equal(await scalar('select completed_leaves from get_user_course_progress(auth.uid(),120)'),1);
    });
    await subtest('ordinary callers cannot inspect another identity entitlements',async () => {
      await asUser(1);
      assert.equal(await scalar('select can_user_access_course($1,130)',[uid(7)]),false);
      assert.equal(await scalar('select can_access_discovery_resource($1,202)',[uid(7)]),false);
      await assert.rejects(() => scalar('select count(*) from accessible_discovery_nodes($1)',[uid(7)]),/another member/);
    });
    await subtest('members cannot self-promote, revoke past status, or grant limited course audiences',async () => {
      await asUser(1);
      await rejected(()=>db.exec(`insert into user_roles(user_id,role_id) select auth.uid(),id from roles where code='admin'`),/row-level security/);
      await rejected(()=>db.exec("insert into roles(code) values('hijacked')"),/row-level security/);
      await rejected(()=>db.exec(`insert into content_node_roles(node_id,role_id) select 130,id from roles where code='user'`),/row-level security/);
      await rejected(()=>db.exec(`insert into content_node_roles(node_id,role_id) select 131,id from roles where code='user'`),/course node|row-level security/);
      assert.equal(await scalar("with changed as (update roles set code='hijacked' where code='admin' returning *) select count(*)::int from changed"),0);
      assert.equal(await scalar("with changed as (update user_roles set role_id=(select id from roles where code='admin') where user_id=auth.uid() returning *) select count(*)::int from changed"),0);
      assert.equal(await scalar("with changed as (delete from roles where code='admin' returning *) select count(*)::int from changed"),0);
      await rejected(()=>db.exec('truncate user_roles'),/permission denied/);
      await asUser(2);
      assert.equal(await scalar("with changed as (delete from user_roles where user_id=auth.uid() returning *) select count(*)::int from changed"),0);
      await asUser(8);
      await db.exec(`insert into user_roles(user_id,role_id) select '${uid(10)}',id from roles where code='user'`);
      assert.equal(await scalar('select content_membership_kind($1)',[uid(10)]),'full');
      await asService(); await db.exec('set role anon;');
      await rejected(()=>db.exec(`insert into user_roles(user_id,role_id) select '${uid(10)}',id from roles where code='admin'`),/permission denied/);
      for(const table of ['roles','user_roles','content_node_roles']) {
        await rejected(()=>db.exec(`delete from ${table}`),/permission denied/);
        await rejected(()=>db.exec(`truncate ${table} cascade`),/permission denied/);
      }
    });
    await subtest('legacy builder mutators are service-only and authorized node triggers still cascade',async () => {
      for (const actor of [null,1,2,8]) {
        if(actor) await asUser(actor);
        else { await asService(); await db.exec("select set_config('request.jwt.claim.role','anon',false); set role anon;"); }
        for(const sql of [
          "select set_node_state(122,'published')",
          'select set_course_order(array[130,120]::bigint[])',
          'select enforce_strict_sequence(120,false)',
        ]) await rejected(()=>db.exec(sql),/permission denied/);
      }
      await asService(); await db.exec('set role service_role;');
      await db.exec("select set_node_state(122,'draft'); select enforce_strict_sequence(120,false); select set_course_order(array[130,120]::bigint[]);");
      assert.equal(await scalar("select count(*)::int from content_nodes where id in (122,123,124,125) and state='draft'"),4);
      assert.equal(await scalar('select count(*)::int from node_children where parent_id in (120,122) and is_required'),0);
      assert.deepEqual((await rows('select course_node_id from course_sort_orders order by sort_order')).map((r)=>r.course_node_id),[130,120]);
      await asUser(8);
      await db.exec("update content_nodes set state='published' where id=122; update content_nodes set sequential_unlock=true where id=120;");
      assert.equal(await scalar("select count(*)::int from content_nodes where id in (122,123,124,125) and state='published'"),4);
      assert.equal(await scalar('select count(*)::int from node_children where parent_id in (120,122) and not is_required'),0);
    });
    await subtest('publication progress details match totals and admin draft preview stays separate',async () => {
      await asUser(1);
      assert.deepEqual((await rows('select node_id from get_user_course_completion_detail(auth.uid(),120) order by node_id')).map((r)=>r.node_id),[122,124,126]);
      await rejected(()=>rows('select * from get_child_unlock_status_admin_preview(120,auth.uid())'),/permission denied/);
      await asService();
      assert.deepEqual((await rows('select child_id from get_child_unlock_status_admin_preview(120,$1)',[uid(1)])).map((r)=>r.child_id),[121,122,126]);
    });
    await subtest('merged identity stays excluded even with retained member roles',async () => {
      await db.exec(`insert into user_merge_log(id,source_user_id,dest_user_id,dry_run) values(999,'${uid(1)}','${uid(10)}',false);
        insert into account_merges(source_user_id,dest_user_id,request_id,transfer_log_id,source_snapshot)
          values('${uid(1)}','${uid(10)}',gen_random_uuid(),999,'{}');
        update profiles set merged_into_user_id='${uid(10)}',merged_at=(select merged_at from account_merges where source_user_id='${uid(1)}')
          where id='${uid(1)}';`);
      await asUser(1);
      assert.equal(await scalar('select content_membership_kind(auth.uid())'),'none');
      assert.equal(await scalar('select count(*)::int from resources'),0);
      assert.equal(await scalar('select count(*)::int from accessible_discovery_nodes()'),0);
    });
    await subtest('draft roots, completed cycles and unassociated private files do not grant access',async () => {
      await db.exec(`insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'resources','orphan.pdf');`);
      await asUser(3);
      assert.equal(await scalar("select count(*)::int from storage.objects where name='orphan.pdf'"),0);
      await asService();
      await db.exec("update content_nodes set state='draft' where id=100");
      await asUser(3); assert.equal(await scalar('select can_access_discovery_node(auth.uid(),110)'),false);
      await asService(); await db.exec("update ninety_day_cycles set status='completed' where id=400");
      await asUser(3); assert.equal(await scalar('select can_user_access_course(auth.uid(),120)'),false);
      await asUser(5); assert.equal(await scalar('select can_user_access_course(auth.uid(),120)'),true,'full dual membership survives ended programme');
    });
    await subtest('legacy search entry points inherit content RLS and do not bypass revoked or anonymous access',async () => {
      for(const actor of [2,null]) {
        if(actor) await asUser(actor);
        else { await asService(); await db.exec("select set_config('request.jwt.claim.role','anon',false); set role anon;"); }
        for(const sql of [
          "select count(*)::int from search_resources(''::text,null::text[],null::bigint[],'relevance'::text,24,0,'balanced'::text)",
          "select count(*)::int from search_resources(''::text,null::text[],null::bigint[],null::text,null::text,'relevance'::text,24,0,'balanced'::text)",
          "select count(*)::int from search_resources_with_page(''::text,null::text[],null::bigint[],null::text,null::text,'relevance'::text,24,0,'balanced'::text)",
          'select count(*)::int from get_available_courses_for_user(auth.uid())',
        ]) assert.equal(await scalar(sql),0);
      }
    });
  } finally { await db.close(); }
});
