begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'America/Edmonton')::date$$;
insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
select ('00000000-0000-4000-8000-00000000985'||n)::uuid,'{}','{}' from generate_series(1,5)n;
insert into public.profiles(id,first_name)
select ('00000000-0000-4000-8000-00000000985'||n)::uuid,'Booking fixture '||n from generate_series(1,5)n;
insert into public.roles(code) select wanted.code from unnest(array['admin','coach','implementation_coach']) wanted(code)
where not exists(select 1 from public.roles r where r.code=wanted.code);
insert into public.user_roles(user_id,role_id)
select ('00000000-0000-4000-8000-00000000985'||v.n)::uuid,r.id
from (values(1,'admin'),(2,'implementation_coach'),(4,'coach'))v(n,code) join public.roles r on r.code=v.code;
insert into public.user_coaches(user_id,coach_id,is_active,relationship_type)
values('00000000-0000-4000-8000-000000009853','00000000-0000-4000-8000-000000009852',true,'implementation');
insert into public.coaching_notes_base(id,user_id,created_at)
values(985201,'00000000-0000-4000-8000-000000009853',pg_temp.today()-10),
      (985202,'00000000-0000-4000-8000-000000009855',pg_temp.today()-10);
insert into public.coaching_note_action_steps(id,coaching_note_id,label) values(985501,985201,'Keep historical progress');
insert into public.meeting_types(code,name,counts_toward_engagement,is_active)
select 'IMPLEMENTATION_MEETING','Implementation',true,true
where not exists(select 1 from public.meeting_types where code='IMPLEMENTATION_MEETING');
insert into public.meetings(id,meeting_type_id,date,meeting_timezone,ghl_status)
select x.id,mt.id,pg_temp.today()+x.day_offset,'America/Edmonton',x.status
from (values(985401,-3,null::text),(985402,0,null),(985403,1,null),(985404,2,null),(985405,3,'No_Show'))x(id,day_offset,status)
cross join public.meeting_types mt where mt.code='IMPLEMENTATION_MEETING';
insert into public.meeting_attendance_base(meeting_id,user_id,attended)
select id,'00000000-0000-4000-8000-000000009853',false from public.meetings where id between 985401 and 985405;
create function pg_temp.change(_meeting bigint,_operation text,_payload jsonb default '{}')
returns jsonb language sql as $$
  select public.mutate_implementation_workspace(985201,_meeting,_operation,_payload,
    coalesce((select revision from public.implementation_meeting_sessions where meeting_id=_meeting and note_id=985201),0));
$$;

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009853';
select throws_ok($$select pg_temp.change(985401,'set_next_meeting_booked','{"booked":true}')$$,'42501',null,'Member cannot edit coach booking flag');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009854';
select throws_ok($$select pg_temp.change(985401,'set_next_meeting_booked','{"booked":true}')$$,'42501',null,'Unassigned coach cannot edit booking flag');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009852';
select throws_ok($$select public.mutate_implementation_workspace(985202,985401,'set_next_meeting_booked','{"booked":true}',0)$$,
  '42501',null,'Assigned coach cannot redirect flag to another member cycle');
select throws_ok($$select pg_temp.change(985404,'set_next_meeting_booked','{"booked":true}')$$,'22023',null,'Meeting must be explicitly started before booking status is saved');
select throws_ok($$select pg_temp.change(985405,'set_next_meeting_booked','{"booked":true}')$$,'22023',null,'Cancelled meeting cannot accept booking changes');
select lives_ok($$select pg_temp.change(985401,'start')$$,'Coach starts first meeting');
select ok((select not next_meeting_booked from public.implementation_meeting_sessions where meeting_id=985401),'New session booking flag defaults false');
select lives_ok($$select pg_temp.change(985401,'save_notes','{"notes":"Original coaching notes","commitments":"Original commitment"}')$$,'Save initial note provenance');
select lives_ok($$select pg_temp.change(985401,'complete_meeting')$$,'Complete first meeting before correcting booking status');
create temporary table original_session as select notes,commitments,notes_written_at,notes_author_id,notes_updated_at,notes_updated_by,progress_snapshot,completed_at
from public.implementation_meeting_sessions where meeting_id=985401;
select lives_ok($$select pg_temp.change(985401,'set_next_meeting_booked','{"booked":true}')$$,'Latest completed meeting may record booking status without reopening');
select ok((select next_meeting_booked and status='completed' and revision=4 from public.implementation_meeting_sessions where meeting_id=985401),
  'Booking saves atomically with a new revision and preserves completed status');
select ok((select s.notes=o.notes and s.commitments=o.commitments and s.notes_written_at=o.notes_written_at and s.notes_author_id=o.notes_author_id
  and s.notes_updated_at is not distinct from o.notes_updated_at and s.notes_updated_by is not distinct from o.notes_updated_by
  and s.progress_snapshot=o.progress_snapshot and s.completed_at=o.completed_at
  from public.implementation_meeting_sessions s cross join original_session o where s.meeting_id=985401),
  'Booking flag never changes notes, attribution, progress or completion date');
select ok((select not attended from public.meeting_attendance_base where meeting_id=985401 and user_id='00000000-0000-4000-8000-000000009853'),
  'Booking a next meeting never implies attendance in this meeting');
select throws_ok($$select public.mutate_implementation_workspace(985201,985401,'set_next_meeting_booked','{"booked":false}',3)$$,
  '40001',null,'Stale revision cannot overwrite booking status');
select ok((select next_meeting_booked from public.implementation_meeting_sessions where meeting_id=985401),'Stale save preserves stored flag');
select throws_ok($$select pg_temp.change(985401,'set_next_meeting_booked','{}')$$,'22023',null,'Missing booked value rejected');
select throws_ok($$select pg_temp.change(985401,'set_next_meeting_booked','{"booked":null}')$$,'22023',null,'Null booked value rejected');
select throws_ok($$select pg_temp.change(985401,'set_next_meeting_booked','{"booked":"true"}')$$,'22023',null,'String boolean rejected');
select throws_ok($$select pg_temp.change(985401,'set_next_meeting_booked','{"booked":1}')$$,'22023',null,'Numeric boolean rejected');
select throws_ok($$select pg_temp.change(985401,'set_next_meeting_booked','{"booked":true,"attended":true}')$$,'22023',null,'Booking payload cannot smuggle attendance change');
select lives_ok($$select pg_temp.change(985402,'start')$$,'Coach starts a subsequent session');
select ok((select not next_meeting_booked from public.implementation_meeting_sessions where meeting_id=985402),'Subsequent session does not inherit previous booking flag');
update public.coaching_note_action_steps set status='complete' where id=985501;
select lives_ok($$select pg_temp.change(985401,'set_next_meeting_booked','{"booked":false}')$$,'Historical completed meeting booking flag remains correctable');
select ok((select not next_meeting_booked and status='completed' from public.implementation_meeting_sessions where meeting_id=985401),'Historical flag can be unchecked without reopening');
select is((select progress_snapshot from public.implementation_meeting_sessions where meeting_id=985401),(select progress_snapshot from original_session),
  'Historical booking correction never refreshes progress from live action changes');
select lives_ok($$select pg_temp.change(985402,'set_next_meeting_booked','{"booked":true}')$$,'Current meeting booking flag can be checked');
select ok((select next_meeting_booked from public.implementation_meeting_sessions where meeting_id=985402)
  and not(select next_meeting_booked from public.implementation_meeting_sessions where meeting_id=985401),'Booking state belongs only to selected meeting');
select lives_ok($$select pg_temp.change(985402,'save_notes','{"notes":"Current notes","commitments":""}')$$,'Saving notes preserves independently saved booking status');
select ok((select next_meeting_booked from public.implementation_meeting_sessions where meeting_id=985402),'Other workspace mutations retain booking status');
select lives_ok($$select pg_temp.change(985403,'start')$$,'Another session starts without clearing previous flags');
select ok((select next_meeting_booked from public.implementation_meeting_sessions where meeting_id=985402)
  and not(select next_meeting_booked from public.implementation_meeting_sessions where meeting_id=985403),'Prior open session flag retained and new session defaults false');
select lives_ok($$select pg_temp.change(985402,'set_next_meeting_booked','{"booked":false}')$$,'Historical open session flag also remains correctable');
select is((select count(*) from public.implementation_step_events e join public.implementation_meeting_sessions s on s.id=e.session_id where s.note_id=985201),
  0::bigint,'Booking edits do not create checklist progress events');
select ok(not exists(select 1 from public.meeting_attendance_base where meeting_id between 985401 and 985405 and attended),
  'No booking or note operation marked attendance');
update public.meetings set ghl_status='cancelled' where id=985401;
select throws_ok($$select pg_temp.change(985401,'set_next_meeting_booked','{"booked":true}')$$,'22023',null,'Existing cancelled historical session rejects booking corrections');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009851';
select lives_ok($$select pg_temp.change(985403,'set_next_meeting_booked','{"booked":true}')$$,'Admin can record booking without coach pairing');
set local role authenticated;
select throws_ok($$update public.implementation_meeting_sessions set next_meeting_booked=false where meeting_id=985403$$,
  '42501',null,'Browser cannot bypass revision checks through direct column update');
reset role;
update public.user_coaches set ended_at=now()-interval '1 second'
where user_id='00000000-0000-4000-8000-000000009853' and coach_id='00000000-0000-4000-8000-000000009852';
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009852';
select throws_ok($$select pg_temp.change(985403,'set_next_meeting_booked','{"booked":false}')$$,'42501',null,'Ended pairing loses booking write access');
select * from finish();
rollback;
