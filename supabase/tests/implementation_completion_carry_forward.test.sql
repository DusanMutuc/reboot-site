-- Run against local Supabase after applying the completion carry-forward migration.
-- All fixture records are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000951', '{}', '{}'),
       ('00000000-0000-0000-0000-000000000952', '{}', '{}');
insert into public.profiles (id, first_name)
values ('00000000-0000-0000-0000-000000000951', 'Carry fixture'),
       ('00000000-0000-0000-0000-000000000952', 'Other member');
insert into public.system_scorecard_templates (key, audience, name, version, is_active)
select 'carry_test_v' || n, 'foundation', 'Carry fixture',
       (select max(version) from public.system_scorecard_templates where audience = 'foundation') + n, false
from generate_series(1, 2) n;
insert into public.system_scorecard_categories (id, template_key, key, label, position)
values (951001, 'carry_test_v1', 'systems', 'Systems', 1),
       (951002, 'carry_test_v2', 'systems', 'Systems', 1);
insert into public.system_scorecard_systems (id, template_key, category_id, key, label, position)
select 951010 + n, 'carry_test_v1', 951001, 'carry_' || n, 'Original ' || n, n
from generate_series(1, 3) n;
insert into public.system_scorecard_systems (id, template_key, category_id, key, label, position)
select 951020 + n, 'carry_test_v2', 951002, 'carry_' || n, 'Renamed ' || n, n
from generate_series(1, 3) n;
insert into public.coaching_notes_base (id, user_id)
select 951030 + n, case when n = 4 then '00000000-0000-0000-0000-000000000952'::uuid
                       else '00000000-0000-0000-0000-000000000951'::uuid end
from generate_series(1, 5) n;
insert into public.business_reviews (id, user_id, coaching_note_id, review_date, system_scorecard_template_key)
select 951040 + n, case when n = 4 then '00000000-0000-0000-0000-000000000952'::uuid
                       else '00000000-0000-0000-0000-000000000951'::uuid end,
       951030 + n, date '2030-01-01' + n,
       case when n = 1 then 'carry_test_v1' else 'carry_test_v2' end
from generate_series(1, 4) n;
insert into public.business_review_system_ratings (business_review_id, template_key, system_id, status)
select r.id, s.template_key, s.id, 'started'
from public.business_reviews r
join public.system_scorecard_systems s on s.template_key = r.system_scorecard_template_key
where r.id between 951041 and 951044;
update public.business_review_system_ratings
set reviewed_at = '2030-01-01', reviewed_by = '00000000-0000-0000-0000-000000000951'
where business_review_id = 951041 or (business_review_id = 951042 and system_id = 951023);
insert into public.coaching_note_action_steps (id, coaching_note_id, label, status)
select 951050 + n, 951031, 'Step ' || n, 'in_progress' from generate_series(1, 4) n;
insert into public.business_review_system_priorities
  (business_review_id, system_id, position, action_step_id, starting_status)
select 951041, 951010 + n, n, 951050 + n,
       case when n = 2 then 'complete'::public.system_scorecard_status else 'started'::public.system_scorecard_status end
from generate_series(1, 3) n;

update public.coaching_note_action_steps set status = 'complete' where id = 951051;
select is((select status::text from public.business_review_system_ratings where business_review_id = 951041 and system_id = 951011), 'complete', 'Original rating is completed');
select is((select status::text from public.business_review_system_ratings where business_review_id = 951042 and system_id = 951021), 'complete', 'Precreated next audit carries completion across versions and renamed labels');
select is((select reviewed_at from public.business_review_system_ratings where business_review_id = 951041 and system_id = 951011), '2030-01-01'::timestamptz, 'Original review date is preserved');
select ok((select reviewed_at is null and reviewed_by is null from public.business_review_system_ratings where business_review_id = 951042 and system_id = 951021), 'Inherited completion does not count as a new assessment');
select is((select status::text from public.business_review_system_ratings where business_review_id = 951043 and system_id = 951021), 'started', 'Only the next audit is updated');
select is((select status::text from public.business_review_system_ratings where business_review_id = 951044 and system_id = 951021), 'started', 'Other members are isolated');

update public.coaching_note_action_steps set status = 'complete' where id = 951052;
select is((select status::text from public.business_review_system_ratings where business_review_id = 951042 and system_id = 951022), 'consistent', 'Previously complete priority carries consistent forward');
update public.coaching_note_action_steps set status = 'complete' where id = 951053;
select is((select status::text from public.business_review_system_ratings where business_review_id = 951042 and system_id = 951023), 'started', 'Manual reassessment is preserved');
select is((select status::text from public.business_review_system_ratings where business_review_id = 951043 and system_id = 951023), 'started', 'Manual reassessment is not skipped to reach a later audit');

update public.coaching_note_action_steps set status = 'in_progress' where id = 951051;
select is((select status::text from public.business_review_system_ratings where business_review_id = 951042 and system_id = 951021), 'complete', 'Reopening a task retains existing one-way promotion behavior');
update public.coaching_note_action_steps set status = 'complete' where id = 951051;
update public.business_review_system_ratings set status = 'started' where business_review_id = 951042 and system_id = 951021;
select public.carry_priority_completion_to_next_review(951051);
select is((select status::text from public.business_review_system_ratings where business_review_id = 951042 and system_id = 951021), 'complete', 'Backfill repairs an already-completed step without toggling it');
select public.carry_priority_completion_to_next_review(951051);
select is((select status::text from public.business_review_system_ratings where business_review_id = 951042 and system_id = 951021), 'complete', 'Repair is idempotent');

update public.business_review_system_ratings set status = 'consistent' where business_review_id = 951042 and system_id = 951021;
select public.carry_priority_completion_to_next_review(951051);
select is((select status::text from public.business_review_system_ratings where business_review_id = 951042 and system_id = 951021), 'consistent', 'Carry-forward never downgrades consistent');
update public.business_review_system_ratings set status = 'started' where system_id in (951011, 951021) and business_review_id in (951041, 951042);
select public.carry_priority_completion_to_next_review(951051);
select is((select status::text from public.business_review_system_ratings where business_review_id = 951042 and system_id = 951021), 'started', 'Repair respects a later downward reassessment in the source audit');
update public.business_review_system_ratings set status = 'complete' where business_review_id = 951041 and system_id = 951011;

update public.business_reviews set status = 'completed', completed_at = now() where id = 951042;
select public.carry_priority_completion_to_next_review(951051);
select is((select status::text from public.business_review_system_ratings where business_review_id = 951042 and system_id = 951021), 'started', 'Completed next audit is protected');
select is((select status::text from public.business_review_system_ratings where business_review_id = 951043 and system_id = 951021), 'started', 'Completed next audit is not skipped');
update public.business_reviews set status = 'draft', completed_at = null where id = 951042;

insert into public.meetings (id, meeting_type_id, date, ghl_status)
select 951061, id, '2030-01-03', 'No_Show' from public.meeting_types where code = 'M2_MEETING';
update public.business_reviews set meeting_id = 951061 where id = 951042;
select public.carry_priority_completion_to_next_review(951051);
select is((select status::text from public.business_review_system_ratings where business_review_id = 951042 and system_id = 951021), 'started', 'Cancelled/no-show review is not changed');
select is((select status::text from public.business_review_system_ratings where business_review_id = 951043 and system_id = 951021), 'complete', 'Next non-cancelled audit receives completion');

-- The other ordering still works: completion before creating the next audit.
insert into public.business_reviews (id, user_id, coaching_note_id, review_date, system_scorecard_template_key)
values (951045, '00000000-0000-0000-0000-000000000951', 951035, '2030-01-06', 'carry_test_v2');
select public.initialize_business_review_system_scorecard(951045);
select is((select status::text from public.business_review_system_ratings where business_review_id = 951045 and system_id = 951021), 'complete', 'Audit created after completion inherits it normally');

update public.business_review_system_ratings set status = 'started' where business_review_id = 951043 and system_id = 951021;
update public.coaching_note_action_steps set status = 'complete' where id = 951054;
select is((select status::text from public.business_review_system_ratings where business_review_id = 951043 and system_id = 951021), 'started', 'Unlinked manual action steps do not alter scorecards');
select ok(not has_function_privilege('authenticated', 'public.carry_priority_completion_to_next_review(bigint)', 'EXECUTE'), 'Browser users cannot call the privileged repair function directly');

-- The same system key in Legends must not match a Foundation priority. An
-- explicitly assigned additional Foundation scorecard should still receive it.
insert into public.system_scorecard_templates (key, audience, name, version, is_active)
select 'carry_test_legends', 'legends', 'Legends fixture',
       (select max(version) from public.system_scorecard_templates where audience = 'legends') + 1, false;
insert into public.system_scorecard_categories (id, template_key, key, label, position)
values (951003, 'carry_test_legends', 'systems', 'Systems', 1);
insert into public.system_scorecard_systems (id, template_key, category_id, key, label, position)
values (951071, 'carry_test_legends', 951003, 'carry_1', 'Same key, different audience', 1);
delete from public.business_review_system_ratings where business_review_id = 951043;
update public.business_reviews set system_scorecard_template_key = 'carry_test_legends' where id = 951043;
insert into public.business_review_system_ratings (business_review_id, template_key, system_id, status)
values (951043, 'carry_test_legends', 951071, 'started');
select public.carry_priority_completion_to_next_review(951051);
select is((select status::text from public.business_review_system_ratings where business_review_id = 951043 and system_id = 951071), 'started', 'Matching keys from different audiences are isolated');
insert into public.business_review_additional_scorecards (business_review_id, template_key)
values (951043, 'carry_test_v2');
insert into public.business_review_system_ratings (business_review_id, template_key, system_id, status)
values (951043, 'carry_test_v2', 951021, 'started');
select public.carry_priority_completion_to_next_review(951051);
select is((select status::text from public.business_review_system_ratings where business_review_id = 951043 and system_id = 951021), 'complete', 'Additional Foundation scorecard receives its matching completion');
select is((select status::text from public.business_review_system_ratings where business_review_id = 951043 and system_id = 951071), 'started', 'Primary Legends rating remains unchanged');

select * from finish();
rollback;
