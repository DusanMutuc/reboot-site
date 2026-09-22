-- Transactional integration test: new fixture users/cycles only, always rolled back.
begin;

create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$ begin if value is distinct from true then raise exception '%', message; end if; end; $$;

do $$
declare
  member_id uuid := gen_random_uuid();
  programme_id uuid := gen_random_uuid();
  programme_only_id uuid := gen_random_uuid();
  cycle_a bigint := -9202609221;
  cycle_b bigint := -9202609222;
  systems bigint[];
  ctx jsonb;
begin
  select array_agg(id) into systems from (
    select id from public.content_nodes where state = 'published' and slug is not null
      and node_type in ('lesson', 'chapter', 'playlist') order by id limit 8
  ) nodes;
  perform pg_temp.assert_true(cardinality(systems) = 8, 'Eight published fixture systems are required');
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (member_id, member_id || '@example.invalid', '{}'::jsonb, '{}'::jsonb),
    (programme_id, programme_id || '@example.invalid', '{}'::jsonb, '{}'::jsonb),
    (programme_only_id, programme_only_id || '@example.invalid', '{}'::jsonb, '{}'::jsonb);
  insert into public.profiles (id, first_name) values (member_id, 'Dual fixture'), (programme_id, 'Programme fixture'), (programme_only_id, 'Programme-only fixture')
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role_id) select member_id, id from public.roles where code = 'user';
  insert into public.user_roles (user_id, role_id) select programme_id, id from public.roles where code = 'ninety-day-user';
  insert into public.ninety_day_cycles (id, name, starts_on, ends_on, status)
  overriding system value values
    (cycle_a, 'Dual fixture A', current_date, current_date + 89, 'draft'),
    (cycle_b, 'Dual fixture B', current_date, current_date + 89, 'draft');
  perform public.configure_ninety_day_cycle(cycle_a, 'Dual fixture A', current_date, 'America/Edmonton', 'active', systems, systems[1], null);

  perform public.admin_enroll_ninety_day_user(member_id, cycle_a, true);
  perform pg_temp.assert_true((select count(*) = 2 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = member_id and r.code in ('user', 'ninety-day-user')), 'Enrollment must preserve full membership');
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  ctx := public.get_my_member_home_context();
  perform pg_temp.assert_true(ctx->>'default_home' = 'ninety-day' and (ctx->>'has_active_ninety_day_enrollment')::boolean,
    'The selected programme home and active enrollment must be visible to the member');

  begin
    perform public.enroll_ninety_day_user(member_id, cycle_b);
    raise exception 'Duplicate enrollment unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'User already has an open 90-day cycle enrollment' then raise; end if;
  end;

  perform public.enroll_ninety_day_user(programme_id, cycle_a);
  perform public.enroll_ninety_day_user(programme_only_id, cycle_a);
  perform pg_temp.assert_true(public.grant_full_membership(programme_id), 'Full membership should be added');
  perform pg_temp.assert_true(not public.grant_full_membership(programme_id), 'Adding full membership is idempotent');
  perform pg_temp.assert_true(exists(select 1 from public.ninety_day_cycle_users where user_id = programme_id and ended_at is null),
    'Adding membership must not end the programme');
  perform pg_temp.assert_true((select count(*) = 2 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = programme_id and r.code in ('user', 'ninety-day-user')), 'Both roles must remain');
  perform set_config('request.jwt.claim.sub', programme_id::text, true);
  perform pg_temp.assert_true(public.get_my_member_home_context()->>'default_home' = 'ninety-day', 'Adding access preserves programme home');

  perform public.set_member_default_home(member_id, 'member');
  perform pg_temp.assert_true(public.get_my_member_home_context()->>'default_home' = 'ninety-day', 'Context must not reveal another member preference');
  perform public.set_member_default_home(member_id, 'ninety-day');
  perform pg_temp.assert_true(public.end_ninety_day_enrollment(member_id, cycle_a), 'Enrollment should end');
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  ctx := public.get_my_member_home_context();
  perform pg_temp.assert_true(ctx->>'default_home' = 'member' and not (ctx->>'has_active_ninety_day_enrollment')::boolean,
    'Ending the programme restores member home and removes switching eligibility');
  perform pg_temp.assert_true(exists(select 1 from public.ninety_day_cycle_users where user_id = member_id and ended_at is not null), 'Enrollment history must remain');
  perform pg_temp.assert_true(exists(select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = member_id and r.code = 'user'), 'Ending enrollment must preserve full membership');

  begin
    perform public.admin_enroll_ninety_day_user(member_id, cycle_b, true);
    raise exception 'A draft cycle cannot become the default';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'An active 90-day enrollment is required' then raise; end if;
  end;
  perform pg_temp.assert_true(not exists(select 1 from public.ninety_day_cycle_users where user_id = member_id and ended_at is null),
    'Invalid default selection must roll back enrollment atomically');

  update public.ninety_day_cycles set status = 'completed' where id = cycle_a;
  perform set_config('request.jwt.claim.sub', programme_id::text, true);
  ctx := public.get_my_member_home_context();
  perform pg_temp.assert_true(ctx->>'default_home' = 'member' and not (ctx->>'has_active_ninety_day_enrollment')::boolean,
    'Completing a cycle restores the member home');
  perform pg_temp.assert_true(not exists(select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = programme_only_id and r.code = 'user'), 'Programme completion must not grant full membership');
  perform pg_temp.assert_true(not has_function_privilege('authenticated', 'public.set_member_default_home(uuid,text)', 'EXECUTE'),
    'Members cannot change the admin default');
  perform pg_temp.assert_true(not has_function_privilege('authenticated', 'public.grant_full_membership(uuid)', 'EXECUTE'), 'Members cannot grant themselves full access');
  perform pg_temp.assert_true(not has_function_privilege('authenticated', 'public.admin_enroll_ninety_day_user(uuid,bigint,boolean)', 'EXECUTE'), 'Members cannot enroll themselves');
  perform pg_temp.assert_true(not has_table_privilege('authenticated', 'public.member_home_preferences', 'UPDATE'), 'Preferences cannot be updated directly by members');
end;
$$;
select 'PASS: dual memberships, defaults, enrollment lifecycle, privacy and permissions' as result;
rollback;
