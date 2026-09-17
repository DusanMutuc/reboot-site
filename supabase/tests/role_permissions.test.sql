begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Synthetic identities only; everything in this file rolls back.
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  label || '@example.invalid', '', now(), '{}', '{}', now(), now()
from (values
  ('00000000-0000-0000-0000-000000000961'::uuid, 'role-permissions-admin'),
  ('00000000-0000-0000-0000-000000000962'::uuid, 'role-permissions-member'),
  ('00000000-0000-0000-0000-000000000963'::uuid, 'role-permissions-coach'),
  ('00000000-0000-0000-0000-000000000964'::uuid, 'role-permissions-target'),
  ('00000000-0000-0000-0000-000000000965'::uuid, 'role-permissions-coach-peer')
) as fixture(id, label);
insert into public.profiles(id, first_name)
select id, 'Role permissions fixture' from auth.users where email like 'role-permissions-%@example.invalid';
insert into public.roles(code)
select requested.code from unnest(array['admin', 'user', 'coach', 'assistant', 'legend', 'past_member', 'role-permissions-fixture']) as requested(code)
where not exists (select 1 from public.roles r where r.code = requested.code);
insert into public.user_roles(user_id, role_id)
select fixture.id::uuid, r.id from (values
  ('00000000-0000-0000-0000-000000000961', 'admin'),
  ('00000000-0000-0000-0000-000000000962', 'user'),
  ('00000000-0000-0000-0000-000000000962', 'past_member'),
  ('00000000-0000-0000-0000-000000000963', 'coach'),
  ('00000000-0000-0000-0000-000000000964', 'user'),
  ('00000000-0000-0000-0000-000000000965', 'coach')
) as fixture(id, code) join public.roles r on r.code = fixture.code;

select ok((select bool_and(relrowsecurity and not relforcerowsecurity)
  from pg_class where oid in ('public.roles'::regclass, 'public.user_roles'::regclass)),
  'both tables enforce RLS without restricting the SQL Editor owner');
select ok((select bool_and(pg_get_userbyid(relowner) = 'postgres')
  from pg_class where oid in ('public.roles'::regclass, 'public.user_roles'::regclass)), 'postgres owns both tables');
select ok(not has_table_privilege('anon', 'public.roles', 'INSERT')
  and not has_table_privilege('anon', 'public.user_roles', 'INSERT'), 'anonymous table write grants are removed');
select ok(not has_table_privilege('authenticated', 'public.roles', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.user_roles', 'TRUNCATE'), 'browser cannot bypass RLS with TRUNCATE');
select ok(not has_table_privilege('authenticated', 'public.roles', 'TRIGGER')
  and not has_table_privilege('authenticated', 'public.user_roles', 'TRIGGER'), 'browser cannot attach triggers');
select ok(not has_sequence_privilege('authenticated', 'public.roles_id_seq', 'UPDATE'), 'browser cannot reset the role ID sequence');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=pg_catalog, public, pg_temp'])
  from pg_proc where oid in ('public.is_admin()'::regprocedure, 'public.has_role(text)'::regprocedure,
    'public.has_role(text[])'::regprocedure)), 'self-role helpers use a fixed owner context and safe search path');

set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = 'anon';
set local request.jwt.claims = '{"role":"anon"}';
select ok(not public.is_admin() and not public.has_role('admin') and not public.has_role(array['admin']),
  'anonymous policy checks return false without recursive/permission errors');
select throws_ok($$select * from public.roles$$, '42501', null, 'anonymous cannot read role definitions');
select throws_ok($$select * from public.user_roles$$, '42501', null, 'anonymous cannot read role assignments');
select throws_ok($$insert into public.roles(code) values ('role-permissions-anon')$$,
  '42501', null, 'anonymous cannot create roles');
select throws_ok($$insert into public.user_roles(user_id, role_id) values ('00000000-0000-0000-0000-000000000962', 1)$$,
  '42501', null, 'anonymous cannot assign roles');
select throws_ok($$update public.roles set code = 'role-permissions-anon' where code = 'role-permissions-fixture'$$,
  '42501', null, 'anonymous cannot rename roles');
select throws_ok($$delete from public.user_roles where user_id = '00000000-0000-0000-0000-000000000961'$$,
  '42501', null, 'anonymous cannot remove admin assignments');
select throws_ok($$select public.transfer_user_data('00000000-0000-0000-0000-000000000961',
  '00000000-0000-0000-0000-000000000962', '{"skip_admin_check":true,"dry_run":false}')$$,
  '42501', null, 'anonymous cannot copy admin roles through the transfer RPC');
select throws_ok($$select public.transfer_user_data_admin('00000000-0000-0000-0000-000000000961',
  '00000000-0000-0000-0000-000000000962', '{}')$$, '42501', null, 'anonymous cannot call the transfer wrapper');
select throws_ok($$select public.try_delete_user_db('00000000-0000-0000-0000-000000000961')$$,
  '42501', null, 'anonymous cannot delete an admin account through the fallback RPC');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000962';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000962","role":"authenticated","user_metadata":{"role":"admin","roles":["admin"]}}';
select ok(not public.is_admin() and not public.has_role('admin'), 'self-declared metadata does not confer admin rights');
select ok(public.has_role('user') and public.has_role(array['user', 'admin']), 'member role helpers still read actual assignments');
select is((select count(*) from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid() and r.code in ('user', 'past_member')), 2::bigint, 'own role join used by navigation remains readable');
select throws_ok($$insert into public.user_roles(user_id, role_id)
  select auth.uid(), id from public.roles where code = 'admin'$$, '42501', null, 'member cannot self-promote');
select throws_ok($$insert into public.user_roles(user_id, role_id)
  select '00000000-0000-0000-0000-000000000964', id from public.roles where code = 'admin'$$,
  '42501', null, 'member cannot grant someone else admin');
select throws_ok($$insert into public.user_roles(user_id, role_id)
  select auth.uid(), id from public.roles where code = 'user'
  on conflict(user_id, role_id) do update set role_id = (select id from public.roles where code = 'admin')$$,
  '42501', null, 'upsert cannot bypass role assignment policies');
with changed as (update public.user_roles set role_id = (select id from public.roles where code = 'admin')
  where user_id = auth.uid() and role_id = (select id from public.roles where code = 'user') returning *)
select is((select count(*) from changed), 0::bigint, 'member cannot update their existing role into admin');
with changed as (delete from public.user_roles where user_id = auth.uid()
  and role_id = (select id from public.roles where code = 'past_member') returning *)
select is((select count(*) from changed),
  0::bigint, 'member cannot remove their own access restriction');
with changed as (delete from public.user_roles where user_id = '00000000-0000-0000-0000-000000000961' returning *)
select is((select count(*) from changed), 0::bigint, 'member cannot revoke someone else admin');
select throws_ok($$insert into public.roles(code) values ('role-permissions-member-created')$$,
  '42501', null, 'member cannot create a role definition');
with changed as (update public.roles set code = 'role-permissions-member-renamed'
  where code = 'role-permissions-fixture' returning *)
select is((select count(*) from changed),
  0::bigint, 'member cannot change a role definition');
with changed as (delete from public.roles where code = 'role-permissions-fixture' returning *)
select is((select count(*) from changed), 0::bigint, 'member cannot delete a role definition');
select throws_ok($$select public.transfer_user_data('00000000-0000-0000-0000-000000000961',
  '00000000-0000-0000-0000-000000000962', '{"skip_admin_check":true,"dry_run":false}')$$,
  '42501', null, 'member cannot bypass admin checks with the transfer options');
select throws_ok($$select public.transfer_user_data_admin('00000000-0000-0000-0000-000000000961',
  '00000000-0000-0000-0000-000000000962', '{"dry_run":false}')$$,
  '42501', null, 'member cannot copy admin roles through the wrapper');
select throws_ok($$select public.try_delete_user_db('00000000-0000-0000-0000-000000000961')$$,
  '42501', null, 'member cannot bypass role removal restrictions by deleting the admin');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000963';
select ok(public.is_coach() and not public.is_admin(), 'coach checks continue to work without granting admin');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000965'),
  1::bigint, 'existing coach-peer profile policy retains its cross-user role lookup');
select throws_ok($$insert into public.user_roles(user_id, role_id)
  select auth.uid(), id from public.roles where code = 'admin'$$, '42501', null, 'coach cannot self-promote');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000961';
select ok(public.is_admin() and public.has_role('admin'), 'admin is recognized using stored roles, not stale member metadata');
select lives_ok($$insert into public.roles(code) values ('role-permissions-admin-created')$$,
  'admin can create a role definition using its sequence');
with changed as (update public.roles set code = 'role-permissions-admin-renamed'
  where code = 'role-permissions-admin-created' returning *)
select is((select count(*) from changed), 1::bigint, 'admin can rename a role');
with changed as (delete from public.roles where code = 'role-permissions-admin-renamed' returning *)
select is((select count(*) from changed), 1::bigint, 'admin can remove an unused role');
select lives_ok($$insert into public.user_roles(user_id, role_id)
  select '00000000-0000-0000-0000-000000000964', id from public.roles where code = 'assistant'$$,
  'admin can assign another user a role');
with changed as (update public.user_roles set role_id = (select id from public.roles where code = 'legend')
  where user_id = '00000000-0000-0000-0000-000000000964' and role_id = (select id from public.roles where code = 'assistant') returning *)
select is((select count(*) from changed), 1::bigint, 'admin can change an assignment');
with changed as (delete from public.user_roles where user_id = '00000000-0000-0000-0000-000000000964'
  and role_id = (select id from public.roles where code = 'legend') returning *)
select is((select count(*) from changed),
  1::bigint, 'admin can remove an assignment');
select lives_ok($$insert into public.user_roles(user_id, role_id)
  select '00000000-0000-0000-0000-000000000964', id from public.roles where code = 'admin'
  on conflict (user_id, role_id) do nothing$$, 'admin can promote another user');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000964';
select ok(public.is_admin(), 'promotion takes effect on the next statement without a new JWT');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000961';
delete from public.user_roles where user_id = '00000000-0000-0000-0000-000000000964'
  and role_id = (select id from public.roles where code = 'admin');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000964';
select ok(not public.is_admin(), 'revocation takes effect on the next statement without a new JWT');
select throws_ok($$insert into public.user_roles(user_id, role_id)
  select auth.uid(), id from public.roles where code = 'admin'$$,
  '42501', null, 'recently revoked admin cannot restore their own role');

reset role;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = '';
set local request.jwt.claims = '';
select is(current_user::text, 'postgres', 'trusted SQL Editor-equivalent owner context is under test');
select lives_ok($$insert into public.user_roles(user_id, role_id)
  select '00000000-0000-0000-0000-000000000964', id from public.roles where code = 'assistant'$$,
  'SQL Editor owner can assign a role without a member session');
with changed as (update public.user_roles set role_id = (select id from public.roles where code = 'legend')
  where user_id = '00000000-0000-0000-0000-000000000964' and role_id = (select id from public.roles where code = 'assistant') returning *)
select is((select count(*) from changed), 1::bigint, 'SQL Editor owner can change roles');
with changed as (delete from public.user_roles where user_id = '00000000-0000-0000-0000-000000000964'
  and role_id = (select id from public.roles where code = 'legend') returning *)
select is((select count(*) from changed),
  1::bigint, 'SQL Editor owner can remove roles');

set local role service_role;
set local request.jwt.claim.role = 'service_role';
select lives_ok($$insert into public.user_roles(user_id, role_id)
  select '00000000-0000-0000-0000-000000000964', id from public.roles where code = 'assistant'
  on conflict(user_id, role_id) do update set role_id = excluded.role_id$$,
  'trusted service role can upsert roles for admin routes and onboarding');
with changed as (delete from public.user_roles where user_id = '00000000-0000-0000-0000-000000000964'
  and role_id = (select id from public.roles where code = 'assistant') returning *)
select is((select count(*) from changed),
  1::bigint, 'trusted service role can remove assignments');
select ok(has_function_privilege(current_user, 'public.transfer_user_data(uuid,uuid,jsonb)', 'EXECUTE')
  and has_function_privilege(current_user, 'public.transfer_user_data_admin(uuid,uuid,jsonb)', 'EXECUTE')
  and has_function_privilege(current_user, 'public.try_delete_user_db(uuid)', 'EXECUTE'),
  'admin server routes retain access to account-management RPCs');
select is(public.try_delete_user_db('00000000-0000-0000-0000-000000000964'), null::text,
  'trusted account deletion fallback succeeds');
reset role;
select is((select count(*) from public.user_roles where user_id = '00000000-0000-0000-0000-000000000964'),
  0::bigint, 'account deletion still cascades to its assignments');
select ok(exists(select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = '00000000-0000-0000-0000-000000000961' and r.code = 'admin'),
  'denied attacks left the original admin fixture intact');

select * from finish();
rollback;
