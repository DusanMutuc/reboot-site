begin;

-- Attendance-backed meeting feeds should never expose a canceled GHL meeting.
-- This trigger applies consistently to Business Audit and Implementation
-- meetings, including status changes made outside the hourly sync RPCs.
create or replace function public.remove_cancelled_ghl_meeting_attendance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _normalized_status text := lower(
    regexp_replace(coalesce(new.ghl_status, ''), '[[:space:]_-]+', '', 'g')
  );
begin
  if new.ghl_appointment_id is not null
     and _normalized_status in ('cancelled', 'canceled', 'deleted', 'invalid', 'noshow') then
    delete from public.meeting_attendance_base as attendance
    where attendance.meeting_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists meetings_remove_cancelled_ghl_attendance
  on public.meetings;

create trigger meetings_remove_cancelled_ghl_attendance
after insert or update of ghl_status
on public.meetings
for each row
execute function public.remove_cancelled_ghl_meeting_attendance();

-- Repair any canceled appointments synchronized before this trigger existed.
delete from public.meeting_attendance_base as attendance
using public.meetings as meeting
where attendance.meeting_id = meeting.id
  and meeting.ghl_appointment_id is not null
  and lower(regexp_replace(coalesce(meeting.ghl_status, ''), '[[:space:]_-]+', '', 'g'))
    in ('cancelled', 'canceled', 'deleted', 'invalid', 'noshow');

-- Version 2 adds a safe adoption step before delegating to the already-installed
-- Implementation sync function. If exactly one single-student manual meeting
-- exists on the same date, the GHL appointment claims it rather than creating a
-- duplicate. The advisory lock also makes concurrent hourly invocations safe.
create or replace function public.sync_implementation_appointment_v2(
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
  _manual_candidate_id bigint;
  _manual_candidate_count integer := 0;
begin
  if _normalized_appointment_id is null then
    raise exception 'A GHL appointment id is required.';
  end if;

  if _student_id is null or _coach_id is null then
    raise exception 'A student and coach are required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_normalized_appointment_id, 0));

  if not coalesce(_is_cancelled, false)
     and _meeting_date is not null
     and not exists (
       select 1
       from public.meetings as existing
       where existing.ghl_appointment_id = _normalized_appointment_id
     ) then
    perform pg_advisory_xact_lock(
      hashtextextended(_student_id::text || ':' || _meeting_date::text || ':implementation', 0)
    );

    select meeting_type.id
      into _meeting_type_id
    from public.meeting_types as meeting_type
    where meeting_type.code = 'IMPLEMENTATION_MEETING'
      and meeting_type.is_active = true
    limit 1;

    if _meeting_type_id is null then
      raise exception 'The active IMPLEMENTATION_MEETING meeting type was not found.';
    end if;

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
      update public.meetings as candidate
      set ghl_appointment_id = _normalized_appointment_id,
          updated_at = now()
      where candidate.id = _manual_candidate_id
        and candidate.ghl_appointment_id is null;
    end if;
  end if;

  return query
  select
    synced.meeting_id,
    synced.meeting_created,
    synced.skipped_cancelled
  from public.sync_implementation_appointment(
    _ghl_appointment_id => _normalized_appointment_id,
    _ghl_calendar_id => _ghl_calendar_id,
    _starts_at => _starts_at,
    _ends_at => _ends_at,
    _meeting_timezone => _meeting_timezone,
    _ghl_status => _ghl_status,
    _title => _title,
    _student_id => _student_id,
    _coach_id => _coach_id,
    _meeting_date => _meeting_date,
    _is_cancelled => _is_cancelled
  ) as synced;
end;
$$;

comment on function public.sync_implementation_appointment_v2(
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
  'Synchronizes one GHL Implementation appointment and safely adopts an unambiguous same-day manual meeting.';

revoke all on function public.sync_implementation_appointment_v2(
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

grant execute on function public.sync_implementation_appointment_v2(
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
