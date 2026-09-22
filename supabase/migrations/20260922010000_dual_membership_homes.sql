begin;

-- Membership grants access; this separate preference only selects the home view.
create table public.member_home_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  default_home text not null default 'member' check (default_home in ('member', 'ninety-day'))
);
alter table public.member_home_preferences enable row level security;
revoke all on public.member_home_preferences from public, anon, authenticated;
grant select on public.member_home_preferences to authenticated;
grant all on public.member_home_preferences to service_role;
create policy member_home_preferences_read_own on public.member_home_preferences
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.get_my_member_home_context()
returns jsonb
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'default_home', coalesce((select default_home from public.member_home_preferences where user_id = auth.uid()), 'member'),
    'has_active_ninety_day_enrollment', exists (
      select 1 from public.ninety_day_cycle_users enrollment
      join public.ninety_day_cycles cycle on cycle.id = enrollment.cycle_id
      where enrollment.user_id = auth.uid() and enrollment.ended_at is null and cycle.status = 'active'
    )
  );
$$;
revoke all on function public.get_my_member_home_context() from public, anon;
grant execute on function public.get_my_member_home_context() to authenticated, service_role;

create or replace function public.enroll_ninety_day_user(
  p_user_id uuid,
  p_cycle_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  ninety_day_role_id bigint;
  cycle_status text;
begin
  perform 1 from public.profiles where id = p_user_id for update;

  select status into cycle_status
  from public.ninety_day_cycles
  where id = p_cycle_id;

  if cycle_status is null or cycle_status not in ('draft', 'active') then
    raise exception 'A draft or active 90-day cycle is required' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User profile not found' using errcode = 'P0001';
  end if;

  select id into ninety_day_role_id from public.roles where code = 'ninety-day-user';

  if ninety_day_role_id is null then
    raise exception 'Required role definition is missing' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.user_roles
    where user_id = p_user_id
      and role_id = (select id from public.roles where code = 'past_member')
  ) then
    raise exception 'Restore member access before enrolling in a programme'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.ninety_day_cycle_users
    where user_id = p_user_id and ended_at is null and cycle_id <> p_cycle_id
  ) then
    raise exception 'User already has an open 90-day cycle enrollment'
      using errcode = 'P0001';
  end if;

  insert into public.user_roles(user_id, role_id)
  values (p_user_id, ninety_day_role_id)
  on conflict (user_id, role_id) do nothing;

  insert into public.ninety_day_cycle_users(cycle_id, user_id)
  values (p_cycle_id, p_user_id)
  on conflict (cycle_id, user_id) do update
    set ended_at = null, outcome = null, enrolled_at = now();

  return true;
end;
$$;

create or replace function public.set_member_default_home(p_user_id uuid, p_default_home text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User profile not found'; end if;
  if p_default_home is null or p_default_home not in ('member', 'ninety-day') then
    raise exception 'Invalid default home';
  end if;
  if not exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.code = 'user'
  ) then raise exception 'Full membership is required to choose a default home'; end if;
  if p_default_home = 'ninety-day' and not exists (
    select 1 from public.ninety_day_cycle_users e
    join public.ninety_day_cycles c on c.id = e.cycle_id
    join public.user_roles ur on ur.user_id = e.user_id
    join public.roles r on r.id = ur.role_id and r.code = 'ninety-day-user'
    where e.user_id = p_user_id and e.ended_at is null and c.status = 'active'
  ) then raise exception 'An active 90-day enrollment is required'; end if;
  insert into public.member_home_preferences (user_id, default_home)
  values (p_user_id, p_default_home)
  on conflict (user_id) do update set default_home = excluded.default_home;
end;
$$;

create or replace function public.admin_enroll_ninety_day_user(
  p_user_id uuid, p_cycle_id bigint, p_make_default boolean default false
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.enroll_ninety_day_user(p_user_id, p_cycle_id);
  if p_make_default then
    perform public.set_member_default_home(p_user_id, 'ninety-day');
  end if;
  return true;
end;
$$;

create or replace function public.grant_full_membership(p_user_id uuid)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  changed integer;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User profile not found'; end if;
  if exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.code = 'past_member'
  ) then raise exception 'Restore member access before granting membership'; end if;
  if not exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.code in ('user', 'ninety-day-user')
  ) then raise exception 'Member role is required'; end if;
  insert into public.user_roles (user_id, role_id)
  select p_user_id, id from public.roles where code = 'user'
  on conflict (user_id, role_id) do nothing;
  get diagnostics changed = row_count;
  -- Preserve a programme participant's current home when full access is added.
  if changed > 0 and exists (
    select 1 from public.ninety_day_cycle_users e join public.ninety_day_cycles c on c.id = e.cycle_id
    where e.user_id = p_user_id and e.ended_at is null and c.status = 'active'
  ) then
    insert into public.member_home_preferences (user_id, default_home)
    values (p_user_id, 'ninety-day') on conflict (user_id) do nothing;
  end if;
  return changed > 0;
end;
$$;

create or replace function public.end_ninety_day_enrollment(p_user_id uuid, p_cycle_id bigint)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  changed integer;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  update public.ninety_day_cycle_users set ended_at = now(), outcome = 'removed'
  where user_id = p_user_id and cycle_id = p_cycle_id and ended_at is null;
  get diagnostics changed = row_count;
  if changed > 0 then
    update public.member_home_preferences set default_home = 'member' where user_id = p_user_id;
  end if;
  -- Keep membership roles and history. An enrollment is separate from access.
  return changed > 0;
end;
$$;

create or replace function public.reset_completed_cycle_default_homes()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    update public.member_home_preferences p set default_home = 'member'
    where p.default_home = 'ninety-day' and exists (
      select 1 from public.ninety_day_cycle_users e
      where e.user_id = p.user_id and e.cycle_id = new.id and e.ended_at is null
    );
  end if;
  return new;
end;
$$;
create trigger ninety_day_cycle_reset_default_homes
  after update of status on public.ninety_day_cycles
  for each row execute function public.reset_completed_cycle_default_homes();

revoke all on function public.set_member_default_home(uuid, text),
  public.admin_enroll_ninety_day_user(uuid, bigint, boolean),
  public.grant_full_membership(uuid), public.end_ninety_day_enrollment(uuid, bigint),
  public.reset_completed_cycle_default_homes() from public, anon, authenticated;
grant execute on function public.set_member_default_home(uuid, text),
  public.admin_enroll_ninety_day_user(uuid, bigint, boolean),
  public.grant_full_membership(uuid), public.end_ninety_day_enrollment(uuid, bigint)
  to service_role;

commit;
