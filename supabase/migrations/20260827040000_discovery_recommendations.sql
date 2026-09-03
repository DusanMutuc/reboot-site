begin;

create or replace function public.recommend_discovery_resources(
  _user_id uuid default null,
  _limit integer default 8
)
returns table (
  resource_id bigint,
  title text,
  description text,
  media_type text,
  url text,
  thumbnail text,
  duration integer,
  created_at timestamptz,
  open_path text,
  categories text[],
  tags jsonb,
  score real,
  reason_code text,
  matched_priority_count integer,
  matched_priority_labels text[],
  eligible_candidate_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  actor_id uuid := coalesce(_user_id, auth.uid());
  caller_role text := coalesce(auth.role(), '');
  resource_types constant text[] := array[
    'video', 'podcast', 'pdf', 'document', 'audio', 'image', 'link'
  ]::text[];
begin
  if actor_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if caller_role <> 'service_role' and auth.uid() is distinct from actor_id then
    raise exception 'A member can only request their own recommendations'
      using errcode = '42501';
  end if;

  if _limit < 1 or _limit > 24 then
    raise exception 'Recommendation limit is out of range'
      using errcode = '22023';
  end if;

  return query
  with recursive active_review as (
    select review.id
    from public.business_reviews review
    left join public.meetings meeting on meeting.id = review.meeting_id
    where review.user_id = actor_id
      and review.review_date <= current_date
      and coalesce(
        regexp_replace(lower(meeting.ghl_status), '[[:space:]_-]+', '', 'g'),
        ''
      ) not in ('cancelled', 'canceled', 'deleted', 'invalid', 'noshow')
    order by review.review_date desc, review.id desc
    limit 1
  ),
  active_priorities as (
    select
      priority.system_id as priority_id,
      priority.position,
      coalesce(nullif(btrim(action_step.label), ''), system.label) as priority_label,
      coalesce(action_step.library_item_id, system.library_item_id) as linked_node_id
    from active_review review
    join public.business_review_system_priorities priority
      on priority.business_review_id = review.id
    join public.system_scorecard_systems system
      on system.id = priority.system_id
    join public.coaching_note_action_steps action_step
      on action_step.id = priority.action_step_id
    where action_step.status <> 'complete'::public.action_step_status
  ),
  assigned_nodes(node_id) as (
    select priority.linked_node_id
    from active_priorities priority
    where priority.linked_node_id is not null

    union

    select child.child_id
    from public.node_children child
    join assigned_nodes assigned on assigned.node_id = child.parent_id
  ),
  assigned_resources as (
    select distinct location.resource_id
    from public.resource_block_locations location
    join assigned_nodes assigned on assigned.node_id = location.node_id
    where location.resource_id is not null
  ),
  priority_topics as (
    select distinct
      priority.priority_id,
      priority.position,
      priority.priority_label,
      tag.id as tag_id
    from active_priorities priority
    join public.content_node_tags node_tag
      on node_tag.node_id = priority.linked_node_id
    join public.tags tag on tag.id = node_tag.tag_id
    where tag.tag_kind = 'topic'
      and tag.is_active
  ),
  topic_signals as (
    select
      search.resource_id,
      search.title,
      search.description,
      search.media_type,
      search.url,
      search.thumbnail,
      search.duration,
      search.created_at,
      search.open_path,
      search.categories,
      search.tags,
      topic.priority_id,
      topic.position,
      topic.priority_label,
      'canonical_topic_overlap'::text as signal_reason,
      (100 + (4 - topic.position) * 3)::real as signal_weight,
      search.score as lexical_score
    from priority_topics topic
    cross join lateral public.search_discovery_items(
      actor_id,
      '',
      null,
      resource_types,
      array[topic.tag_id]::bigint[],
      null,
      null,
      'relevance',
      100,
      0,
      false
    ) search
    where search.resource_id is not null
  ),
  strict_label_signals as (
    select
      search.resource_id,
      search.title,
      search.description,
      search.media_type,
      search.url,
      search.thumbnail,
      search.duration,
      search.created_at,
      search.open_path,
      search.categories,
      search.tags,
      priority.priority_id,
      priority.position,
      priority.priority_label,
      'strict_priority_label'::text as signal_reason,
      (50 + (4 - priority.position) * 2)::real as signal_weight,
      search.score as lexical_score
    from active_priorities priority
    cross join lateral public.search_discovery_items(
      actor_id,
      priority.priority_label,
      null,
      resource_types,
      null,
      null,
      null,
      'relevance',
      100,
      0,
      false
    ) search
    where search.resource_id is not null
      and search.ranking_tier = 'strict'
  ),
  all_signals as (
    select * from topic_signals
    union all
    select * from strict_label_signals
  ),
  eligible_signals as (
    select signal.*
    from all_signals signal
    where not exists (
      select 1
      from assigned_resources assigned
      where assigned.resource_id = signal.resource_id
    )
      and not exists (
        select 1
        from public.user_resource_discovery_preferences preference
        where preference.user_id = actor_id
          and preference.resource_id = signal.resource_id
          and preference.preference in ('finished', 'not_interested')
      )
  ),
  aggregated as (
    select
      signal.resource_id,
      case
        when bool_or(signal.signal_reason = 'canonical_topic_overlap')
          then 'canonical_topic_overlap'::text
        else 'strict_priority_label'::text
      end as strongest_reason,
      count(distinct signal.priority_id)::integer as priority_count,
      array_agg(distinct signal.priority_label order by signal.priority_label) as priority_labels,
      (
        max(signal.signal_weight)
        + least(greatest(count(distinct signal.priority_id) - 1, 0), 2) * 12
        + coalesce(max(signal.lexical_score), 0)
      )::real as recommendation_score
    from eligible_signals signal
    group by signal.resource_id
  ),
  details as (
    select distinct on (signal.resource_id)
      signal.resource_id,
      signal.title,
      signal.description,
      signal.media_type,
      signal.url,
      signal.thumbnail,
      signal.duration,
      signal.created_at,
      signal.open_path,
      signal.categories,
      signal.tags
    from eligible_signals signal
    order by
      signal.resource_id,
      signal.signal_weight desc,
      signal.lexical_score desc,
      signal.priority_id
  ),
  candidates as (
    select
      details.*,
      aggregated.recommendation_score,
      aggregated.strongest_reason,
      aggregated.priority_count,
      aggregated.priority_labels,
      count(*) over () as candidate_count
    from details
    join aggregated on aggregated.resource_id = details.resource_id
  ),
  diversified as (
    select
      candidate.*,
      row_number() over (
        partition by candidate.media_type
        order by
          candidate.recommendation_score desc,
          candidate.created_at desc,
          candidate.resource_id desc
      ) as media_type_position
    from candidates candidate
  )
  select
    diversified.resource_id,
    diversified.title,
    diversified.description,
    diversified.media_type,
    diversified.url,
    diversified.thumbnail,
    diversified.duration,
    diversified.created_at,
    diversified.open_path,
    diversified.categories,
    diversified.tags,
    diversified.recommendation_score as score,
    diversified.strongest_reason as reason_code,
    diversified.priority_count as matched_priority_count,
    diversified.priority_labels as matched_priority_labels,
    diversified.candidate_count as eligible_candidate_count
  from diversified
  order by
    diversified.media_type_position,
    diversified.recommendation_score desc,
    diversified.created_at desc,
    diversified.resource_id desc
  limit _limit;
end
$function$;

revoke all on function public.recommend_discovery_resources(uuid, integer)
  from public, anon;
grant execute on function public.recommend_discovery_resources(uuid, integer)
  to authenticated, service_role;

comment on function public.recommend_discovery_resources(uuid, integer) is
  'Stable supplemental recommendations from current incomplete scorecard priorities: canonical guide-topic overlap first, strict priority-label search second. Assigned resources and explicit member feedback are excluded; opens and impressions are ignored.';

commit;
