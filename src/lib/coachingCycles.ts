import type { SupabaseClient } from '@supabase/supabase-js';

import { getBusinessAuditLocalDate } from '@/lib/businessAuditConfig';
import { isCancelledGhlStatus } from '@/lib/businessReviews';

export type CoachingCycleKind = 'business_audit' | 'm2';

export type CoachingCycle = {
  id: string;
  noteId: number;
  kind: CoachingCycleKind;
  cycleDate: string;
  businessReviewId: number | null;
  cancelled: boolean;
  isFuture: boolean;
};

export type CoachingCyclesPayload = {
  cycles: CoachingCycle[];
  activeCycleId: string | null;
  nextAuditDate: string | null;
};

type CoachingNoteRow = {
  id: number;
  created_at: string;
  m2_meeting_id: number | null;
};

type BusinessReviewRow = {
  id: number;
  coaching_note_id: number;
  meeting_id: number | null;
  review_date: string;
};

type MeetingRow = {
  id: number;
  date: string;
  ghl_status: string | null;
};

function toDateOnly(value: string): string {
  const dateOnly = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)
    ? dateOnly
    : getBusinessAuditLocalDate(new Date(value));
}

export function selectActiveCoachingCycle(
  cycles: CoachingCycle[],
  today = getBusinessAuditLocalDate(),
): CoachingCycle | null {
  const eligible = cycles.filter(
    (cycle) => !cycle.cancelled && cycle.cycleDate <= today,
  ).sort(
    (left, right) =>
      right.cycleDate.localeCompare(left.cycleDate) || right.noteId - left.noteId,
  );
  const latestAudit = eligible.find((cycle) => cycle.kind === 'business_audit');

  if (latestAudit) return latestAudit;

  return eligible.find((cycle) => cycle.kind === 'm2') ?? null;
}

export async function loadCoachingCycles(
  client: SupabaseClient,
  studentId: string,
): Promise<CoachingCyclesPayload> {
  const [notesResult, reviewsResult] = await Promise.all([
    client
      .from('coaching_notes')
      .select('id, created_at, m2_meeting_id')
      .eq('user_id', studentId),
    client
      .from('business_reviews')
      .select('id, coaching_note_id, meeting_id, review_date')
      .eq('user_id', studentId)
      .order('review_date', { ascending: false })
      .order('id', { ascending: false }),
  ]);

  if (notesResult.error) {
    throw new Error(notesResult.error.message);
  }

  if (reviewsResult.error) {
    throw new Error(reviewsResult.error.message);
  }

  const notes = (notesResult.data ?? []) as CoachingNoteRow[];
  const reviews = (reviewsResult.data ?? []) as BusinessReviewRow[];
  const meetingIds = Array.from(
    new Set(
      [
        ...notes.map((note) => note.m2_meeting_id),
        ...reviews.map((review) => review.meeting_id),
      ].filter((id): id is number => id != null),
    ),
  );

  let meetings: MeetingRow[] = [];

  if (meetingIds.length > 0) {
    const meetingsResult = await client
      .from('meetings')
      .select('id, date, ghl_status')
      .in('id', meetingIds);

    if (meetingsResult.error) {
      throw new Error(meetingsResult.error.message);
    }

    meetings = (meetingsResult.data ?? []) as MeetingRow[];
  }

  const meetingById = new Map(meetings.map((meeting) => [Number(meeting.id), meeting]));
  const reviewByNoteId = new Map<number, BusinessReviewRow>();

  // Reviews arrive newest first, so the first relationship is the canonical one
  // if legacy data ever contains more than one review for a note.
  reviews.forEach((review) => {
    if (!reviewByNoteId.has(Number(review.coaching_note_id))) {
      reviewByNoteId.set(Number(review.coaching_note_id), review);
    }
  });

  const today = getBusinessAuditLocalDate();
  const cycles = notes
    .map<CoachingCycle>((note) => {
      const noteId = Number(note.id);
      const review = reviewByNoteId.get(noteId);

      if (review) {
        const meetingStatus = review.meeting_id
          ? meetingById.get(Number(review.meeting_id))?.ghl_status
          : null;

        return {
          id: `business_audit:${Number(review.id)}`,
          noteId,
          kind: 'business_audit',
          cycleDate: review.review_date,
          businessReviewId: Number(review.id),
          cancelled: isCancelledGhlStatus(meetingStatus),
          isFuture: review.review_date > today,
        };
      }

      const meetingDate = note.m2_meeting_id
        ? meetingById.get(Number(note.m2_meeting_id))?.date
        : null;
      const cycleDate = meetingDate ?? toDateOnly(note.created_at);

      return {
        id: `m2:${noteId}`,
        noteId,
        kind: 'm2',
        cycleDate,
        businessReviewId: null,
        cancelled: false,
        isFuture: cycleDate > today,
      };
    })
    .sort(
      (left, right) =>
        right.cycleDate.localeCompare(left.cycleDate) || right.noteId - left.noteId,
    );

  const activeCycle = selectActiveCoachingCycle(cycles, today);
  const nextAuditDate = cycles
    .filter(
      (cycle) =>
        cycle.kind === 'business_audit' &&
        !cycle.cancelled &&
        cycle.cycleDate > today,
    )
    .sort((left, right) => left.cycleDate.localeCompare(right.cycleDate))[0]
    ?.cycleDate ?? null;

  return {
    cycles,
    activeCycleId: activeCycle?.id ?? null,
    nextAuditDate,
  };
}
