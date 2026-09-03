-- "Save topics" on a single item means "these are the topics", including the ones you removed.
--
-- The insert-only behaviour was inherited from the bulk path, where adding-never-replacing is a
-- deliberate guardrail: a bulk write proposes topics for items the admin has not individually
-- examined, so it must never destroy what is already there. A single save is the opposite — the
-- admin is looking at that one item's exact topic set and pressing Save on it.
--
-- It went unnoticed because the topics queue only contains items with no active topics, so there
-- was nothing to remove. It becomes visible the moment the control appears in the builder, where a
-- node may already be tagged, and on any reopened item.
--
-- admin_bulk_discovery_topics is unchanged and still only ever adds.
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
  if _kind = 'node' and not exists(select 1 from public.discovery_job_items i
    where i.kind = 'node' and i.id = _id) then
    raise exception 'Only Library guides and whole courses carry discovery decisions' using errcode = '22023'; end if;
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
        delete from public.resource_tags rt where rt.resource_id = _id
          and not rt.tag_id = any(_tag_ids)
          and exists(select 1 from public.tags t where t.id = rt.tag_id and t.tag_kind = 'topic');
        insert into public.resource_tags(resource_id, tag_id)
          select _id, t from unnest(_tag_ids) t on conflict do nothing;
      else
        delete from public.content_node_tags nt where nt.node_id = _id
          and not nt.tag_id = any(_tag_ids)
          and exists(select 1 from public.tags t where t.id = nt.tag_id and t.tag_kind = 'topic');
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
