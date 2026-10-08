-- Pending accounts cannot use a legacy password session to reach application
-- data. Auth recovery endpoints remain available, including to past members.
begin;
create function public.account_setup_complete(_user_id uuid)
returns boolean language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  metadata jsonb;
  cutoff timestamptz;
  timestamp_text text;
  token_issued_at text;
begin
  if _user_id is null then return true; end if;
  select u.raw_app_meta_data into metadata from auth.users u where u.id = _user_id;
  if not found then return false; end if;
  if coalesce(metadata->'must_reset_password', 'false'::jsonb) = 'true'::jsonb then return false; end if;

  -- Administrative lookups of another account do not carry that account's JWT.
  -- Service-role access already has the explicit maintenance bypass.
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is distinct from _user_id then return true; end if;

  -- Revoked refresh sessions do not revoke already-issued access tokens. Keep
  -- those tokens blocked after the owner completes setup and clears the flag.
  foreach timestamp_text in array array[metadata->>'setup_required_at', metadata->>'setup_completed_at'] loop
    if timestamp_text is not null then
      begin
        cutoff := greatest(cutoff, timestamp_text::timestamptz);
      exception when invalid_datetime_format or datetime_field_overflow then
        return false;
      end;
    end if;
  end loop;
  if cutoff is null then return true; end if;
  token_issued_at := auth.jwt()->>'iat';
  if jsonb_typeof(auth.jwt()->'iat') is distinct from 'number'
    or token_issued_at !~ '^[0-9]{1,12}$' then return false; end if;

  -- Supabase iat has second precision. Reject the entire cutoff second, so a
  -- token issued just before rotation/completion cannot regain access. A fresh
  -- sign-in in a later second is required (strictly greater, not >=).
  return token_issued_at::numeric > floor(extract(epoch from cutoff));
end;
$$;
revoke all on function public.account_setup_complete(uuid) from public;
grant execute on function public.account_setup_complete(uuid) to anon, authenticated, service_role;

create function public.account_setup_pre_request()
returns void language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- Preserve the archived-account guard and any hook it already chains.
  perform public.account_merge_pre_request();
  if coalesce(auth.role(), '') <> 'service_role' and not public.account_setup_complete(auth.uid()) then
    raise exception 'Complete password setup using an email link, or sign in again if setup is already complete.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.account_setup_pre_request() from public;
grant execute on function public.account_setup_pre_request() to anon, authenticated, service_role;

do $$
declare r record; configured_hook text; runtime_hook text; config_hook text;
begin
  -- A dynamic config hook could replace the installed request guard on reload.
  -- Preserve the same fail-closed preflight used by the archive installation.
  select split_part(setting,'=',2) into config_hook
  from pg_db_role_setting s cross join lateral unnest(s.setconfig) setting
  where s.setrole = (select oid from pg_roles where rolname = 'authenticator')
    and s.setdatabase in (0, (select oid from pg_database where datname = current_database()))
    and setting like 'pgrst.db_pre_config=%'
  order by s.setdatabase desc limit 1;
  if nullif(config_hook, '') is not null or nullif(current_setting('pgrst.db_pre_config', true), '') is not null then
    raise exception 'Integrate password setup with the existing PostgREST pre-config hook before installing.';
  end if;
  select split_part(setting,'=',2) into configured_hook
  from pg_db_role_setting s cross join lateral unnest(s.setconfig) setting
  where s.setrole = (select oid from pg_roles where rolname = 'authenticator')
    and s.setdatabase in (0, (select oid from pg_database where datname = current_database()))
    and setting like 'pgrst.db_pre_request=%'
  order by s.setdatabase desc limit 1;
  if configured_hook is distinct from 'public.account_merge_pre_request' then
    raise exception 'Expected the archived-account API guard; inspect existing configuration before onboarding migration.';
  end if;
  runtime_hook := nullif(current_setting('pgrst.db_pre_request', true), '');
  if runtime_hook is not null and runtime_hook <> configured_hook then
    raise exception 'Multiple PostgREST request guards require manual integration before installing password setup.';
  end if;
  execute format('alter role authenticator in database %I set pgrst.db_pre_request = %L',
    current_database(), 'public.account_setup_pre_request');

  -- Every currently exposed application/storage table already has the archive
  -- restriction. Add a setup restriction without altering its existing grants.
  for r in select distinct schemaname, tablename from pg_policies
    where policyname = 'account_merge_subject_guard' and schemaname in ('public','storage')
  loop
    execute format('create policy account_setup_subject_guard on %I.%I as restrictive
      for all to public using ((select public.account_setup_complete(auth.uid())))
      with check ((select public.account_setup_complete(auth.uid())))', r.schemaname,r.tablename);
  end loop;
end;
$$;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
