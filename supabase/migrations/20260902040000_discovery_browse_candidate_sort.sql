-- Ordering for the homepage browse picker.
--
-- Alphabetical is the wrong default for the question people actually bring to this list: "has
-- anything arrived that I should consider?" A resource added yesterday sorts between two from 2024
-- and is invisible. Newest-first answers that in a glance.
--
-- This deliberately does NOT turn "ready to add" into a backlog. It stays a pool you pick from —
-- there is no completion here, and coverage per category remains the signal that something is
-- missing. Sorting only makes the pool scannable.
drop function if exists public.admin_discovery_browse_candidates(uuid,text,text,integer,integer);
create or replace function public.admin_discovery_browse_candidates(_actor_id uuid, _view text default 'ready',
  _q text default '', _limit integer default 60, _offset integer default 0, _sort text default 'newest')
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  if _view not in ('ready','blocked') or _sort not in ('newest','title')
    or _limit not between 1 and 200 or _offset < 0 or length(coalesce(_q,'')) > 120 then
    raise exception 'Invalid candidate request' using errcode = '22023'; end if;

  with candidates as materialized (
    select i.*, r.created_at,
      public.discovery_browse_blocker(i.state, i.is_discoverable, i.embedded, i.discovery_open_mode,
        exists(select 1 from public.discovery_decisions d
          where d.item_kind = 'resource' and d.item_id = i.id and d.question = 'placement')) as blocker
    from public.discovery_job_items i
    join public.resources r on r.id = i.id
    where i.kind = 'resource' and not i.is_browsable
  ), scoped as (
    select * from candidates c
    where (case _view when 'ready' then c.blocker is null else c.blocker is not null end)
      and (coalesce(_q,'') = '' or position(lower(_q) in lower(c.title)) > 0)
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(x) order by x.ord) from (
        select s.kind, s.id, s.title, s.media_type, s.state, s.duration, s.embedded, s.blocker,
          s.created_at as "createdAt",
          row_number() over (order by
            case when _sort = 'newest' then s.created_at end desc nulls last,
            lower(s.title), s.id) as ord,
          (select n.title from public.content_blocks b join public.content_nodes n on n.id = b.node_id
            where b.resource_id = s.id and b.block_type = 'asset' order by b.node_id, b.position limit 1) as guide
        from scoped s
        order by
          case when _sort = 'newest' then s.created_at end desc nulls last,
          lower(s.title), s.id
        limit _limit offset _offset) x), '[]'::jsonb),
    'total', (select count(*) from scoped),
    'readyTotal', (select count(*) from candidates where blocker is null),
    'blockedTotal', (select count(*) from candidates where blocker is not null),
    'blockerCounts', coalesce((select jsonb_object_agg(blocker, n) from
      (select blocker, count(*) as n from candidates where blocker is not null group by blocker) b), '{}'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_discovery_browse_candidates(uuid,text,text,integer,integer,text) from public, anon, authenticated;
grant execute on function public.admin_discovery_browse_candidates(uuid,text,text,integer,integer,text) to service_role;
