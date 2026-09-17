begin;

-- Publication/access and catalogue discoverability are deliberately separate.
-- Existing published content remains discoverable during the additive rollout;
-- new manually-created content defaults to non-discoverable until reviewed.
alter table public.resources
  add column is_discoverable boolean not null default false,
  add column catalog_priority smallint not null default 0;

alter table public.resources
  add constraint resources_catalog_priority_valid
  check (catalog_priority between -100 and 100);

update public.resources
set is_discoverable = true
where state = 'published';

alter table public.resources
  alter column state set default 'draft'::text;

alter table public.content_nodes
  add column is_discoverable boolean not null default false,
  add column catalog_priority smallint not null default 0;

alter table public.content_nodes
  add constraint content_nodes_catalog_priority_valid
  check (catalog_priority between -100 and 100);

update public.content_nodes
set is_discoverable = true
where state = 'published';

create index resources_discovery_catalog_idx
  on public.resources (catalog_priority desc, created_at desc, id desc)
  where state = 'published' and is_discoverable;

create index content_nodes_discovery_catalog_idx
  on public.content_nodes (catalog_priority desc, created_at desc, id desc)
  where state = 'published' and is_discoverable;

-- Reuse the existing tag graph, but make the taxonomy explicit. Alias rows are
-- search vocabulary only; resources and guides are assigned canonical rows.
alter table public.tags
  add column slug text,
  add column tag_kind text not null default 'topic',
  add column browse_category text,
  add column canonical_tag_id bigint,
  add column is_active boolean not null default true;

alter table public.tags
  add constraint tags_kind_valid
  check (tag_kind in ('browse_category', 'topic', 'alias', 'format', 'audience', 'legacy')),
  add constraint tags_browse_category_valid
  check (
    browse_category is null
    or browse_category in ('marketing', 'systems', 'hiring', 'mindset')
  ),
  add constraint tags_alias_shape_valid
  check (
    (tag_kind = 'alias' and canonical_tag_id is not null)
    or (tag_kind <> 'alias' and canonical_tag_id is null)
  ),
  add constraint tags_canonical_tag_fkey
  foreign key (canonical_tag_id) references public.tags(id) on delete restrict;

update public.tags
set slug = coalesce(
  nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''),
  'tag'
) || '-' || id::text
where slug is null;

create index tags_slug_idx on public.tags (slug);
create index tags_canonical_tag_idx on public.tags (canonical_tag_id)
  where canonical_tag_id is not null;
create index tags_browse_category_idx on public.tags (browse_category)
  where is_active and browse_category is not null;
create unique index tags_active_browse_category_unique
  on public.tags (browse_category)
  where is_active and tag_kind = 'browse_category';

do $seed_categories$
declare
  category_row record;
  existing_id bigint;
begin
  for category_row in
    select *
    from (values
      ('marketing'::text, 'Marketing & sales'::text),
      ('systems'::text, 'Systems & operations'::text),
      ('hiring'::text, 'Hiring & team'::text),
      ('mindset'::text, 'Mindset & leadership'::text)
    ) as categories(slug, label)
  loop
    select id
    into existing_id
    from public.tags
    where lower(name) = lower(category_row.label)
    order by id
    limit 1;

    if existing_id is null then
      insert into public.tags (
        name,
        slug,
        category,
        tag_kind,
        browse_category,
        is_active
      )
      values (
        category_row.label,
        category_row.slug,
        'browse',
        'browse_category',
        category_row.slug,
        true
      );
    else
      update public.tags
      set slug = category_row.slug,
          category = 'browse',
          tag_kind = 'browse_category',
          browse_category = category_row.slug,
          canonical_tag_id = null,
          is_active = true
      where id = existing_id;
    end if;
  end loop;
end
$seed_categories$;

create index content_node_tags_tag_node_idx
  on public.content_node_tags (tag_id, node_id);

-- This relation already exists in production. Harden its tag reference and
-- member read policy instead of replacing the table.
alter table public.content_node_tags
  drop constraint content_node_tags_tag_id_fkey,
  add constraint content_node_tags_tag_id_fkey
    foreign key (tag_id) references public.tags(id) on delete restrict;

drop policy if exists cntags_members_read on public.content_node_tags;
create policy cntags_members_read
  on public.content_node_tags
  for select
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.content_nodes node
      where node.id = content_node_tags.node_id
        and node.state = 'published'
        and node.is_discoverable
        and (node.owner_id is null or node.owner_id = auth.uid())
    )
  );

create or replace function public.guard_assignable_discovery_tag()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  selected_tag public.tags%rowtype;
begin
  select *
  into selected_tag
  from public.tags
  where id = new.tag_id;

  if not found then
    raise exception 'Discovery tag % does not exist', new.tag_id
      using errcode = '23503';
  end if;

  if not selected_tag.is_active then
    raise exception 'Inactive discovery tags cannot be assigned'
      using errcode = '23514';
  end if;

  if selected_tag.tag_kind = 'alias' then
    raise exception 'Alias tags are search vocabulary and cannot be assigned directly'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

create trigger trg_resource_tags_assignable
before insert or update on public.resource_tags
for each row execute function public.guard_assignable_discovery_tag();

create trigger trg_content_node_tags_assignable
before insert or update on public.content_node_tags
for each row execute function public.guard_assignable_discovery_tag();

-- tag_text contains canonical labels and active aliases, but aliases remain
-- hidden from browse/filter UI because they are not assigned to the resource.
create or replace function public.refresh_tag_text(_resource_id bigint)
returns void
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  refreshed_text text;
begin
  with direct_tags as (
    select tag.id, tag.name, tag.canonical_tag_id
    from public.resource_tags resource_tag
    join public.tags tag on tag.id = resource_tag.tag_id
    where resource_tag.resource_id = _resource_id
  ),
  expanded_terms as (
    select direct.name
    from direct_tags direct

    union

    select canonical.name
    from direct_tags direct
    join public.tags canonical on canonical.id = direct.canonical_tag_id
    where canonical.is_active

    union

    select alias.name
    from direct_tags direct
    join public.tags alias
      on alias.canonical_tag_id = coalesce(direct.canonical_tag_id, direct.id)
    where alias.tag_kind = 'alias'
      and alias.is_active
  )
  select string_agg(lower(term.name), ' ' order by lower(term.name))
  into refreshed_text
  from expanded_terms term;

  update public.resources
  set tag_text = refreshed_text
  where id = _resource_id;
end
$function$;

create or replace function public._tags_after_change_refresh_dependents()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  root_ids bigint[] := '{}'::bigint[];
  affected_resource_id bigint;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    root_ids := array_append(root_ids, coalesce(old.canonical_tag_id, old.id));
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    root_ids := array_append(root_ids, coalesce(new.canonical_tag_id, new.id));
  end if;

  for affected_resource_id in
    select distinct resource_tag.resource_id
    from public.resource_tags resource_tag
    join public.tags assigned on assigned.id = resource_tag.tag_id
    where coalesce(assigned.canonical_tag_id, assigned.id) = any(root_ids)
  loop
    perform public.refresh_tag_text(affected_resource_id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$function$;

drop trigger if exists trg_tags_refresh_dependents on public.tags;
create trigger trg_tags_refresh_dependents
after insert or update or delete on public.tags
for each row execute function public._tags_after_change_refresh_dependents();

do $refresh_existing_tag_text$
declare
  resource_row record;
begin
  for resource_row in select id from public.resources loop
    perform public.refresh_tag_text(resource_row.id);
  end loop;
end
$refresh_existing_tag_text$;

-- Explicit member feedback is the only initial signal that suppresses a
-- recommendation. Opens and passive visibility do not change ranking.
create table public.user_resource_discovery_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id bigint not null references public.resources(id) on delete cascade,
  preference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, resource_id),
  constraint user_resource_discovery_preference_valid
    check (preference in ('finished', 'not_interested'))
);

create trigger trg_touch_user_resource_discovery_preferences
before update on public.user_resource_discovery_preferences
for each row execute function public.touch_updated_at();

alter table public.user_resource_discovery_preferences enable row level security;

create policy user_resource_discovery_preferences_admin_read
  on public.user_resource_discovery_preferences
  for select
  using (public.is_admin());

create policy user_resource_discovery_preferences_own_read
  on public.user_resource_discovery_preferences
  for select
  using (user_id = auth.uid());

create policy user_resource_discovery_preferences_own_insert
  on public.user_resource_discovery_preferences
  for insert
  with check (user_id = auth.uid());

create policy user_resource_discovery_preferences_own_update
  on public.user_resource_discovery_preferences
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy user_resource_discovery_preferences_own_delete
  on public.user_resource_discovery_preferences
  for delete
  using (user_id = auth.uid());

grant select, insert, update, delete
  on public.user_resource_discovery_preferences to authenticated;
grant all on public.user_resource_discovery_preferences to service_role;

commit;
