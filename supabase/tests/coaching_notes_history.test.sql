begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
select ('00000000-0000-4000-8000-00000000098'||n)::uuid,'{}','{}' from generate_series(1,6)n;
insert into public.profiles(id,first_name)
select ('00000000-0000-4000-8000-00000000098'||n)::uuid,'Coaching history fixture '||n from generate_series(1,6)n;
insert into public.roles(code) select wanted.code
from unnest(array['admin','coach','implementation_coach','superadmin']) wanted(code)
where not exists(select 1 from public.roles r where r.code=wanted.code);
insert into public.user_roles(user_id,role_id)
select ('00000000-0000-4000-8000-00000000098'||v.n)::uuid,r.id
from (values(1,'admin'),(2,'implementation_coach'),(4,'coach'),(5,'superadmin'))v(n,code)
join public.roles r on r.code=v.code;
insert into public.user_coaches(user_id,coach_id,is_active,relationship_type)
values('00000000-0000-4000-8000-000000000983','00000000-0000-4000-8000-000000000982',true,'implementation');
insert into public.coaching_notes_base(id,user_id,created_at)
values(982201,'00000000-0000-4000-8000-000000000983',now()-interval '10 days');
insert into public.meeting_types(code,name,counts_toward_engagement,is_active)
select 'IMPLEMENTATION_MEETING','Implementation',true,true
where not exists(select 1 from public.meeting_types where code='IMPLEMENTATION_MEETING');
insert into public.meetings(id,meeting_type_id,date,meeting_timezone)
select x.id,mt.id,(now() at time zone 'America/Edmonton')::date+x.day_offset,'America/Edmonton'
from (values(982401,-2),(982402,0))x(id,day_offset)
cross join public.meeting_types mt where mt.code='IMPLEMENTATION_MEETING';
insert into public.meeting_attendance_base(meeting_id,user_id)
values(982401,'00000000-0000-4000-8000-000000000983'),(982402,'00000000-0000-4000-8000-000000000983');
-- Simulate a legacy session whose note provenance was never captured. Its last
-- general update may have been an unrelated checkbox change by someone else.
insert into public.implementation_meeting_sessions(id,note_id,meeting_id,user_id,notes,updated_by,started_at)
values('00000000-0000-4000-8000-000000000991',982201,982401,'00000000-0000-4000-8000-000000000983',
  'Legacy meeting content','00000000-0000-4000-8000-000000000981',now()-interval '2 days');

select ok(not has_table_privilege('authenticated','public.general_coaching_notes','INSERT'),'Standalone notes require guarded RPC');
select ok(not has_table_privilege('authenticated','public.general_coaching_notes','UPDATE'),'Client cannot rewrite authors or original dates');
select ok(not has_table_privilege('service_role','public.general_coaching_notes','DELETE'),'Service client cannot delete general notes directly');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000983';
select throws_ok($$select public.add_general_coaching_note('00000000-0000-4000-8000-000000000983','Private note','00000000-0000-4000-8000-000000000901')$$,
  '42501',null,'Member cannot add staff coaching notes');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000984';
select throws_ok($$select public.add_general_coaching_note('00000000-0000-4000-8000-000000000983','Private note','00000000-0000-4000-8000-000000000901')$$,
  '42501',null,'Unassigned coach cannot add notes');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000982';
select throws_ok($$select public.add_general_coaching_note('00000000-0000-4000-8000-000000000986','Other member','00000000-0000-4000-8000-000000000901')$$,
  '42501',null,'Assigned coach cannot target another member');
select throws_ok($$select public.add_general_coaching_note('00000000-0000-4000-8000-000000000983',E' \n\t','00000000-0000-4000-8000-000000000901')$$,
  '22023',null,'Whitespace-only note rejected');
select throws_ok($$select public.add_general_coaching_note('00000000-0000-4000-8000-000000000983',repeat('x',30001),'00000000-0000-4000-8000-000000000901')$$,
  '22023',null,'Oversized note rejected');
select throws_ok($$select public.add_general_coaching_note('00000000-0000-4000-8000-000000000983','Note',null)$$,
  '22023',null,'Missing retry identity rejected');
select lives_ok($$select public.add_general_coaching_note('00000000-0000-4000-8000-000000000983',E'  First note\nSecond line  ','00000000-0000-4000-8000-000000000901')$$,
  'Assigned implementation coach can add standalone note');
select is((select body from public.general_coaching_notes where id='00000000-0000-4000-8000-000000000901'),E'First note\nSecond line','Outer whitespace normalized and multiline content retained');
select is((select author_id from public.general_coaching_notes where id='00000000-0000-4000-8000-000000000901'),
  '00000000-0000-4000-8000-000000000982'::uuid,'Standalone author is authenticated actor');
select ok((select created_at between now()-interval '1 minute' and clock_timestamp() from public.general_coaching_notes where id='00000000-0000-4000-8000-000000000901'),
  'Standalone note records actual writing time');
select lives_ok($$select public.add_general_coaching_note('00000000-0000-4000-8000-000000000983',E'First note\nSecond line','00000000-0000-4000-8000-000000000901')$$,
  'Retry with same identity and content is idempotent');
select is((select count(*) from public.general_coaching_notes where user_id='00000000-0000-4000-8000-000000000983'),1::bigint,'Retry creates exactly one note');
select is((select count(*) from public.coaching_notes_base where user_id='00000000-0000-4000-8000-000000000983'),1::bigint,'Standalone writing does not create a coaching cycle');
select throws_ok($$select public.add_general_coaching_note('00000000-0000-4000-8000-000000000983','Different content','00000000-0000-4000-8000-000000000901')$$,
  '22023',null,'Retry ID cannot overwrite prior content');

select lives_ok($$select public.mutate_implementation_workspace(982201,982402,'start')$$,'Start meeting leaves legacy attribution unknown');
select ok((select notes_written_at is null and notes_author_id is null and notes_updated_at is null and notes_updated_by is null
  from public.implementation_meeting_sessions where meeting_id=982401),'Snapshot refresh never invents legacy note authorship');
select lives_ok($$select public.mutate_implementation_workspace(982201,982402,'save_notes','{"notes":"","commitments":"Follow up next week"}',1)$$,
  'Commitments-only first writing receives its own attribution');
select is((select notes_author_id from public.implementation_meeting_sessions where meeting_id=982402),
  '00000000-0000-4000-8000-000000000982'::uuid,'Meeting note author records first actual writer');
select ok((select notes_written_at is not null and notes_updated_at is null from public.implementation_meeting_sessions where meeting_id=982402),
  'First writing has written date and no misleading edited date');
create temporary table original_attribution as select notes_written_at,notes_author_id from public.implementation_meeting_sessions where meeting_id=982402;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000981';
select throws_ok($$select public.add_general_coaching_note('00000000-0000-4000-8000-000000000983',E'First note\nSecond line','00000000-0000-4000-8000-000000000901')$$,
  '22023',null,'Another actor cannot take ownership of a retry identity');
select lives_ok($$select public.add_general_coaching_note('00000000-0000-4000-8000-000000000986','Admin note','00000000-0000-4000-8000-000000000902')$$,
  'Administrator can write without coach pairing');
select lives_ok($$select public.mutate_implementation_workspace(982201,982402,'set_attendance','{"attended":true}',2)$$,
  'Attendance edit by another actor succeeds');
select ok((select notes_updated_at is null and notes_updated_by is null and notes_author_id=(select notes_author_id from original_attribution)
  and notes_written_at=(select notes_written_at from original_attribution) from public.implementation_meeting_sessions where meeting_id=982402),
  'Attendance changes cannot masquerade as note writing or editing');
select lives_ok($$select public.mutate_implementation_workspace(982201,982402,'save_notes','{"notes":"","commitments":"Follow up next week"}',3)$$,
  'Saving unchanged text is harmless');
select ok((select notes_updated_at is null from public.implementation_meeting_sessions where meeting_id=982402),
  'Unchanged save does not create an edit timestamp');
select lives_ok($$select public.mutate_implementation_workspace(982201,982402,'save_notes','{"notes":"Added detail","commitments":"Follow up next week"}',4)$$,
  'Actual text change records editor');
select ok((select notes_updated_at is not null and notes_updated_by='00000000-0000-4000-8000-000000000981'
  and notes_author_id=(select notes_author_id from original_attribution) and notes_written_at=(select notes_written_at from original_attribution)
  from public.implementation_meeting_sessions where meeting_id=982402),'Actual edit preserves original writer/date and records separate editor/date');
select lives_ok($$select public.mutate_implementation_workspace(982201,982401,'save_notes','{"notes":"Corrected legacy content","commitments":""}',2)$$,
  'Historical legacy note can be corrected');
select ok((select notes_written_at is null and notes_author_id is null and notes_updated_at is not null
  and notes_updated_by='00000000-0000-4000-8000-000000000981' from public.implementation_meeting_sessions where meeting_id=982401),
  'Legacy edit keeps unknown original metadata and records truthful new editor');

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000982';
select is((select count(*) from public.general_coaching_notes where user_id in('00000000-0000-4000-8000-000000000983','00000000-0000-4000-8000-000000000986')),1::bigint,
  'Assigned coach reads only assigned member standalone notes');
select throws_ok($$insert into public.general_coaching_notes(id,user_id,body) values('00000000-0000-4000-8000-000000000999','00000000-0000-4000-8000-000000000983','Forged')$$,
  '42501',null,'Browser cannot bypass author stamping');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000983';
select is((select count(*) from public.general_coaching_notes where user_id='00000000-0000-4000-8000-000000000983'),0::bigint,'Member cannot read staff general notes');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000984';
select is((select count(*) from public.general_coaching_notes where user_id='00000000-0000-4000-8000-000000000983'),0::bigint,'Unassigned coach cannot read general notes');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000985';
select is((select count(*) from public.general_coaching_notes where user_id in('00000000-0000-4000-8000-000000000983','00000000-0000-4000-8000-000000000986')),2::bigint,
  'Superadmin can read across members');
reset role;
update public.user_coaches set ended_at=now()-interval '1 second'
where user_id='00000000-0000-4000-8000-000000000983' and coach_id='00000000-0000-4000-8000-000000000982';
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000982';
select throws_ok($$select public.add_general_coaching_note('00000000-0000-4000-8000-000000000983','Ended coach','00000000-0000-4000-8000-000000000903')$$,
  '42501',null,'Ended pairing immediately loses write access');
set local role authenticated;
select is((select count(*) from public.general_coaching_notes where user_id='00000000-0000-4000-8000-000000000983'),0::bigint,'Ended pairing immediately loses read access');
reset role;
select * from finish();
rollback;
