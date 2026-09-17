begin;

-- Separate from discovery eligibility: these are abandoned editor/test records in the production
-- clone, not merely nodes that discovery no longer surfaces. The guard deliberately aborts if any
-- candidate has changed, gained meaningful content or acquired a reference before deployment.
do $cleanup$
declare
  target_ids bigint[] := array[23,79,81,82,83,89,90,92,93,94,95,99,101,102,103,104,146]::bigint[];
  unsafe_ids bigint[];
  dependency record;
  has_dependency boolean;
  deleted_count integer;
begin
  with expected(id, node_type, title, state) as (
    values
      (23::bigint,  'lesson',  'test test',                                   'draft'),
      (79::bigint,  'lesson',  'New Page',                                    'draft'),
      (81::bigint,  'lesson',  'New Item',                                    'draft'),
      (82::bigint,  'lesson',  'New Item',                                    'draft'),
      (83::bigint,  'lesson',  'test nesotn oenteo',                           'published'),
      (89::bigint,  'lesson',  'Nesto asdsadas ',                              'draft'),
      (90::bigint,  'lesson',  'Somethin or somethin else who knows dasdasa',  'published'),
      (92::bigint,  'lesson',  'asdsada',                                      'published'),
      (93::bigint,  'chapter', 'Untitled',                                     'published'),
      (94::bigint,  'chapter', 'asdasd',                                       'draft'),
      (95::bigint,  'lesson',  'asdasdsaas',                                   'draft'),
      (99::bigint,  'lesson',  'Foundations',                                  'draft'),
      (101::bigint, 'lesson',  'Foundation',                                   'draft'),
      (102::bigint, 'chapter', 'Hiring Your First Assistant',                  'draft'),
      (103::bigint, 'lesson',  'Untitled',                                     'draft'),
      (104::bigint, 'lesson',  'Untitled',                                     'draft'),
      (146::bigint, 'lesson',  'test',                                         'draft')
  )
  select array_agg(node.id order by node.id)
  into unsafe_ids
  from expected
  join public.content_nodes node using (id)
  where node.node_type is distinct from expected.node_type
     or node.title is distinct from expected.title
     or node.state is distinct from expected.state;

  if unsafe_ids is not null then
    raise exception 'Abandoned-node cleanup stopped: metadata changed for node IDs %', unsafe_ids;
  end if;

  -- Only the two known dummy text blocks are allowed. Assets, smart documents or edited prose turn
  -- the row into something that needs human review rather than automatic deletion.
  select array_agg(distinct block.node_id order by block.node_id)
  into unsafe_ids
  from public.content_blocks block
  where block.node_id = any(target_ids)
    and not (
      (block.id = 93 and block.node_id = 79 and block.position = 0 and block.block_type = 'text'
        and block.resource_id is null and block.text_md = '<p>Hello Hello</p><p></p>')
      or
      (block.id = 95 and block.node_id = 83 and block.position = 0 and block.block_type = 'text'
        and block.resource_id is null and block.text_md = '<p>Nesto nesto nesto</p><p></p>')
    );
  if unsafe_ids is not null then
    raise exception 'Abandoned-node cleanup stopped: meaningful or changed blocks exist for node IDs %', unsafe_ids;
  end if;

  -- The only allowed hierarchy is the three empty child chapters already inspected.
  select array_agg(distinct touched order by touched)
  into unsafe_ids
  from (
    select unnest(array[edge.parent_id, edge.child_id]) as touched
    from public.node_children edge
    where (edge.parent_id = any(target_ids) or edge.child_id = any(target_ids))
      and not (
        (edge.parent_id = 92 and edge.child_id in (93,94))
        or (edge.parent_id = 101 and edge.child_id = 102)
      )
  ) unexpected_edges;
  if unsafe_ids is not null then
    raise exception 'Abandoned-node cleanup stopped: hierarchy changed for node IDs %', unsafe_ids;
  end if;

  -- Guard every foreign-key dependency, including cascading tables, except the exact blocks and
  -- hierarchy checked above. This prevents deletion from silently erasing progress, assignments,
  -- access, analytics or future dependent data added to this schema.
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
      and constraint_row.conrelid not in ('public.content_blocks'::regclass, 'public.node_children'::regclass)
  loop
    execute format('select exists(select 1 from %s where %I = any($1))',
      dependency.table_name, dependency.column_name)
      into has_dependency using target_ids;
    if has_dependency then
      raise exception 'Abandoned-node cleanup stopped: %.% contains dependent data',
        dependency.table_name, dependency.column_name;
    end if;
  end loop;

  delete from public.content_nodes where id = any(target_ids);
  get diagnostics deleted_count = row_count;
  raise notice 'Removed % confirmed abandoned learning nodes (already-absent rows are harmless)', deleted_count;
end
$cleanup$;

commit;
