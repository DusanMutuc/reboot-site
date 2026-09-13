begin;

create table if not exists public.member_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text,
  started_by uuid references public.profiles (id) on delete set null,
  ended_by uuid references public.profiles (id) on delete set null,
  constraint member_pauses_valid_period check (ended_at is null or ended_at >= started_at),
  constraint member_pauses_reason_length check (reason is null or char_length(reason) <= 1000)
);

create unique index if not exists member_pauses_one_open_per_member
  on public.member_pauses (user_id) where ended_at is null;

create index if not exists member_pauses_user_started_at_idx
  on public.member_pauses (user_id, started_at desc);

comment on table public.member_pauses is
  'Intervals when a coaching member has paused the programme. A null ended_at is an active pause; history remains after resumption.';

alter table public.member_pauses enable row level security;
revoke all on table public.member_pauses from anon, authenticated;
grant select, insert, update on table public.member_pauses to service_role;

-- Attendance recorded on a paused calendar date is outside the member's
-- engagement window, including after they resume.
create or replace function public.compute_user_attention_auto_from_attendance(p_user_id uuid)
returns public.user_attention_status
language sql security definer
set search_path to public
as $$
  with rng as (
    select (current_date - interval '2 months')::date as d_from,
           current_date::date as d_to
  ),
  agg as (
    select count(*)::int as expected_count,
           count(*) filter (where ma.attended)::int as attended_count
    from public.meeting_attendance ma
    join public.meetings m on m.id = ma.meeting_id
    join public.meeting_types mt on mt.id = m.meeting_type_id
    cross join rng
    where ma.user_id = p_user_id
      and mt.counts_toward_engagement = true
      and m.date between rng.d_from and rng.d_to
      and not exists (
        select 1
        from public.member_pauses pause
        where pause.user_id = p_user_id
          and m.date >= (pause.started_at at time zone 'UTC')::date
          and (pause.ended_at is null or m.date <= (pause.ended_at at time zone 'UTC')::date)
      )
  ),
  ratio as (
    select expected_count,
           case when expected_count = 0 then null
                else attended_count::numeric / expected_count::numeric
           end as x
    from agg
  )
  select case
    when expected_count = 0 then 'green'::public.user_attention_status
    when x >= 0.5 then 'green'::public.user_attention_status
    when x >= 1.0 / 3.0 then 'yellow'::public.user_attention_status
    else 'red'::public.user_attention_status
  end
  from ratio;
$$;

create or replace function public.recompute_attention_on_member_pause()
returns trigger
language plpgsql security definer
set search_path to public
as $$
begin
  perform public.apply_user_attention_auto(new.user_id);
  return new;
end;
$$;

create trigger member_pauses_recompute_attention
after insert or update of ended_at on public.member_pauses
for each row execute function public.recompute_attention_on_member_pause();

commit;
