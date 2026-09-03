begin;

-- Stop rather than silently OR these rules with unaudited pre-existing policies.
-- The cloned baseline has no policies on either table. Check production before
-- deploying this migration; it has only been exercised against the local clone.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public'
    and tablename in ('roles', 'user_roles')) then
    raise exception 'Audit existing roles/user_roles policies before applying role permissions';
  end if;
end;
$$;

-- Policy helpers read the trusted assignment tables as their owner, avoiding
-- recursive RLS checks. They authorize ONLY the request's auth.uid(), never a
-- supplied user ID, user-editable metadata, or current_user inside a definer.
create or replace function public.has_role(_codes text[]) returns boolean
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.code = any (_codes)
  );
$$;
alter function public.has_role(text[]) owner to postgres;

create or replace function public.has_role(role_code text) returns boolean
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.has_role(array[role_code]);
$$;
alter function public.has_role(text) owner to postgres;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.has_role('admin'::text);
$$;
alter function public.is_admin() owner to postgres;

revoke all on function public.is_admin(), public.has_role(text), public.has_role(text[])
  from public, anon, authenticated;
-- Anonymous policy evaluation can still ask about the current actor (false
-- without a user), but cannot read or edit the underlying assignment tables.
grant execute on function public.is_admin(), public.has_role(text), public.has_role(text[])
  to anon, authenticated, service_role;

alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
-- Deliberately no FORCE ROW LEVEL SECURITY: normal SQL Editor/postgres owner
-- access and service_role's existing BYPASSRLS remain intact.

revoke all on table public.roles, public.user_roles from public, anon, authenticated;
grant select, insert, update, delete on table public.roles, public.user_roles to authenticated;
grant all on table public.roles, public.user_roles to service_role;

-- Retain existing authenticated read behavior. Coach-peer profile policies and
-- other role-based directory reads inspect other users' roles. Narrowing that
-- visibility would require a separate read-path/privacy change, not this fix.
create policy roles_authenticated_read on public.roles
  for select to authenticated using (true);
create policy user_roles_authenticated_read on public.user_roles
  for select to authenticated using (true);

create policy roles_admin_write on public.roles
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy user_roles_admin_write on public.user_roles
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- RLS does not guard TRUNCATE or sequence setval. Do not restore broad table or
-- sequence grants to browser roles. USAGE permits an admin to create a role ID;
-- the table INSERT policy still rejects every non-admin role creation.
revoke all on sequence public.roles_id_seq from public, anon, authenticated;
grant usage on sequence public.roles_id_seq to authenticated;
grant all on sequence public.roles_id_seq to service_role;

-- These legacy definer RPCs can copy assignments or cascade-delete them by
-- deleting accounts. Their internal checks are NOT a browser security boundary
-- (current_user is the function owner; skip_admin_check is caller-supplied).
-- Only the admin-guarded server routes and trusted SQL callers may invoke them.
revoke all on function public.transfer_user_data(uuid, uuid, jsonb),
  public.transfer_user_data_admin(uuid, uuid, jsonb), public.try_delete_user_db(uuid)
  from public, anon, authenticated;
grant execute on function public.transfer_user_data(uuid, uuid, jsonb),
  public.transfer_user_data_admin(uuid, uuid, jsonb), public.try_delete_user_db(uuid)
  to service_role;

commit;
