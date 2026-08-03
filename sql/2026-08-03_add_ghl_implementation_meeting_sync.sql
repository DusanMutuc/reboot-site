begin;

create or replace function public.sync_implementation_appointment(
  _ghl_appointment_id text,
  _ghl_calendar_id text,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _meeting_timezone text,
  _ghl_status text,
  _title text,
  _student_id uuid,
  _coach_id uuid,
  _meeting_date date,
  _is_cancelled boolean default false
)
returns table (
  meeting_id bigint,
  meeting_created boolean,
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
  _existing_meeting_type_code text;
  _manual_candidate_id bigint;
  _manual_candidate_count integer := 0;
  _meeting_was_created boolean := false;
begin
  if _normalized_appointment_id is null then
    raise exception 'A GHL appointment id is required.';
  end if;

  -- Serializes overlapping cron invocations for the same GHL appointment.
  perform pg_advisory_xact_lock(hashtextextended(_normalized_appointment_id, 0));

  if _student_id is null or _coach_id is null then
    raise exception 'A student and coach are required.';
  end if;

  if not exists (
    select 1
    from public.user_coaches as assignment
    where assignment.user_id = _student_id
      and assignment.coach_id = _coach_id
      and assignment.course_id = 2
      and assignment.is_active = true
      and assignment.relationship_type::text = 'implementation'
  ) then
    raise exception 'The coach is not the student''s active implementation coach.';
  end if;

  select existing.id, meeting_type.code
    into _meeting_id, _existing_meeting_type_code
  from public.meetings as existing
  join public.meeting_types as meeting_type
    on meeting_type.id = existing.meeting_type_id
  where existing.ghl_appointment_id = _normalized_appointment_id
  limit 1;

  -- A cancellation that was never synchronized should not create a site meeting.
  if coalesce(_is_cancelled, false) and _meeting_id is null then
    return query
      select null::bigint, false, true;
    return;
  end if;

  if _meeting_id is not null and _existing_meeting_type_code <> 'IMPLEMENTATION_MEETING' then
    raise exception
      'The GHL appointment is already connected to a % meeting.',
      _existing_meeting_type_code;
  end if;

  if _starts_at is null or _meeting_date is null then
    raise exception 'An appointment start and meeting date are required.';
  end if;

  if nullif(btrim(_meeting_timezone), '') is null then
    raise exception 'A meeting timezone is required.';
  end if;

  select meeting_type.id
    into _meeting_type_id
  from public.meeting_types as meeting_type
  where meeting_type.code = 'IMPLEMENTATION_MEETING'
    and meeting_type.is_active = true
  limit 1;

  if _meeting_type_id is null then
    raise exception 'The active IMPLEMENTATION_MEETING meeting type was not found.';
  end if;

  -- If the coach created the site slot before the hourly job saw the GHL
  -- booking, adopt the one unambiguous manual meeting instead of creating a
  -- duplicate. Shared/multi-attendee meetings are deliberately not adopted.
  if _meeting_id is null then
    perform pg_advisory_xact_lock(
      hashtextextended(_student_id::text || ':' || _meeting_date::text || ':implementation', 0)
    );

    select count(*)::integer, min(candidate.id)
      into _manual_candidate_count, _manual_candidate_id
    from public.meetings as candidate
    where candidate.meeting_type_id = _meeting_type_id
      and candidate.date = _meeting_date
      and candidate.ghl_appointment_id is null
      and candidate.starts_at is null
      and exists (
        select 1
        from public.meeting_attendance_base as attendance
        where attendance.meeting_id = candidate.id
          and attendance.user_id = _student_id
      )
      and not exists (
        select 1
        from public.meeting_attendance_base as other_attendance
        where other_attendance.meeting_id = candidate.id
          and other_attendance.user_id <> _student_id
      );

    if _manual_candidate_count = 1 then
      _meeting_id := _manual_candidate_id;
    end if;
  end if;

  if _meeting_id is null then
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
      _meeting_date,
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
    set date = _meeting_date,
        created_by = _coach_id,
        title = coalesce(nullif(btrim(_title), ''), existing.title),
        ghl_appointment_id = _normalized_appointment_id,
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
    -- get_user_meetings is attendance-backed. Removing this association keeps
    -- the cancelled record for history while removing it from the student's
    -- Implementation slots. Reconfirmation inserts the association again.
    delete from public.meeting_attendance_base as attendance
    where attendance.meeting_id = _meeting_id
      and attendance.user_id = _student_id;

    return query
      select _meeting_id, false, false;
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
  on conflict do nothing;

  return query
    select _meeting_id, _meeting_was_created, false;
end;
$$;

comment on function public.sync_implementation_appointment(
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
  'Idempotently synchronizes one GHL Implementation appointment and its student attendance association.';

revoke all on function public.sync_implementation_appointment(
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

grant execute on function public.sync_implementation_appointment(
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
