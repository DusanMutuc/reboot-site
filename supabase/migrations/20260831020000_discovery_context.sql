begin;

-- This is permission to present an embedded item on its own, not a media-type
-- classification. Existing records retain context until somebody reviews them.
alter table public.resources add column discovery_open_mode text not null default 'context'
  check (discovery_open_mode in ('context', 'direct'));

-- Internal path inventory. Start at an accessible learning root and require
-- publication/ownership at EVERY hop. Keep all valid paths until the caller
-- selects a placement; a restricted first parent must not mask a public second.
create function public.discovery_node_paths(_user_id uuid)
returns table(node_id bigint, root_id bigint, path_ids bigint[], open_path text,
  container_id bigint, container_path text)
language sql stable security definer set search_path = pg_catalog, public
as $$
  with recursive paths as (
    select n.id, n.id as root_id, array[n.id] as path_ids,
      case when n.node_type = 'course' then '/courses/' || n.slug
           when n.slug = 'assistant-library' then '/assistant-library'
           else '/library' end as open_path,
      case when n.node_type = 'course' then n.id else null::bigint end as container_id,
      case when n.node_type = 'course' then '/courses/' || n.slug else null::text end as container_path,
      n.node_type = 'course' as in_course
    from public.content_nodes n
    where _user_id is not null and n.state = 'published'
      and (n.owner_id is null or n.owner_id = _user_id)
      and nullif(n.slug, '') is not null
      and (
        (n.node_type = 'course' and public.can_user_access_course(_user_id, n.id))
        or (n.node_type = 'collection' and n.slug = 'library')
        or (n.node_type = 'collection' and n.slug = 'assistant-library'
            and public.is_assistant(_user_id))
      )
    union all
    select n.id, p.root_id, p.path_ids || n.id,
      case when p.in_course then p.open_path || '/' || n.slug
           when root.slug = 'assistant-library' then '/assistant-library/' || n.slug
           else '/library/' || n.slug end,
      case when n.node_type = 'lesson' then n.id else p.container_id end,
      case when n.node_type = 'lesson' then
        case when p.in_course then p.open_path || '/' || n.slug
             when root.slug = 'assistant-library' then '/assistant-library/' || n.slug
             else '/library/' || n.slug end
        else p.container_path end,
      p.in_course
    from paths p
    join public.node_children edge on edge.parent_id = p.id
    join public.content_nodes n on n.id = edge.child_id
    join public.content_nodes root on root.id = p.root_id
    where n.state = 'published' and (n.owner_id is null or n.owner_id = _user_id)
      and n.node_type <> 'course' and nullif(n.slug, '') is not null
      and not n.id = any(p.path_ids) and cardinality(p.path_ids) < 64
  )
  select id, root_id, path_ids, open_path, container_id, container_path from paths;
$$;
revoke all on function public.discovery_node_paths(uuid) from public, anon, authenticated;

-- The service API uses this same check as resource RLS. Discovery flags do not
-- grant/revoke learning access: hidden resources still work inside allowed guides.
create function public.can_access_discovery_resource(_user_id uuid, _resource_id bigint)
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$
  select _user_id is not null
    and (auth.role() = 'service_role' or auth.uid() = _user_id)
    and exists (
      select 1 from public.resources r where r.id = _resource_id and r.state = 'published'
      and (
        not exists (select 1 from public.content_blocks b where b.block_type = 'asset' and b.resource_id = r.id)
        or exists (
          select 1 from public.content_blocks b
          join public.discovery_node_paths(_user_id) p on p.node_id = b.node_id
          where b.block_type = 'asset' and b.resource_id = r.id
        )
      )
    );
$$;
revoke all on function public.can_access_discovery_resource(uuid, bigint) from public, anon;
grant execute on function public.can_access_discovery_resource(uuid, bigint) to authenticated, service_role;

drop policy resources_members_read on public.resources;
create policy resources_members_read on public.resources for select to authenticated
  using (public.can_access_discovery_resource(auth.uid(), id));

-- Library loaders use a service client, so they need an explicit, caller-bound
-- inventory rather than relying on that client's bypassed RLS.
create function public.accessible_discovery_nodes(_user_id uuid default null)
returns table(node_id bigint, root_id bigint, open_path text)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare actor uuid := coalesce(_user_id, auth.uid());
begin
  if actor is null or (coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from actor) then
    raise exception 'Cannot inspect another member access' using errcode = '42501';
  end if;
  return query select distinct p.node_id, p.root_id, p.open_path from public.discovery_node_paths(actor) p;
end;
$$;
revoke all on function public.accessible_discovery_nodes(uuid) from public, anon;
grant execute on function public.accessible_discovery_nodes(uuid) to authenticated, service_role;

create function public.can_access_discovery_node(_user_id uuid, _node_id bigint)
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$
  select _user_id is not null
    and (auth.role() = 'service_role' or auth.uid() = _user_id)
    and (exists (select 1 from public.discovery_node_paths(_user_id) p where p.node_id = _node_id)
      or exists (select 1 from public.content_nodes n where n.id = _node_id
        and n.node_type = 'playlist' and n.owner_id = _user_id));
$$;
revoke all on function public.can_access_discovery_node(uuid, bigint) from public, anon;
grant execute on function public.can_access_discovery_node(uuid, bigint) to authenticated, service_role;
drop policy cn_members_read on public.content_nodes;
create policy cn_members_read on public.content_nodes for select to authenticated
  using (public.can_access_discovery_node(auth.uid(), id));

-- These read-only views must not expose parent titles through their owner's RLS
-- bypass. Discovery no longer uses their global "primary" placement decision.
alter view public.resource_block_locations set (security_invoker = true);
alter view public.resource_primary_location set (security_invoker = true);

create function public.discovery_resource_contexts(_user_id uuid, _resource_ids bigint[])
returns table(resource_id bigint, container_id bigint, container_title text, container_path text)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
begin
  if _user_id is null or (coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from _user_id) then
    raise exception 'Cannot inspect another member access' using errcode = '42501';
  end if;
  return query
    select distinct on (b.resource_id) b.resource_id, n.id, n.title, p.container_path
    from public.content_blocks b
    join public.resources r on r.id = b.resource_id and r.state = 'published'
    join public.discovery_node_paths(_user_id) p on p.node_id = b.node_id
    join public.content_nodes n on n.id = p.container_id
    where b.block_type = 'asset' and b.resource_id = any(_resource_ids)
    order by b.resource_id, (p.open_path like '/library/%') desc, cardinality(p.path_ids), p.open_path, b.id;
end;
$$;
revoke all on function public.discovery_resource_contexts(uuid, bigint[]) from public, anon;
grant execute on function public.discovery_resource_contexts(uuid, bigint[]) to authenticated, service_role;

-- Context-aware search is appended below; legacy RPC signatures are retained.
create or replace function public.search_discovery_catalogue(
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
  match_reason_codes text[],
  container_id bigint,
  container_title text,
  container_path text
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
  accessible_paths as materialized (
    select * from public.discovery_node_paths(actor_id)
  ),
  placements as (
    select distinct on (b.resource_id) b.resource_id, p.container_id, p.container_path
    from public.content_blocks b
    join accessible_paths p on p.node_id = b.node_id
    where b.block_type = 'asset'
    order by b.resource_id, (p.open_path like '/library/%') desc,
      cardinality(p.path_ids), p.open_path, b.id
  ),
  eligible_resources as (
    select
      case when presentation.in_context then 'guide' else 'resource' end::text as item_type,
      case when presentation.in_context then null else resource.id end as resource_id,
      case when presentation.in_context then container.id else null end as content_node_id,
      case when presentation.in_context then container.title else resource.title end as title,
      case when presentation.in_context then container.description else resource.description end as description,
      case when presentation.in_context then 'guide' else resource.type end as media_type,
      null::text as url,
      case when presentation.in_context then container.hero_image else resource.thumbnail end as thumbnail,
      case when presentation.in_context then null else resource.duration end as duration,
      case when presentation.in_context then container.created_at else resource.created_at end as created_at,
      case when presentation.in_context then placement.container_path else '/r/' || resource.id end as open_path,
      coalesce(tag_summary.categories, '{}'::text[]) as categories,
      coalesce(tag_summary.tags, '[]'::jsonb) as tags,
      resource.tag_text,
      resource.tsv_all as search_vector,
      to_tsvector('simple',
        coalesce(resource.title, '') || ' '
        || coalesce(resource.tag_text, '') || ' '
        || coalesce(resource.description, '')
      ) as simple_vector,
      resource.catalog_priority,
      resource.title as match_title,
      case when presentation.in_context then null else container.id end as container_id,
      case when presentation.in_context then null else container.title end as container_title,
      case when presentation.in_context then null else placement.container_path end as container_path
    from public.resources resource
    left join placements placement on placement.resource_id = resource.id
    left join public.content_nodes container on container.id = placement.container_id
    cross join lateral (
      select exists (
        select 1 from public.content_blocks b where b.resource_id = resource.id and b.block_type = 'asset'
      ) as has_placement
    ) membership
    cross join lateral (
      select membership.has_placement and resource.discovery_open_mode = 'context' as in_context
    ) presentation
    left join lateral (
      select
        coalesce(
          array_agg(distinct tag.browse_category)
            filter (where tag.browse_category is not null and tag.is_active and tag.tag_kind <> 'alias'),
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
      and (not membership.has_placement or placement.resource_id is not null)
      and (not presentation.in_context or (
        _surface = 'search' and container.node_type = 'lesson' and container.is_discoverable
      ))
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
      path.open_path,
      coalesce(tag_summary.categories, '{}'::text[]) as categories,
      coalesce(tag_summary.tags, '[]'::jsonb) as tags,
      node.tag_text,
      node.tsv_discovery as search_vector,
      to_tsvector('simple',
        coalesce(node.title, '') || ' '
        || coalesce(node.tag_text, '') || ' '
        || coalesce(node.description, '')
      ) as simple_vector,
      node.catalog_priority,
      node.title as match_title,
      null::bigint as container_id, null::text as container_title, null::text as container_path
    from public.content_nodes node
    join lateral (
      select p.open_path from accessible_paths p where p.node_id = node.id
      order by (p.open_path like '/library/%') desc, cardinality(p.path_ids), p.open_path limit 1
    ) path on true
    left join lateral (
      select
        coalesce(
          array_agg(distinct tag.browse_category)
            filter (where tag.browse_category is not null and tag.is_active and tag.tag_kind <> 'alias'),
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
        or lower(eligible.match_title) like '%' || queries.q_lc || '%'
        or similarity(lower(eligible.match_title), queries.q_lc) >= queries.title_similarity_floor
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
            when queries.q_lc <> '' and lower(eligible.match_title) = queries.q_lc then 1.20
            when queries.q_lc <> '' and lower(eligible.match_title) like queries.q_lc || '%' then 0.80
            when queries.q_lc <> '' and lower(eligible.match_title) like '%' || queries.q_lc || '%' then 0.50
            else 0
          end
        + case when eligible.simple_vector @@ queries.prefix_query then 0.35 else 0 end
        + case
            when queries.q_lc <> '' and lower(coalesce(eligible.tag_text, '')) like '%' || queries.q_lc || '%'
              then 0.45
            else 0
          end
        + greatest(similarity(lower(eligible.match_title), queries.q_lc), 0) * 0.70
        + greatest(word_similarity(lower(coalesce(eligible.tag_text, '')), queries.q_lc), 0) * 0.45
        + greatest(word_similarity(lower(coalesce(eligible.description, '')), queries.q_lc), 0) * 0.15
        + eligible.catalog_priority * 0.005 as computed_score,
      array_remove(array[
        case when queries.q_lc <> '' and lower(eligible.match_title) = queries.q_lc then 'exact_title' end,
        case when queries.q_lc <> '' and lower(eligible.match_title) like queries.q_lc || '%' then 'title_prefix' end,
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
  unique_matches as (
    select distinct on (m.item_type, coalesce(m.resource_id, m.content_node_id)) m.*
    from matched m
    order by m.item_type, coalesce(m.resource_id, m.content_node_id),
      (m.tier = 'strict') desc, m.computed_score desc, m.match_title
  ),
  counted as (
    select unique_matches.*, count(*) over () as all_match_count,
      (select count(distinct (e.item_type, coalesce(e.resource_id, e.content_node_id))) from eligible e) as all_eligible_count
    from unique_matches
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
    counted.reason_codes as match_reason_codes,
    counted.container_id, counted.container_title, counted.container_path
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
language sql security definer set search_path = pg_catalog, public as $$
  select result.item_type, result.resource_id, result.content_node_id, result.title, result.description, result.media_type, result.url, result.thumbnail, result.duration, result.created_at, result.open_path, result.categories, result.tags, result.ranking_tier, result.score, result.total_match_count, result.eligible_candidate_count, result.match_reason_codes
  from public.search_discovery_catalogue(_user_id, _q, _browse_category, _types, _tag_ids, _duration, _date_range,
    _sort, _limit, _offset, _include_related, _surface) result;
$$;

revoke all on function public.search_discovery_catalogue(uuid,text,text,text[],bigint[],text,text,text,integer,integer,boolean,text) from public, anon;
grant execute on function public.search_discovery_catalogue(uuid,text,text,text[],bigint[],text,text,text,integer,integer,boolean,text) to authenticated, service_role;

commit;
