begin;

-- A Legends review keeps its Legends scorecard and may carry one Foundation
-- scorecard assigned by a coach or admin. The primary template remains on
-- business_reviews for existing integrations.
create table public.business_review_additional_scorecards (
  business_review_id bigint primary key references public.business_reviews(id) on delete cascade,
  template_key text not null references public.system_scorecard_templates(key) on update cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.business_review_additional_scorecards enable row level security;
revoke all on public.business_review_additional_scorecards from public, anon, authenticated;
grant all on public.business_review_additional_scorecards to service_role;

create function public.validate_business_review_additional_scorecard()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  _primary_audience public.system_scorecard_audience;
  _extra_audience public.system_scorecard_audience;
begin
  select template.audience into _primary_audience
  from public.business_reviews review
  join public.system_scorecard_templates template
    on template.key = review.system_scorecard_template_key
  where review.id = new.business_review_id;

  select audience into _extra_audience
  from public.system_scorecard_templates
  where key = new.template_key;

  if _primary_audience is distinct from 'legends'
    or _extra_audience is distinct from 'foundation' then
    raise exception 'Only a Foundation scorecard can be added to a Legends review'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_business_review_additional_scorecard
before insert or update on public.business_review_additional_scorecards
for each row execute function public.validate_business_review_additional_scorecard();

-- The old FK allowed ratings only for the review's primary template. Keep
-- the system/template FK, and validate that the template is assigned here.
alter table public.business_review_system_ratings
  drop constraint business_review_system_ratings_review_template_fkey;
alter table public.business_review_system_ratings
  add constraint business_review_system_ratings_review_fkey
  foreign key (business_review_id) references public.business_reviews(id)
  on delete cascade;

create function public.validate_business_review_system_rating_template()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from public.business_reviews review
    where review.id = new.business_review_id
      and review.system_scorecard_template_key = new.template_key
  ) and not exists (
    select 1 from public.business_review_additional_scorecards extra
    where extra.business_review_id = new.business_review_id
      and extra.template_key = new.template_key
  ) then
    raise exception 'Scorecard template is not assigned to this review'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger validate_business_review_system_rating_template
before insert or update of business_review_id, template_key
on public.business_review_system_ratings
for each row execute function public.validate_business_review_system_rating_template();

create or replace function public.assign_foundation_scorecard_to_business_review(
  _business_review_id bigint
) returns text language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  _actor_id uuid := auth.uid();
  _review public.business_reviews%rowtype;
  _template_key text;
begin
  if _actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into _review
  from public.business_reviews
  where id = _business_review_id
  for update;
  if not found then
    raise exception 'Business Review not found' using errcode = 'P0002';
  end if;

  if not (
    exists (
      select 1 from public.user_roles ur
      join public.roles role on role.id = ur.role_id
      where ur.user_id = _actor_id and role.code = 'admin'
    ) or (
      exists (
        select 1 from public.user_roles ur
        join public.roles role on role.id = ur.role_id
        where ur.user_id = _actor_id and role.code = 'coach'
      ) and exists (
        select 1 from public.user_coaches assignment
        where assignment.coach_id = _actor_id
          and assignment.user_id = _review.user_id
          and assignment.is_active = true
      )
    )
  ) then
    raise exception 'You do not have access to this student' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.system_scorecard_templates template
    where template.key = _review.system_scorecard_template_key
      and template.audience = 'legends'
  ) then
    raise exception 'Only Legends reviews can receive an additional Foundation scorecard'
      using errcode = '22023';
  end if;

  select extra.template_key into _template_key
  from public.business_review_additional_scorecards extra
  where extra.business_review_id = _review.id;
  if _template_key is not null then
    return _template_key;
  end if;

  select template.key into _template_key
  from public.system_scorecard_templates template
  where template.audience = 'foundation' and template.is_active = true;
  if _template_key is null then
    raise exception 'No active Foundation scorecard template found' using errcode = 'P0002';
  end if;

  insert into public.business_review_additional_scorecards (
    business_review_id, template_key, assigned_by
  ) values (_review.id, _template_key, _actor_id);

  insert into public.business_review_system_ratings (
    business_review_id, template_key, system_id, status
  )
  select _review.id, _template_key, current_system.id,
    coalesce(previous_rating.status, 'not_started'::public.system_scorecard_status)
  from public.system_scorecard_systems current_system
  left join lateral (
    select rating.status
    from public.business_review_system_ratings rating
    join public.business_reviews previous_review
      on previous_review.id = rating.business_review_id
    join public.system_scorecard_templates previous_template
      on previous_template.key = rating.template_key
    join public.system_scorecard_systems previous_system
      on previous_system.id = rating.system_id
     and previous_system.template_key = rating.template_key
    where previous_review.user_id = _review.user_id
      and previous_review.id <> _review.id
      and (previous_review.review_date, previous_review.id)
          < (_review.review_date, _review.id)
      and previous_template.audience = 'foundation'
      and previous_system.key = current_system.key
    order by previous_review.review_date desc, previous_review.id desc
    limit 1
  ) previous_rating on true
  where current_system.template_key = _template_key
  on conflict (business_review_id, system_id) do nothing;

  return _template_key;
end;
$$;

revoke all on function public.assign_foundation_scorecard_to_business_review(bigint) from public;
grant execute on function public.assign_foundation_scorecard_to_business_review(bigint)
to authenticated, service_role;

CREATE OR REPLACE FUNCTION "public"."admin_clone_system_scorecard_version"("_source_template_key" "text", "_actor_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _source public.system_scorecard_templates%rowtype;
  _next_version integer;
  _target_key text;
  _category record;
  _new_category_id bigint;
begin
  select template.*
    into _source
  from public.system_scorecard_templates as template
  where template.key = _source_template_key
  for update;

  if _source.key is null then
    raise exception 'Scorecard template not found.';
  end if;

  if exists (
    select 1
    from public.system_scorecard_templates as candidate
    where candidate.audience = _source.audience
      and candidate.is_active = false
      and not exists (
        select 1
        from public.business_reviews as review
        where review.system_scorecard_template_key = candidate.key
      )
      and not exists (
        select 1 from public.business_review_additional_scorecards extra
        where extra.template_key = candidate.key
      )
  ) then
    raise exception 'This scorecard already has an unpublished draft version.';
  end if;

  select coalesce(max(template.version), 0) + 1
    into _next_version
  from public.system_scorecard_templates as template
  where template.audience = _source.audience;

  _target_key := format('%s_scorecard_v%s', _source.audience::text, _next_version);

  insert into public.system_scorecard_templates (
    key,
    audience,
    name,
    version,
    is_active,
    created_at,
    updated_at
  )
  values (
    _target_key,
    _source.audience,
    _source.name,
    _next_version,
    false,
    now(),
    now()
  );

  for _category in
    select category.*
    from public.system_scorecard_categories as category
    where category.template_key = _source.key
    order by category.position, category.id
  loop
    insert into public.system_scorecard_categories (
      template_key,
      key,
      label,
      position,
      created_at,
      updated_at
    )
    values (
      _target_key,
      _category.key,
      _category.label,
      _category.position,
      now(),
      now()
    )
    returning id into _new_category_id;

    insert into public.system_scorecard_systems (
      template_key,
      category_id,
      key,
      label,
      position,
      library_item_id,
      created_at,
      updated_at
    )
    select
      _target_key,
      _new_category_id,
      system.key,
      system.label,
      system.position,
      system.library_item_id,
      now(),
      now()
    from public.system_scorecard_systems as system
    where system.template_key = _source.key
      and system.category_id = _category.id
    order by system.position, system.id;
  end loop;

  return _target_key;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."admin_discard_system_scorecard_draft"("_template_key" "text", "_actor_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _template public.system_scorecard_templates%rowtype;
begin
  select template.*
    into _template
  from public.system_scorecard_templates as template
  where template.key = _template_key
  for update;

  if _template.key is null then
    raise exception 'Scorecard template not found.';
  end if;

  if _template.is_active or exists (
    select 1
    from public.business_reviews as review
    where review.system_scorecard_template_key = _template.key
  ) or exists (
    select 1 from public.business_review_additional_scorecards extra
    where extra.template_key = _template.key
  ) then
    raise exception 'Only an unpublished, unused scorecard draft can be discarded.';
  end if;

  delete from public.system_scorecard_systems as system
  where system.template_key = _template.key;

  delete from public.system_scorecard_categories as category
  where category.template_key = _template.key;

  delete from public.system_scorecard_templates as template
  where template.key = _template.key;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."admin_publish_system_scorecard_version"("_template_key" "text", "_actor_id" "uuid", "_resolutions" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _target public.system_scorecard_templates%rowtype;
  _review public.business_reviews%rowtype;
  _source_template_key text;
  _resolution jsonb;
  _snapshot jsonb;
  _priority jsonb;
  _rating jsonb;
  _old_system_key text;
  _target_system_key text;
  _target_system_id bigint;
  _target_system_label text;
  _target_library_item_id bigint;
  _starting_status public.system_scorecard_status;
  _mapped_priority_keys text[];
  _new_priority_position integer;
  _removed_priority_count integer;
  _removed_reviewed_count integer;
  _eligible_count integer := 0;
  _migrated_count integer := 0;
  _skipped_count integer := 0;
  _was_active boolean;
begin
  if jsonb_typeof(coalesce(_resolutions, '[]'::jsonb)) <> 'array' then
    raise exception 'Conflict resolutions must be an array.';
  end if;

  select template.*
    into _target
  from public.system_scorecard_templates as template
  where template.key = _template_key
  for update;

  if _target.key is null then
    raise exception 'Scorecard template not found.';
  end if;

  _was_active := _target.is_active;

  if not _target.is_active and (
    exists (
      select 1
      from public.business_reviews as review
      where review.system_scorecard_template_key = _target.key
    ) or exists (
      select 1 from public.business_review_additional_scorecards extra
      where extra.template_key = _target.key
    )
  ) then
    raise exception 'A retired scorecard version cannot be published again.';
  end if;

  if not exists (
    select 1
    from public.system_scorecard_systems as system
    where system.template_key = _target.key
  ) then
    raise exception 'A scorecard version must contain at least one system before publishing.';
  end if;

  for _review in
    select review.*
    from public.business_reviews as review
    left join public.business_review_additional_scorecards as extra
      on extra.business_review_id = review.id
     and _target.audience = 'foundation'
    join public.system_scorecard_templates as current_template
      on current_template.key = coalesce(extra.template_key, review.system_scorecard_template_key)
    where review.status::text = 'draft'
      and current_template.audience = _target.audience
      and current_template.key <> _target.key
    order by review.review_date, review.id
    for update of review
  loop
    select extra.template_key into _source_template_key
    from public.business_review_additional_scorecards extra
    where extra.business_review_id = _review.id
      and _target.audience = 'foundation';
    _source_template_key := coalesce(_source_template_key, _review.system_scorecard_template_key);
    _eligible_count := _eligible_count + 1;

    select count(*)::integer
      into _removed_priority_count
    from public.business_review_system_priorities as priority
    join public.system_scorecard_systems as old_system
      on old_system.id = priority.system_id
    left join public.system_scorecard_systems as target_system
      on target_system.template_key = _target.key
      and target_system.key = old_system.key
    where priority.business_review_id = _review.id
      and old_system.template_key = _source_template_key
      and target_system.id is null;

    select count(*)::integer
      into _removed_reviewed_count
    from public.business_review_system_ratings as rating
    join public.system_scorecard_systems as old_system
      on old_system.id = rating.system_id
    left join public.system_scorecard_systems as target_system
      on target_system.template_key = _target.key
      and target_system.key = old_system.key
    where rating.business_review_id = _review.id
      and rating.template_key = _source_template_key
      and rating.reviewed_at is not null
      and target_system.id is null;

    _resolution := null;
    select item.value
      into _resolution
    from jsonb_array_elements(coalesce(_resolutions, '[]'::jsonb)) as item(value)
    where (item.value ->> 'reviewId')::bigint = _review.id
    limit 1;

    if _removed_priority_count > 0 or _removed_reviewed_count > 0 then
      if _resolution is null
        or coalesce(_resolution ->> 'action', '') not in ('upgrade', 'skip')
      then
        raise exception 'Business Review % has unresolved scorecard conflicts.', _review.id;
      end if;

      if _resolution ->> 'action' = 'skip' then
        _skipped_count := _skipped_count + 1;
        continue;
      end if;

      if _removed_reviewed_count > 0
        and not coalesce((_resolution ->> 'confirmReviewedRemoval')::boolean, false)
      then
        raise exception 'Business Review % contains reviewed systems that require confirmation.', _review.id;
      end if;
    else
      _resolution := jsonb_build_object(
        'reviewId', _review.id,
        'action', 'automatic'
      );
    end if;

    select jsonb_build_object(
      'review', to_jsonb(_review),
      'ratings', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'systemKey', system.key,
            'status', rating.status,
            'reviewedAt', rating.reviewed_at,
            'reviewedBy', rating.reviewed_by,
            'updatedBy', rating.updated_by,
            'createdAt', rating.created_at,
            'updatedAt', rating.updated_at
          )
          order by system.position, system.id
        )
        from public.business_review_system_ratings as rating
        join public.system_scorecard_systems as system
          on system.id = rating.system_id
        where rating.business_review_id = _review.id
          and rating.template_key = _source_template_key
      ), '[]'::jsonb),
      'priorities', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'systemKey', system.key,
            'position', priority.position,
            'actionStepId', priority.action_step_id,
            'startingStatus', priority.starting_status,
            'selectedAt', priority.selected_at,
            'selectedBy', priority.selected_by
          )
          order by priority.position, system.id
        )
        from public.business_review_system_priorities as priority
        join public.system_scorecard_systems as system
          on system.id = priority.system_id
        where priority.business_review_id = _review.id
          and system.template_key = _source_template_key
      ), '[]'::jsonb)
    ) into _snapshot;

    _mapped_priority_keys := array[]::text[];

    for _priority in
      select item.value
      from jsonb_array_elements(_snapshot -> 'priorities') as item(value)
    loop
      _old_system_key := _priority ->> 'systemKey';
      _target_system_key := _old_system_key;
      _target_system_id := null;

      select system.id
        into _target_system_id
      from public.system_scorecard_systems as system
      where system.template_key = _target.key
        and system.key = _target_system_key
      limit 1;

      if _target_system_id is null then
        if not (
          coalesce(_resolution -> 'priorityReplacements', '{}'::jsonb) ? _old_system_key
        ) then
          raise exception 'Priority % in Business Review % needs a replacement or explicit removal.',
            _old_system_key, _review.id;
        end if;

        _target_system_key := _resolution -> 'priorityReplacements' ->> _old_system_key;

        if _target_system_key is not null then
          select system.id
            into _target_system_id
          from public.system_scorecard_systems as system
          where system.template_key = _target.key
            and system.key = _target_system_key
          limit 1;

          if _target_system_id is null then
            raise exception 'Replacement system % was not found in %.',
              _target_system_key, _target.key;
          end if;
        end if;
      end if;

      if _target_system_key is not null
        and _target_system_key = any(_mapped_priority_keys)
      then
        raise exception 'Business Review % would contain the same priority twice.', _review.id;
      end if;

      if _target_system_key is not null then
        _mapped_priority_keys := array_append(_mapped_priority_keys, _target_system_key);
      end if;
    end loop;

    delete from public.business_review_system_priorities as priority
    using public.business_review_system_ratings as rating
    where priority.business_review_id = _review.id
      and rating.business_review_id = priority.business_review_id
      and rating.system_id = priority.system_id
      and rating.template_key = _source_template_key;

    delete from public.business_review_system_ratings as rating
    where rating.business_review_id = _review.id
      and rating.template_key = _source_template_key;

    if _source_template_key = _review.system_scorecard_template_key then
      update public.business_reviews as review
      set system_scorecard_template_key = _target.key,
          updated_at = now()
      where review.id = _review.id;
    else
      update public.business_review_additional_scorecards as extra
      set template_key = _target.key
      where extra.business_review_id = _review.id;
      update public.business_reviews as review
      set updated_at = now()
      where review.id = _review.id;
    end if;

    insert into public.business_review_system_ratings (
      business_review_id,
      template_key,
      system_id,
      status,
      reviewed_at,
      reviewed_by,
      updated_by,
      created_at,
      updated_at
    )
    select
      _review.id,
      _target.key,
      target_system.id,
      coalesce(
        (source_rating.value ->> 'status')::public.system_scorecard_status,
        'not_started'::public.system_scorecard_status
      ),
      nullif(source_rating.value ->> 'reviewedAt', '')::timestamptz,
      nullif(source_rating.value ->> 'reviewedBy', '')::uuid,
      nullif(source_rating.value ->> 'updatedBy', '')::uuid,
      coalesce(
        nullif(source_rating.value ->> 'createdAt', '')::timestamptz,
        now()
      ),
      coalesce(
        nullif(source_rating.value ->> 'updatedAt', '')::timestamptz,
        now()
      )
    from public.system_scorecard_systems as target_system
    left join lateral (
      select item.value
      from jsonb_array_elements(_snapshot -> 'ratings') as item(value)
      where item.value ->> 'systemKey' = target_system.key
      limit 1
    ) as source_rating on true
    where target_system.template_key = _target.key;

    _new_priority_position := 0;

    for _priority in
      select item.value
      from jsonb_array_elements(_snapshot -> 'priorities') as item(value)
      order by (item.value ->> 'position')::integer
    loop
      _old_system_key := _priority ->> 'systemKey';
      _target_system_key := _old_system_key;
      _target_system_id := null;

      select system.id, system.label, system.library_item_id
        into _target_system_id, _target_system_label, _target_library_item_id
      from public.system_scorecard_systems as system
      where system.template_key = _target.key
        and system.key = _target_system_key
      limit 1;

      if _target_system_id is null then
        _target_system_key := _resolution -> 'priorityReplacements' ->> _old_system_key;

        if _target_system_key is not null then
          select system.id, system.label, system.library_item_id
            into _target_system_id, _target_system_label, _target_library_item_id
          from public.system_scorecard_systems as system
          where system.template_key = _target.key
            and system.key = _target_system_key
          limit 1;
        end if;
      end if;

      if _target_system_id is null then
        delete from public.coaching_note_action_steps as action_step
        where action_step.id = (_priority ->> 'actionStepId')::bigint;
        continue;
      end if;

      select candidate.position into _new_priority_position
      from generate_series(1, 3) as candidate(position)
      where not exists (
        select 1 from public.business_review_system_priorities existing
        where existing.business_review_id = _review.id
          and existing.position = candidate.position
      )
      order by candidate.position limit 1;

      if _target_system_key = _old_system_key then
        _starting_status := (_priority ->> 'startingStatus')::public.system_scorecard_status;
      else
        select rating.status
          into _starting_status
        from public.business_review_system_ratings as rating
        where rating.business_review_id = _review.id
          and rating.system_id = _target_system_id;
      end if;

      insert into public.business_review_system_priorities (
        business_review_id,
        system_id,
        position,
        action_step_id,
        starting_status,
        selected_at,
        selected_by
      )
      values (
        _review.id,
        _target_system_id,
        _new_priority_position,
        (_priority ->> 'actionStepId')::bigint,
        _starting_status,
        coalesce(nullif(_priority ->> 'selectedAt', '')::timestamptz, now()),
        nullif(_priority ->> 'selectedBy', '')::uuid
      );

      update public.coaching_note_action_steps as action_step
      set label = _target_system_label,
          library_item_id = _target_library_item_id,
          updated_at = now()
      where action_step.id = (_priority ->> 'actionStepId')::bigint;
    end loop;

    insert into public.system_scorecard_version_migrations (
      business_review_id,
      from_template_key,
      to_template_key,
      migrated_by,
      resolution,
      previous_snapshot
    )
    values (
      _review.id,
      _source_template_key,
      _target.key,
      _actor_id,
      _resolution,
      _snapshot
    );

    _migrated_count := _migrated_count + 1;
  end loop;

  if not _was_active then
    update public.system_scorecard_templates as template
    set is_active = false,
        updated_at = now()
    where template.audience = _target.audience
      and template.key <> _target.key
      and template.is_active = true;

    update public.system_scorecard_templates as template
    set is_active = true,
        updated_at = now()
    where template.key = _target.key;
  end if;

  return jsonb_build_object(
    'templateKey', _target.key,
    'published', not _was_active,
    'eligibleReviewCount', _eligible_count,
    'migratedReviewCount', _migrated_count,
    'skippedReviewCount', _skipped_count
  );
end;
$$;


CREATE OR REPLACE FUNCTION "public"."set_business_review_system_priority"("_business_review_id" bigint, "_system_id" bigint, "_selected" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  _actor_id uuid := auth.uid();
  _review public.business_reviews%rowtype;
  _starting_status public.system_scorecard_status;
  _system_label text;
  _library_item_id bigint;
  _position smallint;
  _action_step_id bigint;
  _action_step_status public.action_step_status;
begin
  if _actor_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if _business_review_id is null or _system_id is null or _selected is null then
    raise exception 'Business audit, system, and selection state are required'
      using errcode = '22004';
  end if;

  select *
  into _review
  from public.business_reviews
  where id = _business_review_id
  for update;

  if not found then
    raise exception 'Business audit not found'
      using errcode = 'P0002';
  end if;

  if not (
    exists (
      select 1
      from public.user_roles user_role
      join public.roles role
        on role.id = user_role.role_id
      where user_role.user_id = _actor_id
        and role.code = 'admin'
    )
    or (
      exists (
        select 1
        from public.user_roles user_role
        join public.roles role
          on role.id = user_role.role_id
        where user_role.user_id = _actor_id
          and role.code = 'coach'
      )
      and exists (
        select 1
        from public.user_coaches assignment
        where assignment.coach_id = _actor_id
          and assignment.user_id = _review.user_id
          and assignment.is_active = true
      )
    )
  ) then
    raise exception 'You do not have access to this student'
      using errcode = '42501';
  end if;

  select
    rating.status,
    system.label,
    system.library_item_id
  into
    _starting_status,
    _system_label,
    _library_item_id
  from public.business_review_system_ratings rating
  join public.system_scorecard_systems system
    on system.id = rating.system_id
   and system.template_key = rating.template_key
  where rating.business_review_id = _review.id
    and rating.system_id = _system_id;

  if not found then
    raise exception 'That system does not belong to this Business Audit'
      using errcode = '22023';
  end if;

  if _selected then
    select
      priority.position,
      priority.action_step_id
    into
      _position,
      _action_step_id
    from public.business_review_system_priorities priority
    where priority.business_review_id = _review.id
      and priority.system_id = _system_id;

    if found then
      return jsonb_build_object(
        'selected', true,
        'position', _position,
        'actionStepId', _action_step_id
      );
    end if;

    select candidate.position::smallint
    into _position
    from generate_series(1, 3) as candidate(position)
    where not exists (
      select 1
      from public.business_review_system_priorities priority
      where priority.business_review_id = _review.id
        and priority.position = candidate.position
    )
    order by candidate.position
    limit 1;

    if _position is null then
      raise exception 'A Business Audit can have at most three priority systems'
        using errcode = '23514';
    end if;

    insert into public.coaching_note_action_steps (
      coaching_note_id,
      label,
      library_item_id,
      status
    )
    values (
      _review.coaching_note_id,
      _system_label,
      _library_item_id,
      'not_started'::public.action_step_status
    )
    returning id into _action_step_id;

    insert into public.business_review_system_priorities (
      business_review_id,
      system_id,
      position,
      action_step_id,
      starting_status,
      selected_by
    )
    values (
      _review.id,
      _system_id,
      _position,
      _action_step_id,
      _starting_status,
      _actor_id
    );

    return jsonb_build_object(
      'selected', true,
      'position', _position,
      'actionStepId', _action_step_id
    );
  end if;

  select
    priority.action_step_id,
    action_step.status
  into
    _action_step_id,
    _action_step_status
  from public.business_review_system_priorities priority
  join public.coaching_note_action_steps action_step
    on action_step.id = priority.action_step_id
  where priority.business_review_id = _review.id
    and priority.system_id = _system_id;

  if not found then
    return jsonb_build_object('selected', false);
  end if;

  if _action_step_status = 'not_started'::public.action_step_status then
    -- An untouched generated step can be removed cleanly.
    delete from public.coaching_note_action_steps
    where id = _action_step_id;
  else
    -- Preserve implementation work after it has started. It becomes a normal
    -- action step and is no longer synchronized as a scorecard priority.
    delete from public.business_review_system_priorities
    where business_review_id = _review.id
      and system_id = _system_id;
  end if;

  return jsonb_build_object('selected', false);
end;
$$;

commit;
