-- Exercise the live index/check definitions using temporary tables only.
-- No production rows or sequences are changed; everything is rolled back.
begin;

create temporary table test_ninety_day_cycles
  (like public.ninety_day_cycles including constraints including indexes);
create temporary table test_ninety_day_cycle_users
  (like public.ninety_day_cycle_users including constraints including indexes);

insert into test_ninety_day_cycles
  (id, name, starts_on, ends_on, timezone, status, created_at, updated_at)
values
  (1, 'Concurrent cohort A', '2026-09-01', '2026-11-29', 'America/Edmonton', 'active', now(), now()),
  (2, 'Concurrent cohort B', '2026-09-22', '2026-12-20', 'America/Edmonton', 'active', now(), now());

insert into test_ninety_day_cycle_users (cycle_id, user_id, enrolled_at)
values
  (1, '00000000-0000-0000-0000-000000000001', now()),
  (2, '00000000-0000-0000-0000-000000000002', now());

do $$
begin
  if (select count(*) from test_ninety_day_cycles where status = 'active') <> 2 then
    raise exception 'Two independent cycles must be able to remain active';
  end if;

  begin
    insert into test_ninety_day_cycle_users (cycle_id, user_id, enrolled_at)
    values (2, '00000000-0000-0000-0000-000000000001', now());
    raise exception 'A member must not have two open enrollments';
  exception when unique_violation then
    null;
  end;
end;
$$;

-- Ending one enrollment still permits joining another active cohort.
update test_ninety_day_cycle_users
set ended_at = now(), outcome = 'transferred'
where user_id = '00000000-0000-0000-0000-000000000001';
insert into test_ninety_day_cycle_users (cycle_id, user_id, enrolled_at)
values (2, '00000000-0000-0000-0000-000000000001', now());

select 'PASS: concurrent cycles, one open enrollment per member, and transfers' as result;
rollback;
