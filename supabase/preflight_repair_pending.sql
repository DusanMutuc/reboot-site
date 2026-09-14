-- Read-only verification before marking the September 4 and 13 migrations applied.
with expected(signature, repository_md5) as (
  values
    ('public.create_business_review_for_sync(uuid,uuid,date)', 'a3c887245e10cda20c99aa0834325f61'),
    ('public.sync_business_audit_appointment(text,text,timestamptz,timestamptz,text,text,text,uuid,uuid,date,boolean)', '9b2315d18e352a98e05cbe63fcc318d0'),
    ('public.compute_user_attention_auto_from_attendance(uuid)', '69755082755d3e42e3833dc70bc79f00'),
    ('public.recompute_attention_on_member_pause()', '9282cadf02e08779cf03498f34784f9d')
)
select jsonb_pretty(jsonb_build_object(
  'logged_versions', (
    select coalesce(jsonb_agg(version order by version), '[]'::jsonb)
    from supabase_migrations.schema_migrations
    where version in ('20260904010000', '20260913010000', '20260914000000')
  ),
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'signature', expected.signature,
      'matches_repository', md5(replace(proc.prosrc, E'\r\n', E'\n')) = expected.repository_md5,
      'live_md5', md5(replace(proc.prosrc, E'\r\n', E'\n'))
    ) order by expected.signature), '[]'::jsonb)
    from expected
    left join pg_proc proc on proc.oid = to_regprocedure(expected.signature)
  ),
  'member_pauses_table', to_regclass('public.member_pauses')::text,
  'member_pauses_trigger', exists (
    select 1 from pg_trigger
    where tgrelid = to_regclass('public.member_pauses')
      and tgname = 'member_pauses_recompute_attention'
      and not tgisinternal
  ),
  'member_pauses_indexes', (
    select coalesce(jsonb_agg(indexname order by indexname), '[]'::jsonb)
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'member_pauses'
  ),
  'migration_history_columns', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) order by ordinal_position), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
  )
)) as repair_preflight;
