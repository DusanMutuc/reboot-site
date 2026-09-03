begin;

-- Explicitly approved cleanup of the four remaining parentless lesson roots. IDs 88 and 91 are
-- their abandoned child chapters and are removed with the roots. Embedded resources are separate
-- catalogue records and are intentionally preserved; only their content_blocks disappear.
do $cleanup$
declare
  target_ids bigint[] := array[84,86,87,88,91,148]::bigint[];
  allowed_block_ids bigint[] := array[97,98,99,100,101,102,105,235,236]::bigint[];
  unsafe_ids bigint[];
  dependency record;
  has_dependency boolean;
  deleted_count integer;
begin
  -- A schema-only test database has none of these production-clone rows. In that environment the
  -- cleanup is already satisfied and must remain a no-op.
  if not exists (select 1 from public.content_nodes node where node.id = any(target_ids)) then
    return;
  end if;

  with expected(id, node_type, title, state) as (
    values
      (84::bigint,  'lesson',  'Red Carpet',                  'published'),
      (86::bigint,  'lesson',  'Red carpet',                  'draft'),
      (87::bigint,  'lesson',  'Sta god 2',                   'draft'),
      (88::bigint,  'chapter', 'Red carpet Main sta god',     'draft'),
      (91::bigint,  'chapter', 'Additional resources',        'draft'),
      (148::bigint, 'lesson',  'TEST',                        'published')
  )
  select array_agg(node.id order by node.id)
  into unsafe_ids
  from expected
  join public.content_nodes node using (id)
  where node.node_type is distinct from expected.node_type
     or node.title is distinct from expected.title
     or node.state is distinct from expected.state;

  if unsafe_ids is not null then
    raise exception 'Remaining-orphan cleanup stopped: metadata changed for node IDs %', unsafe_ids;
  end if;

  select array_agg(block.node_id order by block.node_id)
  into unsafe_ids
  from public.content_blocks block
  where block.node_id = any(target_ids)
    and not block.id = any(allowed_block_ids);
  if unsafe_ids is not null then
    raise exception 'Remaining-orphan cleanup stopped: new blocks exist for node IDs %', unsafe_ids;
  end if;

  select array_agg(distinct touched order by touched)
  into unsafe_ids
  from (
    select unnest(array[edge.parent_id, edge.child_id]) as touched
    from public.node_children edge
    where (edge.parent_id = any(target_ids) or edge.child_id = any(target_ids))
      and not (edge.parent_id = 86 and edge.child_id in (88,91))
  ) unexpected_edges;
  if unsafe_ids is not null then
    raise exception 'Remaining-orphan cleanup stopped: hierarchy changed for node IDs %', unsafe_ids;
  end if;

  -- Seven known progress rows are part of this explicitly approved removal. Stop if another learner
  -- has used the abandoned content, or if one of the known statuses has changed before deployment.
  if (select count(*) from public.user_node_progress progress where progress.node_id = any(target_ids)) <> 7
     or exists (
       select 1
       from public.user_node_progress progress
       where progress.node_id = any(target_ids)
         and not exists (
           select 1
           from (values
             (86::bigint, '25739408-22b0-48ba-85a6-bc08901482fa'::uuid, 'in_progress'::public.node_progress_status),
             (86::bigint, '89ef70e3-ea31-4b5b-9e0b-c3adc8fb8523'::uuid, 'completed'::public.node_progress_status),
             (86::bigint, 'a3e66594-3928-4bbd-8e95-40a078f757bb'::uuid, 'in_progress'::public.node_progress_status),
             (86::bigint, 'e9a97abf-cbb3-4ede-a25d-8cfeb7d2c36b'::uuid, 'in_progress'::public.node_progress_status),
             (87::bigint, '89ef70e3-ea31-4b5b-9e0b-c3adc8fb8523'::uuid, 'in_progress'::public.node_progress_status),
             (88::bigint, '89ef70e3-ea31-4b5b-9e0b-c3adc8fb8523'::uuid, 'completed'::public.node_progress_status),
             (88::bigint, 'a3e66594-3928-4bbd-8e95-40a078f757bb'::uuid, 'in_progress'::public.node_progress_status)
           ) expected(node_id, user_id, status)
           where expected.node_id = progress.node_id
             and expected.user_id = progress.user_id
             and expected.status = progress.status
         )
     ) then
    raise exception 'Remaining-orphan cleanup stopped: learner progress changed since review';
  end if;

  -- The historical item is retained and its content_node_id becomes null through ON DELETE SET
  -- NULL. Its immutable item_key still explains what occupied position 4 in that old result set.
  if (select count(*) from public.discovery_result_set_items item where item.content_node_id = any(target_ids)) > 1
     or exists (
       select 1
       from public.discovery_result_set_items item
       where item.content_node_id = any(target_ids)
         and not (item.result_set_id = '79bff778-5712-433c-a730-3db038d8909d'::uuid
           and item.position = 4 and item.item_key = 'guide:148' and item.content_node_id = 148)
     ) then
    raise exception 'Remaining-orphan cleanup stopped: discovery history changed since review';
  end if;

  -- Guard all other foreign-key dependencies, including cascading tables. The four explicitly
  -- reviewed dependency classes above are the only data allowed to move with this deletion.
  for dependency in
    select constraint_row.conrelid::regclass as table_name, attribute.attname as column_name
    from pg_catalog.pg_constraint constraint_row
    join unnest(constraint_row.conkey) with ordinality source_key(attnum, ordinality) on true
    join unnest(constraint_row.confkey) with ordinality target_key(attnum, ordinality)
      on target_key.ordinality = source_key.ordinality
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid and attribute.attnum = source_key.attnum
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.content_nodes'::regclass
      and constraint_row.conrelid not in (
        'public.content_blocks'::regclass,
        'public.node_children'::regclass,
        'public.user_node_progress'::regclass,
        'public.discovery_result_set_items'::regclass
      )
  loop
    execute format('select exists(select 1 from %s where %I = any($1))',
      dependency.table_name, dependency.column_name)
      into has_dependency using target_ids;
    if has_dependency then
      raise exception 'Remaining-orphan cleanup stopped: %.% contains dependent data',
        dependency.table_name, dependency.column_name;
    end if;
  end loop;

  delete from public.content_nodes where id = any(target_ids);
  get diagnostics deleted_count = row_count;
  raise notice 'Removed % remaining orphan learning nodes and child chapters', deleted_count;
end
$cleanup$;

commit;
