begin;

-- Search eligibility is retained during the additive rollout. Browse inclusion
-- requires review; publishing an item alone never approves a homepage card.
alter table public.resources
  add column is_browsable boolean not null default false,
  add constraint resources_browsable_requires_searchable
    check (not is_browsable or is_discoverable);

comment on column public.resources.is_discoverable is
  'Eligible for discovery search, subject to publication and member access. Does not imply homepage browse.';
comment on column public.resources.is_browsable is
  'Reviewed supplementary material eligible for homepage browse and algorithmic recommendations. Requires search eligibility.';

create index resources_browse_catalog_idx
  on public.resources (catalog_priority desc, created_at desc, id desc)
  where state = 'published' and is_discoverable and is_browsable;

create or replace function public.search_discovery_items_for_surface(
  _user_id uuid default null,
  _q text default '',
  _browse_category text default null,
  _types text[] default null,
  _tag_ids bigint[] default null,
  _duration text default null,
  _date_range text default null,
  _sort text default 'relevance',
  _limit integer default 24,
  _offset integer default 0,
  _include_related boolean default true,
  _surface text default 'search'
)
returns table (
  item_type text,
  resource_id bigint,
  content_node_id bigint,
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
  ranking_tier text,
  score real,
  total_match_count bigint,
  eligible_candidate_count bigint,
  match_reason_codes text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  actor_id uuid := coalesce(_user_id, auth.uid());
  caller_role text := coalesce(auth.role(), '');
  normalized_sort text := lower(coalesce(nullif(btrim(_sort), ''), 'relevance'));
begin
  if actor_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if caller_role <> 'service_role' and auth.uid() is distinct from actor_id then
    raise exception 'A member can only search their own accessible catalogue'
      using errcode = '42501';
  end if;

  if _browse_category is not null
     and _browse_category not in ('marketing', 'systems', 'hiring', 'mindset') then
    raise exception 'Unknown browse category %', _browse_category
      using errcode = '22023';
  end if;

  if normalized_sort not in (
    'relevance', 'newest', 'oldest', 'title_asc', 'title_desc',
    'duration_asc', 'duration_desc', 'date_desc', 'date_asc',
    'alpha_asc', 'alpha_desc'
  ) then
    raise exception 'Unknown discovery sort %', _sort
      using errcode = '22023';
  end if;

  if _limit < 1 or _limit > 100 or _offset < 0 then
    raise exception 'Discovery pagination is out of range'
      using errcode = '22023';
  end if;

  if _surface is null or _surface not in ('search', 'browse') then
    raise exception 'Unknown discovery surface %', _surface
      using errcode = '22023';
  end if;

  return query
  with params as (
    select
      btrim(coalesce(_q, '')) as q_raw,
      lower(regexp_replace(btrim(coalesce(_q, '')), '[[:space:]]+', ' ', 'g')) as q_lc
  ),
  query_parts as (
    select
      params.*,
      array_remove(
        regexp_split_to_array(
          regexp_replace(params.q_lc, '[^[:alnum:]]+', ' ', 'g'),
          '[[:space:]]+'
        ),
        ''
      ) as terms
    from params
  ),
  queries as (
    select
      query_parts.*,
      case
        when q_lc = '' then null::tsquery
        else websearch_to_tsquery('english', q_raw)
      end as web_query,
      case
        when coalesce(array_length(terms, 1), 0) = 0 then null::tsquery
        else to_tsquery(
          'simple',
          array_to_string(
            array(select quote_literal(term) || ':*' from unnest(terms) term),
            ' & '
          )
        )
      end as prefix_query,
      case
        when coalesce(array_length(terms, 1), 0) = 0 then null::tsquery
        else to_tsquery(
          'simple',
          array_to_string(
            array(select quote_literal(term) from unnest(terms) term),
            ' | '
          )
        )
      end as related_query,
      case when char_length(q_lc) <= 6 then 0.24 else 0.32 end as title_similarity_floor,
      case when char_length(q_lc) <= 6 then 0.20 else 0.27 end as related_similarity_floor
    from query_parts
  ),
  visible_course_ids as (
    select available.course_node_id
    from public.get_available_course_ids_for_user(actor_id) available
  ),
  eligible_resources as (
    select
      'resource'::text as item_type,
      resource.id as resource_id,
      null::bigint as content_node_id,
      resource.title,
      resource.description,
      resource.type as media_type,
      resource.url,
      resource.thumbnail,
      resource.duration,
      resource.created_at,
      coalesce(primary_location.open_path, resource.url) as open_path,
      coalesce(tag_summary.categories, '{}'::text[]) as categories,
      coalesce(tag_summary.tags, '[]'::jsonb) as tags,
      resource.tag_text,
      resource.tsv_all as search_vector,
      to_tsvector('simple',
        coalesce(resource.title, '') || ' '
        || coalesce(resource.tag_text, '') || ' '
        || coalesce(resource.description, '')
      ) as simple_vector,
      resource.catalog_priority
    from public.resources resource
    left join public.resource_primary_location primary_location
      on primary_location.resource_id = resource.id
    left join lateral (
      select
        coalesce(
          array_agg(distinct tag.browse_category)
            filter (where tag.browse_category is not null),
          '{}'::text[]
        ) as categories,
        coalesce(
          jsonb_agg(
            distinct jsonb_build_object(
              'id', tag.id,
              'name', tag.name,
              'kind', tag.tag_kind,
              'browseCategory', tag.browse_category
            )
          ) filter (where tag.tag_kind <> 'alias' and tag.is_active),
          '[]'::jsonb
        ) as tags
      from public.resource_tags resource_tag
      join public.tags tag on tag.id = resource_tag.tag_id
      where resource_tag.resource_id = resource.id
    ) tag_summary on true
    where resource.state = 'published'
      and resource.is_discoverable
      and (_surface = 'search' or resource.is_browsable)
      and (
        not exists (
          select 1
          from public.resource_block_locations location
          where location.resource_id = resource.id
        )
        or exists (
          select 1
          from public.resource_block_locations location
          where location.resource_id = resource.id
            and (
              not exists (
                select 1
                from public.get_containing_course_ids(location.node_id) containing
              )
              or exists (
                select 1
                from public.get_containing_course_ids(location.node_id) containing
                join visible_course_ids visible
                  on visible.course_node_id = containing.course_node_id
              )
            )
        )
      )
      and (_types is null or resource.type = any(_types))
      and (_tag_ids is null or exists (
        select 1
        from public.resource_tags filtered_tag
        where filtered_tag.resource_id = resource.id
          and filtered_tag.tag_id = any(_tag_ids)
      ))
      and (_browse_category is null or _browse_category = any(coalesce(tag_summary.categories, '{}'::text[])))
      and (
        _duration is null
        or _duration = 'all'
        or (_duration = 'short' and resource.duration is not null and resource.duration < 600)
        or (_duration = 'medium' and resource.duration is not null and resource.duration between 600 and 1800)
        or (_duration = 'long' and resource.duration is not null and resource.duration > 1800)
      )
      and (
        _date_range is null
        or _date_range = 'all'
        or (_date_range = '30' and resource.created_at >= now() - interval '30 days')
        or (_date_range = '90' and resource.created_at >= now() - interval '90 days')
      )
  ),
  eligible_guides as (
    select
      'guide'::text as item_type,
      null::bigint as resource_id,
      node.id as content_node_id,
      node.title,
      node.description,
      'guide'::text as media_type,
      null::text as url,
      node.hero_image as thumbnail,
      null::integer as duration,
      node.created_at,
      public.resolve_content_node_open_path(node.id) as open_path,
      coalesce(tag_summary.categories, '{}'::text[]) as categories,
      coalesce(tag_summary.tags, '[]'::jsonb) as tags,
      node.tag_text,
      node.tsv_discovery as search_vector,
      to_tsvector('simple',
        coalesce(node.title, '') || ' '
        || coalesce(node.tag_text, '') || ' '
        || coalesce(node.description, '')
      ) as simple_vector,
      node.catalog_priority
    from public.content_nodes node
    left join lateral (
      select
        coalesce(
          array_agg(distinct tag.browse_category)
            filter (where tag.browse_category is not null),
          '{}'::text[]
        ) as categories,
        coalesce(
          jsonb_agg(
            distinct jsonb_build_object(
              'id', tag.id,
              'name', tag.name,
              'kind', tag.tag_kind,
              'browseCategory', tag.browse_category
            )
          ) filter (where tag.tag_kind <> 'alias' and tag.is_active),
          '[]'::jsonb
        ) as tags
      from public.content_node_tags node_tag
      join public.tags tag on tag.id = node_tag.tag_id
      where node_tag.node_id = node.id
    ) tag_summary on true
    where _surface = 'search'
      and node.node_type = 'lesson'
      and node.state = 'published'
      and node.is_discoverable
      and (node.owner_id is null or node.owner_id = actor_id)
      and (
        not exists (
          select 1
          from public.get_containing_course_ids(node.id) containing
        )
        or exists (
          select 1
          from public.get_containing_course_ids(node.id) containing
          join visible_course_ids visible
            on visible.course_node_id = containing.course_node_id
        )
      )
      and (_types is null or 'guide' = any(_types))
      and (_tag_ids is null or exists (
        select 1
        from public.content_node_tags filtered_tag
        where filtered_tag.node_id = node.id
          and filtered_tag.tag_id = any(_tag_ids)
      ))
      and (_browse_category is null or _browse_category = any(coalesce(tag_summary.categories, '{}'::text[])))
      and (_duration is null or _duration = 'all')
      and (
        _date_range is null
        or _date_range = 'all'
        or (_date_range = '30' and node.created_at >= now() - interval '30 days')
        or (_date_range = '90' and node.created_at >= now() - interval '90 days')
      )
  ),
  eligible as (
    select * from eligible_resources
    union all
    select * from eligible_guides
  ),
  assessed as (
    select
      eligible.*,
      queries.q_lc,
      queries.web_query,
      queries.prefix_query,
      queries.related_query,
      (
        queries.q_lc = ''
        or eligible.search_vector @@ queries.web_query
        or eligible.simple_vector @@ queries.prefix_query
        or lower(eligible.title) like '%' || queries.q_lc || '%'
        or similarity(lower(eligible.title), queries.q_lc) >= queries.title_similarity_floor
      ) as strict_match,
      (
        queries.q_lc <> ''
        and _include_related
        and (
          eligible.simple_vector @@ queries.related_query
          or word_similarity(lower(coalesce(eligible.tag_text, '')), queries.q_lc)
              >= queries.related_similarity_floor
          or word_similarity(lower(coalesce(eligible.description, '')), queries.q_lc)
              >= queries.related_similarity_floor
        )
      ) as broad_match,
      coalesce(ts_rank(eligible.search_vector, queries.web_query), 0)
        + case
            when queries.q_lc <> '' and lower(eligible.title) = queries.q_lc then 1.20
            when queries.q_lc <> '' and lower(eligible.title) like queries.q_lc || '%' then 0.80
            when queries.q_lc <> '' and lower(eligible.title) like '%' || queries.q_lc || '%' then 0.50
            else 0
          end
        + case when eligible.simple_vector @@ queries.prefix_query then 0.35 else 0 end
        + case
            when queries.q_lc <> '' and lower(coalesce(eligible.tag_text, '')) like '%' || queries.q_lc || '%'
              then 0.45
            else 0
          end
        + greatest(similarity(lower(eligible.title), queries.q_lc), 0) * 0.70
        + greatest(word_similarity(lower(coalesce(eligible.tag_text, '')), queries.q_lc), 0) * 0.45
        + greatest(word_similarity(lower(coalesce(eligible.description, '')), queries.q_lc), 0) * 0.15
        + eligible.catalog_priority * 0.005 as computed_score,
      array_remove(array[
        case when queries.q_lc <> '' and lower(eligible.title) = queries.q_lc then 'exact_title' end,
        case when queries.q_lc <> '' and lower(eligible.title) like queries.q_lc || '%' then 'title_prefix' end,
        case when queries.web_query is not null and eligible.search_vector @@ queries.web_query then 'lexical' end,
        case when queries.prefix_query is not null and eligible.simple_vector @@ queries.prefix_query then 'term_prefix' end,
        case when queries.q_lc <> '' and lower(coalesce(eligible.tag_text, '')) like '%' || queries.q_lc || '%' then 'canonical_topic' end,
        case when queries.related_query is not null and eligible.simple_vector @@ queries.related_query then 'related_term' end
      ], null) as reason_codes
    from eligible
    cross join queries
  ),
  matched as (
    select
      assessed.*,
      case when assessed.strict_match then 'strict'::text else 'related'::text end as tier
    from assessed
    where assessed.strict_match
       or (not assessed.strict_match and assessed.broad_match)
  ),
  counted as (
    select
      matched.*,
      count(*) over () as all_match_count,
      (select count(*) from eligible) as all_eligible_count
    from matched
  )
  select
    counted.item_type,
    counted.resource_id,
    counted.content_node_id,
    counted.title,
    counted.description,
    counted.media_type,
    counted.url,
    counted.thumbnail,
    counted.duration,
    counted.created_at,
    counted.open_path,
    counted.categories,
    counted.tags,
    counted.tier as ranking_tier,
    counted.computed_score::real as score,
    counted.all_match_count as total_match_count,
    counted.all_eligible_count as eligible_candidate_count,
    counted.reason_codes as match_reason_codes
  from counted
  order by
    case when normalized_sort = 'relevance' and counted.tier = 'strict' then 0 else 1 end,
    case when normalized_sort = 'relevance' then counted.computed_score end desc nulls last,
    case when normalized_sort in ('newest', 'date_desc') then counted.created_at end desc,
    case when normalized_sort in ('oldest', 'date_asc') then counted.created_at end asc,
    case when normalized_sort in ('title_asc', 'alpha_asc') then lower(counted.title) end asc,
    case when normalized_sort in ('title_desc', 'alpha_desc') then lower(counted.title) end desc,
    case when normalized_sort = 'duration_asc' then counted.duration end asc nulls last,
    case when normalized_sort = 'duration_desc' then counted.duration end desc nulls last,
    counted.catalog_priority desc,
    counted.created_at desc,
    counted.item_type,
    coalesce(counted.resource_id, counted.content_node_id) desc
  limit _limit
  offset _offset;
end
$function$;

revoke all on function public.search_discovery_items_for_surface(
  uuid, text, text, text[], bigint[], text, text, text, integer, integer, boolean, text
) from public, anon;
grant execute on function public.search_discovery_items_for_surface(
  uuid, text, text, text[], bigint[], text, text, text, integer, integer, boolean, text
) to authenticated, service_role;

create or replace function public.search_discovery_items(
  _user_id uuid default null,
  _q text default '',
  _browse_category text default null,
  _types text[] default null,
  _tag_ids bigint[] default null,
  _duration text default null,
  _date_range text default null,
  _sort text default 'relevance',
  _limit integer default 24,
  _offset integer default 0,
  _include_related boolean default true
)
returns table (
  item_type text,
  resource_id bigint,
  content_node_id bigint,
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
  ranking_tier text,
  score real,
  total_match_count bigint,
  eligible_candidate_count bigint,
  match_reason_codes text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  -- Preserve the existing search RPC signature. All eligibility and access
  -- checks stay in the shared surface-aware query.
  return query
  select *
  from public.search_discovery_items_for_surface(
    _user_id, _q, _browse_category, _types, _tag_ids, _duration, _date_range,
    _sort, _limit, _offset, _include_related, 'search'
  );
end
$function$;

comment on function public.search_discovery_items_for_surface(
  uuid, text, text, text[], bigint[], text, text, text, integer, integer, boolean, text
) is 'Search includes eligible resources and guides; browse includes only explicitly approved resources. Eligibility precedes counts, ranking, and pagination.';

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
    cross join lateral public.search_discovery_items_for_surface(
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
      false,
      'browse'
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
    cross join lateral public.search_discovery_items_for_surface(
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
      false,
      'browse'
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

-- Opening discovery is not opening the structured guide library. Existing
-- historical events remain untouched; new navigation uses a distinct event.
alter table public.discovery_events
  drop constraint discovery_events_type_valid,
  add constraint discovery_events_type_valid check (event_type in (
    'result_set_shown', 'item_impression', 'item_open', 'full_library_opened',
    'discovery_opened', 'category_selected', 'filter_changed', 'sort_changed',
    'search_reformulated', 'search_cleared', 'search_dismissed', 'tab_session_ended',
    'feedback_finished', 'feedback_not_interested'
  ));

commit;

