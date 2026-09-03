-- Job queues, decision writes and the browse collection.
--
-- Queue membership is ALWAYS "entry condition AND (no current answer OR stale answer)". It is
-- never "no decision row", which would sweep every legitimately tagged item into the topics queue.

-- One row per item the discovery jobs can govern. Chapters, collections and playlists are absent:
-- a chapter is a structural grouping, not a search result, so it is neither a topic target nor a
-- visibility item.
create or replace view public.discovery_job_items as
  select 'resource'::text as kind, r.id, r.title, coalesce(r.description,'') as description,
    r.type as media_type, r.state, r.is_discoverable, r.is_browsable, r.discovery_open_mode,
    r.duration, (coalesce(r.thumbnail,'') <> '') as has_thumbnail, coalesce(r.url,'') as url,
    exists(select 1 from public.content_blocks b where b.resource_id = r.id and b.block_type = 'asset') as embedded,
    exists(select 1 from public.resource_tags rt join public.tags t on t.id = rt.tag_id
      where rt.resource_id = r.id and t.is_active and t.tag_kind = 'topic') as has_topics
  from public.resources r
  union all
  select 'node', n.id, n.title, coalesce(n.description,''), n.node_type, n.state, n.is_discoverable,
    false, 'context', null::integer, false, '',
    false,
    exists(select 1 from public.content_node_tags nt join public.tags t on t.id = nt.tag_id
      where nt.node_id = n.id and t.is_active and t.tag_kind = 'topic')
  from public.content_nodes n where n.node_type in ('lesson','course');

revoke all on public.discovery_job_items from public, anon, authenticated;
grant select on public.discovery_job_items to service_role;

comment on view public.discovery_job_items is
  'Items the discovery jobs govern: all resources, plus lessons and courses. Chapters, collections '
  'and playlists are excluded — a chapter is not a search result, a topic target or a visibility item.';

-- Entry condition per question, expressed once.
create or replace function public.discovery_entry_condition(_question text, _kind text, _has_topics boolean,
  _embedded boolean, _is_discoverable boolean)
returns boolean language sql immutable set search_path = pg_catalog, public as $$
  select case _question
    when 'topics'     then not _has_topics
    when 'placement'  then _kind = 'resource' and _embedded
    when 'visibility' then not _is_discoverable
    else false end;
$$;
revoke all on function public.discovery_entry_condition(text,text,boolean,boolean,boolean) from public, anon, authenticated;

-- Queue rows with staleness resolved. Staleness is recomputed server-side and returned as a flag;
-- the client never sees the evidence and never decides what is stale.
create or replace function public.discovery_queue_rows(_question text)
returns table (kind text, id bigint, title text, description text, media_type text, state text,
  is_discoverable boolean, is_browsable boolean, discovery_open_mode text, duration integer,
  has_thumbnail boolean, url text, embedded boolean, has_topics boolean,
  answer text, token uuid, decided_at timestamptz, decided_label text, stale boolean,
  eligible boolean, needs boolean, decided boolean)
language sql stable security definer set search_path = pg_catalog, public as $$
  select i.kind, i.id, i.title, i.description, i.media_type, i.state, i.is_discoverable,
    i.is_browsable, i.discovery_open_mode, i.duration, i.has_thumbnail, i.url, i.embedded, i.has_topics,
    d.answer, d.token, d.decided_at, d.decided_label,
    (d.answer is not null and d.evidence is distinct from public.discovery_evidence(i.kind, i.id, _question)) as stale,
    public.discovery_entry_condition(_question, i.kind, i.has_topics, i.embedded, i.is_discoverable) as eligible,
    (d.answer is null and public.discovery_entry_condition(_question, i.kind, i.has_topics, i.embedded, i.is_discoverable))
      or (d.answer is not null and d.evidence is distinct from public.discovery_evidence(i.kind, i.id, _question)) as needs,
    (d.answer is not null and d.evidence is not distinct from public.discovery_evidence(i.kind, i.id, _question)) as decided
  from public.discovery_job_items i
  left join public.discovery_decisions d
    on d.item_kind = i.kind and d.item_id = i.id and d.question = _question
  where _question <> 'placement' or i.kind = 'resource';
$$;
revoke all on function public.discovery_queue_rows(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Landing counts. No progress bar: the model denies a finish line, so this returns the
-- work outstanding and the stable population, never a percentage.
-- ---------------------------------------------------------------------------
create or replace function public.admin_discovery_job_counts(_actor_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  select jsonb_build_object(
    'topics', (select jsonb_build_object(
        'needs', count(*) filter (where q.needs),
        'decided', count(*) filter (where q.decided),
        'population', count(*) filter (where q.needs or q.decided),
        'resources', count(*) filter (where q.needs and q.kind = 'resource'),
        'lessons', count(*) filter (where q.needs and q.kind = 'node' and q.media_type = 'lesson'),
        'courses', count(*) filter (where q.needs and q.kind = 'node' and q.media_type = 'course'))
      from public.discovery_queue_rows('topics') q),
    'topicsByFormat', (select coalesce(jsonb_object_agg(media_type, n), '{}'::jsonb)
      from (select q.media_type, count(*) as n from public.discovery_queue_rows('topics') q
            where q.needs group by q.media_type) s),
    'placement', (select jsonb_build_object(
        'needs', count(*) filter (where q.needs),
        'decided', count(*) filter (where q.decided),
        'population', count(*) filter (where q.needs or q.decided))
      from public.discovery_queue_rows('placement') q),
    'placementByFormat', (select coalesce(jsonb_object_agg(media_type, n), '{}'::jsonb)
      from (select q.media_type, count(*) as n from public.discovery_queue_rows('placement') q
            where q.needs group by q.media_type) s),
    'visibility', (select jsonb_build_object(
        'needs', count(*) filter (where q.needs),
        'decided', count(*) filter (where q.decided),
        'population', count(*) filter (where q.needs or q.decided),
        'lessons', count(*) filter (where q.needs and q.kind = 'node'),
        'resources', count(*) filter (where q.needs and q.kind = 'resource'))
      from public.discovery_queue_rows('visibility') q),
    -- Chapters are outside every job. Reported so the landing screen can say so rather than
    -- leaving an admin to wonder where 20 hidden chapters went.
    'hiddenChaptersExcluded', (select count(*) from public.content_nodes n
      where n.node_type = 'chapter' and not n.is_discoverable),
    'browse', (select jsonb_build_object(
        'approved', count(*) filter (where r.is_browsable),
        'ready', count(*) filter (where not r.is_browsable and r.state = 'published' and r.is_discoverable
          and (not i.embedded or r.discovery_open_mode = 'direct')),
        'blocked', count(*) filter (where not r.is_browsable and not (r.state = 'published' and r.is_discoverable
          and (not i.embedded or r.discovery_open_mode = 'direct'))))
      from public.resources r join public.discovery_job_items i on i.kind = 'resource' and i.id = r.id),
    -- The diagnostic that is not a job: nothing on the Content tab can change it.
    'categoryDiagnostic', jsonb_build_object(
      'topicsTotal', (select count(*) from public.tags where tag_kind = 'topic' and is_active),
      'topicsWithCategory', (select count(*) from public.tags where tag_kind = 'topic' and is_active and browse_category is not null),
      'itemsWithoutCategory', (select count(*) from public.resources r where not exists(
        select 1 from public.resource_tags rt join public.tags t on t.id = rt.tag_id
        where rt.resource_id = r.id and t.is_active and t.browse_category is not null)))
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_discovery_job_counts(uuid) from public, anon, authenticated;
grant execute on function public.admin_discovery_job_counts(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Queue listing. Order: needs-a-decision before changed-since-decision (new work before rework),
-- then clustered by format and title so similar material arrives together.
-- ---------------------------------------------------------------------------
create or replace function public.admin_discovery_queue(_actor_id uuid, _question text, _q text default '',
  _media_type text default null, _limit integer default 60, _offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  if _question not in ('topics','placement','visibility') or _limit not between 1 and 400
    or _offset < 0 or length(coalesce(_q,'')) > 120 then
    raise exception 'Invalid queue request' using errcode = '22023'; end if;

  with rows as materialized (select * from public.discovery_queue_rows(_question)),
  scoped as (select * from rows where rows.needs or rows.decided),
  filtered as (
    select * from scoped s
    where (coalesce(_q,'') = '' or position(lower(_q) in lower(s.title)) > 0)
      and (_media_type is null or s.media_type = _media_type)
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by page.sort_needs, page.media_type, lower(page.title), page.id)
      from (
        select f.kind, f.id, f.title, f.description, f.media_type, f.state, f.is_discoverable,
          f.is_browsable, f.discovery_open_mode, f.duration, f.has_thumbnail, f.embedded,
          f.answer, f.token, f.decided_at, f.decided_label, f.stale, f.needs, f.decided,
          case when f.needs and f.answer is null then 0 when f.needs then 1 else 2 end as sort_needs,
          coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'category', t.browse_category)
              order by t.name)
            from public.tags t where t.is_active and t.tag_kind = 'topic' and (
              (f.kind = 'resource' and exists(select 1 from public.resource_tags rt where rt.resource_id = f.id and rt.tag_id = t.id))
              or (f.kind = 'node' and exists(select 1 from public.content_node_tags nt where nt.node_id = f.id and nt.tag_id = t.id))
            )), '[]'::jsonb) as topics,
          coalesce((select jsonb_agg(jsonb_build_object('nodeId', b.node_id, 'nodeTitle', n.title,
              'nodeType', n.node_type, 'nodeState', n.state, 'position', b.position) order by b.node_id, b.position)
            from public.content_blocks b join public.content_nodes n on n.id = b.node_id
            where f.kind = 'resource' and b.resource_id = f.id and b.block_type = 'asset'), '[]'::jsonb) as placements
        from filtered f
        order by sort_needs, f.media_type, lower(f.title), f.id
        limit _limit offset _offset
      ) page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    -- Stable denominator: candidates plus items already carrying a current answer. Eligibility
    -- alone would shrink on every save and the count would never appear to advance.
    'progress', (select jsonb_build_object(
        'decided', count(*) filter (where s.decided),
        'population', count(*),
        'needs', count(*) filter (where s.needs),
        'reopened', count(*) filter (where s.stale)) from scoped s),
    'formats', coalesce((select jsonb_object_agg(media_type, n) from
      (select s.media_type, count(*) as n from scoped s group by s.media_type) x), '{}'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_discovery_queue(uuid,text,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.admin_discovery_queue(uuid,text,text,text,integer,integer) to service_role;

-- The guide as the workspace: every placement, with the surrounding blocks that ARE the question.
create or replace function public.admin_discovery_placement_context(_actor_id uuid, _resource_id bigint)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  select jsonb_build_object(
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
          'nodeId', own.node_id, 'nodeTitle', n.title, 'nodeType', n.node_type, 'nodeState', n.state,
          'nodeDescription', coalesce(n.description,''), 'position', own.position,
          'blockCount', (select count(*) from public.content_blocks c where c.node_id = own.node_id),
          'hasProse', exists(select 1 from public.content_blocks c where c.node_id = own.node_id
            and c.block_type = 'text' and coalesce(c.text_md,'') <> ''),
          'blocks', (select jsonb_agg(jsonb_build_object(
                'position', c.position, 'type', c.block_type, 'text', left(coalesce(c.text_md,''), 600),
                'label', coalesce(c.label,''), 'isThis', c.id = own.id,
                'resourceTitle', rr.title, 'resourceType', rr.type) order by c.position, c.id)
            from public.content_blocks c left join public.resources rr on rr.id = c.resource_id
            where c.node_id = own.node_id))
        order by own.node_id, own.position)
      from public.content_blocks own join public.content_nodes n on n.id = own.node_id
      where own.resource_id = _resource_id and own.block_type = 'asset'), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_discovery_placement_context(uuid,bigint) from public, anon, authenticated;
grant execute on function public.admin_discovery_placement_context(uuid,bigint) to service_role;

-- ---------------------------------------------------------------------------
-- Recording a decision. The setting write and the decision write are ONE transaction:
-- recording "suitable independently" without setting discovery_open_mode, or the reverse,
-- must be impossible.
--
-- _token is the token the client loaded. Null means "I expect no existing decision". A
-- mismatch is refused with who changed it and when — never a silent overwrite. _force lets an
-- admin deliberately overwrite after being told.
-- ---------------------------------------------------------------------------
create or replace function public.admin_record_discovery_decision(_actor_id uuid, _kind text, _id bigint,
  _question text, _answer text, _tag_ids bigint[] default null, _token uuid default null,
  _force boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare existing public.discovery_decisions%rowtype; label text; fresh uuid;
begin
  perform public.assert_discovery_editor(_actor_id);
  if _kind not in ('resource','node') or _question not in ('topics','placement','visibility') then
    raise exception 'Invalid discovery decision target' using errcode = '22023'; end if;
  if not ((_question = 'topics' and _answer in ('assigned','none_needed'))
       or (_question = 'placement' and _answer in ('direct','context'))
       or (_question = 'visibility' and _answer in ('allowed','excluded'))) then
    raise exception 'Answer % is not valid for question %', _answer, _question using errcode = '22023'; end if;
  if _question = 'placement' and _kind <> 'resource' then
    raise exception 'Only resources sit inside guides' using errcode = '22023'; end if;
  if _kind = 'node' and not exists(select 1 from public.content_nodes n
    where n.id = _id and n.node_type in ('lesson','course')) then
    raise exception 'Only lessons and courses carry discovery decisions' using errcode = '22023'; end if;
  if _kind = 'resource' and not exists(select 1 from public.resources r where r.id = _id) then
    raise exception 'Resource % no longer exists', _id using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(60901, hashtext(_kind || ':' || _id::text));

  select * into existing from public.discovery_decisions d
    where d.item_kind = _kind and d.item_id = _id and d.question = _question for update;

  if not _force and existing.item_id is not null and existing.token is distinct from _token then
    return jsonb_build_object('ok', false, 'conflict', true,
      'decidedBy', existing.decided_label, 'decidedAt', existing.decided_at, 'answer', existing.answer);
  end if;
  if not _force and existing.item_id is null and _token is not null then
    return jsonb_build_object('ok', false, 'conflict', true, 'decidedBy', null, 'decidedAt', null,
      'answer', null, 'removed', true);
  end if;

  select coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'An administrator')
    into label from public.profiles p where p.id = _actor_id;
  label := coalesce(label, 'An administrator');

  -- Exempt the following writes from the supersession triggers: this IS the job.
  perform set_config('discovery.job_write', 'on', true);

  if _question = 'topics' then
    if _answer = 'assigned' then
      if _tag_ids is null or cardinality(_tag_ids) = 0 or cardinality(_tag_ids) > 50
        or exists(select 1 from unnest(_tag_ids) s(id) where s.id is null or not exists(
          select 1 from public.tags t where t.id = s.id and t.is_active and t.tag_kind = 'topic')) then
        raise exception 'Choose between 1 and 50 existing active topics' using errcode = '22023'; end if;
      if _kind = 'resource' then
        insert into public.resource_tags(resource_id, tag_id)
          select _id, t from unnest(_tag_ids) t on conflict do nothing;
      else
        insert into public.content_node_tags(node_id, tag_id)
          select _id, t from unnest(_tag_ids) t on conflict do nothing;
      end if;
    end if;
    -- "No topic needed" records a judgement and changes no assignment. Absence of tags is not
    -- itself a decision, which is exactly why this row exists.

  elsif _question = 'placement' then
    update public.resources set discovery_open_mode = case _answer when 'direct' then 'direct' else 'context' end
      where id = _id;

  elsif _question = 'visibility' then
    if _kind = 'resource' then
      update public.resources set is_discoverable = (_answer = 'allowed') where id = _id;
    else
      update public.content_nodes set is_discoverable = (_answer = 'allowed') where id = _id;
    end if;
  end if;

  fresh := gen_random_uuid();
  insert into public.discovery_decisions(item_kind, item_id, question, answer, token, decided_at,
    decided_by, decided_label, evidence)
  values (_kind, _id, _question, _answer, fresh, now(), _actor_id, label,
    public.discovery_evidence(_kind, _id, _question))
  on conflict (item_kind, item_id, question) do update
    set answer = excluded.answer, token = excluded.token, decided_at = excluded.decided_at,
        decided_by = excluded.decided_by, decided_label = excluded.decided_label,
        evidence = excluded.evidence;

  perform set_config('discovery.job_write', 'off', true);
  return jsonb_build_object('ok', true, 'token', fresh, 'answer', _answer);
end;
$$;
revoke all on function public.admin_record_discovery_decision(uuid,text,bigint,text,text,bigint[],uuid,boolean) from public, anon, authenticated;
grant execute on function public.admin_record_discovery_decision(uuid,text,bigint,text,text,bigint[],uuid,boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Undo restores the EXACT prior state, not merely the absence of a decision. The client holds
-- before-images; this applies them. An entry another admin has changed since is skipped and
-- named rather than overwritten.
--
-- _entries: [{kind, id, question, answer|null, tagIds:[...]|null, token|null}]
--   token = the token the client last saw. answer null = there was no decision before.
--   tagIds = the exact topic set to restore (topics question only).
-- ---------------------------------------------------------------------------
create or replace function public.admin_undo_discovery_decisions(_actor_id uuid, _entries jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare entry jsonb; kind text; target bigint; v_question text; want_answer text; want_tags bigint[];
  want_token uuid; current_row public.discovery_decisions%rowtype; restored jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb; label text; fresh uuid;
begin
  perform public.assert_discovery_editor(_actor_id);
  if jsonb_typeof(_entries) <> 'array' or jsonb_array_length(_entries) not between 1 and 200 then
    raise exception 'Undo needs between 1 and 200 entries' using errcode = '22023'; end if;
  select coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'An administrator')
    into label from public.profiles p where p.id = _actor_id;
  label := coalesce(label, 'An administrator');

  for entry in select * from jsonb_array_elements(_entries) loop
    kind := entry->>'kind'; target := (entry->>'id')::bigint; v_question := entry->>'question';
    want_answer := nullif(entry->>'answer', '');
    want_token := nullif(entry->>'token', '')::uuid;
    want_tags := case when entry->'tagIds' is null or jsonb_typeof(entry->'tagIds') <> 'array' then null
      else array(select (jsonb_array_elements_text(entry->'tagIds'))::bigint) end;
    if kind not in ('resource','node') or v_question not in ('topics','placement','visibility') then
      raise exception 'Invalid undo entry' using errcode = '22023'; end if;

    perform pg_advisory_xact_lock(60901, hashtext(kind || ':' || target::text));
    select * into current_row from public.discovery_decisions d
      where d.item_kind = kind and d.item_id = target and d.question = v_question for update;

    -- Somebody else moved it since the before-image was taken.
    if current_row.token is distinct from want_token then
      skipped := skipped || jsonb_build_object('kind', kind, 'id', target, 'question', v_question,
        'reason', case when current_row.item_id is null then 'The decision was removed by an external edit.'
          else format('%s changed this on %s.', current_row.decided_label,
            to_char(current_row.decided_at, 'FMDD Mon')) end);
      continue;
    end if;

    perform set_config('discovery.job_write', 'on', true);
    if v_question = 'topics' then
      if want_tags is not null then
        if kind = 'resource' then
          delete from public.resource_tags rt where rt.resource_id = target
            and not rt.tag_id = any(want_tags)
            and exists(select 1 from public.tags t where t.id = rt.tag_id and t.tag_kind = 'topic');
          insert into public.resource_tags(resource_id, tag_id)
            select target, t from unnest(want_tags) t on conflict do nothing;
        else
          delete from public.content_node_tags nt where nt.node_id = target
            and not nt.tag_id = any(want_tags)
            and exists(select 1 from public.tags t where t.id = nt.tag_id and t.tag_kind = 'topic');
          insert into public.content_node_tags(node_id, tag_id)
            select target, t from unnest(want_tags) t on conflict do nothing;
        end if;
      end if;
    elsif v_question = 'placement' then
      update public.resources set discovery_open_mode =
        case when want_answer = 'direct' then 'direct' else 'context' end where id = target;
    elsif v_question = 'visibility' then
      if kind = 'resource' then
        update public.resources set is_discoverable = coalesce(want_answer = 'allowed', is_discoverable) where id = target;
      else
        update public.content_nodes set is_discoverable = coalesce(want_answer = 'allowed', is_discoverable) where id = target;
      end if;
    end if;

    if want_answer is null then
      delete from public.discovery_decisions d
        where d.item_kind = kind and d.item_id = target and d.question = v_question;
      restored := restored || jsonb_build_object('kind', kind, 'id', target, 'question', v_question, 'token', null);
    else
      fresh := gen_random_uuid();
      insert into public.discovery_decisions(item_kind, item_id, question, answer, token, decided_at,
        decided_by, decided_label, evidence)
      values (kind, target, v_question, want_answer, fresh, now(), _actor_id, label,
        public.discovery_evidence(kind, target, v_question))
      on conflict (item_kind, item_id, question) do update
        set answer = excluded.answer, token = excluded.token, decided_at = excluded.decided_at,
            decided_by = excluded.decided_by, decided_label = excluded.decided_label, evidence = excluded.evidence;
      restored := restored || jsonb_build_object('kind', kind, 'id', target, 'question', v_question, 'token', fresh);
    end if;
    perform set_config('discovery.job_write', 'off', true);
  end loop;

  return jsonb_build_object('ok', true, 'restored', restored, 'skipped', skipped);
end;
$$;
revoke all on function public.admin_undo_discovery_decisions(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.admin_undo_discovery_decisions(uuid,jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Bulk topics. Adds; never replaces. Each target is written as its own topics decision —
-- a faster route to the same records, not a different kind of decision. Targets carry their
-- full (kind, id) identity: a bare id would name two different items.
-- ---------------------------------------------------------------------------
create or replace function public.admin_bulk_discovery_topics(_actor_id uuid, _targets jsonb, _tag_ids bigint[])
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare entry jsonb; kind text; target bigint; want_token uuid;
  current_row public.discovery_decisions%rowtype; label text; fresh uuid;
  written jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb; before_tags bigint[];
begin
  perform public.assert_discovery_editor(_actor_id);
  if jsonb_typeof(_targets) <> 'array' or jsonb_array_length(_targets) not between 1 and 100 then
    raise exception 'Choose between 1 and 100 items' using errcode = '22023'; end if;
  if _tag_ids is null or cardinality(_tag_ids) = 0 or cardinality(_tag_ids) > 50
    or exists(select 1 from unnest(_tag_ids) s(id) where s.id is null or not exists(
      select 1 from public.tags t where t.id = s.id and t.is_active and t.tag_kind = 'topic')) then
    raise exception 'Choose between 1 and 50 existing active topics' using errcode = '22023'; end if;
  select coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'An administrator')
    into label from public.profiles p where p.id = _actor_id;
  label := coalesce(label, 'An administrator');

  for entry in select * from jsonb_array_elements(_targets) loop
    kind := entry->>'kind'; target := (entry->>'id')::bigint; want_token := nullif(entry->>'token','')::uuid;
    if kind not in ('resource','node') then raise exception 'Invalid bulk target' using errcode = '22023'; end if;
    if kind = 'node' and not exists(select 1 from public.content_nodes n
      where n.id = target and n.node_type in ('lesson','course')) then
      raise exception 'Only lessons and courses carry topics' using errcode = '22023'; end if;
    if kind = 'resource' and not exists(select 1 from public.resources r where r.id = target) then
      raise exception 'Resource % no longer exists', target using errcode = '22023'; end if;

    perform pg_advisory_xact_lock(60901, hashtext(kind || ':' || target::text));
    select * into current_row from public.discovery_decisions d
      where d.item_kind = kind and d.item_id = target and d.question = 'topics' for update;
    if current_row.token is distinct from want_token then
      skipped := skipped || jsonb_build_object('kind', kind, 'id', target,
        'reason', case when current_row.item_id is null then 'The decision was removed by an external edit.'
          else format('%s changed this on %s.', current_row.decided_label,
            to_char(current_row.decided_at, 'FMDD Mon')) end);
      continue;
    end if;

    -- Before-image for the single bulk undo entry.
    before_tags := case kind when 'resource' then
        array(select rt.tag_id from public.resource_tags rt join public.tags t on t.id = rt.tag_id
              where rt.resource_id = target and t.tag_kind = 'topic' order by rt.tag_id)
      else
        array(select nt.tag_id from public.content_node_tags nt join public.tags t on t.id = nt.tag_id
              where nt.node_id = target and t.tag_kind = 'topic' order by nt.tag_id) end;

    perform set_config('discovery.job_write', 'on', true);
    if kind = 'resource' then
      insert into public.resource_tags(resource_id, tag_id) select target, t from unnest(_tag_ids) t on conflict do nothing;
    else
      insert into public.content_node_tags(node_id, tag_id) select target, t from unnest(_tag_ids) t on conflict do nothing;
    end if;
    fresh := gen_random_uuid();
    insert into public.discovery_decisions(item_kind, item_id, question, answer, token, decided_at,
      decided_by, decided_label, evidence)
    values (kind, target, 'topics', 'assigned', fresh, now(), _actor_id, label,
      public.discovery_evidence(kind, target, 'topics'))
    on conflict (item_kind, item_id, question) do update
      set answer = excluded.answer, token = excluded.token, decided_at = excluded.decided_at,
          decided_by = excluded.decided_by, decided_label = excluded.decided_label, evidence = excluded.evidence;
    perform set_config('discovery.job_write', 'off', true);

    written := written || jsonb_build_object('kind', kind, 'id', target, 'token', fresh,
      'previousAnswer', current_row.answer, 'previousToken', current_row.token,
      'previousTagIds', to_jsonb(before_tags));
  end loop;

  return jsonb_build_object('ok', true, 'written', written, 'skipped', skipped,
    'topicCount', cardinality(_tag_ids));
end;
$$;
revoke all on function public.admin_bulk_discovery_topics(uuid,jsonb,bigint[]) from public, anon, authenticated;
grant execute on function public.admin_bulk_discovery_topics(uuid,jsonb,bigint[]) to service_role;

-- Only items that already carry topics can be a representative. Nothing may be proposed before
-- the admin picks one: a format marker finds related material but never states its subject.
create or replace function public.admin_discovery_representatives(_actor_id uuid, _q text default '', _limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  if _limit not between 1 and 200 or length(coalesce(_q,'')) > 120 then
    raise exception 'Invalid representative search' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.media_type, lower(x.title)), '[]'::jsonb) into result
  from (
    select i.kind, i.id, i.title, i.media_type,
      (select n.title from public.content_blocks b join public.content_nodes n on n.id = b.node_id
        where i.kind = 'resource' and b.resource_id = i.id and b.block_type = 'asset'
        order by b.node_id, b.position limit 1) as guide,
      (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
        from public.tags t where t.is_active and t.tag_kind = 'topic' and (
          (i.kind = 'resource' and exists(select 1 from public.resource_tags rt where rt.resource_id = i.id and rt.tag_id = t.id))
          or (i.kind = 'node' and exists(select 1 from public.content_node_tags nt where nt.node_id = i.id and nt.tag_id = t.id)))) as topics
    from public.discovery_job_items i
    where i.has_topics and (coalesce(_q,'') = '' or position(lower(_q) in lower(i.title)) > 0)
    limit _limit
  ) x;
  return result;
end;
$$;
revoke all on function public.admin_discovery_representatives(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.admin_discovery_representatives(uuid,text,integer) to service_role;

-- ---------------------------------------------------------------------------
-- Job D — homepage browse. Not a queue: no completion, no percentage, no caught-up state.
-- The useful signal is coverage per category. Categories overlap, so they do not sum to the
-- total and the payload never presents them as a partition.
-- ---------------------------------------------------------------------------

-- Why a resource cannot be added, in the order that matters. Null means it can.
create or replace function public.discovery_browse_blocker(_state text, _is_discoverable boolean,
  _embedded boolean, _open_mode text, _has_placement_decision boolean)
returns text language sql immutable set search_path = pg_catalog, public as $$
  select case
    when _state <> 'published' then 'unpublished'
    when not _is_discoverable then 'hidden'
    when _embedded and not _has_placement_decision then 'context_not_reviewed'
    when _embedded and _open_mode <> 'direct' then 'kept_within_guide'
    else null end;
$$;
revoke all on function public.discovery_browse_blocker(text,boolean,boolean,text,boolean) from public, anon, authenticated;

create or replace function public.admin_discovery_browse(_actor_id uuid, _q text default '', _limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  if _limit not between 1 and 500 or length(coalesce(_q,'')) > 120 then
    raise exception 'Invalid browse request' using errcode = '22023'; end if;

  with approved as materialized (
    select i.*, public.discovery_browse_blocker(i.state, i.is_discoverable, i.embedded,
        i.discovery_open_mode,
        exists(select 1 from public.discovery_decisions d
          where d.item_kind = 'resource' and d.item_id = i.id and d.question = 'placement')) as blocker,
      coalesce((select array_agg(distinct t.browse_category) filter (where t.browse_category is not null)
        from public.resource_tags rt join public.tags t on t.id = rt.tag_id
        where rt.resource_id = i.id and t.is_active and t.tag_kind = 'topic'), '{}'::text[]) as categories
    from public.discovery_job_items i where i.kind = 'resource' and i.is_browsable
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(x) order by lower(x.title), x.id) from (
        select a.kind, a.id, a.title, a.media_type, a.state, a.duration, a.has_thumbnail,
          a.embedded, a.blocker, a.categories,
          (select n.title from public.content_blocks b join public.content_nodes n on n.id = b.node_id
            where b.resource_id = a.id and b.block_type = 'asset' order by b.node_id, b.position limit 1) as guide
        from approved a
        where coalesce(_q,'') = '' or position(lower(_q) in lower(a.title)) > 0
        limit _limit) x), '[]'::jsonb),
    'total', (select count(*) from approved),
    'cantAppear', (select count(*) from approved where blocker is not null),
    'noCategory', (select count(*) from approved where cardinality(categories) = 0),
    -- Per-category coverage. An item with topics in two categories appears in both.
    'coverage', (select jsonb_object_agg(c.code, coalesce(n.hits, 0)) from
      (values ('marketing'),('systems'),('hiring'),('mindset')) c(code)
      left join lateral (select count(*) as hits from approved a where c.code = any(a.categories)) n on true)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_discovery_browse(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.admin_discovery_browse(uuid,text,integer) to service_role;

-- Candidates, split into what can be added and what cannot. Ineligible items are shown WITH the
-- reason, never hidden: hiding them means an admin searches for something they know exists, gets
-- nothing, and cannot find out why. Every reason routes out to the job that owns it.
create or replace function public.admin_discovery_browse_candidates(_actor_id uuid, _view text default 'ready',
  _q text default '', _limit integer default 60, _offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.assert_discovery_editor(_actor_id);
  if _view not in ('ready','blocked') or _limit not between 1 and 200 or _offset < 0
    or length(coalesce(_q,'')) > 120 then
    raise exception 'Invalid candidate request' using errcode = '22023'; end if;

  with candidates as materialized (
    select i.*, public.discovery_browse_blocker(i.state, i.is_discoverable, i.embedded,
        i.discovery_open_mode,
        exists(select 1 from public.discovery_decisions d
          where d.item_kind = 'resource' and d.item_id = i.id and d.question = 'placement')) as blocker
    from public.discovery_job_items i where i.kind = 'resource' and not i.is_browsable
  ), scoped as (
    select * from candidates c
    where (case _view when 'ready' then c.blocker is null else c.blocker is not null end)
      and (coalesce(_q,'') = '' or position(lower(_q) in lower(c.title)) > 0)
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(x) order by lower(x.title), x.id) from (
        select s.kind, s.id, s.title, s.media_type, s.state, s.duration, s.embedded, s.blocker,
          (select n.title from public.content_blocks b join public.content_nodes n on n.id = b.node_id
            where b.resource_id = s.id and b.block_type = 'asset' order by b.node_id, b.position limit 1) as guide
        from scoped s order by lower(s.title), s.id limit _limit offset _offset) x), '[]'::jsonb),
    'total', (select count(*) from scoped),
    'readyTotal', (select count(*) from candidates where blocker is null),
    'blockedTotal', (select count(*) from candidates where blocker is not null),
    'blockerCounts', coalesce((select jsonb_object_agg(blocker, n) from
      (select blocker, count(*) as n from candidates where blocker is not null group by blocker) b), '{}'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_discovery_browse_candidates(uuid,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.admin_discovery_browse_candidates(uuid,text,text,integer,integer) to service_role;

-- Adding to browse must never make something searchable, unhide it, or overturn a placement
-- decision. If the item is blocked, the caller is told why and nothing is written.
create or replace function public.admin_set_discovery_browse(_actor_id uuid, _resource_id bigint, _approved boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare row_state record; blocker text;
begin
  perform public.assert_discovery_editor(_actor_id);
  select i.state, i.is_discoverable, i.embedded, i.discovery_open_mode, i.title into row_state
  from public.discovery_job_items i where i.kind = 'resource' and i.id = _resource_id;
  if row_state is null then raise exception 'Resource % no longer exists', _resource_id using errcode = '22023'; end if;

  if _approved then
    blocker := public.discovery_browse_blocker(row_state.state, row_state.is_discoverable,
      row_state.embedded, row_state.discovery_open_mode,
      exists(select 1 from public.discovery_decisions d
        where d.item_kind = 'resource' and d.item_id = _resource_id and d.question = 'placement'));
    if blocker is not null then
      return jsonb_build_object('ok', false, 'blocker', blocker, 'title', row_state.title);
    end if;
  end if;

  update public.resources set is_browsable = _approved where id = _resource_id;
  return jsonb_build_object('ok', true, 'approved', _approved, 'title', row_state.title);
end;
$$;
revoke all on function public.admin_set_discovery_browse(uuid,bigint,boolean) from public, anon, authenticated;
grant execute on function public.admin_set_discovery_browse(uuid,bigint,boolean) to service_role;
