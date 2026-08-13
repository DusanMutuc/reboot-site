begin;

insert into public.content_nodes (
  node_type,
  title,
  slug,
  state,
  description,
  created_at,
  updated_at
)
select
  'collection',
  'Legends Library',
  'legends-library',
  'published',
  'Private library content for Reboot Legends.',
  now(),
  now()
where not exists (
  select 1
  from public.content_nodes
  where slug = 'legends-slibrary'
);

commit;
