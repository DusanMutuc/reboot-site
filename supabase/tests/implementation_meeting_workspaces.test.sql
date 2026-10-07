begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000097'||n)::uuid,'{}','{}' from generate_series(1,6)n;
insert into public.profiles(id,first_name)
select ('00000000-0000-0000-0000-00000000097'||n)::uuid,'Implementation fixture '||n from generate_series(1,6)n;
insert into public.roles(code) select wanted.code
from unnest(array['admin','coach','implementation_coach','superadmin']) wanted(code)
where not exists(select 1 from public.roles r where r.code=wanted.code);
insert into public.user_roles(user_id,role_id)
select ('00000000-0000-0000-0000-00000000097'||v.n)::uuid,r.id
from (values(1,'admin'),(2,'implementation_coach'),(4,'coach'),(5,'superadmin'))v(n,code)
join public.roles r on r.code=v.code;
insert into public.user_coaches(user_id,coach_id,is_active,relationship_type)
values('00000000-0000-0000-0000-000000000973','00000000-0000-0000-0000-000000000972',true,'implementation');

create function pg_temp.ws_today() returns date language sql stable as $$select (now() at time zone 'America/Edmonton')::date$$;
update public.system_scorecard_templates set is_active=false where audience='foundation' and is_active;
insert into public.system_scorecard_templates(key,audience,name,version,is_active)
select 'workspace_fixture','foundation','Workspace fixture',coalesce(max(version),0)+1,true
from public.system_scorecard_templates where audience='foundation';
insert into public.system_scorecard_categories(id,template_key,key,label,position)
values(972001,'workspace_fixture','workspace','Workspace',1);
insert into public.system_scorecard_systems(id,template_key,category_id,key,label,position)
select 972010+n,'workspace_fixture',972001,'workspace_'||n,'System '||n,n from generate_series(1,3)n;
insert into public.coaching_notes_base(id,user_id,created_at)
values(972201,'00000000-0000-0000-0000-000000000973',pg_temp.ws_today()-10),
      (972202,'00000000-0000-0000-0000-000000000973',pg_temp.ws_today()+20),
      (972203,'00000000-0000-0000-0000-000000000973',pg_temp.ws_today()+5),
      (972204,'00000000-0000-0000-0000-000000000976',pg_temp.ws_today()-10);
insert into public.meeting_types(code,name,counts_toward_engagement,is_active)
select 'IMPLEMENTATION_MEETING','Implementation',true,true
where not exists(select 1 from public.meeting_types where code='IMPLEMENTATION_MEETING');
insert into public.meetings(id,meeting_type_id,date,meeting_timezone,ghl_status)
select x.id,mt.id,pg_temp.ws_today()+x.day_offset,'America/Edmonton',x.ghl_status
from (values(972401,-2,null::text),(972402,0,null),(972403,2,null),(972404,20,null),
  (972405,-11,null),(972406,0,'No_Show'),(972408,0,null),(972409,5,'cancelled'))x(id,day_offset,ghl_status)
cross join public.meeting_types mt where mt.code='IMPLEMENTATION_MEETING';
insert into public.meetings(id,meeting_type_id,date)
select 972407,id,pg_temp.ws_today() from public.meeting_types where code='M2_MEETING';
insert into public.meeting_attendance_base(meeting_id,user_id)
select id,'00000000-0000-0000-0000-000000000973'
from public.meetings where id between 972401 and 972409 and id<>972408;
insert into public.business_reviews(id,user_id,coaching_note_id,review_date,system_scorecard_template_key,meeting_id)
values(972301,'00000000-0000-0000-0000-000000000973',972201,pg_temp.ws_today()-10,'workspace_fixture',null),
      (972302,'00000000-0000-0000-0000-000000000973',972202,pg_temp.ws_today()+20,'workspace_fixture',null),
      (972303,'00000000-0000-0000-0000-000000000973',972203,pg_temp.ws_today()+5,'workspace_fixture',972409);
insert into public.business_review_system_ratings(business_review_id,template_key,system_id,status)
select r.id,'workspace_fixture',s.id,'not_started'
from public.business_reviews r cross join public.system_scorecard_systems s
where r.id in(972301,972302) and s.template_key='workspace_fixture';
insert into public.coaching_note_action_steps(id,coaching_note_id,label,status)
select 972100+n,972201,'Action '||n,'not_started' from generate_series(1,4)n;
insert into public.business_review_system_priorities(business_review_id,system_id,position,action_step_id,starting_status)
select 972301,972010+n,n,972100+n,'not_started' from generate_series(1,3)n;

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000971';
select * from public.save_system_implementation_guide('foundation','workspace_1',0,
  '[{"id":"00000000-0000-0000-0000-000000000b01","title":"First","description":"First detail"},
    {"id":"00000000-0000-0000-0000-000000000b02","title":"Second","description":"Second detail"}]');
select * from public.save_system_implementation_guide('foundation','workspace_2',0,'[]');

create function pg_temp.ws(_meeting bigint,_operation text,_payload jsonb default '{}')
returns jsonb language sql as $$
  select public.mutate_implementation_workspace(972201,_meeting,_operation,_payload,
    coalesce((select revision from public.implementation_meeting_sessions where meeting_id=_meeting and note_id=972201),0));
$$;
create function pg_temp.ws_action(_meeting bigint,_action bigint)
returns jsonb language sql stable as $$
  select item from public.implementation_meeting_sessions s,
    lateral jsonb_array_elements(s.progress_snapshot) item
  where s.note_id=972201 and s.meeting_id=_meeting and (item->>'actionStepId')::bigint=_action;
$$;

select ok(not has_table_privilege('authenticated','public.implementation_action_checklists','UPDATE'),'Checklist progress requires the guarded RPC');
select ok(not has_table_privilege('authenticated','public.implementation_meeting_sessions','INSERT'),'Client cannot create arbitrary session ownership');
select ok(not has_table_privilege('authenticated','public.implementation_step_notes','UPDATE'),'Step notes are append-only for clients');
select ok(not has_table_privilege('service_role','public.implementation_step_events','DELETE'),'Service role cannot delete check events directly');
select ok(not has_function_privilege('authenticated','public.build_implementation_progress_snapshot(bigint)','EXECUTE'),'Snapshot builder is internal');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000973';
select throws_ok($$select pg_temp.ws(972401,'start')$$,'42501',null,'Member cannot open coach workspace');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000974';
select throws_ok($$select pg_temp.ws(972401,'start')$$,'42501',null,'Unassigned coach cannot open workspace');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000972';
select throws_ok($$select public.mutate_implementation_workspace(972204,972401,'start')$$,'42501',null,'Assigned coach cannot access another member');
select throws_ok($$select pg_temp.ws(972404,'start')$$,'22023',null,'Next review date is exclusive');
select throws_ok($$select pg_temp.ws(972405,'start')$$,'22023',null,'Meeting before cycle start rejected');
select throws_ok($$select pg_temp.ws(972406,'start')$$,'22023',null,'Normalized no-show appointment rejected');
select throws_ok($$select pg_temp.ws(972407,'start')$$,'22023',null,'Wrong meeting type rejected');
select throws_ok($$select pg_temp.ws(972408,'start')$$,'22023',null,'Unassociated member appointment rejected');
select is((select count(*) from public.implementation_action_checklists where action_step_id between 972101 and 972104),0::bigint,'Rejected starts do not initialize checklists');

select lives_ok($$select pg_temp.ws(972401,'start')$$,'Assigned implementation coach starts historical meeting');
select is((select count(*) from public.implementation_action_checklists where action_step_id between 972101 and 972104),1::bigint,'Only priority with nonempty guide receives checklist');
select is(jsonb_array_length(pg_temp.ws_action(972401,972102)->'steps'),0,'Empty guide renders no checks');
select is(jsonb_array_length(pg_temp.ws_action(972401,972103)->'steps'),0,'Missing guide renders no checks');
select is(jsonb_array_length(pg_temp.ws_action(972401,972104)->'steps'),0,'Manual action does not infer a system checklist');
select is((select count(*) from public.implementation_session_actions sa join public.implementation_meeting_sessions s on s.id=sa.session_id where s.meeting_id=972401),4::bigint,'All snapshotted actions, including guide-less/manual, have history references');
select is((select revision from public.implementation_meeting_sessions where meeting_id=972401),1,'Start creates session revision 1');
select lives_ok($$select public.mutate_implementation_workspace(972201,972401,'start','{}',0)$$,'Repeated start is idempotent even with initial expected revision');
select is((select count(*) from public.implementation_meeting_sessions where meeting_id=972401),1::bigint,'Repeated start does not duplicate sessions');
select lives_ok($$select pg_temp.ws(972401,'save_notes','{"notes":"Initial notes","commitments":"Prepare next step"}')$$,'Meeting notes and commitments save independently');
select ok(not(select attended from public.meeting_attendance_base where meeting_id=972401 and user_id='00000000-0000-0000-0000-000000000973'),'Saving notes does not imply attendance');
select throws_ok($$select public.mutate_implementation_workspace(972201,972401,'save_notes','{"notes":"Stale overwrite","commitments":""}',1)$$,'40001',null,'Stale revision cannot overwrite notes');
select is((select notes from public.implementation_meeting_sessions where meeting_id=972401),'Initial notes','Stale save preserves prior notes');
select lives_ok($$select pg_temp.ws(972401,'toggle_step','{"actionStepId":972101,"stepId":"00000000-0000-0000-0000-000000000b01","completed":true}')$$,'Historical meeting can record progress while it is latest');
select ok(not(select attended from public.meeting_attendance_base where meeting_id=972401 and user_id='00000000-0000-0000-0000-000000000973'),'Historical check does not auto-attend');
select is((select status::text from public.coaching_note_action_steps where id=972101),'in_progress','First check starts action without completing it');
select lives_ok($$select pg_temp.ws(972401,'add_step_note','{"actionStepId":972101,"stepId":"00000000-0000-0000-0000-000000000b01","body":"Evidence for first step"}')$$,'Per-step note appends to meeting');
select is((select author_id from public.implementation_step_notes where action_step_id=972101),'00000000-0000-0000-0000-000000000972'::uuid,'Step-note author comes from authenticated actor');
select throws_ok($$delete from public.coaching_note_action_steps where id=972104$$,'23503',null,'Guide-less manual action cannot be deleted out of meeting history');

-- Admin edits the source guide after it has been instantiated. New source
-- content must not rewrite current or historical member checklists.
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000971';
select * from public.save_system_implementation_guide('foundation','workspace_1',1,
  '[{"id":"00000000-0000-0000-0000-000000000b01","title":"Changed source","description":"New source content"}]');
select * from public.save_system_implementation_guide('foundation','workspace_3',0,
  '[{"id":"00000000-0000-0000-0000-000000000b03","title":"New guide","description":"Third guide detail"}]');
select lives_ok($$select public.set_business_review_system_priority(972301,972012,false)$$,'Removing an untouched snapshotted priority preserves its action');
select ok(exists(select 1 from public.coaching_note_action_steps where id=972102) and not exists(select 1 from public.business_review_system_priorities where action_step_id=972102),'Priority detached without erasing not-started history action');
update public.coaching_note_action_steps set status='complete' where id=972104;
insert into public.coaching_note_action_steps(id,coaching_note_id,label) values(972105,972201,'Added during meeting');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000972';
select lives_ok($$select pg_temp.ws(972402,'start')$$,'Next meeting starts and inherits cumulative progress');
select is(pg_temp.ws_action(972402,972101)->>'guideRevision','1','Already-instantiated checklist remains pinned to guide revision 1');
select is(pg_temp.ws_action(972402,972101)->'steps'->0->>'title','First','Source edits do not rewrite pinned step text');
select is(pg_temp.ws_action(972402,972101)->'progress'->'00000000-0000-0000-0000-000000000b01'->>'completed','true','Previous meeting check carries forward');
select is(pg_temp.ws_action(972401,972104)->>'status','complete','Starting next meeting freezes live legacy action changes into previous open meeting');
select ok(pg_temp.ws_action(972401,972105) is not null,'Previous open snapshot captures newly added manual actions');
select is(jsonb_array_length(pg_temp.ws_action(972401,972103)->'steps'),0,'Previous meeting freeze occurs before newly available guide is instantiated');
select is(jsonb_array_length(pg_temp.ws_action(972402,972103)->'steps'),1,'Next explicit start initializes newly available guide');
select throws_ok($$select pg_temp.ws(972401,'toggle_step','{"actionStepId":972101,"stepId":"00000000-0000-0000-0000-000000000b01","completed":false}')$$,'22023',null,'Older meeting cannot change cumulative checks once a newer session started');
select lives_ok($$select pg_temp.ws(972401,'save_notes','{"notes":"Corrected historical notes","commitments":"Historical promise"}')$$,'Historical meeting notes remain correctable');
select is(pg_temp.ws_action(972401,972101)->'progress'->'00000000-0000-0000-0000-000000000b01'->>'completed','true','Historical note correction does not refresh progress snapshot');
select throws_ok($$select pg_temp.ws(972401,'reopen_meeting')$$,'22023',null,'An older meeting cannot be reopened for progress edits');

select lives_ok($$select pg_temp.ws(972402,'toggle_step','{"actionStepId":972101,"stepId":"00000000-0000-0000-0000-000000000b02","completed":true}')$$,'Current meeting checks its first new item');
select ok((select attended from public.meeting_attendance_base where meeting_id=972402 and user_id='00000000-0000-0000-0000-000000000973'),'First true transition today marks existing attendance');
select is((select status::text from public.coaching_note_action_steps where id=972101),'in_progress','Last checkbox never automatically completes action');
select lives_ok($$select pg_temp.ws(972402,'toggle_step','{"actionStepId":972101,"stepId":"00000000-0000-0000-0000-000000000b02","completed":false}')$$,'A checked step can be reopened in current meeting');
select ok((select attended from public.meeting_attendance_base where meeting_id=972402 and user_id='00000000-0000-0000-0000-000000000973'),'Unchecking never revokes attendance');
select lives_ok($$select pg_temp.ws(972402,'set_attendance','{"attended":false}')$$,'Coach can explicitly correct attendance');
select lives_ok($$select pg_temp.ws(972402,'toggle_step','{"actionStepId":972101,"stepId":"00000000-0000-0000-0000-000000000b02","completed":true}')$$,'Checked item can be rechecked');
select ok(not(select attended from public.meeting_attendance_base where meeting_id=972402 and user_id='00000000-0000-0000-0000-000000000973'),'Later true transitions do not override explicit attendance correction');
select is((select count(*) from public.implementation_step_events e join public.implementation_meeting_sessions s on s.id=e.session_id where s.meeting_id=972402),3::bigint,'Every changed check state has an append-only meeting event');
select lives_ok($$select pg_temp.ws(972402,'toggle_step','{"actionStepId":972101,"stepId":"00000000-0000-0000-0000-000000000b02","completed":true}')$$,'Repeated already-true request is harmless');
select is((select count(*) from public.implementation_step_events e join public.implementation_meeting_sessions s on s.id=e.session_id where s.meeting_id=972402),3::bigint,'Repeated same value does not create fake transitions');
select throws_ok($$select pg_temp.ws(972402,'toggle_step','{"actionStepId":972101,"stepId":"00000000-0000-0000-0000-000000000b03","completed":true}')$$,'22023',null,'Cannot check a step belonging to another action');
select throws_ok($$select pg_temp.ws(972402,'toggle_step','{"actionStepId":972102,"stepId":"00000000-0000-0000-0000-000000000b01","completed":true}')$$,'22023',null,'Guide-less action has no invented checklist');
select throws_ok($$select pg_temp.ws(972402,'save_notes',jsonb_build_object('notes',repeat('x',30001),'commitments',''))$$,'22023',null,'Oversized notes rejected');
select throws_ok($$select pg_temp.ws(972402,'add_step_note','{"actionStepId":972101,"stepId":"00000000-0000-0000-0000-000000000b01","body":"   "}')$$,'22023',null,'Blank step note rejected');
select throws_ok($$select pg_temp.ws(972402,'set_attendance','{"attended":true,"userId":"00000000-0000-0000-0000-000000000976"}')$$,'22023',null,'Payload cannot redirect attendance to another member');

select lives_ok($$select pg_temp.ws(972402,'set_action_status','{"actionStepId":972101,"status":"complete"}')$$,'Coach explicitly marks the overall action complete');
select is((select status::text from public.business_review_system_ratings where business_review_id=972301 and system_id=972011),'complete','Explicit action completion runs existing scorecard promotion trigger');
select is((select status::text from public.business_review_system_ratings where business_review_id=972302 and system_id=972011),'complete','Explicit completion carries into next noncancelled draft review');
select lives_ok($$select pg_temp.ws(972402,'complete_meeting')$$,'Meeting completion freezes snapshot');
update public.coaching_note_action_steps set status='in_progress' where id=972101;
select lives_ok($$select pg_temp.ws(972402,'save_notes','{"notes":"Corrected after completion","commitments":"Done"}')$$,'Completed meeting notes can be corrected');
select is(pg_temp.ws_action(972402,972101)->>'status','complete','Completed progress snapshot ignores later action changes and note edits');
select throws_ok($$select pg_temp.ws(972402,'toggle_step','{"actionStepId":972101,"stepId":"00000000-0000-0000-0000-000000000b01","completed":false}')$$,'22023',null,'Completed meeting cannot change checks until reopened');
select lives_ok($$select pg_temp.ws(972402,'reopen_meeting')$$,'Latest completed meeting can be reopened');
insert into public.coaching_note_action_steps(id,coaching_note_id,label) values(972106,972201,'New live manual action');
select lives_ok($$select pg_temp.ws(972402,'set_action_status','{"actionStepId":972106,"status":"in_progress"}')$$,'New manual action visible in live workspace can update before next meeting');
select is(pg_temp.ws_action(972402,972106)->>'status','in_progress','New manual action is captured and referenced atomically');

select lives_ok($$select pg_temp.ws(972403,'start')$$,'Future in-cycle meeting can start');
select lives_ok($$select pg_temp.ws(972403,'toggle_step','{"actionStepId":972103,"stepId":"00000000-0000-0000-0000-000000000b03","completed":true}')$$,'Future meeting progress can be prepared');
select ok(not(select attended from public.meeting_attendance_base where meeting_id=972403 and user_id='00000000-0000-0000-0000-000000000973'),'Future check does not auto-attend');
select is(pg_temp.ws_action(972402,972103)->'progress','{}'::jsonb,'New meeting changes do not alter preceding meeting snapshot');
-- Simulate a preparation check on a prior day, then the real meeting day. Such
-- prep must not suppress attendance from the first true transition on the day.
update public.implementation_step_events set created_at=now()-interval '1 day'
where session_id=(select id from public.implementation_meeting_sessions where meeting_id=972403);
update public.meetings set date=pg_temp.ws_today() where id=972403;
select lives_ok($$select pg_temp.ws(972403,'toggle_step','{"actionStepId":972103,"stepId":"00000000-0000-0000-0000-000000000b03","completed":false}')$$,'Prepared checkbox may be reopened on meeting day');
select lives_ok($$select pg_temp.ws(972403,'toggle_step','{"actionStepId":972103,"stepId":"00000000-0000-0000-0000-000000000b03","completed":true}')$$,'First true transition on meeting day follows earlier preparation');
select ok((select attended from public.meeting_attendance_base where meeting_id=972403 and user_id='00000000-0000-0000-0000-000000000973'),'Prior-day preparation does not suppress meeting-day autoattendance');
update public.meetings set date=pg_temp.ws_today()+30 where id=972401;
select lives_ok($$select pg_temp.ws(972401,'start')$$,'Rescheduled existing meeting remains pinned to original cycle');
select lives_ok($$select pg_temp.ws(972401,'save_notes','{"notes":"Still original cycle","commitments":""}')$$,'Rescheduled historical meeting notes remain editable');
select throws_ok($$select public.mutate_implementation_workspace(972202,972401,'start')$$,'22023',null,'Same member/meeting cannot be reattached to another cycle');
select throws_ok($$delete from public.coaching_note_action_steps where id=972106$$,'23503',null,'Live-added snapshotted action also gains deletion protection');

-- Validate the active pairing rules and actual browser-role RLS.
set local role authenticated;
select is((select count(*) from public.implementation_meeting_sessions where note_id=972201),3::bigint,'Assigned implementation coach sees all cycle sessions');
select is((select count(*) from public.implementation_action_checklists where action_step_id between 972101 and 972106),2::bigint,'Assigned implementation coach reads only actual pinned checklists');
select throws_ok($$update public.implementation_meeting_sessions set notes='bypass' where note_id=972201$$,'42501',null,'Client cannot bypass session revision controls');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000973';
select is((select count(*) from public.implementation_meeting_sessions where note_id=972201),0::bigint,'Member does not gain visibility into coach session notes');
select is((select count(*) from public.implementation_action_checklists where action_step_id between 972101 and 972106),0::bigint,'Member cannot read coach checklist state');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000974';
select is((select count(*) from public.implementation_meeting_sessions where note_id=972201),0::bigint,'Unassigned coach cannot read sessions');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000975';
select is((select count(*) from public.implementation_meeting_sessions where note_id=972201),3::bigint,'Superadmin can read sessions without a pairing');
select is((select count(*) from public.implementation_action_checklists where action_step_id between 972101 and 972106),2::bigint,'Superadmin can read checklists through scoped helper');
reset role;
update public.user_coaches set ended_at=now()-interval '1 second'
where user_id='00000000-0000-0000-0000-000000000973' and coach_id='00000000-0000-0000-0000-000000000972';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000972';
select throws_ok($$select pg_temp.ws(972403,'save_notes','{"notes":"Ended coach","commitments":""}')$$,'42501',null,'Ended pairing loses write access immediately');
set local role authenticated;
select is((select count(*) from public.implementation_meeting_sessions where note_id=972201),0::bigint,'Ended pairing loses read access immediately');
reset role;

-- Publishing a replacement scorecard must preserve history-backed actions,
-- including actions with no guide. Unrelated systems must not reuse old pins.
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000971';
update public.business_reviews set status='completed',completed_at=now()
where id not in (972301,972302) and status='draft';
insert into public.business_review_system_priorities(business_review_id,system_id,position,action_step_id,starting_status)
values(972301,972012,2,972102,'not_started');
insert into public.coaching_note_action_steps(id,coaching_note_id,label)
values(972107,972202,'Uncaptured removal'),(972108,972202,'Uncaptured replacement');
insert into public.business_review_system_priorities(business_review_id,system_id,position,action_step_id,starting_status)
values(972302,972012,1,972107,'not_started'),(972302,972013,2,972108,'not_started');
insert into public.system_scorecard_templates(key,audience,name,version,is_active)
select 'workspace_publish_fixture','foundation','Published workspace fixture',max(version)+1,false
from public.system_scorecard_templates where audience='foundation';
insert into public.system_scorecard_categories(id,template_key,key,label,position)
values(972002,'workspace_publish_fixture','workspace','Workspace',1);
insert into public.system_scorecard_systems(id,template_key,category_id,key,label,position)
values(972021,'workspace_publish_fixture',972002,'workspace_1','Same stable system',1),
      (972024,'workspace_publish_fixture',972002,'workspace_4','Unrelated replacement',2);
select lives_ok($$select public.admin_publish_system_scorecard_version(
  'workspace_publish_fixture','00000000-0000-0000-0000-000000000971',
  '[{"reviewId":972301,"action":"upgrade","confirmReviewedRemoval":true,"priorityReplacements":{"workspace_2":null,"workspace_3":"workspace_4"}},
    {"reviewId":972302,"action":"upgrade","confirmReviewedRemoval":true,"priorityReplacements":{"workspace_2":null,"workspace_3":"workspace_4"}}]')$$,
  'Scorecard publication can remove and replace priorities with implementation history');
select ok(exists(select 1 from public.coaching_note_action_steps where id=972102)
  and not exists(select 1 from public.business_review_system_priorities where action_step_id=972102),
  'Publication detaches a guide-less captured priority and preserves its action');
select ok(exists(select 1 from public.implementation_session_actions where action_step_id=972102),
  'Guide-less captured action retains its meeting references');
select ok(not exists(select 1 from public.coaching_note_action_steps where id=972107),
  'Uncaptured removed priority keeps existing deletion behavior');
select is((select action_step_id from public.business_review_system_priorities where business_review_id=972301 and system_id=972021),
  972101::bigint,'Same stable system across scorecard versions reuses its action');
select is((select guide_revision from public.implementation_action_checklists where action_step_id=972101),1,
  'Same stable system retains its original pinned guide revision');
select ok(exists(select 1 from public.coaching_note_action_steps where id=972103 and label='Action 3')
  and not exists(select 1 from public.business_review_system_priorities where action_step_id=972103),
  'Replacing a captured system preserves the old action identity as ordinary work');
select ok(exists(select 1 from public.business_review_system_priorities p
  join public.coaching_note_action_steps a on a.id=p.action_step_id
  where p.business_review_id=972301 and p.system_id=972024 and a.id<>972103
    and a.label='Unrelated replacement' and a.status='not_started'),
  'An unrelated replacement receives a fresh not-started action');
select ok(not exists(select 1 from public.business_review_system_priorities p
  join public.implementation_action_checklists c on c.action_step_id=p.action_step_id
  where p.business_review_id=972301 and p.system_id=972024),
  'Fresh replacement does not inherit the previous system checklist');
select is((select action_step_id from public.business_review_system_priorities where business_review_id=972302 and system_id=972024),
  972108::bigint,'Uncaptured replacement keeps existing action reuse behavior');
select is(pg_temp.ws_action(972402,972103)->>'label','Action 3',
  'Publication leaves the historical meeting label unchanged');

select * from finish();
rollback;
