begin;

create table public.general_coaching_notes (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (length(btrim(body, E' \t\r\n')) between 1 and 30000),
  created_at timestamptz not null default clock_timestamp()
);
create index general_coaching_notes_user_idx on public.general_coaching_notes(user_id,id);
comment on table public.general_coaching_notes is 'Staff-only notes about a member, independent of coaching cycles; IDs provide idempotent creation.';

create function public.can_access_member_coaching_notes(_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=_user_id)
    and (public.has_role(array['admin','superadmin']::text[])
      or (public.has_role(array['coach','implementation_coach']::text[]) and exists (
        select 1 from public.user_coaches c where c.user_id=_user_id and c.coach_id=auth.uid()
          and c.is_active and (c.ended_at is null or c.ended_at>now())
      )));
$$;
revoke all on function public.can_access_member_coaching_notes(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_access_member_coaching_notes(uuid) to authenticated,service_role;

alter table public.general_coaching_notes enable row level security;
create policy general_coaching_notes_staff_read on public.general_coaching_notes
  for select to authenticated using(public.can_access_member_coaching_notes(user_id));
revoke all on public.general_coaching_notes from public,anon,authenticated,service_role;
grant select on public.general_coaching_notes to authenticated,service_role;

create function public.add_general_coaching_note(_user_id uuid,_body text,_request_id uuid)
returns public.general_coaching_notes language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  _actor uuid := auth.uid();
  _note public.general_coaching_notes%rowtype;
  _text text := btrim(_body,E' \t\r\n');
begin
  if not public.can_access_member_coaching_notes(_user_id) then
    raise exception 'You do not have access to these coaching notes.' using errcode='42501';
  end if;
  if _request_id is null or _text is null or length(_text) not between 1 and 30000 then
    raise exception 'A unique request ID and note of 1-30000 characters are required.' using errcode='22023';
  end if;
  insert into public.general_coaching_notes(id,user_id,author_id,body)
  values(_request_id,_user_id,_actor,_text) on conflict(id) do nothing;
  select n.* into _note from public.general_coaching_notes n where n.id=_request_id;
  if _note.user_id<>_user_id or _note.author_id is distinct from _actor or _note.body<>_text then
    raise exception 'This note request ID has already been used. Please start a new note.' using errcode='22023';
  end if;
  return _note;
end;
$$;
revoke all on function public.add_general_coaching_note(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.add_general_coaching_note(uuid,text,uuid) to authenticated,service_role;

alter table public.implementation_meeting_sessions
  add column notes_written_at timestamptz,
  add column notes_author_id uuid references public.profiles(id) on delete set null,
  add column notes_updated_at timestamptz,
  add column notes_updated_by uuid references public.profiles(id) on delete set null;
comment on column public.implementation_meeting_sessions.notes_written_at is
  'First written time for the current meeting-note content; null for pre-tracking notes with unknown provenance. Never inferred from general session updates.';

create function public.track_implementation_note_attribution()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.notes is not distinct from old.notes and new.commitments is not distinct from old.commitments then
    return new;
  end if;
  if length(btrim(old.notes,E' \t\r\n'))=0 and length(btrim(old.commitments,E' \t\r\n'))=0
    and (length(btrim(new.notes,E' \t\r\n'))>0 or length(btrim(new.commitments,E' \t\r\n'))>0) then
    new.notes_written_at := clock_timestamp();
    new.notes_author_id := auth.uid();
    new.notes_updated_at := null;
    new.notes_updated_by := null;
  else
    -- Existing nonempty notes retain their original attribution, including
    -- unknown/null legacy values. Only the subsequent edit has known provenance.
    new.notes_updated_at := clock_timestamp();
    new.notes_updated_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function public.track_implementation_note_attribution() from public,anon,authenticated,service_role;
create trigger implementation_notes_attribution before update of notes,commitments
  on public.implementation_meeting_sessions for each row
  execute function public.track_implementation_note_attribution();

commit;
