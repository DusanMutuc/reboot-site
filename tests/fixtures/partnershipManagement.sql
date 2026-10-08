create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql as
  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.roles(id bigint primary key,code text);
create table public.user_roles(user_id uuid,role_id bigint);
grant select on public.roles,public.user_roles to anon,authenticated,service_role;
insert into public.roles values(1,'admin');
insert into public.user_roles values('00000000-0000-0000-0000-000000000006',1);
create type public.share_domain as enum ('kpis','attendance','notes');
create table public.profiles (
  id uuid primary key references auth.users(id), first_name text, last_name text,
  merged_at timestamptz, merged_into_user_id uuid
);
create table public.partnerships (
  id uuid primary key default gen_random_uuid(), name text,
  shared_kpis boolean not null default true, shared_attendance boolean not null default false,
  shared_notes boolean not null default false, is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.partnership_users (
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (partnership_id,user_id)
);
grant usage on schema public,auth to anon,authenticated,service_role;
grant all on public.partnerships,public.partnership_users to anon,authenticated,service_role;
-- The shipped archive migration preserves these legacy table grants with RLS.
alter table public.partnerships enable row level security;
alter table public.partnership_users enable row level security;
create policy account_merge_preserve_existing_grants on public.partnerships for all to public using(true) with check(true);
create policy account_merge_preserve_existing_grants on public.partnership_users for all to public using(true) with check(true);
insert into auth.users(id,email) select ('00000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid,
  'Member' || i || '@example.test' from generate_series(1,6) i;
insert into public.profiles(id,first_name,last_name) select id,'Member',right(id::text,1) from auth.users;
