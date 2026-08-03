begin;

create table if not exists public.business_review_preparation_responses (
  business_review_id bigint primary key
    references public.business_reviews (id)
    on delete cascade,

  business_forward_wins text not null,
  personal_forward_wins text not null,
  greatest_business_challenge text not null,
  greatest_personal_challenge text not null,
  desired_call_outcome text not null,
  topics_to_discuss text not null,
  business_rating smallint not null,
  personal_rating smallint not null,

  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_review_prep_business_forward_required
    check (btrim(business_forward_wins) <> ''),
  constraint business_review_prep_personal_forward_required
    check (btrim(personal_forward_wins) <> ''),
  constraint business_review_prep_business_challenge_required
    check (btrim(greatest_business_challenge) <> ''),
  constraint business_review_prep_personal_challenge_required
    check (btrim(greatest_personal_challenge) <> ''),
  constraint business_review_prep_call_outcome_required
    check (btrim(desired_call_outcome) <> ''),
  constraint business_review_prep_topics_required
    check (btrim(topics_to_discuss) <> ''),
  constraint business_review_prep_business_rating_valid
    check (business_rating between 1 and 10 and business_rating not in (5, 7)),
  constraint business_review_prep_personal_rating_valid
    check (personal_rating between 1 and 10 and personal_rating not in (5, 7))
);

comment on table public.business_review_preparation_responses is
  'The student-submitted preparation form for one Business Audit. Ownership is derived from business_reviews.user_id.';

comment on column public.business_review_preparation_responses.submitted_at is
  'Timestamp of the most recent complete submission. Students may edit and resubmit answers.';

alter table public.business_review_preparation_responses enable row level security;

-- Students read and write through the authenticated website API, which verifies
-- business_reviews.user_id before using the service-role client. No direct
-- browser policies are intentionally installed.
revoke all on table public.business_review_preparation_responses from anon, authenticated;
grant all on table public.business_review_preparation_responses to service_role;

commit;
