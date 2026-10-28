-- One verified backup address for the existing Supabase Auth identity.
-- No Auth users, credentials, primary emails, or member history are rewritten.
-- Private helpers are intentionally service-only: the website authenticates
-- the actor and requires fresh password proof before management calls. Supabase
-- remains responsible for password verification, recovery, and sessions.
begin;

create schema reboot_backup_email;
revoke all on schema reboot_backup_email from public, anon, authenticated;
grant usage on schema reboot_backup_email to service_role;

create table reboot_backup_email.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  credential_epoch bigint not null default 0 check (credential_epoch >= 0)
);
create table reboot_backup_email.addresses (
  email text primary key check (email = lower(btrim(email)) and email <> ''),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('primary', 'backup')),
  verified_at timestamptz,
  unique (user_id, kind),
  check ((kind = 'backup') = (verified_at is not null))
);
create table reboot_backup_email.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  request_id uuid not null unique,
  version bigint not null,
  credential_epoch bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0)
);
create index backup_email_challenges_user_idx on reboot_backup_email.challenges(user_id, created_at desc);
create table reboot_backup_email.recovery_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  request_id uuid not null unique,
  version bigint not null,
  credential_epoch bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  redemption_id uuid unique,
  revoked_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  check ((consumed_at is null) = (redemption_id is null))
);
create index backup_email_recovery_user_idx on reboot_backup_email.recovery_grants(user_id);
create table reboot_backup_email.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0)
);

alter table reboot_backup_email.accounts enable row level security;
alter table reboot_backup_email.addresses enable row level security;
alter table reboot_backup_email.challenges enable row level security;
alter table reboot_backup_email.recovery_grants enable row level security;
alter table reboot_backup_email.rate_limits enable row level security;
revoke all on all tables in schema reboot_backup_email from public, anon, authenticated, service_role;

-- This also serializes the initial snapshot with signup/admin email changes.
-- A normalization collision aborts installation instead of assigning an alias
-- to an arbitrary user. Resolve such legacy collisions explicitly beforehand.
lock table auth.users in share row exclusive mode;
insert into reboot_backup_email.accounts(user_id) select id from auth.users;
insert into reboot_backup_email.addresses(email,user_id,kind)
  select lower(btrim(email)),id,'primary' from auth.users where nullif(btrim(email),'') is not null;

create function reboot_backup_email.revoke_credentials(_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  -- The website snapshots this version BEFORE verifying the current password,
  -- checks the submitted UI version against that authoritative snapshot, then
  -- passes the snapshot to begin/remove. Changing both counters invalidates a
  -- proof spanning a credential reset as well as in-flight backup login results.
  update reboot_backup_email.accounts set credential_epoch = credential_epoch + 1,version = version + 1 where user_id = _user_id;
  update reboot_backup_email.challenges set revoked_at = clock_timestamp() where user_id = _user_id and revoked_at is null;
  update reboot_backup_email.recovery_grants set revoked_at = clock_timestamp() where user_id = _user_id and revoked_at is null;
end;
$$;

create function reboot_backup_email.sync_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_email text := nullif(lower(btrim(new.email)), '');
begin
  if tg_op = 'INSERT' then
    insert into reboot_backup_email.accounts(user_id) values(new.id);
  end if;
  if tg_op = 'INSERT' or new.email is distinct from old.email then
    -- Never lock profiles here: Auth already owns its row lock, whereas account
    -- merge correctly locks profile before Auth. The unique registry is the
    -- arbiter even when callers bypass the website and use Auth/admin APIs.
    delete from reboot_backup_email.addresses where user_id = new.id and kind = 'primary';
    if v_email is not null then
      insert into reboot_backup_email.addresses(email,user_id,kind) values(v_email,new.id,'primary');
    end if;
  end if;
  if tg_op = 'UPDATE' and (
    new.email is distinct from old.email
    or new.encrypted_password is distinct from old.encrypted_password
    or new.banned_until is distinct from old.banned_until
    or new.deleted_at is distinct from old.deleted_at
    or new.email_confirmed_at is distinct from old.email_confirmed_at
    or (new.raw_app_meta_data->'must_reset_password',new.raw_app_meta_data->'setup_required_at',new.raw_app_meta_data->'setup_completed_at')
      is distinct from (old.raw_app_meta_data->'must_reset_password',old.raw_app_meta_data->'setup_required_at',old.raw_app_meta_data->'setup_completed_at')
  ) then
    perform reboot_backup_email.revoke_credentials(new.id);
  end if;
  return new;
end;
$$;
create trigger reboot_backup_email_sync_auth after insert or update on auth.users
  for each row execute function reboot_backup_email.sync_auth_user();

create function reboot_backup_email.archive_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.merged_at,new.merged_into_user_id) is distinct from (old.merged_at,old.merged_into_user_id) then
    -- Keep address reservations attached to the archived UUID. Merge never
    -- transfers credentials or grants login through a source account's alias.
    perform reboot_backup_email.revoke_credentials(new.id);
  end if;
  return new;
end;
$$;
create trigger reboot_backup_email_archive after update of merged_at,merged_into_user_id on public.profiles
  for each row execute function reboot_backup_email.archive_user();

create function reboot_backup_email.change_mfa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Any factor mutation revokes old grants, including enable-then-disable.
  if tg_op = 'DELETE' then
    perform reboot_backup_email.revoke_credentials(old.user_id);
    return old;
  end if;
  perform reboot_backup_email.revoke_credentials(new.user_id);
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform reboot_backup_email.revoke_credentials(old.user_id);
  end if;
  return new;
end;
$$;
create trigger reboot_backup_email_mfa after insert or update or delete on auth.mfa_factors
  for each row execute function reboot_backup_email.change_mfa();

create function reboot_backup_email.charge(_keys text[],_limits integer[])
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v record; v_attempts integer; v_allowed boolean := true; v_start timestamptz := date_trunc('hour',clock_timestamp());
begin
  -- Stable lock ordering prevents actor/network quota deadlocks. Rejections
  -- return normally so unsuccessful attempts remain counted in the transaction.
  for v in select k, _limits[n] as cap from unnest(_keys) with ordinality as x(k,n) order by k loop
    insert into reboot_backup_email.rate_limits(key,window_start,attempts) values(v.k,v_start,1)
      on conflict(key) do update set window_start = excluded.window_start,
        attempts = case when reboot_backup_email.rate_limits.window_start = excluded.window_start
          then least(reboot_backup_email.rate_limits.attempts + 1,1000000) else 1 end
      returning attempts into v_attempts;
    if v_attempts > v.cap then v_allowed := false; end if;
  end loop;
  return v_allowed;
end;
$$;

create function reboot_backup_email.lock_account(_user_id uuid,_native_login boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare p record; u record; a reboot_backup_email.accounts%rowtype;
begin
  -- Match the existing archive merge ordering. This prevents both a stale
  -- profile check after waiting and a grant crossing an archive transaction.
  select merged_at,merged_into_user_id into p from public.profiles where id = _user_id for share;
  if not found or p.merged_at is not null or p.merged_into_user_id is not null then
    return jsonb_build_object('status','ineligible');
  end if;
  select * into u from auth.users where id = _user_id for share;
  if not found or u.deleted_at is not null or u.banned_until > clock_timestamp() or nullif(btrim(u.email),'') is null then
    return jsonb_build_object('status','ineligible');
  end if;
  select * into a from reboot_backup_email.accounts where user_id = _user_id for update;
  if not found then return jsonb_build_object('status','ineligible'); end if;
  -- The MFA trigger changes the epoch under this same account lock. Query
  -- factors only AFTER waiting for that lock, so READ COMMITTED observes a
  -- factor change that committed while we waited instead of accepting the new
  -- epoch together with an old pre-lock eligibility snapshot.
  if not _native_login and (
    coalesce(u.raw_app_meta_data->'must_reset_password','false'::jsonb) = 'true'::jsonb
    or u.email_confirmed_at is null or nullif(u.encrypted_password,'') is null
    or exists(select 1 from auth.mfa_factors where user_id = _user_id and status = 'verified')
  ) then return jsonb_build_object('status','ineligible'); end if;
  return jsonb_build_object('status','ok','userId',_user_id,'canonicalEmail',u.email,
    'version',a.version,'credentialEpoch',a.credential_epoch);
end;
$$;

create function reboot_backup_email.state(_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a jsonb; b reboot_backup_email.addresses%rowtype; c reboot_backup_email.challenges%rowtype;
begin
  a := reboot_backup_email.lock_account(_user_id);
  if a->>'status' <> 'ok' then return a; end if;
  select * into b from reboot_backup_email.addresses where user_id = _user_id and kind = 'backup';
  select * into c from reboot_backup_email.challenges where user_id = _user_id
    and revoked_at is null and consumed_at is null and expires_at > clock_timestamp()
    and version = (a->>'version')::bigint and credential_epoch = (a->>'credentialEpoch')::bigint
    order by created_at desc limit 1;
  return jsonb_build_object('status','ok','version',a->'version','email',b.email,'verified',b.email is not null,
    'verifiedAt',b.verified_at,'pendingEmail',c.email,'pendingExpiresAt',c.expires_at);
end;
$$;

create function reboot_backup_email.admission(_scope text,_actor_hash text,_network_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cap integer;
begin
  if _scope is null or _scope not in ('manage','verify','recovery','login')
    or _actor_hash is null or _actor_hash !~ '^[0-9a-f]{64}$'
    or _network_hash is null or _network_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status','invalid');
  end if;
  cap := case _scope when 'login' then 60 when 'verify' then 30 else 10 end;
  if not reboot_backup_email.charge(array['admit:'||_scope||':actor:'||_actor_hash,'admit:'||_scope||':network:'||_network_hash],array[cap,cap*3]) then
    return jsonb_build_object('status','rate_limited');
  end if;
  return jsonb_build_object('status','ok');
end;
$$;

create function reboot_backup_email.begin_verification(_user_id uuid,_email text,_token_hash text,_request_id uuid,_expected_version bigint,_network_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a jsonb; c reboot_backup_email.challenges%rowtype; v_email text := lower(btrim(_email));
begin
  if _user_id is null or _request_id is null or _expected_version is null or _expected_version < 0
    or v_email is null or length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or _token_hash is null or _token_hash !~ '^[0-9a-f]{64}$'
    or _network_hash is null or _network_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status','invalid');
  end if;
  if not reboot_backup_email.charge(array['verify-send:user:'||_user_id::text,'verify-send:network:'||_network_hash],array[5,20]) then
    return jsonb_build_object('status','rate_limited');
  end if;
  a := reboot_backup_email.lock_account(_user_id);
  if a->>'status' <> 'ok' then return a; end if;
  select * into c from reboot_backup_email.challenges where request_id = _request_id;
  if found then
    if c.user_id <> _user_id or c.email <> v_email or c.token_hash <> _token_hash or c.version <> _expected_version + 1
      or c.version <> (a->>'version')::bigint
      or c.credential_epoch <> (a->>'credentialEpoch')::bigint or c.revoked_at is not null
      or c.consumed_at is not null or c.expires_at <= clock_timestamp() then
      return jsonb_build_object('status','conflict');
    end if;
  else
    if (a->>'version')::bigint <> _expected_version then return jsonb_build_object('status','conflict'); end if;
    if exists(select 1 from reboot_backup_email.addresses where email = v_email) then
      return jsonb_build_object('status','conflict');
    end if;
    -- Pending edits are state changes too. A stale tab may neither replace the
    -- latest challenge nor remove a newer pending address with the old version.
    update reboot_backup_email.accounts set version = version + 1 where user_id = _user_id;
    update reboot_backup_email.challenges set revoked_at = clock_timestamp() where user_id = _user_id and revoked_at is null;
    -- A pending challenge does not reserve somebody else's mailbox. The
    -- successful verification below atomically competes with Auth/signup.
    insert into reboot_backup_email.challenges(user_id,email,token_hash,request_id,version,credential_epoch,expires_at)
      values(_user_id,v_email,_token_hash,_request_id,_expected_version + 1,(a->>'credentialEpoch')::bigint,clock_timestamp()+interval '15 minutes')
      returning * into c;
  end if;
  return jsonb_build_object('status','ok','challengeId',c.id,'version',c.version,'email',c.email,'expiresAt',c.expires_at);
end;
$$;

create function reboot_backup_email.verify(_user_id uuid,_challenge_id uuid,_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a jsonb; c reboot_backup_email.challenges%rowtype; v_version bigint;
begin
  a := reboot_backup_email.lock_account(_user_id);
  if a->>'status' <> 'ok' then return a; end if;
  select * into c from reboot_backup_email.challenges where id = _challenge_id and user_id = _user_id for update;
  if not found or c.revoked_at is not null or c.consumed_at is not null or c.expires_at <= clock_timestamp()
    or c.version <> (a->>'version')::bigint or c.credential_epoch <> (a->>'credentialEpoch')::bigint or c.attempts >= 10 then
    return jsonb_build_object('status','invalid');
  end if;
  update reboot_backup_email.challenges set attempts = attempts + 1 where id = c.id;
  if _token_hash is null or c.token_hash <> _token_hash then return jsonb_build_object('status','invalid'); end if;
  begin
    -- The subtransaction restores the previous backup when another Auth user
    -- or verified alias has won the unique address concurrently.
    delete from reboot_backup_email.addresses where user_id = _user_id and kind = 'backup';
    insert into reboot_backup_email.addresses(email,user_id,kind,verified_at) values(c.email,_user_id,'backup',clock_timestamp());
  exception when unique_violation then return jsonb_build_object('status','conflict'); end;
  update reboot_backup_email.accounts set version = version + 1 where user_id = _user_id returning version into v_version;
  update reboot_backup_email.challenges set consumed_at = clock_timestamp() where id = c.id;
  update reboot_backup_email.challenges set revoked_at = clock_timestamp() where user_id = _user_id and id <> c.id and revoked_at is null;
  update reboot_backup_email.recovery_grants set revoked_at = clock_timestamp() where user_id = _user_id and revoked_at is null;
  return jsonb_build_object('status','ok','version',v_version);
end;
$$;

create function reboot_backup_email.remove(_user_id uuid,_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a jsonb; v_version bigint;
begin
  a := reboot_backup_email.lock_account(_user_id);
  if a->>'status' <> 'ok' then return a; end if;
  if _expected_version is null or (a->>'version')::bigint <> _expected_version then return jsonb_build_object('status','conflict'); end if;
  delete from reboot_backup_email.addresses where user_id = _user_id and kind = 'backup';
  update reboot_backup_email.accounts set version = version + 1 where user_id = _user_id returning version into v_version;
  update reboot_backup_email.challenges set revoked_at = clock_timestamp() where user_id = _user_id and revoked_at is null;
  update reboot_backup_email.recovery_grants set revoked_at = clock_timestamp() where user_id = _user_id and revoked_at is null;
  return jsonb_build_object('status','ok','version',v_version);
end;
$$;

create function reboot_backup_email.resolve(_email text,_network_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b reboot_backup_email.addresses%rowtype; a jsonb; v_email text := lower(btrim(_email));
begin
  if v_email is null or v_email = '' or length(v_email) > 254 or _network_hash is null or _network_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status','invalid');
  end if;
  if not reboot_backup_email.charge(array['login:email:'||md5(v_email),'login:network:'||_network_hash],array[60,180]) then
    return jsonb_build_object('status','rate_limited');
  end if;
  select * into b from reboot_backup_email.addresses where email = v_email;
  if not found then return jsonb_build_object('status','invalid'); end if;
  a := reboot_backup_email.lock_account(b.user_id,b.kind = 'primary');
  if a->>'status' <> 'ok' then return jsonb_build_object('status','invalid'); end if;
  -- Re-read after locking: the first lookup may have waited behind replacement.
  if not exists(select 1 from reboot_backup_email.addresses where email = v_email and user_id = b.user_id and kind = b.kind) then
    return jsonb_build_object('status','invalid');
  end if;
  return jsonb_build_object('status','ok','userId',b.user_id,'canonicalEmail',a->>'canonicalEmail','email',v_email,
    'version',case when b.kind = 'primary' then 0 else (a->>'version')::bigint end,'kind',b.kind);
end;
$$;

create function reboot_backup_email.recheck_login(_user_id uuid,_email text,_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a jsonb; b reboot_backup_email.addresses%rowtype; v_email text := lower(btrim(_email));
begin
  -- Only primary lookups use version 0. Verified backups start at version 1.
  a := reboot_backup_email.lock_account(_user_id,_version = 0);
  if a->>'status' <> 'ok' then return a; end if;
  select * into b from reboot_backup_email.addresses where email = v_email and user_id = _user_id;
  if not found or _version is null or (_version = 0 and b.kind <> 'primary')
    or (_version <> 0 and (b.kind <> 'backup' or (a->>'version')::bigint <> _version)) then
    return jsonb_build_object('status','invalid');
  end if;
  return jsonb_build_object('status','ok');
end;
$$;

create function reboot_backup_email.begin_recovery(_email text,_token_hash text,_request_id uuid,_network_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a jsonb; b reboot_backup_email.addresses%rowtype; g reboot_backup_email.recovery_grants%rowtype; v_email text := lower(btrim(_email)); v_primary text;
begin
  if v_email is null or v_email = '' or length(v_email) > 254 or _request_id is null
    or _token_hash is null or _token_hash !~ '^[0-9a-f]{64}$'
    or _network_hash is null or _network_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status','invalid');
  end if;
  if not reboot_backup_email.charge(array['recovery:email:'||md5(v_email),'recovery:network:'||_network_hash],array[5,20]) then
    return jsonb_build_object('status','rate_limited');
  end if;
  select * into b from reboot_backup_email.addresses where email = v_email;
  if not found then return jsonb_build_object('status','invalid'); end if;
  if b.kind = 'primary' then
    select email into v_primary from auth.users where id = b.user_id and lower(btrim(email)) = v_email;
    if found then return jsonb_build_object('status','primary','email',v_primary); end if;
    return jsonb_build_object('status','invalid');
  end if;
  a := reboot_backup_email.lock_account(b.user_id);
  if a->>'status' <> 'ok' then return jsonb_build_object('status','invalid'); end if;
  if not exists(select 1 from reboot_backup_email.addresses where user_id = b.user_id and email = v_email and kind = 'backup') then
    return jsonb_build_object('status','invalid');
  end if;
  select * into g from reboot_backup_email.recovery_grants where request_id = _request_id;
  if found then
    if g.user_id <> b.user_id or g.email <> v_email or g.token_hash <> _token_hash or g.version <> (a->>'version')::bigint
      or g.credential_epoch <> (a->>'credentialEpoch')::bigint or g.revoked_at is not null
      or g.consumed_at is not null or g.expires_at <= clock_timestamp() then
      return jsonb_build_object('status','invalid');
    end if;
  else
    insert into reboot_backup_email.recovery_grants(user_id,email,token_hash,request_id,version,credential_epoch,expires_at)
      values(b.user_id,v_email,_token_hash,_request_id,(a->>'version')::bigint,(a->>'credentialEpoch')::bigint,clock_timestamp()+interval '15 minutes') returning * into g;
  end if;
  return jsonb_build_object('status','ok','grantId',g.id,'userId',g.user_id,'email',g.email,'expiresAt',g.expires_at);
end;
$$;

create function reboot_backup_email.consume_recovery(_grant_id uuid,_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a jsonb; g reboot_backup_email.recovery_grants%rowtype; v_user uuid; v_redemption uuid;
begin
  select user_id into v_user from reboot_backup_email.recovery_grants where id = _grant_id;
  if not found then return jsonb_build_object('status','invalid'); end if;
  a := reboot_backup_email.lock_account(v_user);
  if a->>'status' <> 'ok' then return a; end if;
  select * into g from reboot_backup_email.recovery_grants where id = _grant_id for update;
  if g.revoked_at is not null or g.consumed_at is not null or g.expires_at <= clock_timestamp() or g.attempts >= 10
    or g.version <> (a->>'version')::bigint or g.credential_epoch <> (a->>'credentialEpoch')::bigint
    or not exists(select 1 from reboot_backup_email.addresses where user_id = v_user and email = g.email and kind = 'backup') then
    return jsonb_build_object('status','invalid');
  end if;
  update reboot_backup_email.recovery_grants set attempts = attempts + 1 where id = g.id;
  if _token_hash is null or _token_hash <> g.token_hash then return jsonb_build_object('status','invalid'); end if;
  v_redemption := gen_random_uuid();
  update reboot_backup_email.recovery_grants set consumed_at = clock_timestamp(),redemption_id = v_redemption where id = g.id;
  -- Serialize recovery authorization across links for the same account as well
  -- as repeated clicks on one link. Old unconsumed and in-flight grants cannot
  -- pass another recheck after this authorization wins the account lock.
  update reboot_backup_email.recovery_grants set revoked_at = clock_timestamp()
    where user_id = v_user and id <> g.id and revoked_at is null;
  -- One-use authorization point. A lost reply fails closed; request a new link.
  -- The server uses native generateLink/verifyOtp/updateUser without publishing
  -- an Auth recovery token or session to the browser. That external operation
  -- is not atomic with this transaction; recheck immediately before updateUser.
  return jsonb_build_object('status','ok','redemptionId',v_redemption,'userId',v_user,'version',g.version,
    'credentialEpoch',g.credential_epoch,'canonicalEmail',a->>'canonicalEmail');
end;
$$;

create function reboot_backup_email.recheck_recovery(_redemption_id uuid,_user_id uuid,_version bigint,_credential_epoch bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a jsonb;
begin
  a := reboot_backup_email.lock_account(_user_id);
  if a->>'status' <> 'ok' then return a; end if;
  if _version is null or _credential_epoch is null or (a->>'version')::bigint <> _version
    or (a->>'credentialEpoch')::bigint <> _credential_epoch
    or not exists(select 1 from reboot_backup_email.recovery_grants g join reboot_backup_email.addresses b
      on b.user_id = g.user_id and b.email = g.email and b.kind = 'backup'
      where g.redemption_id = _redemption_id and g.user_id = _user_id and g.version = _version
        and g.credential_epoch = _credential_epoch and g.revoked_at is null and g.consumed_at is not null
        and g.expires_at > clock_timestamp() and g.consumed_at > clock_timestamp() - interval '2 minutes') then
    return jsonb_build_object('status','invalid');
  end if;
  return jsonb_build_object('status','ok');
end;
$$;

-- Public wrappers preserve PostgREST availability without exposing private
-- tables or placing privileged function bodies in an exposed schema.
create function public.backup_email_state(_user_id uuid) returns jsonb language sql security invoker set search_path = ''
  as $$ select reboot_backup_email.state(_user_id) $$;
create function public.backup_email_rate_limit(_scope text,_actor_hash text,_network_hash text) returns jsonb language sql security invoker set search_path = ''
  as $$ select reboot_backup_email.admission(_scope,_actor_hash,_network_hash) $$;
create function public.begin_backup_email(_user_id uuid,_email text,_token_hash text,_request_id uuid,_expected_version bigint,_network_hash text) returns jsonb language sql security invoker set search_path = ''
  as $$ select reboot_backup_email.begin_verification(_user_id,_email,_token_hash,_request_id,_expected_version,_network_hash) $$;
create function public.verify_backup_email(_user_id uuid,_challenge_id uuid,_token_hash text) returns jsonb language sql security invoker set search_path = ''
  as $$ select reboot_backup_email.verify(_user_id,_challenge_id,_token_hash) $$;
create function public.remove_backup_email(_user_id uuid,_expected_version bigint) returns jsonb language sql security invoker set search_path = ''
  as $$ select reboot_backup_email.remove(_user_id,_expected_version) $$;
create function public.resolve_login_email(_email text,_network_hash text) returns jsonb language sql security invoker set search_path = ''
  as $$ select reboot_backup_email.resolve(_email,_network_hash) $$;
create function public.recheck_login_email(_user_id uuid,_email text,_version bigint) returns jsonb language sql security invoker set search_path = ''
  as $$ select reboot_backup_email.recheck_login(_user_id,_email,_version) $$;
create function public.begin_backup_recovery(_email text,_token_hash text,_request_id uuid,_network_hash text) returns jsonb language sql security invoker set search_path = ''
  as $$ select reboot_backup_email.begin_recovery(_email,_token_hash,_request_id,_network_hash) $$;
create function public.consume_backup_recovery(_grant_id uuid,_token_hash text) returns jsonb language sql security invoker set search_path = ''
  as $$ select reboot_backup_email.consume_recovery(_grant_id,_token_hash) $$;
create function public.recheck_backup_recovery(_redemption_id uuid,_user_id uuid,_version bigint,_credential_epoch bigint) returns jsonb language sql security invoker set search_path = ''
  as $$ select reboot_backup_email.recheck_recovery(_redemption_id,_user_id,_version,_credential_epoch) $$;

revoke all on all functions in schema reboot_backup_email from public,anon,authenticated,service_role;
grant execute on function reboot_backup_email.state(uuid),reboot_backup_email.admission(text,text,text),
  reboot_backup_email.begin_verification(uuid,text,text,uuid,bigint,text),reboot_backup_email.verify(uuid,uuid,text),
  reboot_backup_email.remove(uuid,bigint),reboot_backup_email.resolve(text,text),reboot_backup_email.recheck_login(uuid,text,bigint),
  reboot_backup_email.begin_recovery(text,text,uuid,text),reboot_backup_email.consume_recovery(uuid,text),
  reboot_backup_email.recheck_recovery(uuid,uuid,bigint,bigint) to service_role;
revoke all on function public.backup_email_state(uuid),public.backup_email_rate_limit(text,text,text),
  public.begin_backup_email(uuid,text,text,uuid,bigint,text),public.verify_backup_email(uuid,uuid,text),public.remove_backup_email(uuid,bigint),
  public.resolve_login_email(text,text),public.recheck_login_email(uuid,text,bigint),public.begin_backup_recovery(text,text,uuid,text),
  public.consume_backup_recovery(uuid,text),public.recheck_backup_recovery(uuid,uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.backup_email_state(uuid),public.backup_email_rate_limit(text,text,text),
  public.begin_backup_email(uuid,text,text,uuid,bigint,text),public.verify_backup_email(uuid,uuid,text),public.remove_backup_email(uuid,bigint),
  public.resolve_login_email(text,text),public.recheck_login_email(uuid,text,bigint),public.begin_backup_recovery(text,text,uuid,text),
  public.consume_backup_recovery(uuid,text),public.recheck_backup_recovery(uuid,uuid,bigint,bigint) to service_role;

comment on schema reboot_backup_email is 'Private verified backup-email ownership, short-lived challenge hashes, and throttles. Never expose this schema through the Data API.';
notify pgrst, 'reload schema';
commit;
