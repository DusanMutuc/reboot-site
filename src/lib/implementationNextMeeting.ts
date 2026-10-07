import type { ImplementationMeeting, UpcomingBusinessReview } from '@/types/implementationWorkspace';
import { implementationLocalDate } from './implementationMeetingSelection';

export type ImplementationNextMeeting = {
  type: 'implementation' | 'business_review';
  label: string;
  reason: 'scheduled' | 'cycle_complete' | 'continue_cycle' | 'cycle_ended';
  implementationCount: number;
  historical: boolean;
  scheduledMeeting: {
    meetingId: number | null;
    reviewId: number | null;
    date: string;
    startsAt: string | null;
    timezone: string;
    title: string | null;
  } | null;
};

type Input = {
  selectedMeeting: ImplementationMeeting | null;
  meetings: readonly ImplementationMeeting[];
  upcomingBusinessReview: UpcomingBusinessReview | null;
  cycleStartDate?: string | null;
  cycleEndDate?: string | null;
};

type DatedMeeting = { date: string; startsAt: string | null };

function startTime(meeting: DatedMeeting): number | null {
  const time = meeting.startsAt ? Date.parse(meeting.startsAt) : NaN;
  return Number.isFinite(time) ? time : null;
}

// Dates define cycle membership. Within a day, only actual appointment times
// establish an order; IDs and session creation times are not meeting times.
function compareMeetings(left: DatedMeeting, right: DatedMeeting): number {
  const dateOrder = left.date.localeCompare(right.date);
  if (dateOrder) return dateOrder;
  const leftTime = startTime(left);
  const rightTime = startTime(right);
  return leftTime !== null && rightTime !== null ? leftTime - rightTime : 0;
}

/**
 * Plans the next call from the meeting being wrapped up, including when viewing
 * history. The existing booking follow-up cadence is three implementations per
 * review (bookingFollowUp.ts). Here attendance distinguishes completed work from
 * missed appointments; the selected session itself is the call being wrapped up.
 */
export function getImplementationNextMeeting(input: Input, now = new Date()): ImplementationNextMeeting | null {
  const { selectedMeeting: selected, meetings, upcomingBusinessReview: review,
    cycleStartDate, cycleEndDate } = input;
  if (!selected || selected.cancelled) return null;

  const belongsToCycle = (meeting: ImplementationMeeting) => Boolean(meeting.session)
    || ((!cycleStartDate || meeting.date >= cycleStartDate) && (!cycleEndDate || meeting.date < cycleEndDate));
  // Workspace meetings are already cycle-scoped. Preserve pinned sessions even
  // if their appointment was subsequently moved beyond the cycle boundary.
  const eligible = [...new Map(meetings.filter((meeting) => !meeting.cancelled && belongsToCycle(meeting))
    .map((meeting) => [meeting.id, meeting])).values()];
  const implementationCount = eligible.filter((meeting) => meeting.id !== selected.id
    && meeting.attended && compareMeetings(meeting, selected) < 0).length
    + (selected.session || selected.attended ? 1 : 0);
  const historical = selected.date < implementationLocalDate(selected.timezone, now);

  const nextImplementation = eligible.filter((meeting) => meeting.id !== selected.id
    && compareMeetings(meeting, selected) > 0)
    .sort((left, right) => compareMeetings(left, right) || left.id - right.id)[0];
  // The server supplies only this cycle's next noncancelled review. A date-only
  // review on the same day remains meaningful; do not fabricate its time.
  const nextReview = review && (review.date > selected.date || (review.date === selected.date
    && (startTime(review) === null || startTime(selected) === null || compareMeetings(review, selected) > 0)))
    ? review : null;
  const cycleEnded = Boolean(cycleEndDate && selected.date >= cycleEndDate);
  const nextIsReview = implementationCount >= 3 || cycleEnded;

  // A booked review does not replace missing implementation calls. An explicit
  // extra implementation before the review may extend the usual three-call plan.
  if (!cycleEnded && nextImplementation && (!nextReview || compareMeetings(nextImplementation, nextReview) < 0)) {
    return {
      type: 'implementation', label: 'Implementation meeting', reason: 'scheduled', implementationCount, historical,
      scheduledMeeting: { meetingId: nextImplementation.id, reviewId: null, date: nextImplementation.date,
        startsAt: nextImplementation.startsAt, timezone: nextImplementation.timezone, title: nextImplementation.title },
    };
  }
  if (nextIsReview && nextReview) {
    return {
      type: 'business_review', label: 'Business Review', reason: 'scheduled', implementationCount, historical,
      scheduledMeeting: { meetingId: nextReview.meetingId, reviewId: nextReview.reviewId, date: nextReview.date,
        startsAt: nextReview.startsAt, timezone: nextReview.timezone, title: nextReview.title },
    };
  }
  return {
    type: nextIsReview ? 'business_review' : 'implementation',
    label: nextIsReview ? 'Business Review' : 'Implementation meeting',
    reason: implementationCount >= 3 ? 'cycle_complete' : cycleEnded ? 'cycle_ended' : 'continue_cycle',
    implementationCount, historical, scheduledMeeting: null,
  };
}
