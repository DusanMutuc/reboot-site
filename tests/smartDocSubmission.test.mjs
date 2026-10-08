import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OWNER = '00000000-0000-0000-0000-000000000801';
const OTHER = '00000000-0000-0000-0000-000000000802';
const ADMIN = '00000000-0000-0000-0000-000000000803';

test('Smart Doc SQL validates submission and serializes edits under authenticated RLS', {
  skip: !process.env.PGLITE_PACKAGE_DIR, timeout: 180000,
}, async (t) => {
  const moduleUrl = (file) => pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, file)).href;
  const { PGlite } = await import(moduleUrl('dist/index.js'));
  const { pg_trgm } = await import(moduleUrl('dist/contrib/pg_trgm.js'));
  const db = new PGlite({ extensions: { pg_trgm } });
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
  const edit = (value, prompt = 1, block = 1, owner = OWNER) => rows('select * from upsert_smart_field_value($1,$2,$3,$4::jsonb)', [block, prompt, owner, JSON.stringify(value)]);
  const submit = (block = 1, owner = OWNER) => rows('select * from submit_smart_doc($1,$2)', [block, owner]);
  const assume = async (owner = OWNER, role = 'authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec(`set role ${role}`);
  };
  const rejected = async (fn, expected) => {
    await db.exec('savepoint rejected');
    try { await assert.rejects(fn, expected); } finally { await db.exec('rollback to savepoint rejected'); }
  };
  const check = (name, body) => t.test(name, async () => {
    await db.exec('begin');
    try { await body(); } finally { await db.exec('rollback; reset role'); }
  });
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql as $$ select current_user::text $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
      grant usage on schema auth to anon, authenticated, service_role;`);
    for (const name of ['20260826000000_remote_schema.sql', '20261008021000_smartdoc_submission_integrity.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    await db.exec(`set search_path=public; set check_function_bodies=true; set row_security=on;
      insert into auth.users(id) values ('${OWNER}'),('${OTHER}'),('${ADMIN}');
      insert into profiles(id) select id from auth.users;
      insert into roles(code) values ('user'),('admin');
      insert into user_roles(user_id,role_id) select '${OWNER}',id from roles where code='user';
      insert into user_roles(user_id,role_id) select '${ADMIN}',id from roles where code='admin';
      insert into content_nodes(id,node_type,title,state) values (1,'lesson','Published','published'),(2,'lesson','Draft','draft');
      insert into smart_docs(id,title,is_published) values (1,'Required questions',true),(2,'Other doc',true),(3,'Draft doc',false),(4,'Optional questions',true);
      insert into content_blocks(id,node_id,block_type,smart_doc_id) values (1,1,'smart_doc',1),(2,1,'smart_doc',2),(3,1,'smart_doc',3),(4,1,'smart_doc',4),(5,2,'smart_doc',1);
      insert into smart_doc_prompts(id,doc_id,label,required,position) values (1,1,'First',true,1),(2,1,'Second',true,2),(3,2,'Other',true,1),(4,4,'Optional',false,1); update smart_docs set is_published=(id <> 3);`);

    await check('required blanks reject atomically without creating a submitted response', async () => {
      await assume();
      await rejected(() => submit(), /every required question/);
      assert.equal(await scalar('select count(*) from smart_doc_responses'), 0);
      await edit('answer');
      await rejected(() => submit(), /1 of 2/);
      assert.equal(await scalar('select status from smart_doc_responses'), 'draft');
    });
    await check('whitespace, JSON objects, and wrong-doc prompt ids cannot bypass validation', async () => {
      await assume();
      await edit(' \t\r\n\u00a0 ');
      assert.deepEqual(await rows('select * from get_smart_doc_progress(1,$1)', [OWNER]), [{ fields_total: 2, fields_completed: 0 }]);
      await rejected(() => edit({ value: 'forged' }), /must be text/);
      await rejected(() => edit('other', 3), /not available/);
      assert.equal(await scalar('select count(*) from smart_doc_response_values'), 1);
      await edit('v');
      assert.equal((await rows('select * from get_smart_doc_progress(1,$1)', [OWNER]))[0].fields_completed, 1);
    });
    await check('successful submit reports accurate totals and retries preserve timestamp', async () => {
      await assume(); await edit('first'); await edit('second', 2);
      const [result] = await submit();
      assert.equal(result.fields_total, 2); assert.equal(result.fields_completed, 2); assert.equal(result.status, 'submitted');
      const [retry] = await submit(); assert.deepEqual(retry.submitted_at, result.submitted_at);
      assert.equal(await scalar('select count(*) from smart_doc_responses'), 1);
    });
    await check('a post-submit edit becomes a draft and cannot retain invalid submitted status', async () => {
      await assume(); await edit('first'); await edit('second', 2); await submit();
      await edit('');
      assert.equal(await scalar('select status from smart_doc_responses'), 'draft');
      assert.equal(await scalar('select submitted_at from smart_doc_responses'), null);
      await rejected(() => submit(), /1 of 2/);
    });
    await check('multiple issued writes and submit settle in order with the latest answer', async () => {
      await assume(); await edit('second', 2);
      // PGlite executes calls on one connection; this verifies queued transactional
      // behavior, not a claim about cross-connection lock contention.
      await Promise.all([edit('first version'), edit('latest version'), submit()]);
      assert.equal(await scalar('select value_json from smart_doc_response_values where prompt_id=1'), 'latest version');
      assert.equal(await scalar('select status from smart_doc_responses'), 'submitted');
      const definition = await scalar("select pg_get_functiondef('public.upsert_smart_field_value(bigint,bigint,uuid,jsonb)'::regprocedure)");
      assert.match(definition, /on conflict \(content_block_id, user_id\) do update/i);
    });
    await check('owner identity is enforced even for a privileged staff viewer', async () => {
      await assume(ADMIN);
      await rejected(() => edit('forged'), /only save your own/);
      await rejected(() => submit(), /only submit your own/);
      await edit('admin answer', 1, 1, ADMIN);
      assert.equal(await scalar('select user_id from smart_doc_responses'), ADMIN);
    });
    await check('unpublished, inaccessible, and nonexistent blocks do not submit as zero-field documents', async () => {
      await assume();
      for (const id of [3,5,999]) await rejected(() => submit(id), /not available/);
      assert.equal(await scalar('select count(*) from smart_doc_responses'), 0);
    });
    await check('optional questions match authored requirements and allow zero-required submission', async () => {
      await assume();
      const [result] = await submit(4);
      assert.equal(result.fields_total, 0); assert.equal(result.fields_completed, 0); assert.equal(result.status, 'submitted');
    });
    await check('anonymous callers cannot invoke write RPCs and functions stay invoker-secured', async () => {
      await assume('', 'anon');
      await rejected(() => edit('anonymous'), /permission denied/);
      await rejected(() => submit(), /permission denied/);
      await db.exec('reset role');
      assert.deepEqual(await rows("select proname,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('submit_smart_doc','upsert_smart_field_value','get_smart_doc_progress') order by proname"), [
        { proname: 'get_smart_doc_progress', prosecdef: false }, { proname: 'submit_smart_doc', prosecdef: false }, { proname: 'upsert_smart_field_value', prosecdef: false },
      ]);
    });
    await check('adding and editing a draft placement preserves a shared published Smart Doc', async () => {
      await db.exec("insert into content_blocks(id,node_id,block_type,smart_doc_id) values (6,2,'smart_doc',1)");
      assert.equal(await scalar('select is_published from smart_docs where id=1'), true);
      await db.exec("update content_blocks set label='Draft label' where id=6");
      assert.equal(await scalar('select is_published from smart_docs where id=1'), true);
      await assume(); await edit('first'); await edit('second',2);
      assert.equal((await submit())[0].status, 'submitted');
    });
    await check('drafting a subtree preserves another published placement and last-placement state still cascades', async () => {
      await db.exec(`insert into content_nodes(id,node_type,title,state) values
        (10,'course','Shared course','published'),(11,'lesson','Shared lesson','published');
        insert into node_edge_rules(parent_type,child_kind,child_type) values('course','node','lesson');
        insert into node_children(parent_id,child_id,position,is_required) values(10,11,1,true);
        insert into content_blocks(id,node_id,block_type,smart_doc_id) values(11,11,'smart_doc',1);`);
      await scalar("select set_node_state(10,'draft')");
      assert.deepEqual(await rows('select id,state from content_nodes where id in (10,11) order by id'),[
        {id:10,state:'draft'},{id:11,state:'draft'},
      ]);
      assert.equal(await scalar('select is_published from smart_docs where id=1'),true);
      await assume(); await edit('first'); await edit('second',2);
      assert.equal((await submit())[0].status,'submitted');
      await db.exec('reset role');
      await scalar("select set_node_state(1,'draft')");
      assert.equal(await scalar('select is_published from smart_docs where id=1'),false);
      await assume(); await rejected(() => submit(),/not available/);
      await db.exec('reset role');
      await scalar("select set_node_state(10,'published')");
      assert.deepEqual(await rows('select id,state from content_nodes where id in (10,11) order by id'),[
        {id:10,state:'published'},{id:11,state:'published'},
      ]);
      assert.equal(await scalar('select is_published from smart_docs where id=1'),true);
    });
  } finally { await db.close(); }
});



