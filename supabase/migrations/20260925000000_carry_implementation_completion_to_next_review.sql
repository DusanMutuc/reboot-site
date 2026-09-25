begin;

-- The next audit is often created by appointment sync before implementation
-- finishes. Refresh its inherited rating as well as the original audit's rating.
create or replace function public.carry_priority_completion_to_next_review(
  _action_step_id bigint
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.business_review_system_ratings target_rating
  set status = source_rating.status,
      updated_by = coalesce(auth.uid(), source_rating.updated_by, target_rating.updated_by),
      updated_at = now()
  from public.business_review_system_priorities priority
  join public.coaching_note_action_steps step
    on step.id = priority.action_step_id and step.status = 'complete'
  join public.business_reviews source_review
    on source_review.id = priority.business_review_id
  join public.business_review_system_ratings source_rating
    on source_rating.business_review_id = priority.business_review_id
   and source_rating.system_id = priority.system_id
  join public.system_scorecard_systems source_system
    on source_system.id = source_rating.system_id
  join public.system_scorecard_templates source_template
    on source_template.key = source_system.template_key
  -- Choose the next real audit before checking whether it is editable. Never
  -- jump over a completed/reassessed audit and apply old work to a later cycle.
  join lateral (
    select candidate.id, candidate.status
    from public.business_reviews candidate
    left join public.meetings meeting on meeting.id = candidate.meeting_id
    where candidate.user_id = source_review.user_id
      and (candidate.review_date, candidate.id) > (source_review.review_date, source_review.id)
      and regexp_replace(lower(coalesce(meeting.ghl_status, '')), '[\s_-]+', '', 'g')
          not in ('cancelled', 'canceled', 'deleted', 'invalid', 'noshow')
    order by candidate.review_date, candidate.id
    limit 1
  ) next_review on next_review.status = 'draft'
  join public.system_scorecard_templates target_template
    on target_template.audience = source_template.audience
  join public.system_scorecard_systems target_system
    on target_system.template_key = target_template.key
   and target_system.key = source_system.key
  where priority.action_step_id = _action_step_id
    and source_rating.status in ('complete', 'consistent')
    and target_rating.business_review_id = next_review.id
    and target_rating.system_id = target_system.id
    and target_rating.template_key = target_template.key
    and target_rating.reviewed_at is null
    and target_rating.status <> 'consistent'
    and target_rating.status is distinct from source_rating.status;
$$;

revoke all on function public.carry_priority_completion_to_next_review(bigint)
  from public, anon, authenticated;
grant execute on function public.carry_priority_completion_to_next_review(bigint)
  to service_role;

create or replace function public.sync_priority_system_from_action_step_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _actor_id uuid := auth.uid();
begin
  update public.business_review_system_ratings rating
  set status = case
        when rating.status = 'consistent'::public.system_scorecard_status
          or priority.starting_status in (
            'complete'::public.system_scorecard_status,
            'consistent'::public.system_scorecard_status
          )
        then 'consistent'::public.system_scorecard_status
        else 'complete'::public.system_scorecard_status
      end,
      updated_by = coalesce(_actor_id, rating.updated_by),
      updated_at = now()
  from public.business_review_system_priorities priority
  where priority.action_step_id = new.id
    and rating.business_review_id = priority.business_review_id
    and rating.system_id = priority.system_id;

  perform public.carry_priority_completion_to_next_review(new.id);
  return new;
end;
$$;

comment on function public.sync_priority_system_from_action_step_completion() is
  'Promotes the linked system to complete/consistent and refreshes the next audit unreviewed rating. Does not mark either system as reviewed.';

-- Repair existing stale snapshots using the same guards, without toggling action
-- steps or re-running achievement triggers. A later manual source reassessment
-- below complete is respected as well.
do $$
declare
  _step_id bigint;
begin
  for _step_id in
    select priority.action_step_id
    from public.business_review_system_priorities priority
    join public.coaching_note_action_steps step on step.id = priority.action_step_id
    join public.business_reviews review on review.id = priority.business_review_id
    where step.status = 'complete'
    order by review.review_date, review.id, priority.action_step_id
  loop
    perform public.carry_priority_completion_to_next_review(_step_id);
  end loop;
end;
$$;

commit;
