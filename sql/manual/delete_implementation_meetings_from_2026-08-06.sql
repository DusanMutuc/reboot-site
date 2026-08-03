-- ONE-OFF DESTRUCTIVE CLEANUP
--
-- Deletes site meeting records of type IMPLEMENTATION_MEETING dated on or
-- after August 6, 2026. The cutoff is inclusive so it matches the GHL meeting
-- synchronization rollout. Change >= to > in the target query if August 6
-- itself must be retained.
--
-- This intentionally targets both manually created and GHL-backed
-- Implementation meetings. It does not delete GHL appointments.

begin;

create temporary table target_future_implementation_meetings
on commit drop
as
select
  meeting.id,
  meeting.date,
  meeting.title,
  meeting.ghl_appointment_id
from public.meetings as meeting
join public.meeting_types as meeting_type
  on meeting_type.id = meeting.meeting_type_id
where meeting_type.code = 'IMPLEMENTATION_MEETING'
  and meeting.date >= date '2026-08-06';

-- Supabase displays this result before the deletion result so the exact scope
-- is visible in the SQL editor output.
select
  target.id,
  target.date,
  target.title,
  target.ghl_appointment_id
from target_future_implementation_meetings as target
order by target.date, target.id;

-- Future meetings should not already be attended or be serving as an M2 /
-- Business Audit link. Abort and roll back the whole cleanup if either data
-- invariant is violated.
do $guard$
begin
  if exists (
    select 1
    from public.meeting_attendance_base as attendance
    join target_future_implementation_meetings as target
      on target.id = attendance.meeting_id
    where attendance.attended = true
  ) then
    raise exception
      'Cleanup stopped: at least one targeted Implementation meeting is already marked attended.';
  end if;

  if exists (
    select 1
    from public.business_reviews as review
    join target_future_implementation_meetings as target
      on target.id = review.meeting_id
  ) then
    raise exception
      'Cleanup stopped: at least one targeted meeting is connected to a Business Audit.';
  end if;

  if exists (
    select 1
    from public.coaching_notes_base as note
    join target_future_implementation_meetings as target
      on target.id = note.m2_meeting_id
  ) then
    raise exception
      'Cleanup stopped: at least one targeted meeting is connected as an M2 coaching-note meeting.';
  end if;
end;
$guard$;

delete from public.meeting_attendance_base as attendance
using target_future_implementation_meetings as target
where attendance.meeting_id = target.id;

delete from public.meetings as meeting
using target_future_implementation_meetings as target
where meeting.id = target.id
returning
  meeting.id,
  meeting.date,
  meeting.title,
  meeting.ghl_appointment_id;

commit;
