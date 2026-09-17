begin;

-- Curators cannot judge whether an embedded resource works on its own without knowing
-- which guide it sits inside. R2 is explicit that file type does not settle it, so the
-- containing node travels with each catalogue row. Filters, pagination, progress counts
-- and the function signature are unchanged.
create or replace function public.admin_discovery_catalogue(_actor_id uuid, _kind text default 'resource', _q text default '',
  _media_type text default null, _filter text default 'all', _limit integer default 50, _offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  if _kind not in ('resource', 'guide') or _filter not in ('all', 'untagged', 'no_category', 'searchable_untagged', 'embedded', 'standalone', 'browse', 'hidden')
    or _limit not between 1 and 100 or _offset < 0 or length(_q) > 100 then
    raise exception 'Invalid catalogue filter or pagination' using errcode = '22023'; end if;
  with items as materialized (
    select r.id, 'resource'::text as kind, r.title, r.type as media_type, r.state, r.is_discoverable,
      r.is_browsable, r.discovery_open_mode, r.search_names,
      coalesce((select array_agg(rt.tag_id order by rt.tag_id) from public.resource_tags rt where rt.resource_id = r.id), '{}'::bigint[]) as tag_ids,
      exists(select 1 from public.content_blocks b where b.resource_id = r.id and b.block_type = 'asset') as embedded,
      placement.node_title as placement_title,
      placement.node_type as placement_type,
      coalesce((select count(*) from public.resource_block_locations b2 where b2.resource_id = r.id), 0) as placement_count
    from public.resources r
    left join public.resource_primary_location placement on placement.resource_id = r.id
    where _kind = 'resource'
    union all
    select n.id, 'guide', n.title, n.node_type, n.state, n.is_discoverable, false, 'context', n.search_names,
      coalesce((select array_agg(nt.tag_id order by nt.tag_id) from public.content_node_tags nt where nt.node_id = n.id), '{}'::bigint[]), false,
      null::text, null::text, 0::bigint
    from public.content_nodes n where _kind = 'guide' and n.node_type in ('lesson', 'chapter', 'course')
  ), enriched as materialized (
    select i.*, exists(select 1 from public.tags t where t.id = any(i.tag_ids) and t.is_active and t.tag_kind <> 'alias') as tagged,
      exists(select 1 from public.tags t where t.id = any(i.tag_ids) and t.is_active and t.tag_kind <> 'alias' and t.browse_category is not null) as has_category
    from items i
  ), filtered as materialized (
    select * from enriched i where (_q = '' or position(lower(_q) in lower(i.title)) > 0)
      and (_media_type is null or i.media_type = _media_type)
      and case _filter when 'untagged' then not i.tagged when 'no_category' then not i.has_category
        when 'searchable_untagged' then i.is_discoverable and not i.tagged when 'embedded' then i.embedded
        when 'standalone' then not i.embedded when 'browse' then i.is_browsable when 'hidden' then not i.is_discoverable else true end
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by lower(page.title), page.id) from
      (select * from filtered order by lower(title), id limit _limit offset _offset) page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'progress', (select jsonb_build_object('total', count(*), 'tagged', count(*) filter(where tagged),
      'categorized', count(*) filter(where has_category), 'browseApproved', count(*) filter(where is_browsable),
      'embedded', count(*) filter(where embedded), 'hidden', count(*) filter(where not is_discoverable)) from enriched)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_discovery_catalogue(uuid,text,text,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.admin_discovery_catalogue(uuid,text,text,text,text,integer,integer) to service_role;

commit;
