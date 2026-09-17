begin;

-- The offer is a first-class entitlement. It deliberately does not include
-- the normal `user` role: promotion swaps the assignments when the member
-- moves onto the full programme.
insert into public.roles(code)
values ('ninety-day-user')
on conflict (code) do nothing;

create or replace function public.promote_ninety_day_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  ninety_day_role_id bigint;
  member_role_id bigint;
  has_ninety_day_role boolean;
  has_member_role boolean;
begin
  select id into ninety_day_role_id
  from public.roles
  where code = 'ninety-day-user';

  select id into member_role_id
  from public.roles
  where code = 'user';

  if ninety_day_role_id is null or member_role_id is null then
    raise exception 'Required role definition is missing' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role_id = ninety_day_role_id
  ) into has_ninety_day_role;

  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role_id = member_role_id
  ) into has_member_role;

  -- Retried requests are safe once the account is already a full member.
  if not has_ninety_day_role then
    if has_member_role then
      return false;
    end if;

    raise exception 'User is not a ninety-day user' using errcode = 'P0001';
  end if;

  insert into public.user_roles(user_id, role_id)
  values (p_user_id, member_role_id)
  on conflict (user_id, role_id) do nothing;

  delete from public.user_roles
  where user_id = p_user_id and role_id = ninety_day_role_id;

  return true;
end;
$$;

alter function public.promote_ninety_day_user(uuid) owner to postgres;
revoke all on function public.promote_ninety_day_user(uuid)
  from public, anon, authenticated;
grant execute on function public.promote_ninety_day_user(uuid) to service_role;

commit;
