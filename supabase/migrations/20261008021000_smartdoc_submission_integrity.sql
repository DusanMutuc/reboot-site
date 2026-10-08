-- Smart Doc submission and field writes share a response-row lock. These RPCs
-- remain SECURITY INVOKER so membership, content and archive RLS still apply.
begin;

-- A document can appear in several lessons. A draft placement must not unpublish
-- the same document from an existing published lesson. Keep the established
-- parent-driven publication behavior, taking every placement into account.
create or replace function public.cb_guard_smartdoc_publish_consistency()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  should_publish boolean;
begin
  if new.block_type = 'smart_doc' then
    select exists (
      select 1 from public.content_nodes n where n.id = new.node_id and n.state = 'published'
      union all
      select 1 from public.content_blocks cb join public.content_nodes n on n.id = cb.node_id
       where cb.smart_doc_id = new.smart_doc_id and cb.id <> new.id and n.state = 'published'
    ) into should_publish;
    update public.smart_docs d set is_published = should_publish, updated_at = now()
     where d.id = new.smart_doc_id and d.is_published is distinct from should_publish;
  end if;
  return new;
end;
$$;

-- State changes use this existing privileged subtree cascade. Preserve its
-- cascade and ACLs (restricted by the content-access migration), but derive each
-- affected document's publication from all placements after the node changes.
create or replace function public.set_node_state(_node_id bigint, _state text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_state text := public._validate_node_state(_state);
begin
  with recursive sub as (
    select cn.id from public.content_nodes cn where cn.id = _node_id
    union all
    select c2.id from public.node_children e
    join public.content_nodes c2 on c2.id = e.child_id
    join sub s on s.id = e.parent_id
  )
  update public.content_nodes n
     set state = v_state, updated_at = now()
   where n.id in (select id from sub);

  with recursive sub as (
    select cn.id from public.content_nodes cn where cn.id = _node_id
    union all
    select c2.id from public.node_children e
    join public.content_nodes c2 on c2.id = e.child_id
    join sub s on s.id = e.parent_id
  ), affected_docs as (
    select distinct sd.id as doc_id
    from public.content_blocks cb
    join public.smart_docs sd on sd.id = cb.smart_doc_id
    where cb.block_type = 'smart_doc' and cb.node_id in (select id from sub)
  )
  update public.smart_docs d
     set is_published = exists (
       select 1 from public.content_blocks placement
       join public.content_nodes n on n.id = placement.node_id
       where placement.block_type = 'smart_doc' and placement.smart_doc_id = d.id
         and n.state = 'published'
     ), updated_at = now()
   where d.id in (select doc_id from affected_docs);
end;
$$;

-- The coach workspace calls the two read RPCs directly. Their definer queries
-- must bind the requested owner to the caller before returning answers or even
-- response metadata. Existing responses remain readable by an assigned current
-- coach after content is retired; new placements follow the student's access.
create function public.can_read_smartdoc_instance(_user_id uuid, _content_block_id bigint)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  actor_id uuid := auth.uid();
  assigned_coach boolean := false;
begin
  if _user_id is null or not exists (select 1 from public.profiles p where p.id = _user_id) then return false; end if;
  if coalesce(auth.role(), '') = 'service_role' then return true; end if;
  if actor_id is null or public.content_membership_kind(actor_id) = 'none'
    or not public.account_setup_complete(actor_id) then return false; end if;
  if public.is_admin() then return true; end if;
  if actor_id <> _user_id then
    assigned_coach := public.has_role(array['coach']::text[]) and exists (
      select 1 from public.user_coaches uc
       where uc.coach_id = actor_id and uc.user_id = _user_id and uc.is_active
    );
    if not assigned_coach then return false; end if;
    if exists (select 1 from public.smart_doc_responses r
      where r.user_id = _user_id and r.content_block_id = _content_block_id) then return true; end if;
  end if;
  return exists (
    select 1 from public.content_blocks cb join public.smart_docs d on d.id = cb.smart_doc_id
     where cb.id = _content_block_id and cb.block_type = 'smart_doc' and d.is_published
       and public.can_access_discovery_node(_user_id, cb.node_id)
  );
end;
$$;
revoke all on function public.can_read_smartdoc_instance(uuid,bigint) from public,anon;
grant execute on function public.can_read_smartdoc_instance(uuid,bigint) to authenticated,service_role;

-- Preserve assigned-coach/admin review actions, but former, merged or pending
-- staff must not regain access through these privileged legacy RPCs.
create or replace function public.coach_reset_doc(_content_block_id bigint, _user_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or public.content_membership_kind(auth.uid()) = 'none'
    or not public.account_setup_complete(auth.uid()) or not (
      public.is_admin() or exists (
        select 1 from public.user_coaches uc where uc.coach_id = auth.uid()
          and uc.user_id = _user_id and uc.is_active
      )
    ) then raise exception 'Permission denied: not assigned coach' using errcode = '42501'; end if;
  update public.smart_doc_responses
     set status = 'draft', submitted_at = null, updated_at = now()
   where content_block_id = _content_block_id and user_id = _user_id;
end;
$$;

create or replace function public.coach_clear_field(_content_block_id bigint, _user_id uuid, _prompt_id bigint)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_response_id bigint;
begin
  if auth.uid() is null or public.content_membership_kind(auth.uid()) = 'none'
    or not public.account_setup_complete(auth.uid()) or not (
      public.is_admin() or exists (
        select 1 from public.user_coaches uc where uc.coach_id = auth.uid()
          and uc.user_id = _user_id and uc.is_active
      )
    ) then raise exception 'Permission denied: not assigned coach' using errcode = '42501'; end if;
  select r.id into v_response_id from public.smart_doc_responses r
   where r.content_block_id = _content_block_id and r.user_id = _user_id for update;
  if v_response_id is not null then
    delete from public.smart_doc_response_values v
     where v.response_id = v_response_id and v.prompt_id = _prompt_id;
    if found then
      update public.smart_doc_responses r
         set status = 'draft', submitted_at = null, updated_at = now()
       where r.id = v_response_id;
    end if;
  end if;
end;
$$;
revoke all on function public.coach_reset_doc(bigint,uuid), public.coach_clear_field(bigint,uuid,bigint) from public,anon;
grant execute on function public.coach_reset_doc(bigint,uuid), public.coach_clear_field(bigint,uuid,bigint) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_user_smartdoc_answers(_user_id uuid, _content_block_id bigint)
 RETURNS TABLE(doc_id bigint, doc_title text, prompt_id bigint, prompt_label text, prompt_type text, prompt_position integer, value_text text, value_json jsonb, updated_at timestamp with time zone, status text, submitted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with inst as (
  select cb.id as content_block_id, sd.id as doc_id, sd.title as doc_title
  from content_blocks cb
  join smart_docs sd on sd.id = cb.smart_doc_id
  where cb.id = _content_block_id and public.can_read_smartdoc_instance(_user_id, cb.id)
),
latest as (
  select r.*
  from smart_doc_responses r
  join inst i on i.content_block_id = r.content_block_id
  where r.user_id = _user_id
  order by coalesce(r.submitted_at, r.updated_at, r.started_at) desc
  limit 1
)
select
  i.doc_id,
  i.doc_title,
  p.id as prompt_id,
  p.label as prompt_label,
  p.prompt_type,
  p.position as prompt_position,  -- alias updated
  case
    when v.value_json is null then null
    else nullif(v.value_json #>> '{}','')
  end as value_text,
  v.value_json,
  coalesce(v.updated_at, l.updated_at, l.started_at) as updated_at,
  l.status,
  l.submitted_at
from inst i
join smart_doc_prompts p on p.doc_id = i.doc_id
left join latest l on true
left join smart_doc_response_values v
  on v.response_id = l.id and v.prompt_id = p.id
order by p.position nulls last, p.id;
$function$
;

CREATE OR REPLACE FUNCTION public.list_user_smartdoc_instances(_user_id uuid, _course_id bigint, _only_submitted boolean DEFAULT false)
 RETURNS TABLE(lesson_id bigint, lesson_title text, lesson_position integer, chapter_id bigint, chapter_title text, chapter_position integer, content_block_id bigint, doc_id bigint, doc_title text, status text, submitted_at timestamp with time zone, has_any_response boolean, answered_prompts integer, total_prompts integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with course as (
  select id, title
  from public.content_nodes
  where id = _course_id
    and node_type = 'course'
),
walk as (
  -- Traverse ALL descendants under the course, carrying nearest lesson/chapter.
  with recursive r as (
    select
      c.id as node_id,
      0::int as depth,
      0::int as pos,

      null::bigint as lesson_id,
      null::text   as lesson_title,
      null::int    as lesson_position,

      null::bigint as chapter_id,
      null::text   as chapter_title,
      null::int    as chapter_position
    from course c

    union all

    select
      child.id as node_id,
      r.depth + 1,
      nc.position as pos,

      case when child.node_type = 'lesson' then child.id    else r.lesson_id end,
      case when child.node_type = 'lesson' then child.title else r.lesson_title end,
      case when child.node_type = 'lesson' then nc.position else r.lesson_position end,

      case
        when child.node_type = 'lesson' then null
        when child.node_type = 'chapter' then child.id
        else r.chapter_id
      end,
      case
        when child.node_type = 'lesson' then null
        when child.node_type = 'chapter' then child.title
        else r.chapter_title
      end,
      case
        when child.node_type = 'lesson' then null
        when child.node_type = 'chapter' then nc.position
        else r.chapter_position
      end
    from r
    join public.node_children nc on nc.parent_id = r.node_id
    join public.content_nodes child on child.id = nc.child_id
  )
  select * from r
),
inst as (
  -- SmartDoc placements anywhere in the subtree.
  select
    coalesce(w.lesson_id, c.id) as lesson_id,
    coalesce(w.lesson_title, c.title) as lesson_title,
    coalesce(w.lesson_position, 0) as lesson_position,

    coalesce(
      w.chapter_id,
      case when w.lesson_id is null then c.id else w.lesson_id end
    ) as chapter_id,

    coalesce(
      w.chapter_title,
      case when w.lesson_id is null then 'Course-level' else 'Lesson-level' end
    ) as chapter_title,

    coalesce(w.chapter_position, 0) as chapter_position,

    cb.id as content_block_id,
    sd.id as doc_id,
    sd.title as doc_title
  from walk w
  cross join course c
  join public.content_blocks cb
    on cb.node_id = w.node_id
   and cb.block_type = 'smart_doc'
  join public.smart_docs sd
    on sd.id = cb.smart_doc_id
  where public.can_read_smartdoc_instance(_user_id, cb.id)
),
latest as (
  -- Latest response for this user per instance, but only for instances under this course.
  select distinct on (r.content_block_id)
    r.content_block_id,
    r.id as response_id,
    r.status,
    r.submitted_at,
    coalesce(r.submitted_at, r.updated_at, r.started_at) as ts
  from public.smart_doc_responses r
  join inst i on i.content_block_id = r.content_block_id
  where r.user_id = _user_id
  order by r.content_block_id, coalesce(r.submitted_at, r.updated_at, r.started_at) desc
),
prompt_counts as (
  select p.doc_id, count(*)::int as total_prompts
  from public.smart_doc_prompts p
  group by p.doc_id
),
answered as (
  select
    i.content_block_id,
    sum(
      case
        when v.value_json is null then 0
        when nullif(v.value_json #>> '{}', '') is null then 0
        else 1
      end
    )::int as answered_prompts
  from inst i
  join latest lr on lr.content_block_id = i.content_block_id
  join public.smart_doc_prompts p on p.doc_id = i.doc_id
  left join public.smart_doc_response_values v
    on v.response_id = lr.response_id
   and v.prompt_id = p.id
  group by i.content_block_id
)
select
  i.lesson_id, i.lesson_title, i.lesson_position,
  i.chapter_id, i.chapter_title, i.chapter_position,
  i.content_block_id,
  i.doc_id, i.doc_title,
  lr.status,
  lr.submitted_at,
  (lr.response_id is not null) as has_any_response,
  coalesce(a.answered_prompts, 0) as answered_prompts,
  coalesce(pc.total_prompts, 0) as total_prompts
from inst i
left join latest lr on lr.content_block_id = i.content_block_id
left join prompt_counts pc on pc.doc_id = i.doc_id
left join answered a on a.content_block_id = i.content_block_id
where (not _only_submitted) or (lr.status = 'submitted')
order by i.lesson_position, i.chapter_position, i.doc_title, i.content_block_id;
$function$
;

create or replace function public.get_smart_doc_progress(_content_block_id bigint, _user_id uuid)
returns table(fields_total integer, fields_completed integer)
language sql stable set search_path = public, pg_temp as $$
  with required as (
    select p.id
    from public.content_blocks cb
    join public.smart_docs d on d.id = cb.smart_doc_id
    join public.smart_doc_prompts p on p.doc_id = d.id
    where cb.id = _content_block_id and cb.block_type = 'smart_doc' and p.required
  ), answers as (
    select p.id, case
      when jsonb_typeof(v.value_json) = 'string' then v.value_json #>> '{}'
      when jsonb_typeof(v.value_json->'value') = 'string' then v.value_json->>'value'
      when jsonb_typeof(v.value_json->'text') = 'string' then v.value_json->>'text'
      else '' end as answer
    from required p
    join public.smart_doc_responses r on r.content_block_id = _content_block_id and r.user_id = _user_id
    join public.smart_doc_response_values v on v.response_id = r.id and v.prompt_id = p.id
  )
  select (select count(*)::integer from required),
    (select count(*)::integer from answers where btrim(answer, E' \t\n\r\f' || chr(11) || chr(160)) <> '');
$$;

create or replace function public.upsert_smart_field_value(
  _content_block_id bigint, _prompt_id bigint, _user_id uuid, _value jsonb)
returns table(fields_total integer, fields_completed integer)
language plpgsql set search_path = public, pg_temp as $$
declare
  response_id bigint;
begin
  if _user_id is null or (current_user not in ('postgres', 'service_role')
      and auth.uid() is distinct from _user_id) then
    raise exception using errcode = '42501', message = 'You can only save your own Smart Doc answers';
  end if;
  if not exists (
    select 1 from public.content_blocks cb
    join public.smart_docs d on d.id = cb.smart_doc_id
    join public.smart_doc_prompts p on p.doc_id = d.id
    where cb.id = _content_block_id and cb.block_type = 'smart_doc' and p.id = _prompt_id
  ) then
    raise exception using errcode = '42501', message = 'This Smart Doc question is not available';
  end if;
  if _value is null or jsonb_typeof(_value) <> 'string' then
    raise exception using errcode = '22023', message = 'Smart Doc answers must be text';
  end if;

  -- The unique key serializes creation as well as existing-response edits.
  insert into public.smart_doc_responses(content_block_id, user_id)
  values (_content_block_id, _user_id)
  on conflict (content_block_id, user_id) do update set updated_at = now()
  returning id into response_id;

  insert into public.smart_doc_response_values(response_id, prompt_id, value_json)
  values (response_id, _prompt_id, _value)
  on conflict on constraint smart_doc_response_values_pkey
    do update set value_json = excluded.value_json, updated_at = now();

  -- Editing a submitted answer requires a fresh validated submission. In
  -- particular, an empty replacement must never stay marked submitted.
  update public.smart_doc_responses r
     set status = 'draft', submitted_at = null, updated_at = now()
   where r.id = response_id;
  return query select p.fields_total, p.fields_completed
    from public.get_smart_doc_progress(_content_block_id, _user_id) p;
end;
$$;

create or replace function public.submit_smart_doc(_content_block_id bigint, _user_id uuid)
returns table(fields_total integer, fields_completed integer, status text, submitted_at timestamptz)
language plpgsql set search_path = public, pg_temp as $$
declare
  response_id bigint;
  total integer;
  completed integer;
  submitted_time timestamptz;
begin
  if _user_id is null or (current_user not in ('postgres', 'service_role')
      and auth.uid() is distinct from _user_id) then
    raise exception using errcode = '42501', message = 'You can only submit your own Smart Doc answers';
  end if;
  if not exists (
    select 1 from public.content_blocks cb
    join public.smart_docs d on d.id = cb.smart_doc_id
    where cb.id = _content_block_id and cb.block_type = 'smart_doc' and d.is_published
  ) then
    raise exception using errcode = '42501', message = 'This Smart Doc is not available for submission';
  end if;

  insert into public.smart_doc_responses(content_block_id, user_id)
  values (_content_block_id, _user_id)
  on conflict (content_block_id, user_id) do update set updated_at = now()
  returning id into response_id;

  select p.fields_total, p.fields_completed into total, completed
    from public.get_smart_doc_progress(_content_block_id, _user_id) p;
  if completed < total then
    raise exception using errcode = '22023', message = format(
      'Please answer every required question before submitting (%s of %s answered).', completed, total);
  end if;

  update public.smart_doc_responses r
     set status = 'submitted', submitted_at = coalesce(r.submitted_at, now()), updated_at = now()
   where r.id = response_id
   returning r.submitted_at into submitted_time;
  return query select total, completed, 'submitted'::text, submitted_time;
end;
$$;

revoke all on function public.submit_smart_doc(bigint, uuid) from public, anon;
revoke all on function public.upsert_smart_field_value(bigint, bigint, uuid, jsonb) from public, anon;
revoke all on function public.get_user_smartdoc_answers(uuid,bigint) from public,anon;
revoke all on function public.list_user_smartdoc_instances(uuid,bigint,boolean) from public,anon;
grant execute on function public.submit_smart_doc(bigint, uuid) to authenticated, service_role;
grant execute on function public.upsert_smart_field_value(bigint, bigint, uuid, jsonb) to authenticated, service_role;
grant execute on function public.get_user_smartdoc_answers(uuid,bigint) to authenticated,service_role;
grant execute on function public.list_user_smartdoc_instances(uuid,bigint,boolean) to authenticated,service_role;

commit;

