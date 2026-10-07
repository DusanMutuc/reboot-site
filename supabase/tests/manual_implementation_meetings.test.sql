begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'America/Edmonton')::date$$;
insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
select ('00000000-0000-4000-8000-00000000983'||n)::uuid,'{}','{}' from generate_series(1,6)n;
insert into public.profiles(id,first_name)
select ('00000000-0000-4000-8000-00000000983'||n)::uuid,'Manual meeting fixture '||n from generate_series(1,6)n;
insert into public.roles(code) select wanted.code from unnest(array['admin','coach','implementation_coach','superadmin']) wanted(code)
where not exists(select 1 from public.roles r where r.code=wanted.code);
insert into public.user_roles(user_id,role_id)
select ('00000000-0000-4000-8000-00000000983'||v.n)::uuid,r.id
from (values(1,'admin'),(2,'implementation_coach'),(4,'coach'),(5,'superadmin'))v(n,code)
join public.roles r on r.code=v.code;
insert into public.user_coaches(user_id,coach_id,is_active,relationship_type,course_id)
values('00000000-0000-4000-8000-000000009833','00000000-0000-4000-8000-000000009832',true,'implementation',2);
insert into public.meeting_types(code,name,counts_toward_engagement,is_active)
select 'IMPLEMENTATION_MEETING','Implementation',true,true
where not exists(select 1 from public.meeting_types where code='IMPLEMENTATION_MEETING');
insert into public.meetings(id,meeting_type_id,date,ghl_status)
select x.id,mt.id,pg_temp.today()+x.day_offset,x.status
from (values(983401,-20,null::text),(983402,-30,'No_Show'),(983403,5,'cancelled'))x(id,day_offset,status)
cross join public.meeting_types mt where mt.code='M2_MEETING';
insert into public.coaching_notes_base(id,user_id,created_at,m2_meeting_id)
values(983201,'00000000-0000-4000-8000-000000009833',pg_temp.today()-10,null),
      (983202,'00000000-0000-4000-8000-000000009833',pg_temp.today()+20,null),
      (983203,'00000000-0000-4000-8000-000000009833',pg_temp.today()+5,null),
      (983204,'00000000-0000-4000-8000-000000009836',pg_temp.today()-10,null),
      (983205,'00000000-0000-4000-8000-000000009833',pg_temp.today()-20,983401),
      (983206,'00000000-0000-4000-8000-000000009833',(pg_temp.today()-39+time '01:00') at time zone 'UTC',null),
      (983207,'00000000-0000-4000-8000-000000009833',pg_temp.today()-30,983402);
insert into public.business_reviews(id,user_id,coaching_note_id,review_date,meeting_id)
values(983301,'00000000-0000-4000-8000-000000009833',983201,pg_temp.today()-10,null),
      (983302,'00000000-0000-4000-8000-000000009833',983202,pg_temp.today()+20,null),
      (983303,'00000000-0000-4000-8000-000000009833',983203,pg_temp.today()+5,983403);
create function pg_temp.make_meeting(_day date,_request integer,_note bigint default 983201)
returns jsonb language sql as $$
  select public.create_implementation_meeting('00000000-0000-4000-8000-000000009833',_note,_day,
    ('00000000-0000-4000-8000-'||lpad((983900+_request)::text,12,'0'))::uuid);
$$;
create temporary table manual_slots(name text primary key,id bigint not null);
create function pg_temp.slot(_name text) returns bigint language sql stable as $$select id from manual_slots where name=_name$$;
create function pg_temp.change_meeting(_name text,_op text,_payload jsonb default '{}')
returns jsonb language sql as $$
  select public.mutate_implementation_workspace(983201,pg_temp.slot(_name),_op,_payload,
    coalesce((select revision from public.implementation_meeting_sessions where meeting_id=pg_temp.slot(_name) and note_id=983201),0));
$$;

select ok(not has_table_privilege('authenticated','public.implementation_meeting_create_requests','INSERT'),'Clients cannot forge retry ownership');
select ok(not has_function_privilege('authenticated','public.implementation_cycle_bounds(bigint)','EXECUTE'),'Shared cycle bounds helper is internal');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009833';
select throws_ok($$select pg_temp.make_meeting(pg_temp.today(),1)$$,'42501',null,'Member cannot create a coach meeting');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009834';
select throws_ok($$select pg_temp.make_meeting(pg_temp.today(),1)$$,'42501',null,'Unassigned coach cannot create a meeting');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009832';
select throws_ok($$select pg_temp.make_meeting(pg_temp.today(),1,983204)$$,'42501',null,'Another member cycle cannot be supplied');
select throws_ok($$select pg_temp.make_meeting(pg_temp.today()-11,1)$$,'22023',null,'Business Review start date is inclusive');
select throws_ok($$select pg_temp.make_meeting(pg_temp.today()+20,1)$$,'22023',null,'Next noncancelled review date is exclusive');
select throws_ok($$select pg_temp.make_meeting(pg_temp.today()+6,1,983203)$$,'22023',null,'Cancelled Business Review cycle rejects manual meetings');
select throws_ok($$select pg_temp.make_meeting(pg_temp.today()-25,1,983207)$$,'22023',null,'Cancelled M2 cycle rejects manual meetings');
select throws_ok($$select pg_temp.make_meeting('infinity',1)$$,'22023',null,'Infinite dates rejected by RPC');
select lives_ok($$insert into manual_slots values('m2',(pg_temp.make_meeting(pg_temp.today()-15,2,983205)->>'meeting_id')::bigint)$$,
  'M2 cycle accepts meeting between its anchor and next review');
select throws_ok($$select pg_temp.make_meeting(pg_temp.today()-10,3,983205)$$,'22023',null,'M2 next-cycle boundary is exclusive');
select lives_ok($$insert into manual_slots values('legacy',(pg_temp.make_meeting(pg_temp.today()-40,4,983206)->>'meeting_id')::bigint)$$,
  'Legacy cycle start uses Edmonton date rather than UTC date');
select lives_ok($$select pg_temp.make_meeting(pg_temp.today()-25,5,983206)$$,'Legacy cycle ignores a cancelled M2 boundary');
select throws_ok($$select pg_temp.make_meeting(pg_temp.today()-20,6,983206)$$,'22023',null,'Legacy next noncancelled cycle is exclusive');
select lives_ok($$insert into manual_slots values('manual',(pg_temp.make_meeting(pg_temp.today(),7)->>'meeting_id')::bigint)$$,
  'Assigned implementation coach can create date-only meeting');
select is((select mt.code from public.meetings m join public.meeting_types mt on mt.id=m.meeting_type_id where m.id=pg_temp.slot('manual')),
  'IMPLEMENTATION_MEETING','Created meeting uses correct type');
select ok((select starts_at is null and ends_at is null and meeting_timezone='America/Edmonton' and ghl_appointment_id is null
  from public.meetings where id=pg_temp.slot('manual')),'Manual slot remains date-only and eligible for later GHL adoption');
select is((select created_by from public.meetings where id=pg_temp.slot('manual')),'00000000-0000-4000-8000-000000009832'::uuid,
  'Manual creator is authenticated actor');
select ok((select not attended from public.meeting_attendance_base where meeting_id=pg_temp.slot('manual') and user_id='00000000-0000-4000-8000-000000009833'),
  'New meeting attendance starts false');
select is((select count(*) from public.implementation_meeting_sessions where meeting_id=pg_temp.slot('manual')),0::bigint,
  'Adding meeting never implicitly starts a session');
select is(pg_temp.make_meeting(pg_temp.today(),7),jsonb_build_object('meeting_id',pg_temp.slot('manual'),'created',false),
  'Identical request retry returns the same meeting');
select is(pg_temp.make_meeting(pg_temp.today(),8),jsonb_build_object('meeting_id',pg_temp.slot('manual'),'created',false),
  'Different request on same date safely reuses the existing meeting');
select throws_ok($$select pg_temp.make_meeting(pg_temp.today()+1,7)$$,'22023',null,'Retry ID cannot be reused for another date');
select lives_ok($$select pg_temp.make_meeting(pg_temp.today()+6,9)$$,'Cancelled later review does not truncate current cycle');
update public.meetings set date=pg_temp.today()+30 where id=(select meeting_id from public.implementation_meeting_create_requests
  where request_id='00000000-0000-4000-8000-000000983909');
select throws_ok($$select pg_temp.make_meeting(pg_temp.today()+6,9)$$,'40001',null,'Retry rejects an unstarted meeting moved outside the selected cycle');
update public.meetings set date=pg_temp.today()+6 where id=(select meeting_id from public.implementation_meeting_create_requests
  where request_id='00000000-0000-4000-8000-000000983909');
update public.business_reviews set meeting_id=983402 where id=983301;
select throws_ok($$select pg_temp.make_meeting(pg_temp.today()+6,9)$$,'40001',null,'Retry rejects an unstarted meeting after its review cycle is cancelled');
update public.business_reviews set meeting_id=null where id=983301;

-- One GHL meeting can be reused; ambiguous dates and another-cycle pins cannot.
insert into public.meetings(id,meeting_type_id,date,ghl_appointment_id,starts_at,ghl_status)
select x.id,mt.id,pg_temp.today()+x.day_offset,x.appointment,case when x.appointment is null then null else now() end,x.status
from (values(983410,1,'manual-fixture-existing',null::text),(983411,2,null,null),(983412,2,null,null),
  (983413,3,null,'cancelled'),(983414,4,null,null))x(id,day_offset,appointment,status)
cross join public.meeting_types mt where mt.code='IMPLEMENTATION_MEETING';
insert into public.meeting_attendance_base(meeting_id,user_id,attended)
select id,'00000000-0000-4000-8000-000000009833',id=983410 from public.meetings where id between 983410 and 983414;
select is(pg_temp.make_meeting(pg_temp.today()+1,10),jsonb_build_object('meeting_id',983410,'created',false),'Single existing GHL meeting is reused');
select ok((select attended from public.meeting_attendance_base where meeting_id=983410 and user_id='00000000-0000-4000-8000-000000009833'),
  'Reusing meeting preserves prior attendance');
select throws_ok($$select pg_temp.make_meeting(pg_temp.today()+2,11)$$,'40001',null,'Multiple same-day meetings require explicit selection');
select lives_ok($$insert into manual_slots values('after_cancel',(pg_temp.make_meeting(pg_temp.today()+3,12)->>'meeting_id')::bigint)$$,
  'Cancelled same-day record does not block valid manual creation');
select isnt(pg_temp.slot('after_cancel'),983413::bigint,'Cancelled record is never reused');
insert into public.implementation_meeting_sessions(note_id,meeting_id,user_id)
values(983202,983414,'00000000-0000-4000-8000-000000009833');
select throws_ok($$select pg_temp.make_meeting(pg_temp.today()+4,13)$$,'40001',null,'Existing session cannot be reassigned to another cycle');

-- A later importer adoption must preserve actual session state and provenance.
insert into public.system_implementation_guides(id,audience,system_key,current_revision)
values('00000000-0000-4000-8000-000000009801','foundation','manual_adoption_fixture',1);
insert into public.system_implementation_guide_versions(guide_id,revision,steps)
values('00000000-0000-4000-8000-000000009801',1,
  '[{"id":"00000000-0000-4000-8000-000000009802","title":"Adoption step","description":"Retain meeting history","resources":[]}]');
insert into public.coaching_note_action_steps(id,coaching_note_id,label) values(983501,983201,'Previously selected action');
insert into public.implementation_action_checklists(action_step_id,guide_id,guide_revision,steps)
select 983501,guide_id,revision,steps from public.system_implementation_guide_versions where guide_id='00000000-0000-4000-8000-000000009801';
select lives_ok($$select pg_temp.change_meeting('manual','start')$$,'Explicit Start opens manually created meeting');
select lives_ok($$select pg_temp.change_meeting('manual','save_notes','{"notes":"Keep this coaching note","commitments":"Follow up"}')$$,
  'Manual meeting stores coach notes');
select lives_ok($$select pg_temp.change_meeting('manual','toggle_step','{"actionStepId":983501,"stepId":"00000000-0000-4000-8000-000000009802","completed":true}')$$,
  'Manual meeting can record genuine implementation progress');
create temporary table before_adoption as select id,notes_written_at,notes_author_id,progress_snapshot
from public.implementation_meeting_sessions where meeting_id=pg_temp.slot('manual');
select lives_ok($$select * from public.sync_implementation_appointment_v2('manual-fixture-recovered','fixture-calendar',
  (pg_temp.today()+time '10:00') at time zone 'America/Edmonton',null,'America/Edmonton','confirmed','Recovered appointment',
  '00000000-0000-4000-8000-000000009833','00000000-0000-4000-8000-000000009832',pg_temp.today(),false)$$,
  'Later GHL import adopts the unambiguous manual slot');
select is((select id from public.meetings where ghl_appointment_id='manual-fixture-recovered'),pg_temp.slot('manual'),
  'GHL recovery keeps the exact meeting ID');
select ok((select s.id=b.id and s.notes_written_at=b.notes_written_at and s.notes_author_id=b.notes_author_id
  and s.progress_snapshot=b.progress_snapshot and s.notes='Keep this coaching note'
  from public.implementation_meeting_sessions s cross join before_adoption b where s.meeting_id=pg_temp.slot('manual')),
  'Adoption preserves session, written note provenance and pinned progress snapshot');
select is((select count(*) from public.implementation_step_events e join before_adoption b on b.id=e.session_id),1::bigint,
  'Adoption preserves checkbox event history');
select ok((select attended from public.meeting_attendance_base where meeting_id=pg_temp.slot('manual') and user_id='00000000-0000-4000-8000-000000009833'),
  'Adoption never resets attended status');
select is(pg_temp.make_meeting(pg_temp.today(),7),jsonb_build_object('meeting_id',pg_temp.slot('manual'),'created',false),
  'Original manual request remains idempotent after GHL adoption');
update public.meetings set date=pg_temp.today()+30 where id=pg_temp.slot('manual');
select is(pg_temp.make_meeting(pg_temp.today(),7),jsonb_build_object('meeting_id',pg_temp.slot('manual'),'created',false),
  'A started session remains pinned to the original cycle after rescheduling');
update public.meetings set date=pg_temp.today() where id=pg_temp.slot('manual');
select lives_ok($$select * from public.sync_implementation_appointment_v2('manual-fixture-cancel-safe','fixture-calendar',
  (pg_temp.today()+3+time '11:00') at time zone 'America/Edmonton',null,'America/Edmonton','confirmed','Recovered appointment',
  '00000000-0000-4000-8000-000000009833','00000000-0000-4000-8000-000000009832',pg_temp.today()+3,false)$$,
  'GHL adoption excludes a cancelled same-day manual candidate');
select is((select id from public.meetings where ghl_appointment_id='manual-fixture-cancel-safe'),pg_temp.slot('after_cancel'),
  'Only valid manual candidate is adopted when cancelled history coexists');
select ok((select ghl_appointment_id is null from public.meetings where id=983413),'Cancelled manual history is not revived');
select lives_ok($$select * from public.sync_implementation_appointment_v2('manual-fixture-recovered','fixture-calendar',
  (pg_temp.today()+time '10:00') at time zone 'America/Edmonton',null,'America/Edmonton','cancelled','Cancelled appointment',
  '00000000-0000-4000-8000-000000009833','00000000-0000-4000-8000-000000009832',pg_temp.today(),true)$$,
  'Later GHL cancellation keeps existing sync behavior');
select ok(not exists(select 1 from public.meeting_attendance_base where meeting_id=pg_temp.slot('manual') and user_id='00000000-0000-4000-8000-000000009833'),
  'Cancelled GHL appointment loses active attendance association');
select ok(exists(select 1 from public.implementation_meeting_sessions where meeting_id=pg_temp.slot('manual') and notes='Keep this coaching note'),
  'Cancellation preserves historical session and notes');
select throws_ok($$select pg_temp.make_meeting(pg_temp.today(),7)$$,'40001',null,'Retry never silently recreates a cancelled meeting');

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009831';
select lives_ok($$select public.create_implementation_meeting('00000000-0000-4000-8000-000000009836',983204,pg_temp.today(),
  '00000000-0000-4000-8000-000000009899')$$,'Admin may add a meeting without coach pairing');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009835';
select lives_ok($$select pg_temp.make_meeting(pg_temp.today()+7,14)$$,'Superadmin may add a meeting without pairing');
delete from public.meetings where id=(select meeting_id from public.implementation_meeting_create_requests
  where request_id='00000000-0000-4000-8000-000000983914');
select ok(not exists(select 1 from public.implementation_meeting_create_requests where request_id='00000000-0000-4000-8000-000000983914'),
  'Retry metadata does not prevent deletion of an unstarted meeting');
update public.user_coaches set ended_at=now()-interval '1 second'
where user_id='00000000-0000-4000-8000-000000009833' and coach_id='00000000-0000-4000-8000-000000009832';
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009832';
select throws_ok($$select pg_temp.make_meeting(pg_temp.today()+8,15)$$,'42501',null,'Ended coach pairing cannot create meetings');
select * from finish();
rollback;
