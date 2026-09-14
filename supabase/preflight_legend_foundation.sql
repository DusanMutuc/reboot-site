-- Run in the Supabase SQL editor BEFORE 20260914000000_legend_foundation_scorecard.sql.
-- Read-only checks; results contain schema metadata and aggregate counts only.

-- 1. Confirm the latest migrations, including 20260913010000_member_pauses.sql.
select version
from supabase_migrations.schema_migrations
order by version desc
limit 12;

-- 2. The new table should not exist yet, and the old rating FK should exist.
select
  to_regclass('public.business_review_additional_scorecards') as additional_scorecards_table,
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_review_system_ratings'::regclass
      and conname = 'business_review_system_ratings_review_template_fkey'
  ) as expected_rating_fk_exists;

-- 3. Compare live function bodies with the repository snapshot this migration extends.
-- A false value means the live function needs inspection before running the migration.
with expected(signature, repository_md5) as (
  values
    ('public.admin_clone_system_scorecard_version(text,uuid)', '187c6b8efab14023a083fdd1993d6a28'),
    ('public.admin_discard_system_scorecard_draft(text,uuid)', '96586f2de399fe0ad8cf0caec7cca5d8'),
    ('public.admin_publish_system_scorecard_version(text,uuid,jsonb)', 'd413951cd106567971cac8ddcc3d51a3'),
    ('public.set_business_review_system_priority(bigint,bigint,boolean)', 'eff7ee8604cd7139a24485f0e246b9df'),
    ('public.initialize_business_review_system_scorecard(bigint)', '80d391c674378e1cd483e442e62be9ac'),
    ('public.create_business_review(uuid,date)', '2fccafb8c8b1f315a45806766150887a')
)
select
  expected.signature,
  md5(replace(proc.prosrc, E'\r\n', E'\n')) as live_md5,
  expected.repository_md5,
  md5(replace(proc.prosrc, E'\r\n', E'\n')) = expected.repository_md5 as matches_repository
from expected
left join pg_proc proc on proc.oid = to_regprocedure(expected.signature)
order by expected.signature;

-- 4. Show constraints and custom triggers relevant to existing scorecards.
select conrelid::regclass::text as table_name,
       conname,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.business_reviews'::regclass,
  'public.business_review_system_ratings'::regclass,
  'public.business_review_system_priorities'::regclass
)
and contype in ('p', 'u', 'f', 'c')
order by table_name, conname;

select tgrelid::regclass::text as table_name,
       tgname,
       pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid in (
  'public.business_reviews'::regclass,
  'public.business_review_system_ratings'::regclass,
  'public.business_review_system_priorities'::regclass
)
and not tgisinternal
order by table_name, tgname;

-- 5. Aggregate sanity checks: one active template per audience, systems present,
-- and no rating rows that already disagree with their review's primary template.
select audience::text,
       count(*) filter (where is_active) as active_template_count,
       array_agg(key order by version) filter (where is_active) as active_keys
from public.system_scorecard_templates
group by audience
order by audience;

select template.audience::text,
       template.key,
       count(system.id) as system_count
from public.system_scorecard_templates template
left join public.system_scorecard_systems system
  on system.template_key = template.key
where template.is_active
group by template.audience, template.key
order by template.audience;

select
  (select count(*) from public.business_reviews) as review_count,
  (select count(*) from public.business_review_system_ratings) as rating_count,
  (select count(*) from public.business_review_system_priorities) as priority_count,
  (select count(*)
   from public.business_review_system_ratings rating
   join public.business_reviews review on review.id = rating.business_review_id
   where rating.template_key is distinct from review.system_scorecard_template_key
  ) as ratings_not_on_primary_template;

-- 6. Supabase SQL Editor often displays only the final result. This one row
-- repeats the checks needed for review so it can be copied as a single value.
with expected(signature, repository_md5) as (
  values
    ('public.admin_clone_system_scorecard_version(text,uuid)', '187c6b8efab14023a083fdd1993d6a28'),
    ('public.admin_discard_system_scorecard_draft(text,uuid)', '96586f2de399fe0ad8cf0caec7cca5d8'),
    ('public.admin_publish_system_scorecard_version(text,uuid,jsonb)', 'd413951cd106567971cac8ddcc3d51a3'),
    ('public.set_business_review_system_priority(bigint,bigint,boolean)', 'eff7ee8604cd7139a24485f0e246b9df'),
    ('public.initialize_business_review_system_scorecard(bigint)', '80d391c674378e1cd483e442e62be9ac'),
    ('public.create_business_review(uuid,date)', '2fccafb8c8b1f315a45806766150887a')
)
select jsonb_pretty(jsonb_build_object(
  'latest_migrations', (
    select coalesce(jsonb_agg(version order by version desc), '[]'::jsonb)
    from (
      select version from supabase_migrations.schema_migrations
      order by version desc limit 12
    ) latest
  ),
  'additional_table', to_regclass('public.business_review_additional_scorecards')::text,
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'signature', expected.signature,
      'matches_repository', md5(replace(proc.prosrc, E'\r\n', E'\n')) = expected.repository_md5,
      'live_md5', md5(replace(proc.prosrc, E'\r\n', E'\n'))
    ) order by expected.signature), '[]'::jsonb)
    from expected
    left join pg_proc proc on proc.oid = to_regprocedure(expected.signature)
  ),
  'constraints', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', conname,
      'definition', pg_get_constraintdef(oid)
    ) order by conname), '[]'::jsonb)
    from pg_constraint
    where conrelid in (
      'public.business_reviews'::regclass,
      'public.business_review_system_ratings'::regclass,
      'public.business_review_system_priorities'::regclass
    )
    and conname in (
      'business_review_system_ratings_review_template_fkey',
      'business_review_system_ratings_system_template_fkey',
      'business_review_system_priorities_rating_fkey',
      'business_review_system_priorities_position_unique',
      'business_reviews_id_system_scorecard_template_unique'
    )
  ),
  'active_templates', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'audience', template.audience::text,
      'key', template.key,
      'system_count', (
        select count(*) from public.system_scorecard_systems system
        where system.template_key = template.key
      )
    ) order by template.audience), '[]'::jsonb)
    from public.system_scorecard_templates template
    where template.is_active
  ),
  'counts', jsonb_build_object(
    'reviews', (select count(*) from public.business_reviews),
    'ratings', (select count(*) from public.business_review_system_ratings),
    'priorities', (select count(*) from public.business_review_system_priorities),
    'ratings_not_on_primary_template', (
      select count(*)
      from public.business_review_system_ratings rating
      join public.business_reviews review on review.id = rating.business_review_id
      where rating.template_key is distinct from review.system_scorecard_template_key
    )
  )
)) as preflight_summary;
