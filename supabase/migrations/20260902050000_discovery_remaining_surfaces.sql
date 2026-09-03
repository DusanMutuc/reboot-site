begin;

-- A search becomes analytically meaningful only after a member actually sees a
-- result set. The original event trigger already does this; the later response
-- recorder accidentally also qualified every two-character query at insert time.
do $migration$
declare
  definition text;
  matches integer;
begin
  select count(*), min(pg_get_functiondef(p.oid))
  into matches, definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'record_discovery_search_response';

  if matches <> 1 then
    raise exception 'Expected one record_discovery_search_response function, found %', matches;
  end if;

  if position('case when char_length(normalized_query) >= 2 then now() end' in definition) = 0 then
    raise exception 'record_discovery_search_response qualification clause no longer matches';
  end if;

  definition := replace(
    definition,
    'case when char_length(normalized_query) >= 2 then now() end',
    'null::timestamptz'
  );
  execute definition;
end
$migration$;

comment on column public.logical_searches.qualified_at is
  'Set only after a result-set shown, impression, or open event; query length is not qualification.';

-- The four-item floor belongs to the algorithmic slice assembled by the app,
-- not to the persisted recommendation response. One named coach suggestion is
-- a valid, visible result set by itself.
alter table public.discovery_result_sets
  drop constraint if exists discovery_result_sets_recommendation_display_minimum;

-- Coach-selected supplementary material is intentionally separate from required
-- course assignments. It remains active until the coach removes it or the member
-- explicitly resolves it through the existing discovery preference controls.
create table public.coach_resource_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id bigint not null references public.resources(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete restrict,
  coaching_note_id bigint references public.coaching_notes_base(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  member_resolution text,
  member_resolved_at timestamptz,
  constraint coach_resource_suggestions_resolution_valid
    check (member_resolution is null or member_resolution in ('finished', 'not_interested')),
  constraint coach_resource_suggestions_resolution_shape
    check ((member_resolution is null) = (member_resolved_at is null)),
  constraint coach_resource_suggestions_removal_shape
    check ((removed_at is null) = (removed_by is null))
);

create unique index coach_resource_suggestions_one_active_resource_idx
  on public.coach_resource_suggestions (user_id, resource_id)
  where removed_at is null and member_resolution is null;

create index coach_resource_suggestions_member_active_idx
  on public.coach_resource_suggestions (user_id, created_at desc)
  where removed_at is null and member_resolution is null;

create index coach_resource_suggestions_coach_recent_idx
  on public.coach_resource_suggestions (coach_id, created_at desc);

comment on table public.coach_resource_suggestions is
  'Optional coach-selected browse recommendations. They are not required training and resolve only through an explicit coach removal or member preference.';

create or replace function public.resolve_coach_resource_suggestions_from_preference()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.coach_resource_suggestions suggestion
  set member_resolution = new.preference,
      member_resolved_at = coalesce(new.updated_at, now())
  where suggestion.user_id = new.user_id
    and suggestion.resource_id = new.resource_id
    and suggestion.removed_at is null
    and suggestion.member_resolution is null;
  return new;
end
$function$;

revoke all on function public.resolve_coach_resource_suggestions_from_preference()
  from public, anon, authenticated;

create trigger trg_resolve_coach_resource_suggestions
after insert or update of preference on public.user_resource_discovery_preferences
for each row execute function public.resolve_coach_resource_suggestions_from_preference();

alter table public.coach_resource_suggestions enable row level security;
revoke all on public.coach_resource_suggestions from public, anon, authenticated;
grant all on public.coach_resource_suggestions to service_role;

commit;
