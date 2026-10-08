-- Keep the derived ownership claims in sync without an unqualified DELETE.
-- Production safeupdate also applies when this statement trigger is reached
-- through an empty FK cascade while deleting an unrelated Auth account.
begin;

lock table public.partnerships, public.partnership_users in share row exclusive mode;

-- CREATE OR REPLACE preserves the existing owner and revoked function grants.
-- The statement serialization triggers and archived-member protection remain.
create or replace function public.refresh_partnership_domain_claims()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.partnership_users pu
    join public.partnerships p on p.id = pu.partnership_id
    join public.profiles profile on profile.id = pu.user_id
    where p.is_active and (p.shared_kpis or p.shared_attendance or p.shared_notes)
      and profile.merged_at is not null
  ) then
    raise exception 'Merged accounts cannot belong to an active sharing partnership.' using errcode = '23514';
  end if;

  -- Remove only claims whose exact owner/member/domain is no longer enabled.
  -- Existing valid rows remain untouched, including on zero-row cascades.
  delete from public.partnership_domain_claims claim
  where not exists (
    select 1 from public.partnerships p
    join public.partnership_users pu on pu.partnership_id = p.id
    where p.id = claim.partnership_id and pu.user_id = claim.user_id and p.is_active
      and ((claim.domain = 'kpis' and p.shared_kpis)
        or (claim.domain = 'attendance' and p.shared_attendance)
        or (claim.domain = 'notes' and p.shared_notes))
  );

  insert into public.partnership_domain_claims(user_id, domain, partnership_id)
  select pu.user_id, d.domain, p.id
  from public.partnerships p
  join public.partnership_users pu on pu.partnership_id = p.id
  cross join lateral (values
    ('kpis'::public.share_domain,p.shared_kpis),
    ('attendance'::public.share_domain,p.shared_attendance),
    ('notes'::public.share_domain,p.shared_notes)
  ) d(domain, shared)
  where p.is_active and d.shared
    and not exists (
      select 1 from public.partnership_domain_claims claim
      where claim.user_id = pu.user_id and claim.domain = d.domain and claim.partnership_id = p.id
    );
  return null;
exception when unique_violation then
  raise exception 'A member already has an active partnership sharing one of the selected domains.'
    using errcode = '23514';
end;
$$;

commit;
