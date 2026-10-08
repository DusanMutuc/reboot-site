begin;

-- Membership is checked inside the database as well as in website middleware.
-- A revoked/merged account wins over every other role, including staff roles.
create function public.content_membership_kind(_user_id uuid)
returns text language sql stable security definer set search_path=pg_catalog,public as $$
  with codes as (
    select coalesce(array_agg(r.code), '{}'::text[]) as values
    from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=_user_id
  )
  select case
    when _user_id is null or not public.account_is_not_merged(_user_id)
      or 'past_member'=any(codes.values) then 'none'
    when codes.values && array['user','legend','assistant','coach','admin']::text[] then 'full'
    when 'ninety-day-user'=any(codes.values) and exists (
      select 1 from public.ninety_day_cycle_users cu
      join public.ninety_day_cycles c on c.id=cu.cycle_id
      where cu.user_id=_user_id and cu.ended_at is null and c.status='active'
    ) then 'programme'
    else 'none' end from codes;
$$;
revoke all on function public.content_membership_kind(uuid) from public,anon;
grant execute on function public.content_membership_kind(uuid) to authenticated,service_role;

-- These legacy SECURITY DEFINER mutators had no caller authorization and could
-- publish drafts or change sequencing through a direct anonymous/member RPC.
-- The builder uses guarded service APIs; nested node triggers run as their owner.
revoke all on function public.set_node_state(bigint,text), public.set_course_order(bigint[]),
  public.enforce_strict_sequence(bigint,boolean) from public,anon,authenticated;
grant execute on function public.set_node_state(bigint,text), public.set_course_order(bigint[]),
  public.enforce_strict_sequence(bigint,boolean) to service_role;

-- Legacy grants allowed clients to assign themselves roles or attach their role
-- to a limited course. Entitlement checks are ineffective unless these inputs
-- can only be changed by an active administrator (or the trusted service).
revoke insert,update,delete,truncate,references,trigger on public.roles,public.user_roles,public.content_node_roles from anon;
revoke truncate,references,trigger on public.roles,public.user_roles,public.content_node_roles from authenticated;
do $role_writes$
declare relation text;
begin
  foreach relation in array array['roles','user_roles','content_node_roles'] loop
    execute format('create policy entitlement_admin_insert on public.%I as restrictive for insert to authenticated
      with check (public.is_admin() and public.content_membership_kind(auth.uid())=''full'')',relation);
    execute format('create policy entitlement_admin_update on public.%I as restrictive for update to authenticated
      using (public.is_admin() and public.content_membership_kind(auth.uid())=''full'')
      with check (public.is_admin() and public.content_membership_kind(auth.uid())=''full'')',relation);
    execute format('create policy entitlement_admin_delete on public.%I as restrictive for delete to authenticated
      using (public.is_admin() and public.content_membership_kind(auth.uid())=''full'')',relation);
  end loop;
end $role_writes$;

-- Caller binding permits the service API and current staff's member progress views.
create function public.can_inspect_content_access(_user_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select _user_id is not null and (
    auth.role()='service_role' or auth.uid()=_user_id
    or (public.content_membership_kind(auth.uid())='full' and public.is_admin_or_coach())
  );
$$;
revoke all on function public.can_inspect_content_access(uuid) from public,anon;
grant execute on function public.can_inspect_content_access(uuid) to authenticated,service_role;

create or replace function public.can_user_access_course(p_user_id uuid,p_course_node_id bigint)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select public.can_inspect_content_access(coalesce(p_user_id,auth.uid())) and exists (
    select 1 from public.content_nodes c
    cross join lateral (select public.content_membership_kind(coalesce(p_user_id,auth.uid())) as kind) membership
    where c.id=p_course_node_id and c.node_type='course' and c.state='published'
      and (c.owner_id is null or c.owner_id=coalesce(p_user_id,auth.uid()))
      and (case when membership.kind='programme' then c.slug='set-your-compass'
        when membership.kind='full' then (
          c.visibility='public'::public.course_visibility
          or exists (select 1 from public.user_course_visibility v where v.user_id=coalesce(p_user_id,auth.uid()) and v.course_node_id=c.id)
          or exists (select 1 from public.content_node_roles nr join public.user_roles ur on ur.role_id=nr.role_id
            where nr.node_id=c.id and ur.user_id=coalesce(p_user_id,auth.uid()))
        ) else false end)
  );
$$;

-- Keep every published path. A draft first placement cannot conceal a second
-- published placement, and a published child cannot escape a draft ancestor.
create or replace function public.discovery_node_paths(_user_id uuid)
returns table(node_id bigint,root_id bigint,path_ids bigint[],open_path text,container_id bigint,container_path text)
language sql stable security definer set search_path=pg_catalog,public as $$
  with recursive membership as (
    select public.content_membership_kind(_user_id) as kind
  ), assigned_systems as (
    select s.node_id from public.ninety_day_cycle_users cu
    join public.ninety_day_cycles c on c.id=cu.cycle_id and c.status='active'
    join public.ninety_day_cycle_systems s on s.cycle_id=c.id
    where cu.user_id=_user_id and cu.ended_at is null
  ), paths as (
    select n.id,n.id as root_id,array[n.id] as path_ids,
      case when n.node_type='course' then '/courses/'||n.slug
        when n.slug='assistant-library' then '/assistant-library'
        when n.slug='legends-library' then '/legends-library' else '/library' end as open_path,
      case when n.node_type='course' then n.id else null::bigint end as container_id,
      case when n.node_type='course' then '/courses/'||n.slug else null::text end as container_path,
      n.node_type='course' as in_course
    from public.content_nodes n cross join membership m
    where m.kind<>'none' and n.state='published' and (n.owner_id is null or n.owner_id=_user_id)
      and nullif(n.slug,'') is not null
      and ((n.node_type='course' and public.can_user_access_course(_user_id,n.id))
        or (n.node_type='collection' and n.slug='library')
        or (n.node_type='collection' and n.slug='assistant-library' and public.is_assistant(_user_id))
        or (n.node_type='collection' and n.slug='legends-library' and exists (
          select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=_user_id and r.code='legend')))
    union all
    select n.id,p.root_id,p.path_ids||n.id,
      case when p.in_course then p.open_path||'/'||n.slug
        when root.slug='assistant-library' then '/assistant-library/'||n.slug
        when root.slug='legends-library' then '/legends-library/'||n.slug else '/library/'||n.slug end,
      case when n.node_type='lesson' then n.id else p.container_id end,
      case when n.node_type='lesson' then
        case when p.in_course then p.open_path||'/'||n.slug
          when root.slug='assistant-library' then '/assistant-library/'||n.slug
          when root.slug='legends-library' then '/legends-library/'||n.slug else '/library/'||n.slug end
        else p.container_path end,p.in_course
    from paths p join public.node_children edge on edge.parent_id=p.id
    join public.content_nodes n on n.id=edge.child_id join public.content_nodes root on root.id=p.root_id
    where n.state='published' and (n.owner_id is null or n.owner_id=_user_id)
      and n.node_type<>'course' and nullif(n.slug,'') is not null
      and not n.id=any(p.path_ids) and cardinality(p.path_ids)<64
  )
  select p.id,p.root_id,p.path_ids,p.open_path,p.container_id,p.container_path
  from paths p cross join membership m
  where m.kind='full' or p.in_course
    or exists (select 1 from assigned_systems s where s.node_id=any(p.path_ids));
$$;
revoke all on function public.discovery_node_paths(uuid) from public,anon,authenticated;

create or replace function public.can_access_discovery_node(_user_id uuid,_node_id bigint)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select public.can_inspect_content_access(_user_id) and public.content_membership_kind(_user_id)<>'none'
    and (exists (select 1 from public.discovery_node_paths(_user_id) p where p.node_id=_node_id)
      or (public.content_membership_kind(_user_id)='full' and exists (
        select 1 from public.content_nodes n where n.id=_node_id and n.node_type='playlist' and n.owner_id=_user_id)));
$$;

create or replace function public.can_user_access_node_via_course(p_user_id uuid,p_node_id bigint)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select public.can_inspect_content_access(coalesce(p_user_id,auth.uid())) and exists (
    select 1 from public.discovery_node_paths(coalesce(p_user_id,auth.uid())) p
    join public.content_nodes root on root.id=p.root_id
    where p.node_id=p_node_id and root.node_type='course'
  );
$$;

create or replace function public.can_access_discovery_resource(_user_id uuid,_resource_id bigint)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select public.can_inspect_content_access(_user_id) and public.content_membership_kind(_user_id)<>'none'
    and exists (select 1 from public.resources r where r.id=_resource_id and r.state='published'
      and ((public.content_membership_kind(_user_id)='full' and not exists (
        select 1 from public.content_blocks b where b.block_type='asset' and b.resource_id=r.id))
        or exists (select 1 from public.content_blocks b join public.discovery_node_paths(_user_id) p on p.node_id=b.node_id
          where b.block_type='asset' and b.resource_id=r.id)));
$$;

-- Preserve later discovery ranking/curation changes; patch only its final resource
-- entitlement. Refuse installation if the expected clause has drifted.
do $migration$
declare definition text; expected text := 'where resource.state = ''published''';
begin
  definition := pg_get_functiondef('public.search_discovery_catalogue(uuid,text,text,text[],bigint[],text,text,text,integer,integer,boolean,text)'::regprocedure);
  if position(expected in definition)=0 then raise exception 'Discovery resource entitlement prerequisite does not match'; end if;
  execute replace(definition,expected,expected||E'\n      and public.can_access_discovery_resource(actor_id, resource.id)');
end $migration$;

create or replace function public.get_available_courses_for_user(_user_id uuid)
returns table(id bigint,title text,slug text,description text,hero_image text,icon text,objectives text,metadata jsonb,sequential_unlock boolean)
language sql stable security definer set search_path=pg_catalog,public as $$
  select c.id,c.title,c.slug,c.description,c.hero_image,c.icon,c.objectives,c.metadata,c.sequential_unlock
  from public.content_nodes c where public.can_user_access_course(_user_id,c.id)
  order by c.title asc nulls last,c.id;
$$;

-- These restrictions intersect existing permissive policies, including admin
-- preview policies, without changing their grants or broadening their scope.
do $policies$
declare relation text;
begin
  foreach relation in array array['content_nodes','content_blocks','node_children','node_edge_rules',
    'content_node_roles','user_course_visibility','content_node_tags','resources','resource_tags','smart_docs','smart_doc_prompts','user_node_progress'] loop
    execute format('create policy content_membership_required on public.%I as restrictive for all to authenticated
      using (public.content_membership_kind(auth.uid()) <> ''none'')
      with check (public.content_membership_kind(auth.uid()) <> ''none'')',relation);
  end loop;
end $policies$;

create policy content_node_read_entitlement on public.content_nodes as restrictive for select to authenticated
  using (public.is_admin() or public.can_access_discovery_node(auth.uid(),id));
create policy content_block_read_entitlement on public.content_blocks as restrictive for select to authenticated
  using (public.is_admin() or public.can_access_discovery_node(auth.uid(),node_id));
create policy content_edge_read_entitlement on public.node_children as restrictive for select to authenticated
  using (public.is_admin() or (public.can_access_discovery_node(auth.uid(),parent_id) and public.can_access_discovery_node(auth.uid(),child_id)));
create policy resource_read_entitlement on public.resources as restrictive for select to authenticated
  using (public.is_admin() or public.can_access_discovery_resource(auth.uid(),id));
create policy content_progress_insert_entitlement on public.user_node_progress as restrictive for insert to authenticated
  with check (public.is_admin_or_coach() or public.can_access_discovery_node(auth.uid(),node_id));
create policy content_progress_update_entitlement on public.user_node_progress as restrictive for update to authenticated
  using (public.is_admin_or_coach() or public.can_access_discovery_node(auth.uid(),node_id))
  with check (public.is_admin_or_coach() or public.can_access_discovery_node(auth.uid(),node_id));

-- Already issued tokens cannot use private Storage to evade resource RLS. Public
-- buckets remain public; this applies to authenticated object access/signing.
create function public.can_access_content_storage(_user_id uuid,_bucket text,_name text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select public.can_inspect_content_access(_user_id) and public.content_membership_kind(_user_id)<>'none' and (
    (auth.uid()=_user_id and public.is_admin())
    or (_bucket in ('course-heroes','achievements') and not exists (
      select 1 from public.resources r where r.storage_bucket=_bucket and r.storage_path=_name))
    or exists (select 1 from public.resources r where r.storage_bucket=_bucket and r.storage_path=_name
      and public.can_access_discovery_resource(_user_id,r.id)));
$$;
revoke all on function public.can_access_content_storage(uuid,text,text) from public,anon;
grant execute on function public.can_access_content_storage(uuid,text,text) to authenticated,service_role;
create policy content_storage_membership on storage.objects as restrictive for select to authenticated
  using (public.can_access_content_storage(auth.uid(),bucket_id,name));

-- Only rendered children may hold up sequential unlocks.
-- The explicit admin builder retains its draft preview under a service-only RPC.
do $preview$
declare definition text;
begin
  definition := pg_get_functiondef('public.get_child_unlock_status(bigint,uuid)'::regprocedure);
  if position('FUNCTION public.get_child_unlock_status(' in definition)=0 then
    raise exception 'Unlock preview prerequisite does not match'; end if;
  execute replace(definition,'FUNCTION public.get_child_unlock_status(', 'FUNCTION public.get_child_unlock_status_admin_preview(');
end $preview$;
revoke all on function public.get_child_unlock_status_admin_preview(bigint,uuid) from public,anon,authenticated;
grant execute on function public.get_child_unlock_status_admin_preview(bigint,uuid) to service_role;

create or replace function public.get_child_unlock_status(_parent_id bigint,_user_id uuid default auth.uid())
returns table(child_id bigint,child_position integer,is_required boolean,locked boolean,reason text)
language sql stable security definer set search_path=pg_catalog,public as $$
  with parent as (
    select n.id,n.sequential_unlock from public.content_nodes n where n.id=_parent_id
      and n.state='published' and public.can_access_discovery_node(_user_id,n.id)
  ), kids as (
    select e.child_id,e.position,coalesce(e.is_required,false) as is_required
    from public.node_children e join public.content_nodes n on n.id=e.child_id join parent p on p.id=e.parent_id
    where n.state='published' and (n.owner_id is null or n.owner_id=_user_id)
  ), assessed as (
    select k.*,not exists (
      select 1 from kids previous left join public.user_node_progress progress
        on progress.node_id=previous.child_id and progress.user_id=_user_id
      where previous.position<k.position and previous.is_required and coalesce(progress.status::text,'')<>'completed'
    ) as previous_completed from kids k
  )
  select k.child_id,k.position,k.is_required,
    coalesce(p.sequential_unlock,true) and not k.previous_completed,
    case when p.sequential_unlock=false then 'sequential_unlock=false'
      when k.previous_completed then 'all_required_previous_completed' else 'waiting_for_required_previous' end
  from assessed k cross join parent p order by k.position;
$$;
alter function public.get_child_unlock_status_bulk(bigint[],uuid) set search_path=pg_catalog,public;

create or replace function public.get_user_course_completion_detail(_user_id uuid,_course_id integer)
returns table(node_id integer,parent_id integer,node_type text,title text,child_position integer,depth integer,
  path_positions text,status text,is_completed boolean)
language sql stable security definer set search_path=pg_catalog,public as $$
  with recursive tree as (
    select n.id,e.parent_id,e.position,1 as depth,lpad(e.position::text,5,'0') as positions,array[_course_id::bigint,n.id] as path
    from public.node_children e join public.content_nodes n on n.id=e.child_id
    where e.parent_id=_course_id and n.state='published' and (n.owner_id is null or n.owner_id=_user_id)
      and public.can_user_access_course(_user_id,_course_id)
    union all
    select n.id,e.parent_id,e.position,t.depth+1,t.positions||'.'||lpad(e.position::text,5,'0'),t.path||n.id
    from tree t join public.node_children e on e.parent_id=t.id join public.content_nodes n on n.id=e.child_id
    where n.state='published' and (n.owner_id is null or n.owner_id=_user_id)
      and not n.id=any(t.path) and cardinality(t.path)<64
  )
  select t.id::integer,t.parent_id::integer,n.node_type,n.title,t.position,t.depth,t.positions,
    coalesce(p.status::text,'not_started'),coalesce(p.status='completed',false)
  from tree t join public.content_nodes n on n.id=t.id
  left join public.user_node_progress p on p.node_id=t.id and p.user_id=_user_id
  where n.node_type in ('lesson','chapter') order by t.positions;
$$;

create or replace function public.get_user_course_progress(_user_id uuid,_course_id integer)
returns table(total_leaves integer,completed_leaves integer,progress numeric)
language sql stable security definer set search_path=pg_catalog,public as $$
  with recursive descendants as (
    select n.id,array[_course_id::bigint,n.id] as path
    from public.node_children e join public.content_nodes n on n.id=e.child_id
    where e.parent_id=_course_id and n.state='published' and (n.owner_id is null or n.owner_id=_user_id)
      and public.can_user_access_course(_user_id,_course_id)
    union all
    select n.id,d.path||n.id from descendants d join public.node_children e on e.parent_id=d.id
    join public.content_nodes n on n.id=e.child_id
    where n.state='published' and (n.owner_id is null or n.owner_id=_user_id)
      and not n.id=any(d.path) and cardinality(d.path)<64
  ), leaves as (
    select distinct d.id from descendants d where not exists (
      select 1 from public.node_children e join public.content_nodes n on n.id=e.child_id
      where e.parent_id=d.id and n.state='published' and (n.owner_id is null or n.owner_id=_user_id)
    )
  ), counts as (
    select count(*)::integer as total,count(p.node_id)::integer as completed from leaves l
    left join public.user_node_progress p on p.node_id=l.id and p.user_id=_user_id and p.status='completed'
  )
  select total,completed,case when total=0 then 0::numeric else completed::numeric/total end from counts;
$$;

-- Keep monotonic progress/timestamps from the existing implementation. Add the
-- missing access boundary before any insert performed by this definer RPC.
do $progress$
declare definition text;
begin
  definition := pg_get_functiondef('public.set_node_progress(bigint,public.node_progress_status)'::regprocedure);
  if position('begin' in definition)=0 or position('insert into public.user_node_progress' in definition)=0 then
    raise exception 'Progress write prerequisite does not match';
  end if;
  execute regexp_replace(definition,'begin',E'begin\n  if not public.can_access_discovery_node(auth.uid(), _node_id) then\n    raise exception ''Content is not available'' using errcode = ''42501'';\n  end if;');
end $progress$;

create or replace function public.mark_completed_and_cascade(_node_id bigint)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare lesson_parent_id bigint;
begin
  perform public.set_node_progress(_node_id,'completed'::public.node_progress_status);
  if not exists (select 1 from public.content_nodes where id=_node_id and node_type='chapter') then return; end if;
  -- Shared chapters may complete more than one accessible published lesson.
  for lesson_parent_id in select e.parent_id from public.node_children e join public.content_nodes p on p.id=e.parent_id
    where e.child_id=_node_id and p.node_type='lesson' and p.state='published'
      and public.can_access_discovery_node(auth.uid(),p.id)
  loop
    if not exists (
      select 1 from public.node_children e join public.content_nodes c on c.id=e.child_id
      left join public.user_node_progress p on p.node_id=c.id and p.user_id=auth.uid()
      where e.parent_id=lesson_parent_id and c.node_type='chapter' and c.state='published'
        and (c.owner_id is null or c.owner_id=auth.uid()) and coalesce(e.is_required,true)
        and coalesce(p.status::text,'')<>'completed'
    ) then perform public.set_node_progress(lesson_parent_id,'completed'::public.node_progress_status); end if;
  end loop;
end;
$$;

commit;
