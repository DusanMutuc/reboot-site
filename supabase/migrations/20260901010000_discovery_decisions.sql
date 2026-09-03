-- Discovery decisions: the record of what an admin actually judged.
--
-- Replaces resources.discovery_reviewed_at as the placement authority. The old columns stay for
-- read compatibility and are no longer written by the job workflow; 20260901030000 migrates them.
--
-- Three properties this table exists to provide, none of which the old columns could:
--   1. A decision per item PER QUESTION, so leaving one queue never implies leaving another.
--   2. The evidence the decision was made against, so a later change can reopen it.
--   3. An opaque token, so a stale client cannot overwrite a decision it never saw.

-- Identity is (kind, id). resources and content_nodes have independent id sequences: on the
-- current catalogue 35 rows collide numerically, so a bare id names two different items.
create table public.discovery_decisions (
  item_kind     text        not null check (item_kind in ('resource','node')),
  item_id       bigint      not null,
  question      text        not null check (question in ('topics','placement','visibility')),
  answer        text        not null,

  -- Opaque and regenerated on every write. Never a counter: an external edit DELETES a decision,
  -- so a counter would restart at 1 and a client still holding 1 would match a row it never saw.
  token         uuid        not null default gen_random_uuid(),

  decided_at    timestamptz not null default now(),
  -- Nullable so a decision outlives the account that made it.
  decided_by    uuid        references auth.users(id) on delete set null,
  -- Captured at decision time so attribution survives account deletion.
  decided_label text        not null,

  evidence      jsonb       not null,

  primary key (item_kind, item_id, question),
  constraint discovery_decisions_answer_valid check (
    (question = 'topics'     and answer in ('assigned','none_needed')) or
    (question = 'placement'  and answer in ('direct','context'))       or
    (question = 'visibility' and answer in ('allowed','excluded'))
  )
);

alter table public.discovery_decisions enable row level security;
revoke all on table public.discovery_decisions from public, anon, authenticated;
grant all on table public.discovery_decisions to service_role;

create index discovery_decisions_question_idx on public.discovery_decisions (question, item_kind, item_id);

comment on table public.discovery_decisions is
  'One row per (item_kind, item_id, question). Authoritative record of discovery decisions; '
  'supersedes resources.discovery_reviewed_at for the placement question.';

-- ---------------------------------------------------------------------------
-- Evidence. Always computed here, never accepted from a client.
-- ---------------------------------------------------------------------------

-- A canonical digest of everything in a containing node EXCEPT the resource's own block.
-- The UX contract says what sits before and after the resource *is* the placement question, so
-- node id and position alone are not enough: adding setup instructions around a resource that
-- stayed at position 3 must reopen the decision.
--
-- `settings` is deliberately excluded: width, spacing and alignment are presentational, and
-- reopening a context review because someone adjusted a column width would train admins to
-- dismiss reopenings without reading them.
create or replace function public.discovery_block_digest(_node_id bigint, _exclude_block_id bigint)
returns text language sql stable set search_path = pg_catalog, public as $$
  select coalesce(
    encode(extensions.digest(string_agg(
      concat_ws('|', b.position::text, b.block_type, coalesce(b.text_md,''), coalesce(b.resource_id::text,''),
        coalesce(b.label,''), coalesce(b.notes,''), coalesce(b.smart_doc_id::text,''), coalesce(b.data::text,'')),
      E'\n' order by b.position, b.id), 'sha256'), 'hex'),
    '')
  from public.content_blocks b
  where b.node_id = _node_id and b.id is distinct from _exclude_block_id;
$$;
revoke all on function public.discovery_block_digest(bigint,bigint) from public, anon, authenticated;

create or replace function public.discovery_evidence(_kind text, _id bigint, _question text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if _question = 'topics' then
    -- Title is the main evidence of subject; description, type and url complete it.
    if _kind = 'resource' then
      select jsonb_build_object('title', r.title, 'description', coalesce(r.description,''),
        'type', r.type, 'url', coalesce(r.url,''))
      into result from public.resources r where r.id = _id;
    else
      select jsonb_build_object('title', n.title, 'description', coalesce(n.description,''),
        'type', n.node_type, 'url', '')
      into result from public.content_nodes n where n.id = _id;
    end if;

  elsif _question = 'visibility' then
    -- Deliberately excludes `state`: allow-in-search is a permission, not an outcome. A draft can
    -- be allowed and still blocked from appearing. Publishing must not reopen the decision.
    if _kind = 'resource' then
      select jsonb_build_object('type', r.type, 'url', coalesce(r.url,''))
      into result from public.resources r where r.id = _id;
    else
      select jsonb_build_object('type', n.node_type, 'url', '')
      into result from public.content_nodes n where n.id = _id;
    end if;

  elsif _question = 'placement' then
    if _kind <> 'resource' then raise exception 'Placement applies to resources only' using errcode = '22023'; end if;
    select jsonb_build_object(
      'type', r.type, 'url', coalesce(r.url,''),
      'placements', coalesce((
        select jsonb_agg(jsonb_build_object(
            'node_id', b.node_id,
            'position', b.position,
            'node_title', n.title,
            'node_description', coalesce(n.description,''),
            -- Instructional text on the resource's own block carries meaning; the block as a
            -- whole does not, since its identity and position are tracked separately.
            'own_label', coalesce(b.label,''),
            'own_notes', coalesce(b.notes,''),
            'surroundings', public.discovery_block_digest(b.node_id, b.id))
          order by b.node_id, b.position)
        from public.content_blocks b join public.content_nodes n on n.id = b.node_id
        where b.resource_id = r.id and b.block_type = 'asset'), '[]'::jsonb))
    into result from public.resources r where r.id = _id;
  else
    raise exception 'Unknown discovery question %', _question using errcode = '22023';
  end if;
  if result is null then raise exception 'Discovery item %:% not found', _kind, _id using errcode = '22023'; end if;
  return result;
end;
$$;
revoke all on function public.discovery_evidence(text,bigint,text) from public, anon, authenticated;
grant execute on function public.discovery_evidence(text,bigint,text) to service_role;

-- ---------------------------------------------------------------------------
-- Supersession. An external edit to the underlying setting DELETES the decision; it does not
-- merely stale it. The job's own writes are exempt via a transaction-local flag, so that
-- recording a decision and applying its setting in one transaction does not erase itself.
-- ---------------------------------------------------------------------------

create or replace function public.discovery_in_job_write() returns boolean
language sql stable set search_path = pg_catalog, public as $$
  select coalesce(current_setting('discovery.job_write', true), '') = 'on';
$$;
revoke all on function public.discovery_in_job_write() from public, anon, authenticated;

create or replace function public.supersede_discovery_decision() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare kind text; target bigint;
begin
  if public.discovery_in_job_write() then return coalesce(new, old); end if;

  if tg_table_name = 'resources' then
    kind := 'resource'; target := coalesce(new.id, old.id);
    if tg_op = 'UPDATE' then
      if new.discovery_open_mode is distinct from old.discovery_open_mode then
        delete from public.discovery_decisions d
          where d.item_kind = kind and d.item_id = target and d.question = 'placement';
      end if;
      if new.is_discoverable is distinct from old.is_discoverable then
        delete from public.discovery_decisions d
          where d.item_kind = kind and d.item_id = target and d.question = 'visibility';
      end if;
    end if;
  elsif tg_table_name = 'content_nodes' then
    kind := 'node'; target := coalesce(new.id, old.id);
    if tg_op = 'UPDATE' and new.is_discoverable is distinct from old.is_discoverable then
      delete from public.discovery_decisions d
        where d.item_kind = kind and d.item_id = target and d.question = 'visibility';
    end if;
  elsif tg_table_name = 'resource_tags' then
    delete from public.discovery_decisions d
      where d.item_kind = 'resource' and d.item_id = coalesce(new.resource_id, old.resource_id) and d.question = 'topics';
  elsif tg_table_name = 'content_node_tags' then
    delete from public.discovery_decisions d
      where d.item_kind = 'node' and d.item_id = coalesce(new.node_id, old.node_id) and d.question = 'topics';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.supersede_discovery_decision() from public, anon, authenticated;

create trigger resources_supersede_discovery after update of discovery_open_mode, is_discoverable on public.resources
for each row execute function public.supersede_discovery_decision();
create trigger content_nodes_supersede_discovery after update of is_discoverable on public.content_nodes
for each row execute function public.supersede_discovery_decision();
create trigger resource_tags_supersede_discovery after insert or delete on public.resource_tags
for each row execute function public.supersede_discovery_decision();
create trigger content_node_tags_supersede_discovery after insert or delete on public.content_node_tags
for each row execute function public.supersede_discovery_decision();

-- A polymorphic reference cannot use a foreign key, so deletion is handled explicitly.
create or replace function public.clear_discovery_decisions() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  delete from public.discovery_decisions d
    where d.item_kind = case tg_table_name when 'resources' then 'resource' else 'node' end
      and d.item_id = old.id;
  return old;
end;
$$;
revoke all on function public.clear_discovery_decisions() from public, anon, authenticated;
create trigger resources_clear_discovery_decisions after delete on public.resources
for each row execute function public.clear_discovery_decisions();
create trigger content_nodes_clear_discovery_decisions after delete on public.content_nodes
for each row execute function public.clear_discovery_decisions();
