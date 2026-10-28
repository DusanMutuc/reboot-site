-- Drafts are private working copies. Only explicit submission changes the
-- existing response table consumed by coaches and submitted-status indicators.
create table public.business_review_preparation_drafts (
  business_review_id bigint primary key references public.business_reviews(id) on delete cascade,
  "values" jsonb not null check (jsonb_typeof("values") = 'object'),
  revision integer not null check (revision > 0),
  submitted_revision integer check (submitted_revision > 0 and submitted_revision <= revision),
  updated_at timestamptz not null default now(),
  last_request_id uuid not null
);
alter table public.business_review_preparation_drafts enable row level security;
revoke all on table public.business_review_preparation_drafts from public, anon, authenticated;
grant select, insert, update, delete on table public.business_review_preparation_drafts to service_role;
comment on table public.business_review_preparation_drafts is
  'Private student preparation draft. The authenticated website API verifies the review owner. Drafts are never coach submissions.';

create function public.save_business_review_preparation(
  _user_id uuid, _business_review_id bigint, _values jsonb,
  _expected_revision integer, _request_id uuid, _submit boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_review public.business_reviews%rowtype;
  v_draft public.business_review_preparation_drafts%rowtype;
  v_response public.business_review_preparation_responses%rowtype;
  v_key text;
  v_revision integer;
  v_now timestamptz := clock_timestamp();
begin
  if _user_id is null or _request_id is null or _submit is null
    or _expected_revision is null or _expected_revision < 0
    or _values is null or jsonb_typeof(_values) <> 'object' then
    raise exception 'Invalid preparation request' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(_values)) <> 8 then
    raise exception 'Exactly eight answer fields are required' using errcode = '22023';
  end if;
  foreach v_key in array array['businessForwardWins','personalForwardWins','greatestBusinessChallenge',
    'greatestPersonalChallenge','desiredCallOutcome','topicsToDiscuss'] loop
    if jsonb_typeof(_values->v_key) is distinct from 'string'
      or length(_values->>v_key) > 10000
      or (_submit and btrim(_values->>v_key) = '') then
      raise exception 'Invalid preparation text' using errcode = '22023';
    end if;
  end loop;
  foreach v_key in array array['businessRating','personalRating'] loop
    if not (_values ? v_key) or not (
      (not _submit and _values->v_key = 'null'::jsonb)
      or _values->v_key in ('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'6'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb)
    ) then
      raise exception 'Invalid preparation rating' using errcode = '22023';
    end if;
  end loop;

  -- Lock the review before the optional draft exists, serializing first saves
  -- as well as draft/submit races. The server binds _user_id to its auth guard.
  select * into v_review from public.business_reviews
    where id = _business_review_id and user_id = _user_id for update;
  if not found or v_review.meeting_id is null then
    raise exception 'Review is unavailable' using errcode = '42501';
  end if;
  perform 1 from public.meetings where id = v_review.meeting_id
    and regexp_replace(lower(coalesce(ghl_status,'')), '[[:space:]_-]+', '', 'g')
      not in ('cancelled','canceled','deleted','invalid','noshow') for share;
  if not found then raise exception 'Review is unavailable' using errcode = '42501'; end if;

  select * into v_draft from public.business_review_preparation_drafts where business_review_id = _business_review_id;
  select * into v_response from public.business_review_preparation_responses where business_review_id = _business_review_id;
  if v_draft.last_request_id = _request_id then
    if v_draft."values" is distinct from _values
      or _submit is distinct from coalesce(v_draft.submitted_revision = v_draft.revision, false) then
      raise exception 'Request ID has already been used' using errcode = '22023';
    end if;
    return jsonb_build_object('draft', to_jsonb(v_draft), 'answers', case when v_response.business_review_id is not null then to_jsonb(v_response) end);
  end if;
  if coalesce(v_draft.revision, 0) <> _expected_revision then
    raise exception 'Preparation revision conflict' using errcode = '40001';
  end if;
  v_revision := coalesce(v_draft.revision, 0) + 1;
  insert into public.business_review_preparation_drafts(business_review_id,"values",revision,submitted_revision,updated_at,last_request_id)
    values(_business_review_id,_values,v_revision,case when _submit then v_revision else v_draft.submitted_revision end,v_now,_request_id)
    on conflict(business_review_id) do update set "values"=excluded."values",revision=excluded.revision,
      submitted_revision=excluded.submitted_revision,updated_at=excluded.updated_at,last_request_id=excluded.last_request_id
    returning * into v_draft;
  if _submit then
    insert into public.business_review_preparation_responses(business_review_id,business_forward_wins,personal_forward_wins,
      greatest_business_challenge,greatest_personal_challenge,desired_call_outcome,topics_to_discuss,business_rating,personal_rating,submitted_at,updated_at)
    values(_business_review_id,btrim(_values->>'businessForwardWins'),btrim(_values->>'personalForwardWins'),
      btrim(_values->>'greatestBusinessChallenge'),btrim(_values->>'greatestPersonalChallenge'),
      btrim(_values->>'desiredCallOutcome'),btrim(_values->>'topicsToDiscuss'),
      (_values->>'businessRating')::smallint,(_values->>'personalRating')::smallint,v_now,v_now)
    on conflict(business_review_id) do update set business_forward_wins=excluded.business_forward_wins,
      personal_forward_wins=excluded.personal_forward_wins,greatest_business_challenge=excluded.greatest_business_challenge,
      greatest_personal_challenge=excluded.greatest_personal_challenge,desired_call_outcome=excluded.desired_call_outcome,
      topics_to_discuss=excluded.topics_to_discuss,business_rating=excluded.business_rating,personal_rating=excluded.personal_rating,
      submitted_at=excluded.submitted_at,updated_at=excluded.updated_at
    returning * into v_response;
  end if;
  return jsonb_build_object('draft', to_jsonb(v_draft), 'answers', case when v_response.business_review_id is not null then to_jsonb(v_response) end);
end;
$$;
revoke all on function public.save_business_review_preparation(uuid,bigint,jsonb,integer,uuid,boolean) from public,anon,authenticated;
grant execute on function public.save_business_review_preparation(uuid,bigint,jsonb,integer,uuid,boolean) to service_role;
