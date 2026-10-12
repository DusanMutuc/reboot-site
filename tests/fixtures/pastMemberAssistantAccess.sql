-- Minimal schema for the actual assistant-access migration and shipped guards.
-- All identities and assignments are synthetic and live only inside PGlite.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql as
  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql as
  $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
grant usage on schema auth to anon,authenticated,service_role;

create table public.profiles(
  id uuid primary key references auth.users(id),
  first_name text,
  merged_at timestamptz,
  merged_into_user_id uuid references public.profiles(id)
);
create table public.roles(id bigint generated always as identity primary key,code text unique not null);
create table public.user_roles(
  user_id uuid not null references public.profiles(id),
  role_id bigint not null references public.roles(id),
  primary key(user_id,role_id)
);
create table public.user_assistants(
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id),
  assistant_id uuid not null references public.profiles(id),
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid references public.profiles(id),
  notes text,
  constraint user_assistants_not_self check(user_id<>assistant_id)
);
create unique index uq_user_assistants_active_pair on public.user_assistants(user_id,assistant_id) where is_active;
create table public.account_merges(source_user_id uuid primary key references public.profiles(id));
create table public.member_pauses(user_id uuid references public.profiles(id),starts_on date,ends_on date);
create table public.ninety_day_cycles(id bigint primary key,status text);
create table public.ninety_day_cycle_users(user_id uuid,cycle_id bigint,ended_at timestamptz);
create table public.content_node_roles(id bigint primary key);

grant all on all tables in schema public to anon,authenticated,service_role;
grant all on all sequences in schema public to anon,authenticated,service_role;
-- Existing reads must survive installation, while permissive legacy write
-- policies must not provide an ordinary client a route around the new guards.
create policy legacy_roles_read on public.user_roles for select using(true);
create policy legacy_roles_write on public.user_roles for all using(true) with check(true);
create policy legacy_assistants_read on public.user_assistants for select using(true);
create policy legacy_assistants_write on public.user_assistants for all using(true) with check(true);

insert into public.roles(code) values
  ('user'),('assistant'),('past_member'),('admin'),('coach'),('legend'),('ninety-day-user');
