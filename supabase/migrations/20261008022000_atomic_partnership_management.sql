-- One logical partnership edit is one transaction. Active sharing ownership is
-- unique for each member/domain, including parent flag changes and concurrent writes.
begin;

lock table public.partnerships, public.partnership_users in share row exclusive mode;

-- Keep existing SELECT policies, but do not allow direct REST writes to bypass
-- the admin-only website handlers. Restrictive policies compose with the shipped
-- archive guard and any existing permissive policy. A past-member role overrides
-- admin, matching the website handlers. Service role still bypasses RLS.
alter table public.partnerships enable row level security;
alter table public.partnership_users enable row level security;
create policy partnership_admin_insert on public.partnerships as restrictive
  for insert to anon, authenticated with check ((select public.is_admin() and not public.has_role(array['past_member']::text[])));
create policy partnership_admin_update on public.partnerships as restrictive
  for update to anon, authenticated using ((select public.is_admin() and not public.has_role(array['past_member']::text[])))
  with check ((select public.is_admin() and not public.has_role(array['past_member']::text[])));
create policy partnership_admin_delete on public.partnerships as restrictive
  for delete to anon, authenticated using ((select public.is_admin() and not public.has_role(array['past_member']::text[])));
create policy partnership_members_admin_insert on public.partnership_users as restrictive
  for insert to anon, authenticated with check ((select public.is_admin() and not public.has_role(array['past_member']::text[])));
create policy partnership_members_admin_update on public.partnership_users as restrictive
  for update to anon, authenticated using ((select public.is_admin() and not public.has_role(array['past_member']::text[])))
  with check ((select public.is_admin() and not public.has_role(array['past_member']::text[])));
create policy partnership_members_admin_delete on public.partnership_users as restrictive
  for delete to anon, authenticated using ((select public.is_admin() and not public.has_role(array['past_member']::text[])));

create table public.partnership_write_guard (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0
);
insert into public.partnership_write_guard(singleton) values (true);
alter table public.partnership_write_guard enable row level security;
revoke all on public.partnership_write_guard from public, anon, authenticated, service_role;

create table public.partnership_domain_claims (
  user_id uuid not null,
  domain public.share_domain not null,
  partnership_id uuid not null,
  constraint partnership_domain_claims_pkey primary key (user_id, domain),
  foreign key (partnership_id, user_id) references public.partnership_users(partnership_id,user_id)
    on update cascade on delete cascade
);
alter table public.partnership_domain_claims enable row level security;
revoke all on public.partnership_domain_claims from public, anon, authenticated, service_role;
grant select on public.partnership_domain_claims to service_role;
comment on table public.partnership_domain_claims is
  'Derived active sharing ownership. Maintained only by partnership triggers; unique per member and domain.';

create function public.serialize_partnership_write()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  -- A real row update, rather than only an advisory lock, also forces stale
  -- REPEATABLE READ / SERIALIZABLE transactions to retry. Nested trigger writes
  -- in the same transaction can acquire this guard again safely.
  update public.partnership_write_guard set revision = revision + 1 where singleton;
  return null;
end;
$$;
revoke all on function public.serialize_partnership_write() from public, anon, authenticated, service_role;

create function public.refresh_partnership_domain_claims()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.partnership_users pu
    join public.partnerships p on p.id = pu.partnership_id
    join public.profiles profile on profile.id = pu.user_id
    where p.is_active and (p.shared_kpis or p.shared_attendance or p.shared_notes)
      and profile.merged_at is not null
  ) then
    raise exception 'Merged accounts cannot belong to an active sharing partnership.' using errcode = '23514';
  end if;
  -- Partnership edits are infrequent admin operations. Rebuilding this small
  -- derived set avoids membership/parent ordering gaps and covers multirow DML.
  delete from public.partnership_domain_claims;
  insert into public.partnership_domain_claims(user_id, domain, partnership_id)
  select pu.user_id, d.domain, p.id
  from public.partnerships p
  join public.partnership_users pu on pu.partnership_id = p.id
  cross join lateral (values
    ('kpis'::public.share_domain,p.shared_kpis),
    ('attendance'::public.share_domain,p.shared_attendance),
    ('notes'::public.share_domain,p.shared_notes)
  ) d(domain, shared)
  where p.is_active and d.shared;
  return null;
exception when unique_violation then
  raise exception 'A member already has an active partnership sharing one of the selected domains.'
    using errcode = '23514';
end;
$$;
revoke all on function public.refresh_partnership_domain_claims() from public, anon, authenticated, service_role;

create function public.protect_archived_partnership()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare member_profile record;
begin
  -- Lock every member, including currently unmerged profiles, before checking.
  -- Archive holds FOR UPDATE on its profiles: after waiting we observe its
  -- committed marker, and a flag change cannot race its shared-owner preflight.
  for member_profile in select p.merged_at from public.partnership_users pu
    join public.profiles p on p.id = pu.user_id where pu.partnership_id = old.id
    order by p.id for share of p
  loop
    if member_profile.merged_at is not null then
      raise exception 'Partnership history containing a merged account is read-only.' using errcode = '42501';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_archived_partnership() from public, anon, authenticated, service_role;

drop trigger trg_enforce_single_active_partnership_per_domain on public.partnership_users;
create trigger partnership_serialize_write before insert or update or delete on public.partnerships
  for each statement execute function public.serialize_partnership_write();
create trigger partnership_members_serialize_write before insert or update or delete on public.partnership_users
  for each statement execute function public.serialize_partnership_write();
create trigger partnership_refresh_domains after insert or update or delete on public.partnerships
  for each statement execute function public.refresh_partnership_domain_claims();
create trigger partnership_members_refresh_domains after insert or update or delete on public.partnership_users
  for each statement execute function public.refresh_partnership_domain_claims();
create trigger partnership_protect_archive before update or delete on public.partnerships
  for each row execute function public.protect_archived_partnership();

-- Backfill through the trigger. Existing overlaps abort installation rather than
-- silently selecting an owner or rewriting any existing partnership.
update public.partnerships set id = id where false;

create or replace function public.canonical_owner_for(_user uuid, _domain public.share_domain)
returns uuid language plpgsql stable set search_path = pg_catalog, public
as $$
declare matching_ids uuid[]; owner_id uuid;
begin
  select array_agg(p.id order by p.id) into matching_ids
  from public.partnerships p join public.partnership_users pu on pu.partnership_id = p.id
  where pu.user_id = _user and p.is_active
    and ((_domain = 'kpis' and p.shared_kpis) or (_domain = 'attendance' and p.shared_attendance)
      or (_domain = 'notes' and p.shared_notes));
  if coalesce(cardinality(matching_ids),0) > 1 then
    raise exception 'Conflicting active partnership ownership.' using errcode = '23514';
  end if;
  select pu.user_id into owner_id from public.partnership_users pu
    where pu.partnership_id = matching_ids[1] order by pu.user_id limit 1;
  return coalesce(owner_id,_user);
end;
$$;

create function public.save_partnership_admin(_id uuid default null, _changes jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  saved public.partnerships%rowtype;
  desired_ids uuid[];
  result jsonb;
begin
  if jsonb_typeof(_changes) is distinct from 'object' then
    raise exception 'Partnership changes must be an object.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(_changes) k where k not in
    ('name','shared_kpis','shared_attendance','shared_notes','is_active','user_ids')) then
    raise exception 'Unsupported partnership field.' using errcode = '22023';
  end if;
  if _changes ? 'name' and jsonb_typeof(_changes->'name') not in ('string','null') then
    raise exception 'Partnership name must be text or null.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(_changes) e where e.key in
    ('shared_kpis','shared_attendance','shared_notes','is_active') and jsonb_typeof(e.value) <> 'boolean') then
    raise exception 'Partnership sharing and active settings must be booleans.' using errcode = '22023';
  end if;
  if _changes ? 'user_ids' then
    if jsonb_typeof(_changes->'user_ids') <> 'array' then
      raise exception 'Partnership members must be an array of account IDs.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(_changes->'user_ids') u where jsonb_typeof(u) <> 'string') then
      raise exception 'Partnership members must be account IDs.' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct value::uuid),array[]::uuid[]) into desired_ids
      from jsonb_array_elements_text(_changes->'user_ids');
  end if;

  -- Acquire before reading existing membership, so two complete edits cannot
  -- interleave their read/remove/update/add phases.
  update public.partnership_write_guard set revision = revision + 1 where singleton;
  if _id is null then
    insert into public.partnerships(name,shared_kpis,shared_attendance,shared_notes,is_active)
    values (nullif(btrim(_changes->>'name'),''),coalesce((_changes->>'shared_kpis')::boolean,false),
      coalesce((_changes->>'shared_attendance')::boolean,false),coalesce((_changes->>'shared_notes')::boolean,false),
      coalesce((_changes->>'is_active')::boolean,true)) returning * into saved;
  else
    select * into saved from public.partnerships where id = _id for update;
    if not found then raise exception 'Partnership not found.' using errcode = 'P0002'; end if;
    -- Remove outgoing members before enabling new domains. A replacement may
    -- legitimately enable a domain that only the outgoing member shares elsewhere.
    if desired_ids is not null then
      delete from public.partnership_users where partnership_id = _id and not (user_id = any(desired_ids));
    end if;
    update public.partnerships set
      name = case when _changes ? 'name' then nullif(btrim(_changes->>'name'),'') else saved.name end,
      shared_kpis = coalesce((_changes->>'shared_kpis')::boolean,saved.shared_kpis),
      shared_attendance = coalesce((_changes->>'shared_attendance')::boolean,saved.shared_attendance),
      shared_notes = coalesce((_changes->>'shared_notes')::boolean,saved.shared_notes),
      is_active = coalesce((_changes->>'is_active')::boolean,saved.is_active)
      where id = _id returning * into saved;
  end if;
  if desired_ids is not null then
    insert into public.partnership_users(partnership_id,user_id)
      select saved.id, uid from unnest(desired_ids) uid
      where not exists (select 1 from public.partnership_users pu where pu.partnership_id = saved.id and pu.user_id = uid);
  end if;
  -- Return the full committed shape from the same transaction. A separate
  -- hydration query must not turn a successful write into an apparent failure.
  select to_jsonb(saved) || jsonb_build_object('members',coalesce(jsonb_agg(jsonb_build_object(
    'user_id',pu.user_id,
    'full_name',coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),nullif(lower(a.email),''),pu.user_id::text),
    'email',coalesce(lower(a.email),'')) order by pu.user_id) filter (where pu.user_id is not null),'[]'::jsonb))
    into result from public.partnership_users pu
    join public.profiles p on p.id = pu.user_id left join auth.users a on a.id = pu.user_id
    where pu.partnership_id = saved.id;
  return result;
end;
$$;
revoke all on function public.save_partnership_admin(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.save_partnership_admin(uuid,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
