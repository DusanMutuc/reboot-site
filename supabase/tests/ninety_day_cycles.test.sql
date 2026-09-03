begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000971',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'ninety-day-cycle@example.invalid',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (id, first_name, last_name)
values ('00000000-0000-0000-0000-000000000971', 'Ninety', 'Day');

insert into public.content_nodes (id, node_type, title, slug, state)
select
  990000 + fixture.position,
  'lesson',
  '90-day fixture system ' || fixture.position,
  'ninety-day-fixture-system-' || fixture.position,
  'published'
from generate_series(1, 9) fixture(position);

insert into public.node_children (parent_id, child_id, position)
select
  (select id from public.content_nodes where node_type = 'collection' and slug = 'library' limit 1),
  990000 + fixture.position,
  900 + fixture.position
from generate_series(1, 9) fixture(position);

insert into public.ninety_day_cycles (
  id,
  name,
  starts_on,
  ends_on,
  timezone,
  status
)
values (
  990001,
  '90-day lifecycle fixture',
  current_date,
  current_date + 89,
  'America/Edmonton',
  'draft'
);

select ok(
  exists (select 1 from public.roles where code = 'ninety-day-user'),
  'the ninety-day-user role is installed'
);

select throws_ok(
  $$select public.configure_ninety_day_cycle(
    990001,
    '90-day lifecycle fixture',
    current_date,
    'America/Edmonton',
    'active',
    array[990001, 990002, 990003, 990004, 990005, 990006, 990007]::bigint[],
    990001,
    null
  )$$,
  '23514',
  null,
  'a cycle cannot activate with fewer than eight systems'
);

select lives_ok(
  $$select public.configure_ninety_day_cycle(
    990001,
    '90-day lifecycle fixture',
    current_date,
    'America/Edmonton',
    'active',
    array[990001, 990002, 990003, 990004, 990005, 990006, 990007, 990008]::bigint[],
    990001,
    null
  )$$,
  'a cycle activates with exactly eight systems and a current system'
);

select is(
  (select count(*) from public.ninety_day_cycle_systems where cycle_id = 990001),
  8::bigint,
  'the cycle persists exactly eight ordered systems'
);

select is(
  (select active_system_node_id from public.ninety_day_cycles where id = 990001),
  990001::bigint,
  'the active system is stored on the cycle for the whole group'
);

select lives_ok(
  $$select public.enroll_ninety_day_user(
    '00000000-0000-0000-0000-000000000971',
    990001
  )$$,
  'a profile can be enrolled in an active cycle'
);

select ok(
  exists (
    select 1
    from public.user_roles assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.user_id = '00000000-0000-0000-0000-000000000971'
      and role.code = 'ninety-day-user'
  ),
  'enrollment assigns the ninety-day-user role'
);

select is(
  (select count(*) from public.ninety_day_cycle_users
    where user_id = '00000000-0000-0000-0000-000000000971' and ended_at is null),
  1::bigint,
  'enrollment creates one open cycle membership'
);

select ok(
  exists (
    select 1
    from public.content_node_roles access
    join public.content_nodes node on node.id = access.node_id
    join public.roles role on role.id = access.role_id
    where node.slug = 'set-your-compass'
      and node.node_type = 'course'
      and role.code = 'ninety-day-user'
  ),
  'Set Your Compass is fixed to the ninety-day audience'
);

insert into public.ninety_day_cycle_meetings (
  cycle_id,
  title,
  starts_at,
  ends_at,
  join_url
)
values (
  990001,
  'Fixture group call',
  now() + interval '1 day',
  now() + interval '1 day 1 hour',
  'https://example.invalid/group-call'
);

select is(
  (select count(*) from public.ninety_day_cycle_meetings where cycle_id = 990001),
  1::bigint,
  'meetings are tied to the cycle'
);

select ok(
  (select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.ninety_day_cycles'::regclass,
      'public.ninety_day_cycle_systems'::regclass,
      'public.ninety_day_cycle_users'::regclass,
      'public.ninety_day_cycle_meetings'::regclass
    )),
  'all ninety-day lifecycle tables have RLS enabled'
);

select ok(
  not has_function_privilege('authenticated', 'public.enroll_ninety_day_user(uuid,bigint)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.configure_ninety_day_cycle(bigint,text,date,text,text,bigint[],bigint,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.promote_ninety_day_user(uuid)', 'EXECUTE'),
  'browser users cannot invoke lifecycle mutations directly'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000971';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000971","role":"authenticated"}';

select throws_ok(
  $$select * from public.ninety_day_cycles$$,
  '42501',
  null,
  'cycle configuration is not directly readable from the browser'
);

select throws_ok(
  $$select public.promote_ninety_day_user(auth.uid())$$,
  '42501',
  null,
  'a ninety-day user cannot promote themself'
);

reset role;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = '';
set local request.jwt.claims = '';

select lives_ok(
  $$select public.promote_ninety_day_user('00000000-0000-0000-0000-000000000971')$$,
  'the service-side promotion swaps access atomically'
);

select ok(
  exists (
    select 1
    from public.user_roles assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.user_id = '00000000-0000-0000-0000-000000000971'
      and role.code = 'user'
  )
  and not exists (
    select 1
    from public.user_roles assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.user_id = '00000000-0000-0000-0000-000000000971'
      and role.code = 'ninety-day-user'
  ),
  'promotion grants member access and removes ninety-day access'
);

select ok(
  exists (
    select 1
    from public.ninety_day_cycle_users
    where user_id = '00000000-0000-0000-0000-000000000971'
      and ended_at is not null
      and outcome = 'promoted'
  ),
  'promotion closes the cycle enrollment with history intact'
);

select * from finish();
rollback;
