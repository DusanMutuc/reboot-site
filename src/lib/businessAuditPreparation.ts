import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';

import { BUSINESS_AUDIT_TIMEZONE } from '@/lib/businessAuditConfig';
import type {
  BusinessAuditPreparationAnswers,
  BusinessAuditPreparationAudit,
  BusinessAuditPreparationPayload,
} from '@/lib/businessAuditPreparationShared';

type BusinessReviewRow = {
  id: number;
  review_date: string;
  status: 'draft' | 'completed';
  meeting_id: number | null;
};

type MeetingRow = {
  id: number;
  ghl_appointment_id: string | null;
  title: string | null;
  date: string;
  starts_at: string | null;
  meeting_timezone: string | null;
  ghl_status: string | null;
};

type PreparationResponseRow = {
  business_review_id: number;
  business_forward_wins: string;
  personal_forward_wins: string;
  greatest_business_challenge: string;
  greatest_personal_challenge: string;
  desired_call_outcome: string;
  topics_to_discuss: string;
  business_rating: number;
  personal_rating: number;
  submitted_at: string;
  updated_at: string;
};

function isCancelledStatus(status: string | null): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase().replace(/[\s_-]+/g, '');
  return ['cancelled', 'canceled', 'deleted', 'invalid', 'noshow'].includes(normalized);
}

function mapAnswers(row: PreparationResponseRow | null): BusinessAuditPreparationAnswers | null {
  if (!row) return null;
  return {
    businessForwardWins: row.business_forward_wins,
    personalForwardWins: row.personal_forward_wins,
    greatestBusinessChallenge: row.greatest_business_challenge,
    greatestPersonalChallenge: row.greatest_personal_challenge,
    desiredCallOutcome: row.desired_call_outcome,
    topicsToDiscuss: row.topics_to_discuss,
    businessRating: Number(row.business_rating),
    personalRating: Number(row.personal_rating),
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

function mapAudit(
  review: BusinessReviewRow,
  meeting: MeetingRow,
  today: string,
): BusinessAuditPreparationAudit {
  return {
    id: Number(review.id),
    reviewDate: review.review_date,
    status: review.status,
    meetingId: Number(meeting.id),
    appointmentId: meeting.ghl_appointment_id,
    title: meeting.title,
    startsAt: meeting.starts_at,
    timezone: meeting.meeting_timezone || BUSINESS_AUDIT_TIMEZONE,
    timing: review.review_date >= today ? 'upcoming' : 'past',
  };
}

async function loadAnswers(
  client: SupabaseClient,
  businessReviewId: number,
): Promise<BusinessAuditPreparationAnswers | null> {
  const { data, error } = await client
    .from('business_review_preparation_responses')
    .select(
      'business_review_id, business_forward_wins, personal_forward_wins, greatest_business_challenge, greatest_personal_challenge, desired_call_outcome, topics_to_discuss, business_rating, personal_rating, submitted_at, updated_at',
    )
    .eq('business_review_id', businessReviewId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return mapAnswers((data as PreparationResponseRow | null) ?? null);
}

async function findPreparationAudit(
  client: SupabaseClient,
  userId: string,
): Promise<{ review: BusinessReviewRow; meeting: MeetingRow } | null> {
  const today = DateTime.now().setZone(BUSINESS_AUDIT_TIMEZONE).toISODate();
  const { data: reviewData, error: reviewError } = await client
    .from('business_reviews')
    .select('id, review_date, status, meeting_id')
    .eq('user_id', userId)
    .not('meeting_id', 'is', null)
    .order('review_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(100);

  if (reviewError) throw new Error(reviewError.message);
  const reviews = (reviewData ?? []) as BusinessReviewRow[];
  const meetingIds = reviews
    .map((review) => review.meeting_id)
    .filter((meetingId): meetingId is number => meetingId !== null);
  if (meetingIds.length === 0) return null;

  const { data: meetingData, error: meetingError } = await client
    .from('meetings')
    .select(
      'id, ghl_appointment_id, title, date, starts_at, meeting_timezone, ghl_status',
    )
    .in('id', meetingIds);

  if (meetingError) throw new Error(meetingError.message);
  const meetingById = new Map(
    ((meetingData ?? []) as MeetingRow[]).map((meeting) => [Number(meeting.id), meeting]),
  );

  const eligible = reviews.filter((review) => {
    if (review.meeting_id === null) return false;
    const meeting = meetingById.get(Number(review.meeting_id));
    return Boolean(meeting && !isCancelledStatus(meeting.ghl_status));
  });
  const upcoming = eligible
    .filter((review) => review.review_date >= (today ?? '1970-01-01'))
    .sort(
      (left, right) =>
        left.review_date.localeCompare(right.review_date) || Number(left.id) - Number(right.id),
    );
  const past = eligible
    .filter((review) => review.review_date < (today ?? '1970-01-01'))
    .sort(
      (left, right) =>
        right.review_date.localeCompare(left.review_date) || Number(right.id) - Number(left.id),
    );
  const review = upcoming[0] ?? past[0];
  if (review?.meeting_id !== null && review?.meeting_id !== undefined) {
    const meeting = meetingById.get(Number(review.meeting_id));
    if (meeting) return { review, meeting };
  }
  return null;
}

export async function loadBusinessAuditPreparation(
  client: SupabaseClient,
  userId: string,
): Promise<BusinessAuditPreparationPayload | null> {
  const target = await findPreparationAudit(client, userId);
  if (!target) return null;
  const today = DateTime.now().setZone(BUSINESS_AUDIT_TIMEZONE).toISODate() ?? '1970-01-01';

  return {
    audit: mapAudit(target.review, target.meeting, today),
    answers: await loadAnswers(client, Number(target.review.id)),
  };
}

export async function userCanEditBusinessAuditPreparation(
  client: SupabaseClient,
  userId: string,
  businessReviewId: number,
): Promise<boolean> {
  const { data, error } = await client
    .from('business_reviews')
    .select('id, meeting_id')
    .eq('id', businessReviewId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.meeting_id) return false;

  const { data: meeting, error: meetingError } = await client
    .from('meetings')
    .select('ghl_status')
    .eq('id', data.meeting_id)
    .maybeSingle();

  if (meetingError) throw new Error(meetingError.message);
  return Boolean(meeting && !isCancelledStatus(meeting.ghl_status));
}

export async function upsertBusinessAuditPreparation(
  client: SupabaseClient,
  businessReviewId: number,
  answers: Omit<BusinessAuditPreparationAnswers, 'submittedAt' | 'updatedAt'>,
): Promise<BusinessAuditPreparationAnswers> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('business_review_preparation_responses')
    .upsert(
      {
        business_review_id: businessReviewId,
        business_forward_wins: answers.businessForwardWins,
        personal_forward_wins: answers.personalForwardWins,
        greatest_business_challenge: answers.greatestBusinessChallenge,
        greatest_personal_challenge: answers.greatestPersonalChallenge,
        desired_call_outcome: answers.desiredCallOutcome,
        topics_to_discuss: answers.topicsToDiscuss,
        business_rating: answers.businessRating,
        personal_rating: answers.personalRating,
        submitted_at: now,
        updated_at: now,
      },
      { onConflict: 'business_review_id' },
    )
    .select(
      'business_review_id, business_forward_wins, personal_forward_wins, greatest_business_challenge, greatest_personal_challenge, desired_call_outcome, topics_to_discuss, business_rating, personal_rating, submitted_at, updated_at',
    )
    .single();

  if (error) throw new Error(error.message);
  const mapped = mapAnswers(data as PreparationResponseRow);
  if (!mapped) throw new Error('The saved preparation form could not be reloaded.');
  return mapped;
}
