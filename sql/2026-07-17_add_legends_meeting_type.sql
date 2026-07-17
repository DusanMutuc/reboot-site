insert into meeting_types (
  name,
  code,
  counts_toward_engagement,
  is_active
)
select
  'Legends Meeting',
  'LEGENDS_MEETING',
  true,
  true
where not exists (
  select 1
  from meeting_types
  where code = 'LEGENDS_MEETING'
);
