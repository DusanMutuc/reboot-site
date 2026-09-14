-- Read-only verification after 20260914000000_legend_foundation_scorecard.sql.
-- Before assigning any Foundation scorecards, counts should remain at the
-- pre-migration baseline (102 reviews, 2828 ratings, 90 priorities), absent
-- concurrent application writes.
select jsonb_pretty(jsonb_build_object(
  'logged_versions', (
    select coalesce(jsonb_agg(version order by version), '[]'::jsonb)
    from supabase_migrations.schema_migrations
    where version in ('20260904010000', '20260913010000', '20260914000000')
  ),
  'additional_table', to_regclass('public.business_review_additional_scorecards')::text,
  'rating_review_fk', (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.business_review_system_ratings'::regclass
      and conname = 'business_review_system_ratings_review_fkey'
  ),
  'old_rating_template_fk_exists', exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_review_system_ratings'::regclass
      and conname = 'business_review_system_ratings_review_template_fkey'
  ),
  'validation_triggers', (
    select coalesce(jsonb_agg(tgname order by tgname), '[]'::jsonb)
    from pg_trigger
    where tgname in (
      'validate_business_review_additional_scorecard',
      'validate_business_review_system_rating_template'
    ) and not tgisinternal
  ),
  'assignment_rpc_exists',
    to_regprocedure('public.assign_foundation_scorecard_to_business_review(bigint)') is not null,
  'counts', jsonb_build_object(
    'reviews', (select count(*) from public.business_reviews),
    'ratings', (select count(*) from public.business_review_system_ratings),
    'priorities', (select count(*) from public.business_review_system_priorities),
    'additional_scorecards', (select count(*) from public.business_review_additional_scorecards),
    'ratings_without_assigned_template', (
      select count(*)
      from public.business_review_system_ratings rating
      join public.business_reviews review on review.id = rating.business_review_id
      left join public.business_review_additional_scorecards extra
        on extra.business_review_id = review.id
      where rating.template_key is distinct from review.system_scorecard_template_key
        and rating.template_key is distinct from extra.template_key
    )
  )
)) as postflight_summary;
