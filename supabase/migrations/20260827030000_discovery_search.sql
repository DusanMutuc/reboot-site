begin;

-- Guides use the same weighted lexical vocabulary as resources. Canonical
-- tags are visible in filters; active aliases are folded into tag_text only.
alter table public.content_nodes
  add column tag_text text,
  add column tsv_discovery tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(tag_text, '')), 'B')
    || setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored;

create index content_nodes_tsv_discovery_idx
  on public.content_nodes using gin (tsv_discovery);

create or replace function public.refresh_content_node_tag_text(_node_id bigint)
returns void
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  refreshed_text text;
begin
  with direct_tags as (
    select tag.id, tag.name, tag.canonical_tag_id
    from public.content_node_tags node_tag
    join public.tags tag on tag.id = node_tag.tag_id
    where node_tag.node_id = _node_id
  ),
  expanded_terms as (
    select direct.name
    from direct_tags direct

    union

    select canonical.name
    from direct_tags direct
    join public.tags canonical on canonical.id = direct.canonical_tag_id
    where canonical.is_active

    union

    select alias.name
    from direct_tags direct
    join public.tags alias
      on alias.canonical_tag_id = coalesce(direct.canonical_tag_id, direct.id)
    where alias.tag_kind = 'alias'
      and alias.is_active
  )
  select string_agg(lower(term.name), ' ' order by lower(term.name))
  into refreshed_text
  from expanded_terms term;

  update public.content_nodes
  set tag_text = refreshed_text
  where id = _node_id;
end
$function$;

create or replace function public.refresh_content_node_tag_text_from_assignment()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_content_node_tag_text(old.node_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and new.node_id is distinct from old.node_id then
    perform public.refresh_content_node_tag_text(old.node_id);
  end if;

  perform public.refresh_content_node_tag_text(new.node_id);

  return new;
end
$function$;

create trigger trg_content_node_tags_refresh_search_text
after insert or update or delete on public.content_node_tags
for each row execute function public.refresh_content_node_tag_text_from_assignment();

-- Expand the existing tag-change hook so renaming a canonical tag or alias
-- refreshes both resource and guide search documents.
create or replace function public._tags_after_change_refresh_dependents()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  root_ids bigint[] := '{}'::bigint[];
  affected_resource_id bigint;
  affected_node_id bigint;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    root_ids := array_append(root_ids, coalesce(old.canonical_tag_id, old.id));
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    root_ids := array_append(root_ids, coalesce(new.canonical_tag_id, new.id));
  end if;

  for affected_resource_id in
    select distinct resource_tag.resource_id
    from public.resource_tags resource_tag
    join public.tags assigned on assigned.id = resource_tag.tag_id
    where coalesce(assigned.canonical_tag_id, assigned.id) = any(root_ids)
  loop
    perform public.refresh_tag_text(affected_resource_id);
  end loop;

  for affected_node_id in
    select distinct node_tag.node_id
    from public.content_node_tags node_tag
    join public.tags assigned on assigned.id = node_tag.tag_id
    where coalesce(assigned.canonical_tag_id, assigned.id) = any(root_ids)
  loop
    perform public.refresh_content_node_tag_text(affected_node_id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$function$;

do $refresh_existing_content_node_tag_text$
declare
  node_row record;
begin
  for node_row in select id from public.content_nodes loop
    perform public.refresh_content_node_tag_text(node_row.id);
  end loop;
end
$refresh_existing_content_node_tag_text$;

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
    where node.node_type = 'lesson'
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

revoke all on function public.search_discovery_items(
  uuid, text, text, text[], bigint[], text, text, text, integer, integer, boolean
) from public, anon;
grant execute on function public.search_discovery_items(
  uuid, text, text, text[], bigint[], text, text, text, integer, integer, boolean
) to authenticated, service_role;

comment on function public.search_discovery_items(
  uuid, text, text, text[], bigint[], text, text, text, integer, integer, boolean
) is
  'Unified discoverable resource-and-guide search. Strict results always precede a separately labelled related pass.';

commit;
