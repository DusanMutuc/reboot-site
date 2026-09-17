-- One authority for placement decisions.
--
-- resources.discovery_reviewed_at was built for the placement question and works for it, but two
-- writable sources cannot both be right: token checking, evidence and staleness all assume one.
-- discovery_decisions becomes authoritative. The old columns are kept for read compatibility and
-- are no longer written by the job workflow.

-- Migrate existing placement reviews. Evidence is generated here, server-side, exactly as a fresh
-- decision would generate it, so a migrated review is immediately comparable for staleness.
insert into public.discovery_decisions (item_kind, item_id, question, answer, decided_at,
  decided_by, decided_label, evidence)
select 'resource', r.id, 'placement',
  case when r.discovery_open_mode = 'direct' then 'direct' else 'context' end,
  r.discovery_reviewed_at, r.discovery_reviewed_by,
  coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Migrated from review history'),
  public.discovery_evidence('resource', r.id, 'placement')
from public.resources r
left join public.profiles p on p.id = r.discovery_reviewed_by
where r.discovery_reviewed_at is not null
on conflict (item_kind, item_id, question) do nothing;

-- The old trigger cleared discovery_reviewed_at whenever open mode changed. That behaviour now
-- lives in supersede_discovery_decision, which deletes the decision row instead. Keeping both
-- would leave two mechanisms claiming to own the same fact.
drop trigger if exists resources_discovery_review_change on public.resources;

comment on column public.resources.discovery_reviewed_at is
  'DEPRECATED as the placement authority — see public.discovery_decisions (question = placement). '
  'Retained for read compatibility only; the discovery jobs no longer write it.';
comment on column public.resources.discovery_reviewed_by is
  'DEPRECATED alongside discovery_reviewed_at. See public.discovery_decisions.decided_by.';

-- admin_update_discovery_items keeps working for the Topics tab and the resource library, but must
-- stop writing the deprecated review columns: a decision recorded there would be invisible to the
-- queue, and one recorded by the queue would be silently contradicted here.
--
-- _review_status is dropped from the signature. Placement decisions are recorded only through
-- admin_record_discovery_decision, which writes the setting and the decision atomically.
drop function if exists public.admin_update_discovery_items(uuid,bigint[],bigint[],bigint[],text,text,text,text[],text);
create function public.admin_update_discovery_items(_actor_id uuid, _resource_ids bigint[] default '{}',
  _node_ids bigint[] default '{}', _tag_ids bigint[] default null, _tag_action text default 'add',
  _visibility text default null, _open_mode text default null, _search_names text[] default null)
returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare total integer;
begin
  perform public.assert_discovery_editor(_actor_id);
  perform pg_advisory_xact_lock(60831, 300);
  if _resource_ids is null or _node_ids is null then raise exception 'Select explicit item IDs' using errcode = '22023'; end if;
  _resource_ids := array(select distinct unnest(_resource_ids));
  _node_ids := array(select distinct unnest(_node_ids));
  total := cardinality(_resource_ids) + cardinality(_node_ids);
  if total not between 1 and 100 then raise exception 'Select between 1 and 100 items' using errcode = '22023'; end if;
  if exists(select 1 from unnest(_resource_ids) s(id) where s.id is null or not exists(select 1 from public.resources r where r.id = s.id))
    or exists(select 1 from unnest(_node_ids) s(id) where s.id is null or not exists(select 1 from public.content_nodes n where n.id = s.id)) then
    raise exception 'One or more selected items no longer exist' using errcode = '22023'; end if;
  if _tag_action is null or _tag_action not in ('add', 'remove', 'replace')
    or (_visibility is not null and _visibility not in ('hidden', 'search_only', 'browse'))
    or (_open_mode is not null and _open_mode not in ('context', 'direct')) then
    raise exception 'Invalid discovery update' using errcode = '22023'; end if;
  if cardinality(_node_ids) > 0 and (_visibility = 'browse' or _open_mode is not null) then
    raise exception 'Guides cannot be approved for homepage browse or standalone resource presentation' using errcode = '22023'; end if;
  if _search_names is not null and total <> 1 then raise exception 'Alternate names belong to one specific item' using errcode = '22023'; end if;
  if _tag_ids is not null then
    if cardinality(_tag_ids) > 100 or exists(select 1 from unnest(_tag_ids) s(id) where s.id is null
      or not exists(select 1 from public.tags t where t.id = s.id and (_tag_action = 'remove' or (t.is_active and t.tag_kind = 'topic')))) then
      raise exception 'Choose existing active canonical tag IDs' using errcode = '22023'; end if;
    if _tag_action in ('remove', 'replace') then
      delete from public.resource_tags rt where rt.resource_id = any(_resource_ids)
        and case when _tag_action = 'remove' then rt.tag_id = any(_tag_ids)
          else not rt.tag_id = any(_tag_ids) and exists(select 1 from public.tags t where t.id = rt.tag_id and t.tag_kind = 'topic') end;
      delete from public.content_node_tags nt where nt.node_id = any(_node_ids)
        and case when _tag_action = 'remove' then nt.tag_id = any(_tag_ids)
          else not nt.tag_id = any(_tag_ids) and exists(select 1 from public.tags t where t.id = nt.tag_id and t.tag_kind = 'topic') end;
    end if;
    if _tag_action in ('add', 'replace') then
      insert into public.resource_tags(resource_id, tag_id) select r, t from unnest(_resource_ids) r cross join unnest(_tag_ids) t on conflict do nothing;
      insert into public.content_node_tags(node_id, tag_id) select n, t from unnest(_node_ids) n cross join unnest(_tag_ids) t on conflict do nothing;
    end if;
  end if;
  -- These edits are deliberately NOT exempt from supersession: an edit made outside the job
  -- removes the decision that was made inside it, which is the whole point of the rule.
  update public.resources set
    is_discoverable = case when _visibility is null then is_discoverable else _visibility <> 'hidden' end,
    is_browsable = case when _visibility is null then is_browsable else _visibility = 'browse' end,
    discovery_open_mode = coalesce(_open_mode, discovery_open_mode),
    search_names = coalesce(_search_names, search_names)
  where id = any(_resource_ids);
  update public.content_nodes set
    is_discoverable = case when _visibility is null then is_discoverable else _visibility <> 'hidden' end,
    search_names = coalesce(_search_names, search_names)
  where id = any(_node_ids);
  return total;
end;
$$;
revoke all on function public.admin_update_discovery_items(uuid,bigint[],bigint[],bigint[],text,text,text,text[]) from public, anon, authenticated;
grant execute on function public.admin_update_discovery_items(uuid,bigint[],bigint[],bigint[],text,text,text,text[]) to service_role;

-- search_discovery_items hardcoded node_type = 'lesson'. Lessons AND whole courses are searchable
-- types; chapters are not. Widening it is what makes "allow in search" truthful for a course.
do $$
declare fn record; body text;
begin
  for fn in select p.oid, pg_get_functiondef(p.oid) as def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_discovery_items'
  loop
    body := replace(fn.def, 'node.node_type = ''lesson''', 'node.node_type in (''lesson'', ''course'')');
    body := replace(body, 'n.node_type = ''lesson''', 'n.node_type in (''lesson'', ''course'')');
    if body is distinct from fn.def then execute body; end if;
  end loop;
end $$;
-- admin_discovery_catalogue still powers the Topics tab and the resource library. Its three
-- review filters read discovery_reviewed_at, which the jobs no longer write — leaving them would
-- make the filters silently wrong. They now read the authority.
create or replace function public.admin_discovery_catalogue(_actor_id uuid, _kind text default 'resource', _q text default '',
  _media_type text default null, _filter text default 'all', _limit integer default 50, _offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  if _kind not in ('resource', 'guide') or _filter not in ('all', 'untagged', 'no_category', 'searchable_untagged', 'embedded', 'standalone', 'browse', 'hidden', 'needs_review', 'reviewed_context', 'reviewed_direct')
    or _limit not between 1 and 100 or _offset < 0 or length(_q) > 100 then
    raise exception 'Invalid catalogue filter or pagination' using errcode = '22023'; end if;
  with items as materialized (
    select r.id, 'resource'::text as kind, r.title, r.type as media_type, r.state, r.is_discoverable,
      r.is_browsable, r.discovery_open_mode, r.search_names, r.discovery_reviewed_at,
      (select d.answer from public.discovery_decisions d
        where d.item_kind = 'resource' and d.item_id = r.id and d.question = 'placement') as placement_answer,
      coalesce((select array_agg(rt.tag_id order by rt.tag_id) from public.resource_tags rt where rt.resource_id = r.id), '{}'::bigint[]) as tag_ids,
      exists(select 1 from public.content_blocks b where b.resource_id = r.id and b.block_type = 'asset') as embedded,
      placement.node_title as placement_title, placement.node_type as placement_type,
      coalesce((select count(*) from public.resource_block_locations b2 where b2.resource_id = r.id), 0) as placement_count
    from public.resources r left join public.resource_primary_location placement on placement.resource_id = r.id
    where _kind = 'resource'
    union all
    select n.id, 'guide', n.title, n.node_type, n.state, n.is_discoverable, false, 'context', n.search_names, null::timestamptz,
      null::text,
      coalesce((select array_agg(nt.tag_id order by nt.tag_id) from public.content_node_tags nt where nt.node_id = n.id), '{}'::bigint[]), false,
      null::text, null::text, 0::bigint
    from public.content_nodes n where _kind = 'guide' and n.node_type in ('lesson', 'chapter', 'course')
  ), enriched as materialized (
    select i.*, exists(select 1 from public.tags t where t.id = any(i.tag_ids) and t.is_active and t.tag_kind = 'topic') as tagged,
      exists(select 1 from public.tags t where t.id = any(i.tag_ids) and t.is_active and t.tag_kind <> 'alias' and t.browse_category is not null) as has_category
    from items i
  ), filtered as materialized (
    select * from enriched i where (_q = '' or position(lower(_q) in lower(i.title)) > 0)
      and (_media_type is null or i.media_type = _media_type)
      and case _filter when 'untagged' then not i.tagged when 'no_category' then not i.has_category
        when 'searchable_untagged' then i.is_discoverable and not i.tagged when 'embedded' then i.embedded
        when 'needs_review' then i.embedded and i.placement_answer is null
        when 'reviewed_context' then i.embedded and i.placement_answer = 'context'
        when 'reviewed_direct' then i.embedded and i.placement_answer = 'direct'
        when 'standalone' then not i.embedded when 'browse' then i.is_browsable when 'hidden' then not i.is_discoverable else true end
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by lower(page.title), page.id) from
      (select * from filtered order by lower(title), id limit _limit offset _offset) page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'progress', (select jsonb_build_object('total', count(*), 'tagged', count(*) filter(where tagged),
      'categorized', count(*) filter(where has_category), 'browseApproved', count(*) filter(where is_browsable),
      'embedded', count(*) filter(where embedded), 'needsReview', count(*) filter(where embedded and placement_answer is null),
      'hidden', count(*) filter(where not is_discoverable)) from enriched)
  ) into result;
  return result;
end;
$$;
