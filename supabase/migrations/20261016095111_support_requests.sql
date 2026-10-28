begin;

-- Only the support API's service-role client can read or write these records.
-- No browser-readable tickets, public attachment URLs, or guest account lookup.
create table public.support_requests (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  reply_email text not null check (length(reply_email) between 3 and 254),
  message text not null check (length(message) between 1 and 5000),
  page_path text check (page_path is null or (left(page_path, 1) = '/' and length(page_path) <= 512)),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  actor_key text not null check (actor_key ~ '^[0-9a-f]{64}$'),
  status text not null default 'preparing' check (status in ('preparing', 'sending', 'failed', 'sent', 'needs_review')),
  delivery_payload jsonb check (delivery_payload is null or octet_length(delivery_payload::text) <= 3000000),
  provider_message_id text,
  lease uuid,
  locked_until timestamptz,
  attempts integer not null default 1 check (attempts > 0),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index support_requests_user_id_idx on public.support_requests(user_id) where user_id is not null;
create index support_requests_status_created_idx on public.support_requests(status, created_at);

create table public.support_rate_limits (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null default now(),
  attempts integer not null check (attempts > 0)
);

alter table public.support_requests enable row level security;
alter table public.support_rate_limits enable row level security;
revoke all on public.support_requests, public.support_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.support_requests, public.support_rate_limits to service_role;

-- Cheap admission happens before any image decoding. A preparing lease also
-- prevents concurrent duplicate requests from decoding the same image.
create function public.prepare_support_request(
  _id uuid, _user_id uuid, _reply_email text, _message text, _page_path text,
  _fingerprint text, _actor_key text, _network_key text, _lease uuid
)
returns table(outcome text, delivery_payload jsonb)
language plpgsql security invoker set search_path = ''
as $$
declare
  existing public.support_requests%rowtype;
  counter_key text;
  counter_count integer;
  over_limit boolean := false;
begin
  if _id is null or _lease is null or _actor_key is null or _network_key is null
     or _actor_key !~ '^[0-9a-f]{64}$' or _network_key !~ '^[0-9a-f]{64}$'
     or _fingerprint is null or _fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid support request';
  end if;

  -- Serialize requests even before the first row exists, then serialize quota
  -- keys in a stable order. All app instances share these limits and leases.
  perform pg_advisory_xact_lock(hashtextextended('support-request:' || _id::text, 0));
  select * into existing from public.support_requests where id = _id for update;
  if found then
    if existing.fingerprint <> _fingerprint or existing.actor_key <> _actor_key then
      return query select 'conflict'::text, null::jsonb;
      return;
    end if;
    if existing.status = 'sent' then
      return query select 'sent'::text, null::jsonb;
      return;
    end if;
    if existing.status = 'needs_review' then
      return query select 'needs_review'::text, null::jsonb;
      return;
    end if;
    -- SMTP has no idempotency key. A sending worker may have reached the mail
    -- server before it crashed or lost its acknowledgement. Never reclaim that
    -- lease: even a crash before the send must be treated as uncertain.
    if existing.status = 'sending' and
       (existing.locked_until is null or existing.locked_until <= clock_timestamp()) then
      update public.support_requests set status = 'needs_review', delivery_payload = null,
        lease = null, locked_until = null where id = _id;
      return query select 'needs_review'::text, null::jsonb;
      return;
    end if;
    if existing.locked_until > clock_timestamp() then
      return query select 'busy'::text, null::jsonb;
      return;
    end if;
  end if;

  for counter_key in select distinct key from unnest(array[_actor_key, _network_key]) as keys(key) order by key loop
    perform pg_advisory_xact_lock(hashtextextended('support-rate:' || counter_key, 0));
    insert into public.support_rate_limits as limits(key, window_start, attempts)
      values (counter_key, now(), 1)
    on conflict (key) do update set
      attempts = case when limits.window_start <= now() - interval '1 hour' then 1 else limits.attempts + 1 end,
      window_start = case when limits.window_start <= now() - interval '1 hour' then now() else limits.window_start end
    returning attempts into counter_count;
    if counter_count > (case when counter_key = _actor_key then 5 else 20 end) then over_limit := true; end if;
  end loop;
  if over_limit then
    return query select 'rate_limited'::text, null::jsonb;
    return;
  end if;

  if existing.id is null then
    insert into public.support_requests(id, user_id, reply_email, message, page_path, fingerprint,
      actor_key, lease, locked_until)
    values (_id, _user_id, _reply_email, _message, _page_path, _fingerprint,
      _actor_key, _lease, clock_timestamp() + interval '45 seconds');
    return query select 'prepare'::text, null::jsonb;
  else
    update public.support_requests set status = case when existing.delivery_payload is null then 'preparing' else 'sending' end, lease = _lease,
      locked_until = clock_timestamp() + interval '45 seconds', attempts = attempts + 1 where id = _id;
    -- Only definitive pre-acceptance failures retain a reusable payload. An
    -- expired preparing lease is also safe: sending requires reserve to succeed.
    return query select case when existing.delivery_payload is null then 'prepare' else 'ready' end, existing.delivery_payload;
  end if;
end;
$$;

-- Convert an admitted preparation into a delivery without consuming quota a
-- second time. A stale worker cannot replace the payload or restart delivery.
create function public.reserve_support_request(_id uuid, _lease uuid, _delivery_payload jsonb)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare changed integer;
begin
  if _delivery_payload is null then raise exception 'Missing support payload'; end if;
  update public.support_requests set status = 'sending', delivery_payload = _delivery_payload,
    locked_until = clock_timestamp() + interval '45 seconds'
  where id = _id and lease = _lease and status = 'preparing' and locked_until > clock_timestamp();
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- The application classifies transport failures conservatively. Only a
-- definitive rejection before SMTP acceptance may use retryable_failure.
create function public.finish_support_request(_id uuid, _lease uuid, _outcome text, _provider_id text default null)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare changed integer;
begin
  if _outcome is null or _outcome not in ('sent', 'retryable_failure', 'uncertain') then
    raise exception 'Invalid delivery outcome';
  end if;
  if _provider_id is not null and (length(btrim(_provider_id)) = 0 or length(_provider_id) > 200) then
    raise exception 'Invalid delivery acknowledgement';
  end if;
  update public.support_requests set
    status = case _outcome when 'sent' then 'sent' when 'retryable_failure' then 'failed' else 'needs_review' end,
    provider_message_id = case when _outcome = 'retryable_failure' then null else _provider_id end,
    sent_at = case when _outcome = 'sent' then clock_timestamp() else null end,
    delivery_payload = case when _outcome = 'retryable_failure' then delivery_payload else null end,
    lease = null, locked_until = null
  -- A late acknowledgement is valid while the same worker still owns sending.
  -- A retry that already quarantined it clears the lease, so stale finish calls
  -- cannot change needs_review back to sent/failed or authorize another send.
  where id = _id and lease = _lease and (status = 'sending' or (status = 'preparing' and _outcome = 'retryable_failure'));
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke execute on function public.prepare_support_request(uuid,uuid,text,text,text,text,text,text,uuid) from public, anon, authenticated;
revoke execute on function public.reserve_support_request(uuid,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.finish_support_request(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.prepare_support_request(uuid,uuid,text,text,text,text,text,text,uuid) to service_role;
grant execute on function public.reserve_support_request(uuid,uuid,jsonb) to service_role;
grant execute on function public.finish_support_request(uuid,uuid,text,text) to service_role;

comment on table public.support_requests is 'Private SMTP support delivery records. Sent or uncertain requests discard their delivery payload. Only definitive pre-acceptance failures may retry; expired sending leases require operator review. Apply the support retention runbook.';
comment on table public.support_rate_limits is 'Service-only hourly quotas keyed by HMAC of reply email/network identity; no raw IP addresses.';

commit;
