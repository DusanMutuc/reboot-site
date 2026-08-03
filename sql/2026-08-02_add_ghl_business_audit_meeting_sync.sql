begin;

alter table public.meetings
  add column if not exists ghl_appointment_id text,
  add column if not exists ghl_calendar_id text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists meeting_timezone text,
  add column if not exists ghl_status text,
  add column if not exists ghl_synced_at timestamptz;

create unique index if not exists meetings_ghl_appointment_id_uidx
  on public.meetings (ghl_appointment_id)
  where ghl_appointment_id is not null;

create index if not exists meetings_starts_at_idx
  on public.meetings (starts_at)
  where starts_at is not null;

comment on column public.meetings.ghl_appointment_id is
  'Stable GoHighLevel appointment identifier used for idempotent calendar synchronization.';

comment on column public.meetings.meeting_timezone is
  'IANA timezone used to derive the meeting date and schedule local-time reminders.';

alter table public.business_reviews
  add column if not exists meeting_id bigint
    references public.meetings (id)
    on delete set null;

create unique index if not exists business_reviews_meeting_id_uidx
  on public.business_reviews (meeting_id)
  where meeting_id is not null;

comment on column public.business_reviews.meeting_id is
  'The M2_MEETING record whose scheduled appointment owns this Business Audit.';

create or replace function public.sync_business_audit_appointment(
  _ghl_appointment_id text,
  _ghl_calendar_id text,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _meeting_timezone text,
  _ghl_status text,
  _title text,
  _student_id uuid,
  _coach_id uuid,
  _review_date date,
  _is_cancelled boolean default false
)
returns table (
  meeting_id bigint,
  business_review_id bigint,
  meeting_created boolean,
  business_review_created boolean,
  skipped_cancelled boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _normalized_appointment_id text := nullif(btrim(_ghl_appointment_id), '');
  _meeting_type_id bigint;
  _meeting_id bigint;
  _review_id bigint;
  _coaching_note_id bigint;
  _meeting_was_created boolean := false;
  _review_was_created boolean := false;
  _previous_claim_sub text := current_setting('request.jwt.claim.sub', true);
  _previous_claims text := current_setting('request.jwt.claims', true);
begin
  if _normalized_appointment_id is null then
    raise exception 'A GHL appointment id is required.';
  end if;

  -- Serializes duplicate cron invocations for the same external appointment.
  perform pg_advisory_xact_lock(hashtextextended(_normalized_appointment_id, 0));

  if _student_id is null or _coach_id is null then
    raise exception 'A student and coach are required.';
  end if;

  if not exists (
    select 1
    from public.user_coaches as assignment
    where assignment.user_id = _student_id
      and assignment.coach_id = _coach_id
      and assignment.is_active = true
      and assignment.relationship_type::text = 'primary'
  ) then
    raise exception 'The coach is not the student''s active primary coach.';
  end if;

  select existing.id
    into _meeting_id
  from public.meetings as existing
  where existing.ghl_appointment_id = _normalized_appointment_id
  limit 1;

  -- A cancelled appointment that was never synchronized should not create
  -- either a site meeting or an empty Business Audit.
  if coalesce(_is_cancelled, false) and _meeting_id is null then
    return query
      select null::bigint, null::bigint, false, false, true;
    return;
  end if;

  if _starts_at is null or _review_date is null then
    raise exception 'An appointment start and review date are required.';
  end if;

  if nullif(btrim(_meeting_timezone), '') is null then
    raise exception 'A meeting timezone is required.';
  end if;

  if _meeting_id is null then
    select meeting_type.id
      into _meeting_type_id
    from public.meeting_types as meeting_type
    where meeting_type.code = 'M2_MEETING'
      and meeting_type.is_active = true
    limit 1;

    if _meeting_type_id is null then
      raise exception 'The active M2_MEETING meeting type was not found.';
    end if;

    insert into public.meetings (
      meeting_type_id,
      date,
      created_by,
      title,
      ghl_appointment_id,
      ghl_calendar_id,
      starts_at,
      ends_at,
      meeting_timezone,
      ghl_status,
      ghl_synced_at
    )
    values (
      _meeting_type_id,
      _review_date,
      _coach_id,
      nullif(btrim(_title), ''),
      _normalized_appointment_id,
      nullif(btrim(_ghl_calendar_id), ''),
      _starts_at,
      _ends_at,
      btrim(_meeting_timezone),
      nullif(btrim(_ghl_status), ''),
      now()
    )
    returning id into _meeting_id;

    _meeting_was_created := true;
  else
    update public.meetings as existing
    set date = _review_date,
        created_by = _coach_id,
        title = coalesce(nullif(btrim(_title), ''), existing.title),
        ghl_calendar_id = nullif(btrim(_ghl_calendar_id), ''),
        starts_at = _starts_at,
        ends_at = _ends_at,
        meeting_timezone = btrim(_meeting_timezone),
        ghl_status = nullif(btrim(_ghl_status), ''),
        ghl_synced_at = now(),
        updated_at = now()
    where existing.id = _meeting_id;
  end if;

  if coalesce(_is_cancelled, false) then
    -- Keep the external meeting and audit for history, but remove the
    -- attendance-backed association so canceled M2s disappear from member
    -- meeting feeds, engagement counts, and Implementation cycle slots.
    delete from public.meeting_attendance_base as attendance
    where attendance.meeting_id = _meeting_id
      and attendance.user_id = _student_id;

    select review.id
      into _review_id
    from public.business_reviews as review
    where review.meeting_id = _meeting_id
    limit 1;

    return query
      select _meeting_id, _review_id, false, false, false;
    return;
  end if;

  insert into public.meeting_attendance_base (
    meeting_id,
    user_id,
    attended
  )
  values (
    _meeting_id,
    _student_id,
    false
  )
  -- The function returns a column named meeting_id, so naming the conflict
  -- columns here makes PL/pgSQL treat meeting_id as ambiguous. The table's
  -- only uniqueness rule is its (meeting_id, user_id) primary key.
  on conflict do nothing;

  select review.id, review.coaching_note_id
    into _review_id, _coaching_note_id
  from public.business_reviews as review
  where review.meeting_id = _meeting_id
  limit 1;

  -- If a coach manually created a draft before the hourly job saw the
  -- appointment, connect that draft instead of producing a duplicate audit.
  if _review_id is null then
    select review.id, review.coaching_note_id
      into _review_id, _coaching_note_id
    from public.business_reviews as review
    where review.user_id = _student_id
      and review.review_date = _review_date
      and review.status::text = 'draft'
      and review.meeting_id is null
    order by review.created_at desc, review.id desc
    limit 1;

    if _review_id is not null then
      update public.business_reviews as review
      set meeting_id = _meeting_id,
          coach_id = _coach_id,
          updated_at = now()
      where review.id = _review_id;
    end if;
  end if;

  if _review_id is null then
    -- create_business_review already owns the template-selection and
    -- coaching-note invariants. Supply the matched primary coach as the
    -- authenticated actor while this service-role-only function calls it.
    perform set_config('request.jwt.claim.sub', _coach_id::text, true);
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', _coach_id::text, 'role', 'authenticated')::text,
      true
    );

    select created.id, created.coaching_note_id
      into _review_id, _coaching_note_id
    from public.create_business_review(
      _user_id => _student_id,
      _review_date => _review_date
    ) as created
    limit 1;

    perform set_config('request.jwt.claim.sub', coalesce(_previous_claim_sub, ''), true);
    perform set_config('request.jwt.claims', coalesce(_previous_claims, '{}'), true);

    if _review_id is null then
      raise exception 'The Business Audit could not be created.';
    end if;

    update public.business_reviews as review
    set meeting_id = _meeting_id,
        updated_at = now()
    where review.id = _review_id;

    _review_was_created := true;
  else
    update public.business_reviews as review
    set review_date = case
          when review.status::text = 'draft' then _review_date
          else review.review_date
        end,
        coach_id = case
          when review.status::text = 'draft' then _coach_id
          else review.coach_id
        end,
        updated_at = case
          when review.status::text = 'draft' then now()
          else review.updated_at
        end
    where review.id = _review_id;
  end if;

  update public.coaching_notes_base as note
  set m2_meeting_id = _meeting_id,
      coach_id = coalesce(note.coach_id, _coach_id),
      updated_at = now()
  where note.id = _coaching_note_id
    and note.deleted_at is null;

  return query
    select
      _meeting_id,
      _review_id,
      _meeting_was_created,
      _review_was_created,
      false;
end;
$$;

comment on function public.sync_business_audit_appointment(
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  uuid,
  uuid,
  date,
  boolean
) is
  'Idempotently synchronizes one GHL Business Audit appointment, attendance row, coaching note, and Business Audit.';

revoke all on function public.sync_business_audit_appointment(
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  uuid,
  uuid,
  date,
  boolean
) from public, anon, authenticated;

grant execute on function public.sync_business_audit_appointment(
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  uuid,
  uuid,
  date,
  boolean
) to service_role;

commit;
