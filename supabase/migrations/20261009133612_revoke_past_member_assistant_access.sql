begin;

-- All application assignment edits use authenticated admin API routes with the
-- service client. A public client must not forge another sponsor to evade removal.
-- Preserve existing SELECT access and all service-role permissions.
revoke insert, update, delete, truncate, references, trigger
  on public.user_assistants from anon, authenticated;

-- A narrow offboarding record prevents delayed onboarding webhooks from
-- recreating an assistant entitlement removed with their last active member.
create table public.assistant_access_revocations (
  assistant_id uuid primary key references public.profiles(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz not null default now()
);
alter table public.assistant_access_revocations enable row level security;
revoke all on public.assistant_access_revocations from public, anon, authenticated;
grant all on public.assistant_access_revocations to service_role;

-- Only trusted server actions may invoke these mutators. They are invokers,
-- not privilege-escalating RPCs; existing role/assignment RLS is unchanged.
create function public.revoke_past_member_assistants(p_member_id uuid)
returns void language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare affected uuid[]; assistant uuid;
begin
  perform pg_advisory_xact_lock(104729, 7);
  if not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_member_id and r.code = 'past_member') then
    raise exception 'Member does not have the Past Member role.' using errcode = '23514';
  end if;
  select array_agg(distinct assistant_id) into affected from public.user_assistants
    where user_id = p_member_id and is_active and (ended_at is null or ended_at > now());
  update public.user_assistants set is_active = false, ended_at = coalesce(least(ended_at, now()), now())
    where user_id = p_member_id and is_active;
  foreach assistant in array coalesce(affected, '{}'::uuid[]) loop
    -- Archived accounts already have access removed and retain immutable history.
    if not exists (select 1 from public.profiles p where p.id = assistant
      and p.merged_at is null and p.merged_into_user_id is null) then continue; end if;
    if exists (
      select 1 from public.user_assistants a join public.profiles p on p.id = a.user_id
      join public.user_roles ur on ur.user_id = p.id
      join public.roles r on r.id = ur.role_id and r.code = 'user'
      where a.assistant_id = assistant and a.is_active and (a.ended_at is null or a.ended_at > now())
        and p.merged_at is null and p.merged_into_user_id is null
        and not exists (select 1 from public.user_roles past join public.roles pr on pr.id = past.role_id
          where past.user_id = p.id and pr.code = 'past_member')
    ) then continue; end if;
    insert into public.assistant_access_revocations(assistant_id, member_id)
      values (assistant, p_member_id) on conflict (assistant_id) do nothing;
    delete from public.user_roles where user_id = assistant
      and role_id = (select id from public.roles where code = 'assistant');
  end loop;
end;
$$;
revoke all on function public.revoke_past_member_assistants(uuid) from public, anon, authenticated;
grant execute on function public.revoke_past_member_assistants(uuid) to service_role;

create function public.remove_past_member_assistant_access()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.roles where id = new.role_id and code = 'past_member') then
    perform public.revoke_past_member_assistants(new.user_id);
  end if;
  return new;
end;
$$;
revoke all on function public.remove_past_member_assistant_access() from public, anon, authenticated, service_role;
-- This only acts when Past Member is assigned; other role changes are untouched.
create trigger remove_past_member_assistant_access after insert or update on public.user_roles
  for each row execute function public.remove_past_member_assistant_access();

create function public.grant_assistant_access_if_allowed(p_assistant_id uuid)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare assistant_role_id bigint;
begin
  perform pg_advisory_xact_lock(104729, 7);
  if exists (select 1 from public.assistant_access_revocations where assistant_id = p_assistant_id) then return false; end if;
  if not exists (select 1 from public.profiles where id = p_assistant_id
    and merged_at is null and merged_into_user_id is null)
    or exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = p_assistant_id and r.code = 'past_member') then
    raise exception 'This account is not eligible for assistant access.' using errcode = '23514';
  end if;
  select id into assistant_role_id from public.roles where code = 'assistant';
  if assistant_role_id is null then raise exception 'Assistant role not configured.'; end if;
  insert into public.user_roles(user_id, role_id) values (p_assistant_id, assistant_role_id)
    on conflict (user_id, role_id) do nothing;
  return true;
end;
$$;
revoke all on function public.grant_assistant_access_if_allowed(uuid) from public, anon, authenticated;
grant execute on function public.grant_assistant_access_if_allowed(uuid) to service_role;

create function public.restore_assistant_access(p_assistant_id uuid)
returns void language plpgsql security invoker set search_path = pg_catalog, public
as $$
begin
  perform pg_advisory_xact_lock(104729, 7);
  delete from public.assistant_access_revocations where assistant_id = p_assistant_id;
  if not public.grant_assistant_access_if_allowed(p_assistant_id) then
    raise exception 'Assistant access could not be restored.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.restore_assistant_access(uuid) from public, anon, authenticated;
grant execute on function public.restore_assistant_access(uuid) to service_role;

-- The existing admin assignment endpoints share the same transaction lock.
-- Reassignment cannot slip between the last-sponsor check and role removal.
create function public.set_member_assistant_assignment(
  p_member_id uuid, p_assistant_id uuid, p_active boolean,
  p_replace boolean default false, p_assigned_by uuid default null
)
returns void language plpgsql security invoker set search_path = pg_catalog, public
as $$
begin
  perform pg_advisory_xact_lock(104729, 7);
  if p_active is null then raise exception 'Choose whether the assignment is active.' using errcode = '23514'; end if;
  if not p_active then
    update public.user_assistants set is_active = false, ended_at = coalesce(least(ended_at, now()), now())
      where user_id = p_member_id and assistant_id = p_assistant_id and is_active;
    return;
  end if;
  if not exists (
    select 1 from public.profiles p join public.user_roles ur on ur.user_id = p.id
    join public.roles r on r.id = ur.role_id and r.code = 'user'
    where p.id = p_member_id and p.merged_at is null and p.merged_into_user_id is null
      and not exists (select 1 from public.user_roles past join public.roles pr on pr.id = past.role_id
        where past.user_id = p.id and pr.code = 'past_member')
  ) then raise exception 'Assistants can only be assigned to current members.' using errcode = '23514'; end if;
  if not exists (
    select 1 from public.profiles p join public.user_roles ur on ur.user_id = p.id
    join public.roles r on r.id = ur.role_id and r.code = 'assistant'
    where p.id = p_assistant_id and p.merged_at is null and p.merged_into_user_id is null
      and not exists (select 1 from public.user_roles past join public.roles pr on pr.id = past.role_id
        where past.user_id = p.id and pr.code = 'past_member')
  ) or exists (select 1 from public.assistant_access_revocations where assistant_id = p_assistant_id) then
    raise exception 'Restore assistant access before assigning this account.' using errcode = '23514';
  end if;
  if p_replace then
    update public.user_assistants set is_active = false, ended_at = coalesce(least(ended_at, now()), now())
      where user_id = p_member_id and assistant_id <> p_assistant_id and is_active;
  end if;
  update public.user_assistants set is_active = false
    where user_id = p_member_id and assistant_id = p_assistant_id and is_active and ended_at <= now();
  if not exists (select 1 from public.user_assistants where user_id = p_member_id
    and assistant_id = p_assistant_id and is_active) then
    insert into public.user_assistants(user_id, assistant_id, assigned_by, is_active)
      values (p_member_id, p_assistant_id, p_assigned_by, true);
  end if;
end;
$$;
revoke all on function public.set_member_assistant_assignment(uuid,uuid,boolean,boolean,uuid) from public, anon, authenticated;
grant execute on function public.set_member_assistant_assignment(uuid,uuid,boolean,boolean,uuid) to service_role;

-- One-time reconciliation of still-active links belonging to existing former
-- members. Ended history alone never causes a new assistant revocation.
do $$
declare member uuid;
begin
  for member in select ur.user_id from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.code = 'past_member'
    join public.profiles p on p.id = ur.user_id
    where p.merged_at is null and p.merged_into_user_id is null
      and exists (select 1 from public.user_assistants a where a.user_id = ur.user_id and a.is_active)
    order by ur.user_id
  loop
    perform public.revoke_past_member_assistants(member);
  end loop;
end;
$$;
commit;
