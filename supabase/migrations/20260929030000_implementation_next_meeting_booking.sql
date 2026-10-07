begin;

alter table public.implementation_meeting_sessions
  add column next_meeting_booked boolean not null default false;
comment on column public.implementation_meeting_sessions.next_meeting_booked is
  'Coach-confirmed booking of the next meeting, recorded independently for this session. Does not imply attendance or progress.';

-- Keep all existing authorization, revision, cancellation and cycle behavior.
-- Apply only the new operation to the latest installed workspace function,
-- including changes from the earlier manual-meeting migration.
do $patch$
declare
  _definition text;
  _old text[] := array[
    $old$'complete_meeting','reopen_meeting','set_attendance','set_action_status')$old$,
    $old$    when 'set_attendance' then array['attended']$old$,
    $old$  if _operation not in ('save_notes','set_attendance') then$old$,
    $old$    when 'set_attendance' then
      if jsonb_typeof(_payload->'attended') is distinct from 'boolean' then$old$,
    $old$    completed_at=_session.completed_at,notes=_session.notes,commitments=_session.commitments,$old$
  ];
  _new text[] := array[
    $new$'complete_meeting','reopen_meeting','set_attendance','set_action_status','set_next_meeting_booked')$new$,
    $new$    when 'set_attendance' then array['attended']
    when 'set_next_meeting_booked' then array['booked']$new$,
    $new$  if _operation not in ('save_notes','set_attendance','set_next_meeting_booked') then$new$,
    $new$    when 'set_next_meeting_booked' then
      if jsonb_typeof(_payload->'booked') is distinct from 'boolean' then
        raise exception 'The booked value must be a boolean.' using errcode = '22023';
      end if;
      _session.next_meeting_booked := (_payload->>'booked')::boolean;
    when 'set_attendance' then
      if jsonb_typeof(_payload->'attended') is distinct from 'boolean' then$new$,
    $new$    completed_at=_session.completed_at,notes=_session.notes,commitments=_session.commitments,
    next_meeting_booked=_session.next_meeting_booked,$new$
  ];
  _i integer;
begin
  _definition := replace(pg_get_functiondef('public.mutate_implementation_workspace(bigint,bigint,text,jsonb,integer)'::regprocedure),chr(13),'');
  for _i in 1..array_length(_old,1) loop
    _old[_i] := replace(_old[_i],chr(13),'');
    _new[_i] := replace(_new[_i],chr(13),'');
    if (length(_definition)-length(replace(_definition,_old[_i],'')))/length(_old[_i]) <> 1 then
      raise exception 'Workspace booking operation prerequisite % does not match.',_i;
    end if;
    _definition := replace(_definition,_old[_i],_new[_i]);
  end loop;
  execute _definition;
end;
$patch$;

commit;
