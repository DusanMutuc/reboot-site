-- Preserve merged-away member accounts as immutable, inaccessible history.
-- Requires 20261008000000_complete_account_transfers.sql. No account is merged
-- by installing this migration. The existing copy-only v2 RPC remains intact.
begin;

alter table public.profiles
  add column merged_into_user_id uuid references public.profiles(id) on delete restrict,
  add column merged_at timestamptz,
  add constraint profiles_merged_pair check ((merged_into_user_id is null) = (merged_at is null)),
  add constraint profiles_no_self_merge check (merged_into_user_id is null or merged_into_user_id <> id);
alter table public.business_reviews
  add column archived_meeting_id bigint references public.meetings(id) on delete restrict;
comment on column public.business_reviews.archived_meeting_id is
  'Historical meeting reference retained when a member-account merge moves unique operational meeting ownership to the destination review.';

create table public.account_merges (
  source_user_id uuid primary key references public.profiles(id) on delete restrict,
  dest_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete restrict,
  request_id uuid not null unique,
  transfer_log_id bigint not null references public.user_merge_log(id) on delete restrict,
  source_email text,
  dest_email text,
  source_snapshot jsonb not null,
  merged_at timestamptz not null default clock_timestamp(),
  check (source_user_id <> dest_user_id)
);
create index account_merges_destination_idx on public.account_merges(dest_user_id, merged_at);
alter table public.account_merges enable row level security;
revoke all on public.account_merges from public, anon, authenticated, service_role;
grant select on public.account_merges to service_role;
comment on table public.account_merges is
  'Immutable member-account archive ledger. Source identity and history remain intact; only the destination remains active.';

create function public.account_is_not_merged(_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$ select not exists (select 1 from public.account_merges where source_user_id = _user_id) $$;
revoke all on function public.account_is_not_merged(uuid) from public;
grant execute on function public.account_is_not_merged(uuid) to anon, authenticated, service_role;

create function public.protect_account_merge_projection()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and old.merged_at is not null
    and (new.merged_at,new.merged_into_user_id) is distinct from (old.merged_at,old.merged_into_user_id) then
    raise exception 'Merge state is managed by the account merge operation.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.merged_at is not null
    and (to_jsonb(new) - 'merged_at' - 'merged_into_user_id') is distinct from
        (to_jsonb(old) - 'merged_at' - 'merged_into_user_id') then
    raise exception 'Account merged' using errcode = '42501';
  end if;
  if new.merged_at is not null then
    if not exists (select 1 from public.account_merges m where m.source_user_id = new.id
      and m.dest_user_id = new.merged_into_user_id and m.merged_at = new.merged_at) then
      raise exception 'Merge state is managed by the account merge operation.' using errcode = '42501';
    end if;
  elsif exists (select 1 from public.account_merges m where m.source_user_id = new.id) then
    raise exception 'Merge state is managed by the account merge operation.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_account_merge_projection() from public, anon, authenticated, service_role;
create trigger profiles_protect_account_merge before insert or update on public.profiles
  for each row execute function public.protect_account_merge_projection();

create function public.protect_account_merge_history()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$ begin raise exception 'Account merge history is immutable.' using errcode = '42501'; end $$;
revoke all on function public.protect_account_merge_history() from public, anon, authenticated, service_role;
create trigger account_merges_immutable before update or delete on public.account_merges
  for each row execute function public.protect_account_merge_history();

-- Prevent background/service operations from creating fresh activity against an
-- archived identity even when their caller forgot to filter the active roster.
create function public.reject_merged_member_write()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare subject uuid; archived_time timestamptz; row_data jsonb; pass integer;
begin
  for pass in 1..case when tg_op = 'UPDATE' then 2 else 1 end loop
    row_data := case when tg_op = 'DELETE' or (tg_op = 'UPDATE' and pass = 1) then to_jsonb(old) else to_jsonb(new) end;
    case tg_argv[0]
      when 'note' then select user_id into subject from public.coaching_notes_base where id = (row_data->>'coaching_note_id')::bigint;
      when 'review' then select user_id into subject from public.business_reviews where id = (row_data->>'business_review_id')::bigint;
      when 'session' then select user_id into subject from public.implementation_meeting_sessions where id = (row_data->>'session_id')::uuid;
      when 'action' then select n.user_id into subject from public.coaching_note_action_steps a
        join public.coaching_notes_base n on n.id = a.coaching_note_id where a.id = (row_data->>'action_step_id')::bigint;
      when 'kpi' then select user_id into subject from public.monthly_kpi_records_base where id = (row_data->>'monthly_kpi_record_id')::bigint;
      when 'response' then select user_id into subject from public.smart_doc_responses where id = (row_data->>'response_id')::bigint;
      else subject := (row_data->>tg_argv[0])::uuid;
    end case;
    -- Serialize writers with archive's profile FOR UPDATE lock. Checking the
    -- locked row also sees a just-committed archive after waiting, unlike a
    -- stale statement-snapshot lookup of the archive ledger.
    select merged_at into archived_time from public.profiles where id = subject for share;
    if archived_time is not null then
      raise exception 'Account merged' using errcode = '42501';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.reject_merged_member_write() from public, anon, authenticated, service_role;
do $$
declare table_name text; relation record;
begin
  foreach table_name in array array['user_roles','user_coaches','user_assistants',
    'ninety_day_cycle_users','member_home_preferences','user_course_visibility',
    'monthly_kpi_records_base','meeting_attendance_base','coaching_notes_base','business_reviews',
    'smart_doc_responses','general_coaching_notes','coaching_private_notes','wins','user_node_progress',
    'member_pauses','partnership_users','user_training_assignments','implementation_meeting_sessions',
    'user_achievements','resource_access','search_analytics','user_attention_status_log']
  loop
    execute format('create trigger reject_merged_member_write before insert or update or delete on public.%I
      for each row execute function public.reject_merged_member_write(''user_id'')', table_name);
  end loop;
  for relation in select * from (values
    ('coaching_note_action_steps','note'),('coaching_note_comments','note'),
    ('business_review_focus_values','review'),('business_review_preparation_responses','review'),
    ('business_review_additional_scorecards','review'),('business_review_system_ratings','review'),
    ('business_review_system_priorities','review'),('system_scorecard_version_migrations','review'),
    ('implementation_action_checklists','action'),('implementation_session_actions','session'),
    ('implementation_step_notes','session'),('implementation_step_events','session'),
    ('monthly_kpi_values','kpi'),('smart_doc_response_values','response')
  ) owner_map(table_name,owner_path)
  loop
    execute format('create trigger reject_merged_member_write before insert or update or delete on public.%I
      for each row execute function public.reject_merged_member_write(%L)', relation.table_name,relation.owner_path);
  end loop;
end;
$$;

-- Preserve the configured pre-request hook and execute it under the original
-- request role. SECURITY DEFINER here would change the predecessor's semantics.
create table public.account_merge_access_settings (
  singleton boolean primary key default true check (singleton),
  previous_pre_request text,
  installed_at timestamptz not null default now()
);
alter table public.account_merge_access_settings enable row level security;
revoke all on public.account_merge_access_settings from public, anon, authenticated, service_role;
grant select on public.account_merge_access_settings to service_role;
create function public.account_merge_previous_pre_request()
returns text language sql stable security definer set search_path = pg_catalog, public
as $$ select previous_pre_request from public.account_merge_access_settings where singleton $$;
revoke all on function public.account_merge_previous_pre_request() from public;
grant execute on function public.account_merge_previous_pre_request() to anon, authenticated, service_role;
create function public.account_merge_pre_request()
returns void language plpgsql set search_path = pg_catalog, public
as $$
declare previous_hook text; hook_name text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.account_is_not_merged(auth.uid()) then
    raise exception 'Account merged' using errcode = '42501';
  end if;
  previous_hook := public.account_merge_previous_pre_request();
  if previous_hook is not null then
    select format('%I.%I()', ns.nspname, p.proname) into hook_name
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where p.oid = to_regprocedure(previous_hook || '()') and p.pronargs = 0;
    if hook_name is null then raise exception 'Previous API request guard is unavailable.' using errcode = '55000'; end if;
    execute 'select ' || hook_name;
  end if;
end;
$$;
revoke all on function public.account_merge_pre_request() from public;
grant execute on function public.account_merge_pre_request() to anon, authenticated, service_role;

do $$
declare auth_role oid; db_id oid; previous_hook text; runtime_hook text; config_hook text;
begin
  select oid into auth_role from pg_roles where rolname = 'authenticator';
  select oid into db_id from pg_database where datname = current_database();
  if auth_role is null then raise exception 'The PostgREST authenticator role is required.'; end if;
  -- A dynamic pre-config function can overwrite this setting after reload. Do
  -- not silently disable that existing security configuration.
  select split_part(setting, '=', 2) into config_hook
  from pg_db_role_setting s cross join lateral unnest(s.setconfig) setting
  where s.setrole = auth_role and s.setdatabase in (0, db_id) and setting like 'pgrst.db_pre_config=%'
  order by s.setdatabase desc limit 1;
  if nullif(config_hook, '') is not null or nullif(current_setting('pgrst.db_pre_config', true), '') is not null then
    raise exception 'Integrate the merged-account guard with the existing PostgREST pre-config hook before installing.';
  end if;
  select split_part(setting, '=', 2) into previous_hook
  from pg_db_role_setting s cross join lateral unnest(s.setconfig) setting
  where s.setrole = auth_role and s.setdatabase in (0, db_id) and setting like 'pgrst.db_pre_request=%'
  order by s.setdatabase desc limit 1;
  previous_hook := nullif(previous_hook, '');
  runtime_hook := nullif(current_setting('pgrst.db_pre_request', true), '');
  if runtime_hook is not null and previous_hook is not null and runtime_hook <> previous_hook then
    raise exception 'Multiple PostgREST request guards require manual integration before installing.';
  end if;
  previous_hook := coalesce(previous_hook, runtime_hook);
  if previous_hook is not null and to_regprocedure(previous_hook || '()') is null then
    raise exception 'The existing PostgREST request guard could not be resolved.';
  end if;
  insert into public.account_merge_access_settings(previous_pre_request) values(previous_hook);
  execute format('alter role authenticator in database %I set pgrst.db_pre_request = %L',
    current_database(), 'public.account_merge_pre_request');
end;
$$;

-- PostgREST hooks do not run for Storage or Realtime. Restrictive policies deny
-- archived JWT subjects even when a permissive policy otherwise grants access.
-- Previously non-RLS tables retain their existing grants-based behavior for
-- everyone else; no table/function privileges are expanded here.
do $$
declare relation record;
begin
  for relation in select c.relname, ns.nspname, c.relrowsecurity from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where c.relkind in ('r','p') and (ns.nspname = 'public' or
      (ns.nspname = 'storage' and c.relname in ('objects','buckets')))
  loop
    if not relation.relrowsecurity then
      execute format('alter table %I.%I enable row level security', relation.nspname, relation.relname);
      execute format('create policy account_merge_preserve_existing_grants on %I.%I as permissive
        for all to public using (true) with check (true)', relation.nspname, relation.relname);
    end if;
    execute format('create policy account_merge_subject_guard on %I.%I as restrictive
      for all to public using ((select public.account_is_not_merged(auth.uid())))
      with check ((select public.account_is_not_merged(auth.uid())))', relation.nspname, relation.relname);
  end loop;
end;
$$;

create or replace function public.get_current_member_ids()
returns table(user_id uuid) language sql stable set search_path = pg_catalog, public
as $$
  select ur.user_id from public.user_roles ur join public.roles r on r.id = ur.role_id and r.code = 'user'
  join public.profiles p on p.id = ur.user_id and p.merged_at is null
  where not exists (select 1 from public.user_roles past join public.roles role on role.id = past.role_id
    where past.user_id = ur.user_id and role.code = 'past_member') order by ur.user_id;
$$;

create or replace function public.get_all_users(_course_id integer default null)
returns table(user_id uuid,full_name text) language sql stable
as $$
  select p.id,concat_ws(' ',p.first_name,p.last_name) as full_name from public.profiles p
  where p.merged_at is null and (_course_id is null or exists (
    select 1 from public.user_coaches c where c.user_id = p.id and c.is_active and c.course_id = _course_id))
  order by full_name;
$$;
create or replace function public.get_my_users(_course_id bigint default null)
returns table(user_id uuid,full_name text) language sql stable
as $$
  select p.id,concat_ws(' ',p.first_name,p.last_name) as full_name from public.user_coaches c
  join public.profiles p on p.id = c.user_id and p.merged_at is null
  where c.coach_id = auth.uid() and c.is_active and c.course_id is not distinct from _course_id
  order by full_name;
$$;
create or replace function public.get_my_users_with_status()
returns table(user_id uuid,full_name text,email text,user_status public.user_attention_status,
  user_status_source text,user_status_manual public.user_attention_status,user_status_manual_reason text,
  attended_count integer,expected_count integer)
language sql stable set search_path = public
as $$
  with rng as (select (current_date - interval '2 months')::date as d_from,current_date as d_to)
  select p.id,nullif(trim(concat_ws(' ',p.first_name,p.last_name)),'') as full_name,null::text,
    coalesce(p.attention_status_manual,p.attention_status_auto),
    case when p.attention_status_manual is not null then 'manual' else 'auto' end,
    p.attention_status_manual,p.attention_status_manual_reason,
    coalesce(c.attended_count,0),coalesce(c.expected_count,0)
  from public.profiles p join public.user_roles ur on ur.user_id = p.id and p.merged_at is null
  join public.roles r on r.id = ur.role_id and r.code = 'user'
  left join lateral (
    select count(*) filter (where mt.counts_toward_engagement and m.date between rng.d_from and rng.d_to)::int as expected_count,
      count(*) filter (where mt.counts_toward_engagement and m.date between rng.d_from and rng.d_to and coalesce(ma.attended,false))::int as attended_count
    from public.meeting_attendance ma join public.meetings m on m.id = ma.meeting_id
    join public.meeting_types mt on mt.id = m.meeting_type_id cross join rng where ma.user_id = p.id
  ) c on true order by full_name nulls last;
$$;
create or replace function public.apply_user_attention_auto(p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare next_status public.user_attention_status;
begin
  -- Global maintenance batches may still include historical IDs. A no-op keeps
  -- one archived member from aborting unrelated members' recomputations.
  perform 1 from public.profiles where id = p_user_id and merged_at is null for update;
  if not found then return; end if;
  next_status := public.compute_user_attention_auto_from_attendance(p_user_id);
  update public.profiles set attention_status_auto = next_status where id = p_user_id;
end;
$$;

-- GHL cancellations may affect a meeting retained by both the archived source
-- and the active destination. Keep the archive's attendance history intact.
create or replace function public.remove_cancelled_ghl_meeting_attendance()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare normalized_status text := lower(regexp_replace(coalesce(new.ghl_status,''),'[[:space:]_-]+','','g'));
begin
  if new.ghl_appointment_id is not null and normalized_status in ('cancelled','canceled','deleted','invalid','noshow') then
    delete from public.meeting_attendance_base attendance
    using public.profiles member
    where attendance.meeting_id = new.id and member.id = attendance.user_id and member.merged_at is null;
  end if;
  return new;
end;
$$;

create function public.get_account_transfer_result_v3(_source uuid, _dest uuid, _options jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare result jsonb; previous_operation text; operation text := coalesce(_options->>'operation', 'merge');
begin
  if session_user not in ('postgres','supabase_admin') and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Account transfers must use the admin server endpoint.' using errcode = '42501';
  end if;
  if operation not in ('merge','copy','archive') then raise exception 'Unsupported account transfer operation.' using errcode = '22023'; end if;
  result := public.get_account_transfer_result_v2(_source, _dest, _options);
  if result is null then return null; end if;
  select coalesce(options->>'operation', 'copy') into previous_operation from public.user_merge_log
  where not dry_run and options->>'request_id' = ((_options->>'request_id')::uuid)::text;
  if previous_operation <> operation then
    raise exception 'This transfer request ID has already been used with different parameters.' using errcode = '22023';
  end if;
  if operation = 'archive' and nullif(_options->>'transfer_log_id','') is not null
    and (_options->>'transfer_log_id')::bigint is distinct from (result->'merge'->>'transfer_log_id')::bigint then
    raise exception 'This transfer request ID has already been used with different parameters.' using errcode = '22023';
  end if;
  return result || jsonb_build_object('operation', operation,
    'archived', coalesce((result->>'archived')::boolean, false));
end;
$$;
revoke all on function public.get_account_transfer_result_v3(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_account_transfer_result_v3(uuid,uuid,jsonb) to service_role;

create function public.transfer_user_data_admin_v3(_source uuid, _dest uuid, _options jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
<<merge_operation>>
declare
  operation text := coalesce(_options->>'operation', 'merge');
  dry_run boolean := coalesce((_options->>'dry_run')::boolean, true);
  request_id uuid := nullif(_options->>'request_id', '')::uuid;
  actor_id uuid := nullif(_options->>'actor_user_id', '')::uuid;
  result jsonb;
  source_profile public.profiles%rowtype;
  dest_profile public.profiles%rowtype;
  source_email text;
  dest_email text;
  source_phone text;
  verified_email text := lower(btrim(_options->>'destination_email'));
  verified_contact text := nullif(btrim(_options->>'destination_ghl_contact_id'), '');
  merge_record public.account_merges%rowtype;
  prior_transfer bigint;
  operation_log bigint;
  source_snapshot jsonb;
  merged_time timestamptz;
  system_actor boolean := coalesce((_options->>'system_actor')::boolean, false);
  old_dest_review_ids bigint[];
  review_map jsonb := '{}'::jsonb;
  review_record record;
  mapped_review_ids bigint[];
  meeting_links jsonb := '[]'::jsonb;
begin
  if session_user not in ('postgres','supabase_admin') and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Account transfers must use the admin server endpoint.' using errcode = '42501';
  end if;
  if jsonb_typeof(_options) is distinct from 'object' or operation not in ('merge','copy','archive')
    or _source is null or _dest is null or _source = _dest then
    raise exception 'Invalid account transfer operation or source/destination.' using errcode = '22023';
  end if;
  if request_id is null and dry_run then request_id := gen_random_uuid(); end if;
  if request_id is null then raise exception 'A transfer request ID is required.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account-transfer:' || least(_source::text,_dest::text),0));
  perform pg_advisory_xact_lock(hashtextextended('account-transfer:' || greatest(_source::text,_dest::text),0));
  perform pg_advisory_xact_lock(hashtextextended('account-transfer-request:' || request_id::text,0));
  _options := _options || jsonb_build_object('operation',operation,'request_id',request_id::text);
  result := public.get_account_transfer_result_v3(_source,_dest,_options);
  if result is not null then return result; end if;

  select * into source_profile from public.profiles where id = _source for update;
  if not found then raise exception 'Source profile not found.' using errcode = '22023'; end if;
  select * into dest_profile from public.profiles where id = _dest for update;
  if not found then raise exception 'Destination profile not found.' using errcode = '22023'; end if;
  if source_profile.merged_at is not null or dest_profile.merged_at is not null then
    raise exception 'An archived account cannot be used as a transfer source or destination.' using errcode = '23514';
  end if;
  if operation <> 'copy' and exists (select 1 from public.account_merges where dest_user_id = _source) then
    raise exception 'This source is already a canonical destination. Merge chains require a separate consolidation.' using errcode = '23514';
  end if;
  if exists (select 1 from public.user_roles ur join public.roles role on role.id = ur.role_id
    where ur.user_id in (_source,_dest) and role.code in ('admin','superadmin','coach','implementation_coach')) then
    raise exception 'Staff accounts require a separate migration.' using errcode = '23514';
  end if;
  if operation <> 'copy' then
    if (system_actor and actor_id is not null) or (not system_actor and (
      actor_id is null or not exists (select 1 from public.user_roles ur join public.roles role on role.id = ur.role_id
      where ur.user_id = actor_id and role.code = 'admin') or not public.account_is_not_merged(actor_id))) then
      raise exception 'An active admin actor is required for account merges.' using errcode = '42501';
    end if;
    if exists (select 1 from public.partnership_users pu join public.partnerships p on p.id = pu.partnership_id
      where pu.user_id in (_source,_dest) and p.is_active and (p.shared_notes or p.shared_kpis or p.shared_attendance)) then
      raise exception 'Resolve shared partnership ownership before merging accounts.' using errcode = '23514';
    end if;
  end if;
  select email,phone into source_email,source_phone from auth.users where id = _source for share;
  select email into dest_email from auth.users where id = _dest for share;
  if verified_contact is null or verified_email is null or lower(btrim(dest_email)) is distinct from verified_email then
    raise exception 'A verified current destination email and GHL contact are required.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account-transfer-contact:' || verified_contact,0));
  perform 1 from public.profiles p
  where p.id <> _dest and (p.id <> _source or operation = 'copy') and p.merged_at is null
    and (p.ghl_contact_id = verified_contact or p.ghl_user_id = verified_contact) for share;
  if found then
    raise exception 'The destination GHL contact belongs to another active account.' using errcode = '23514';
  end if;
  source_snapshot := jsonb_build_object('profile',to_jsonb(source_profile),
    'execution_actor',case when system_actor then 'system' else 'admin' end,
    'role_codes',(select coalesce(jsonb_agg(role.code order by role.code),'[]'::jsonb)
      from public.user_roles ur join public.roles role on role.id = ur.role_id where ur.user_id = _source),
    'auth',jsonb_build_object('email',source_email,'phone',source_phone),
    'active_coach_assignments',(select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from public.user_coaches c where user_id = _source and is_active),
    'active_assistant_assignments',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.user_assistants a where user_id = _source and is_active),
    'open_enrolments',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from public.ninety_day_cycle_users e where user_id = _source and ended_at is null));

  if operation = 'archive' then
    select log.id into prior_transfer from public.user_merge_log log
    where log.source_user_id = _source and log.dest_user_id = _dest and not log.dry_run and log.finished_at is not null
      and log.result_json is not null and coalesce(log.options->>'operation','copy') <> 'archive'
      and (nullif(_options->>'transfer_log_id','') is null or log.id = (_options->>'transfer_log_id')::bigint)
    order by log.finished_at desc,log.id desc limit 1;
    if prior_transfer is null then
      raise exception 'Archive-only requires a completed transfer for this exact source/destination pair.' using errcode = '23514';
    end if;
    insert into public.user_merge_log(source_user_id,dest_user_id,dry_run,options)
    values(_source,_dest,dry_run,_options) returning id into operation_log;
    result := jsonb_build_object('source',_source,'dest',_dest,'dry_run',dry_run,'request_id',request_id,
      'counts',jsonb_build_object('ghl_identity',jsonb_build_object('updated',1)),
      'ghl',jsonb_build_object('destination_email',verified_email,'contact_id',verified_contact));
    if not dry_run then
      update public.profiles set ghl_contact_id = verified_contact,ghl_user_id = verified_contact where id = _dest;
    end if;
  else
    select coalesce(array_agg(id),'{}'::bigint[]) into old_dest_review_ids from public.business_reviews where user_id = _dest;
    result := public.transfer_user_data_admin_v2(_source,_dest,_options);
    select log.id into operation_log from public.user_merge_log log
    where log.source_user_id = _source and log.dest_user_id = _dest and log.dry_run = merge_operation.dry_run
      and log.options->>'request_id' = request_id::text order by log.id desc limit 1;
    prior_transfer := operation_log;
    if operation = 'merge' and not dry_run then
      -- v2 copies source reviews in ascending ID order. Both profile rows are
      -- locked, so no concurrent child INSERT can enter this destination set.
      if (select count(*) from public.business_reviews where user_id = _source) <>
        (select count(*) from public.business_reviews where user_id = _dest and not id = any(old_dest_review_ids)) then
        raise exception 'Could not identify the copied Business Review graph.' using errcode = '23514';
      end if;
      with source_rows as (select id,row_number() over(order by id) position from public.business_reviews where user_id = _source),
      dest_rows as (select id,row_number() over(order by id) position from public.business_reviews
        where user_id = _dest and not id = any(old_dest_review_ids))
      select coalesce(jsonb_object_agg(s.id::text,d.id),'{}'::jsonb) into review_map
      from source_rows s join dest_rows d using(position);
    end if;
  end if;

  if operation <> 'copy' then
    for review_record in select r.*,n.created_at note_created_at,n.m2_meeting_id note_meeting_id
      from public.business_reviews r join public.coaching_notes_base n on n.id = r.coaching_note_id
      where r.user_id = _source and r.meeting_id is not null order by r.id
    loop
      if operation = 'archive' then
        select array_agg(d.id order by d.id) into mapped_review_ids
        from public.business_reviews d join public.coaching_notes_base n on n.id = d.coaching_note_id
        where d.user_id = _dest and (n.m2_meeting_id = review_record.meeting_id
          or (review_record.note_meeting_id is null and n.m2_meeting_id is null
            and n.created_at = review_record.note_created_at and d.review_date = review_record.review_date));
        if coalesce(cardinality(mapped_review_ids),0) <> 1 then
          raise exception 'Archive-only could not uniquely match a transferred Business Review meeting. Resolve the review mapping first.' using errcode = '23514';
        end if;
        review_map := review_map || jsonb_build_object(review_record.id::text,mapped_review_ids[1]);
      end if;
      meeting_links := meeting_links || jsonb_build_array(jsonb_build_object('source_review_id',review_record.id,
        'destination_review_id',(review_map->>review_record.id::text)::bigint,'meeting_id',review_record.meeting_id,
        'source_review_updated_at',review_record.updated_at));
      if operation = 'archive' or not dry_run then
        if exists (select 1 from public.business_reviews where id = (review_map->>review_record.id::text)::bigint and meeting_id is not null) then
          raise exception 'The destination review already owns a different meeting.' using errcode = '23514';
        end if;
      end if;
      if not dry_run then
        update public.business_reviews set archived_meeting_id = meeting_id,meeting_id = null where id = review_record.id;
        update public.business_reviews set meeting_id = review_record.meeting_id where id = (review_map->>review_record.id::text)::bigint;
      end if;
    end loop;
    source_snapshot := source_snapshot || jsonb_build_object('business_review_meeting_links',meeting_links);
    result := jsonb_set(result,'{counts,business_reviews}',coalesce(result->'counts'->'business_reviews','{}'::jsonb)
      || jsonb_build_object('meeting_links_not_copied',0,'meeting_links_transferred',jsonb_array_length(meeting_links)));
  end if;

  if operation <> 'copy' and not dry_run then
    merged_time := clock_timestamp();
    -- Retire active assignments after copying their original state. Preserve
    -- closed historical intervals, and retain pre-archive state in the ledger.
    update public.user_coaches set is_active = false,ended_at = coalesce(least(ended_at,merged_time),merged_time)
    where user_id = _source and is_active;
    update public.user_assistants set is_active = false,ended_at = coalesce(least(ended_at,merged_time),merged_time)
    where user_id = _source and is_active;
    update public.ninety_day_cycle_users set ended_at = merged_time,outcome = 'transferred'
    where user_id = _source and ended_at is null;
    insert into public.account_merges(source_user_id,dest_user_id,actor_user_id,request_id,transfer_log_id,
      source_email,dest_email,source_snapshot,merged_at)
    values(_source,_dest,actor_id,request_id,prior_transfer,source_email,dest_email,source_snapshot,merged_time)
    returning * into merge_record;
    update public.profiles set merged_into_user_id = _dest,merged_at = merged_time where id = _source;
  end if;
  result := result || jsonb_build_object('operation',operation,'archived',operation <> 'copy' and not dry_run,
    'merge',case when operation = 'copy' then null else jsonb_build_object('source_user_id',_source,
      'dest_user_id',_dest,'actor_user_id',actor_id,'request_id',request_id,
      'transfer_log_id',prior_transfer,'merged_at',merged_time) end);
  result := jsonb_set(result,'{counts,account_archive}',jsonb_build_object('archived',case when operation = 'copy' then 0 else 1 end));
  update public.user_merge_log set result_json = result,finished_at = now() where id = operation_log;
  return result;
end;
$$;
revoke all on function public.transfer_user_data_admin_v3(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.transfer_user_data_admin_v3(uuid,uuid,jsonb) to service_role;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
