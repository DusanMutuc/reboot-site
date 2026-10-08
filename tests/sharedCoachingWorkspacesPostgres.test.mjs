import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const uid=(n)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const migration='20261008024000_shared_coaching_workspaces.sql';

for(const lineEndings of ['LF','CRLF'])test(`shared reviews and implementation retain history with independent attendance in PostgreSQL (${lineEndings})`,{
  skip:!process.env.PGLITE_PACKAGE_DIR,timeout:180000,
},async(t)=>{
  const moduleUrl=(file)=>pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR,file)).href;
  const {PGlite}=await import(moduleUrl('dist/index.js'));
  const {pg_trgm}=await import(moduleUrl('dist/contrib/pg_trgm.js'));
  const db=new PGlite({extensions:{pg_trgm}});
  const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
  const scalar=async(sql,args=[]) => Object.values((await rows(sql,args))[0])[0];
  const assume=async(id)=>{
    await db.exec('reset role');
    await rows("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id?uid(id):'',id?'authenticated':'service_role']);
    if(id)await db.exec('set role authenticated');
  };
  const reject=async(fn,pattern=/access|shared|attendee/)=>{
    await db.exec('savepoint rejected');
    try{await assert.rejects(fn,pattern);}finally{await db.exec('rollback to savepoint rejected');}
  };
  const check=(name,fn)=>t.test(name,async()=>{
    await assume(null);await db.exec('begin');
    try{await fn();}finally{await db.exec('rollback;reset role');}
  });
  const mutate=(selected=2,meeting=600,operation='start',payload={},revision=0,note=100)=>scalar(
    'select mutate_implementation_workspace($1::bigint,$2::bigint,$3::text,$4::jsonb,$5::integer,$6::uuid)',
    [note,meeting,operation,JSON.stringify(payload),revision,uid(selected)]);
  let today;
  const create=(member=2,note=100,request=700,date=today)=>scalar(
    'select create_implementation_meeting($1,$2,$3,$4)',[uid(member),note,date,uid(request)]);
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role authenticator;
      create schema auth;create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb,
        raw_app_meta_data jsonb,created_at timestamptz,last_sign_in_at timestamptz);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
      create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
      create schema storage;create table storage.objects(id uuid primary key,bucket_id text,name text);
      create table storage.buckets(id text primary key);
      grant usage on schema auth,storage to anon,authenticated,service_role;
      grant all on storage.objects,storage.buckets to authenticated,service_role;`);
    const dir=new URL('../supabase/migrations/',import.meta.url);
    for(const name of (await readdir(dir)).sort()){
      if(name>=migration||name.includes('seed_system_implementation_guides')||name==='20260916000000_transfer_business_reviews.sql')continue;
      await db.exec(await readFile(new URL(name,dir),'utf8'));
    }
    await db.exec('set search_path=public;set check_function_bodies=true;set row_security=on');
    // Optional read-only capture from the deployment preflight. Replay exact
    // deployed bodies before the new migration, without requiring private data.
    if(process.env.SHARED_COACHING_FUNCTION_SNAPSHOT){
      const snapshot=JSON.parse(await readFile(process.env.SHARED_COACHING_FUNCTION_SNAPSHOT,'utf8'));
      assert.equal(snapshot.functions.length,8,'Expected exactly the eight replaced live functions');
      for(const fn of snapshot.functions)await db.exec(fn.definition);
    }
    const reviewDefinitions={};
    for(const signature of ['create_business_review(uuid,date)','assign_foundation_scorecard_to_business_review(bigint)',
      'set_business_review_system_priority(bigint,bigint,boolean)']){
      reviewDefinitions[signature]=await scalar('select pg_get_functiondef($1::regprocedure)',[`public.${signature}`]);
    }
    await assume(null);
    await db.exec(`begin;
      insert into roles(code) values('user'),('legend'),('coach'),('admin'),('past_member'),('implementation_coach') on conflict do nothing;
      insert into auth.users(id) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,11)n;
      insert into profiles(id) select id from auth.users;
      insert into user_roles(user_id,role_id) select u.id,r.id from auth.users u cross join roles r
        where (u.id in ('${uid(1)}','${uid(2)}','${uid(3)}') and r.code='user')
          or (u.id='${uid(1)}' and r.code='legend')
          or (u.id in ('${uid(4)}','${uid(6)}','${uid(7)}','${uid(8)}','${uid(9)}','${uid(10)}') and r.code='coach')
          or (u.id in ('${uid(5)}','${uid(7)}','${uid(8)}','${uid(9)}') and r.code='admin')
          or (u.id='${uid(7)}' and r.code='past_member')
          or (u.id='${uid(11)}' and r.code='implementation_coach');
      insert into user_coaches(user_id,coach_id,is_active) select '${uid(2)}',id,true from auth.users
        where id in ('${uid(4)}','${uid(7)}','${uid(8)}','${uid(9)}','${uid(10)}','${uid(11)}');
      insert into user_coaches(user_id,coach_id,is_active) values('${uid(1)}','${uid(6)}',true);
      update user_coaches set ended_at=now()-interval '1 day' where coach_id='${uid(10)}';
      update auth.users set raw_app_meta_data='{"must_reset_password":true}' where id='${uid(8)}';
      insert into focus_finder_templates(key,name,version) values('focus_finder_v1','Focus',1) on conflict do nothing;
      insert into system_scorecard_templates(key,audience,name,version) values
        ('shared_legends','legends','Legends',1),('shared_foundation','foundation','Foundation',1);
      insert into system_scorecard_categories(id,template_key,key,label,position) values
        (500,'shared_legends','systems','Systems',1),(501,'shared_foundation','systems','Systems',1);
      insert into system_scorecard_systems(id,template_key,category_id,key,label,position) values
        (500,'shared_legends',500,'legend','Legend',1),(501,'shared_foundation',501,'foundation','Foundation',1);
      insert into coaching_notes_base(id,user_id,created_at) values
        (100,'${uid(1)}',now()-interval '10 days'),(101,'${uid(2)}',now()+interval '10 days'),
        (102,'${uid(3)}',now()-interval '10 days');
      insert into business_reviews(id,user_id,coaching_note_id,review_date,system_scorecard_template_key) values
        (200,'${uid(1)}',100,(now() at time zone 'America/Edmonton')::date-10,'shared_legends'),
        (201,'${uid(2)}',101,(now() at time zone 'America/Edmonton')::date+10,'shared_foundation');
      insert into business_review_system_ratings(business_review_id,template_key,system_id,status)
        values(200,'shared_legends',500,'not_started');
      insert into coaching_note_action_steps(id,coaching_note_id,label,status) values(300,100,'Pinned checklist','not_started');
      insert into system_implementation_guides(id,audience,system_key,current_revision) values('${uid(400)}','legends','legend',1);
      insert into system_implementation_guide_versions(guide_id,revision,steps) values('${uid(400)}',1,
        '[{"id":"${uid(401)}","title":"First step","description":"Do it","resources":[]}]');
      insert into implementation_action_checklists(action_step_id,guide_id,guide_revision,steps)
        select 300,guide_id,revision,steps from system_implementation_guide_versions where guide_id='${uid(400)}';
      insert into meeting_types(id,name,code) values(500,'Implementation','IMPLEMENTATION_MEETING');
      insert into meetings(id,meeting_type_id,date,meeting_timezone) values
        (600,500,(now() at time zone 'America/Edmonton')::date,'America/Edmonton'),
        (601,500,(now() at time zone 'America/Edmonton')::date+1,'America/Edmonton');
      insert into meeting_attendance_base(meeting_id,user_id,attended) values(600,'${uid(1)}',false),(601,'${uid(2)}',false);
      insert into partnerships(id,name,shared_notes,shared_attendance,shared_kpis) values('${uid(900)}','Partners',true,false,false);
      insert into partnership_users(partnership_id,user_id) values('${uid(900)}','${uid(1)}'),('${uid(900)}','${uid(2)}');
      insert into user_merge_log(id,source_user_id,dest_user_id,dry_run) values(999,'${uid(9)}','${uid(5)}',false);
      insert into account_merges(source_user_id,dest_user_id,request_id,transfer_log_id,source_snapshot)
        values('${uid(9)}','${uid(5)}','${uid(999)}',999,'{}');
      update profiles p set merged_into_user_id=m.dest_user_id,merged_at=m.merged_at from account_merges m where p.id=m.source_user_id;
      commit;`);
    today=await scalar("select (now() at time zone 'America/Edmonton')::date::text");
    await check('baseline reproduces shared-coach denial before the fix',async()=>{
      await assume(4);
      assert.equal(await scalar('select can_access_implementation_workspace(100)'),false);
      await reject(()=>scalar('select assign_foundation_scorecard_to_business_review(200)'));
      await reject(()=>scalar('select create_business_review($1,$2)',[uid(1),today]));
      await reject(()=>create());
    });
    const migrationSql=(await readFile(new URL(migration,dir),'utf8')).replaceAll('\r\n','\n');
    await assume(null);await db.exec(lineEndings==='CRLF'?migrationSql.replaceAll('\n','\r\n'):migrationSql);

    await check('review bodies retain existing behavior outside the authorization block',async()=>{
      for(const [signature,definition] of Object.entries(reviewDefinitions)){
        const target=signature.startsWith('create_business_review')?'_user_id'
          :'(select n.user_id from public.coaching_notes_base n where n.id=_review.coaching_note_id and n.deleted_at is null)';
        const expected=definition.replaceAll('\r','').replace(/  if not \([\s\S]*?raise exception 'You do not have access to this student'[\s\S]*?  end if;/,
          `  if not public.can_manage_shared_coaching_member(${target},false) then\n    raise exception 'You do not have access to this student' using errcode='42501';\n  end if;`);
        assert.notEqual(expected,definition.replaceAll('\r',''));
        assert.equal((await scalar('select pg_get_functiondef($1::regprocedure)',[`public.${signature}`])).replaceAll('\r',''),expected,signature);
      }
    });
    await check('shared session starts lock the meeting before checking other cycles and keep private helpers private',async()=>{
      const definition=await scalar("select pg_get_functiondef('public.mutate_implementation_workspace(bigint,bigint,text,jsonb,integer,uuid)'::regprocedure)");
      const lock=definition.indexOf('for update of m;');
      assert.ok(lock>0&&lock<definition.indexOf('other_session'),'meeting lock precedes cross-owner collision check');
      assert.equal(definition.includes('for share of m;'),false);
      for(const role of ['anon','authenticated']){
        assert.equal(await scalar("select has_function_privilege($1,'public.coaching_member_aliases(uuid,public.share_domain)','execute')",[role]),false);
      }
      assert.equal(await scalar("select has_function_privilege('anon','public.mutate_implementation_workspace(bigint,bigint,text,jsonb,integer,uuid)','execute')"),false);
    });
    await check('assigned partner coaches can edit both historic note owners without moving records',async()=>{
      await assume(4);
      for(const note of [100,101])assert.equal(await scalar('select can_access_implementation_workspace($1)',[note]),true);
      assert.equal(await scalar('select can_access_implementation_workspace(102)'),false);
      assert.equal(await scalar('select assign_foundation_scorecard_to_business_review(200)'),'shared_foundation');
      const priority=await scalar('select set_business_review_system_priority(200,500,true)');
      assert.equal(priority.selected,true);
      const created=await scalar('select to_jsonb(create_business_review($1,$2))',[uid(1),today]);
      assert.equal(created.user_id,uid(1));
      await assume(null);
      assert.deepEqual((await rows('select user_id from coaching_notes_base where id in(100,101) order by id')).map(r=>r.user_id),[uid(1),uid(2)]);
    });
    await check('cycle boundaries include the next review on the other historic partner',async()=>{
      const bounds=(await rows('select cycle_start::text,cycle_end::text from implementation_cycle_bounds(100)'))[0];
      assert.equal(bounds.cycle_end,await scalar("select ((now() at time zone 'America/Edmonton')::date+10)::text"));
      await assume(4);
      await reject(()=>create(2,100,701,bounds.cycle_end),/within the selected coaching cycle/);
    });
    await check('notes-only sharing permits shared notes and progress but cannot forge attendance',async()=>{
      await assume(6);const started=await mutate(1);
      await assume(4);
      assert.equal(await scalar('select count(*)::int from implementation_meeting_sessions where note_id=100'),1);
      const saved=await mutate(2,600,'save_notes',{notes:'Shared discussion',commitments:'Next step'},started.revision);
      assert.equal(saved.notes,'Shared discussion');
      await reject(()=>mutate(2,600,'set_attendance',{attended:true},saved.revision),/selected member must be an attendee/);
      const checked=await mutate(2,600,'toggle_step',{actionStepId:300,stepId:uid(401),completed:true},saved.revision);
      assert.equal(checked.revision,saved.revision+1);
      await assume(null);
      assert.equal(await scalar('select attended from meeting_attendance_base where meeting_id=600'),false,'automatic attendance stays untouched');
      assert.equal(await scalar('select count(*)::int from meeting_attendance_base where meeting_id=600'),1);
    });
    await check('selected partner can create and start a notes-shared meeting with its own attendance',async()=>{
      await assume(4);
      const created=await create();assert.equal(created.created,true);
      assert.deepEqual(await create(),{meeting_id:created.meeting_id,created:false});
      const started=await mutate(2,created.meeting_id);assert.equal(started.user_id,uid(1));
      const changed=await mutate(2,created.meeting_id,'set_attendance',{attended:true},started.revision);
      assert.equal(changed.revision,2);
      await assume(null);
      assert.deepEqual(await rows('select user_id,attended from meeting_attendance_base where meeting_id=$1',[created.meeting_id]),[{user_id:uid(2),attended:true}]);
      assert.equal(await scalar('select count(*)::int from implementation_meeting_sessions where meeting_id=$1',[created.meeting_id]),1);
    });
    await check('forging the primary selection or legacy RPC cannot turn notes sharing into attendance authority',async()=>{
      await assume(6);const started=await mutate(1);
      await assume(4);
      assert.equal(await scalar('select can_manage_coaching_attendance($1)',[uid(1)]),false);
      assert.equal(await scalar('select can_manage_coaching_attendance($1)',[uid(2)]),true);
      await reject(()=>mutate(1,600,'set_attendance',{attended:true},started.revision),/access to attendance/);
      await reject(()=>mutate(1),/access to attendance/);
      await reject(()=>create(1),/access to attendance/);
      await reject(()=>scalar("select mutate_implementation_workspace(100,600,'set_attendance','{\"attended\":true}'::jsonb,$1)",[started.revision]),/access to attendance/);
      const checked=await mutate(1,600,'toggle_step',{actionStepId:300,stepId:uid(401),completed:true},started.revision);
      assert.equal(checked.revision,2,'shared checklist remains editable');
      await assume(null);assert.equal(await scalar('select attended from meeting_attendance_base where meeting_id=600'),false);
    });
    await check('attendance sharing reuses historical partner rows and canonical writes',async()=>{
      await db.exec(`update partnerships set shared_attendance=true where id='${uid(900)}'`);
      await assume(4);
      assert.deepEqual(await create(),{meeting_id:600,created:false});
      const started=await mutate(2);
      const changed=await mutate(2,600,'set_attendance',{attended:true},started.revision);
      assert.equal(changed.user_id,uid(1));
      const later=await scalar("select ((now() at time zone 'America/Edmonton')::date+2)::text");
      const created=await create(2,100,702,later);
      await assume(null);
      assert.equal(await scalar('select user_id from meeting_attendance_base where meeting_id=$1',[created.meeting_id]),uid(1));
      assert.equal(await scalar('select attended from meeting_attendance_base where meeting_id=600'),true);
      await assume(4);
      const historic=await mutate(2,601);assert.equal(historic.user_id,uid(1),'pre-sharing secondary attendance remains usable');
    });
    await check('inactive, nonshared and ended assignments do not cross member boundaries',async()=>{
      await assume(10);assert.equal(await scalar('select can_access_implementation_workspace(100)'),false);
      for(const change of ['shared_notes=false','is_active=false']){
        await assume(null);await db.exec(`update partnerships set ${change} where id='${uid(900)}'`);
        await assume(4);assert.equal(await scalar('select can_access_implementation_workspace(100)'),false);
        assert.equal(await scalar('select can_access_implementation_workspace(101)'),true);
        await reject(()=>create());await reject(()=>scalar('select assign_foundation_scorecard_to_business_review(200)'));
        await assume(null);await db.exec(`update partnerships set shared_notes=true,is_active=true where id='${uid(900)}'`);
      }
    });
    await check('an appointment already pinned to the other partner historic cycle cannot be reused',async()=>{
      await db.exec(`insert into implementation_meeting_sessions(note_id,meeting_id,user_id)
        values(101,600,'${uid(2)}');
        update partnerships set shared_attendance=true where id='${uid(900)}';`);
      await assume(4);
      await reject(()=>mutate(),/different coaching cycle/);
      await reject(()=>create(),/another coaching cycle/);
      assert.equal(await scalar('select count(*)::int from implementation_meeting_sessions where meeting_id=600'),1);
    });
    await check('past, pending, merged, member and anonymous actors stay denied',async()=>{
      for(const actor of [1,7,8,9]){
        await assume(actor);assert.equal(await scalar('select can_access_implementation_workspace(100)'),false);
        await reject(()=>mutate());await reject(()=>create());
        await reject(()=>scalar('select assign_foundation_scorecard_to_business_review(200)'));
        await reject(()=>scalar('select create_business_review($1,$2)',[uid(1),today]));
      }
      await assume(null);await db.exec('set role anon');
      await reject(()=>mutate(),/permission denied/);
    });
    await check('implementation-only coaches retain workspace access without gaining review authoring',async()=>{
      await assume(11);assert.equal(await scalar('select can_access_implementation_workspace(100)'),true);
      await reject(()=>scalar('select assign_foundation_scorecard_to_business_review(200)'));
      await reject(()=>scalar('select create_business_review($1,$2)',[uid(1),today]));
    });
    await check('archived note owners cannot be revived through admin or a former sharing alias',async()=>{
      await db.exec(`update partnerships set is_active=false where id='${uid(900)}';
        insert into user_merge_log(id,source_user_id,dest_user_id,dry_run) values(998,'${uid(1)}','${uid(2)}',false);
        insert into account_merges(source_user_id,dest_user_id,request_id,transfer_log_id,source_snapshot)
          values('${uid(1)}','${uid(2)}','${uid(998)}',998,'{}');
        update profiles p set merged_into_user_id=m.dest_user_id,merged_at=m.merged_at from account_merges m
          where p.id=m.source_user_id and p.id='${uid(1)}';`);
      for(const actor of [4,5]){
        await assume(actor);assert.equal(await scalar('select can_access_implementation_workspace(100)'),false);
        await reject(()=>mutate());await reject(()=>create());
        await reject(()=>scalar('select assign_foundation_scorecard_to_business_review(200)'));
      }
    });
    await check('standalone notes share staff access without rewriting their historical owner',async()=>{
      await assume(4);
      const note=await scalar('select to_jsonb(add_general_coaching_note($1,$2,$3))',[uid(1),'Shared standalone note',uid(800)]);
      assert.equal(note.user_id,uid(1));
      assert.equal(await scalar('select count(*)::int from general_coaching_notes where id=$1',[uid(800)]),1);
      await reject(()=>scalar('select add_general_coaching_note($1,$2,$3)',[uid(3),'Unrelated',uid(801)]));
      for(const actor of [7,8,9]){
        await assume(actor);await reject(()=>scalar('select add_general_coaching_note($1,$2,$3)',[uid(1),'Denied',uid(801)]));
      }
      await assume(null);await db.exec(`update partnerships set shared_notes=false where id='${uid(900)}'`);
      await assume(4);assert.equal(await scalar('select count(*)::int from general_coaching_notes where id=$1',[uid(800)]),0);
      await reject(()=>scalar('select add_general_coaching_note($1,$2,$3)',[uid(1),'Unshared',uid(801)]));
    });
    await check('unrelated selected users, deleted notes and stale revisions fail atomically',async()=>{
      await assume(5);
      await reject(()=>mutate(3));await reject(()=>create(3));
      const started=await mutate(1);
      await reject(()=>mutate(1,600,'save_notes',{notes:'stale',commitments:''},999),/changed/);
      assert.equal(await scalar('select notes from implementation_meeting_sessions where id=$1',[started.id]),'');
      await assume(null);await db.exec('update coaching_notes_base set deleted_at=now() where id=100');
      await assume(5);assert.equal(await scalar('select can_access_implementation_workspace(100)'),false);
      await reject(()=>mutate(1));
    });
    await check('legacy five-argument calls retain note-owner attendance and revision behavior',async()=>{
      await assume(6);
      const started=await scalar("select mutate_implementation_workspace(100,600,'start','{}'::jsonb,0)");
      assert.equal(started.user_id,uid(1));
      const changed=await scalar("select mutate_implementation_workspace(100,600,'set_attendance','{\"attended\":true}'::jsonb,$1)",[started.revision]);
      assert.equal(changed.revision,2);
    });
  }finally{await db.close();}
});
