insert into roles (code)
select 'past_member'
where not exists (
  select 1
  from roles
  where code = 'past_member'
);
