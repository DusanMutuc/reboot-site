begin;

create or replace function public.sync_scorecard_priority_action_step_library_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coaching_note_action_steps as action_step
  set
    library_item_id = system.library_item_id,
    updated_at = now()
  from public.system_scorecard_systems as system
  where system.id = new.system_id
    and action_step.id = new.action_step_id
    and action_step.library_item_id is distinct from system.library_item_id;

  return new;
end;
$$;

drop trigger if exists sync_scorecard_priority_action_step_library_item
  on public.business_review_system_priorities;

create trigger sync_scorecard_priority_action_step_library_item
after insert or update of system_id, action_step_id
on public.business_review_system_priorities
for each row
execute function public.sync_scorecard_priority_action_step_library_item();

create or replace function public.propagate_scorecard_system_library_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coaching_note_action_steps as action_step
  set
    library_item_id = new.library_item_id,
    updated_at = now()
  from public.business_review_system_priorities as priority
  where priority.system_id = new.id
    and action_step.id = priority.action_step_id
    and action_step.library_item_id is distinct from new.library_item_id;

  return new;
end;
$$;

drop trigger if exists propagate_scorecard_system_library_item
  on public.system_scorecard_systems;

create trigger propagate_scorecard_system_library_item
after update of library_item_id
on public.system_scorecard_systems
for each row
when (old.library_item_id is distinct from new.library_item_id)
execute function public.propagate_scorecard_system_library_item();

update public.coaching_note_action_steps as action_step
set
  library_item_id = system.library_item_id,
  updated_at = now()
from public.business_review_system_priorities as priority
join public.system_scorecard_systems as system
  on system.id = priority.system_id
where action_step.id = priority.action_step_id
  and action_step.library_item_id is distinct from system.library_item_id;

revoke all on function public.sync_scorecard_priority_action_step_library_item() from public;
revoke all on function public.propagate_scorecard_system_library_item() from public;

commit;
