import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoachingCycle } from '@/lib/coachingCycles';
import { isCancelledGhlStatus } from '@/lib/businessReviews';
import { implementationLocalDate } from '@/lib/implementationMeetingSelection';
import type { UpcomingBusinessReview } from '@/types/implementationWorkspace';

function reviewTimezone(value: string | null): string {
  const timezone = value?.trim() || 'America/Edmonton';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format();
    return timezone;
  } catch { return 'America/Edmonton'; }
}

export async function loadUpcomingBusinessReview(
  client: SupabaseClient,
  userId: string,
  cycles: CoachingCycle[],
  selectedCycle: CoachingCycle | null,
  now = new Date(),
): Promise<UpcomingBusinessReview | null> {
  const following = cycles.filter((cycle) => cycle.kind === 'business_audit' && !cycle.cancelled
    && cycle.businessReviewId !== null && (!selectedCycle || cycle.cycleDate > selectedCycle.cycleDate
      || (selectedCycle.kind === 'business_audit' && cycle.cycleDate === selectedCycle.cycleDate
        && cycle.businessReviewId > (selectedCycle.businessReviewId ?? 0))))
    .sort((left, right) => left.cycleDate.localeCompare(right.cycleDate)
      || (left.businessReviewId ?? 0) - (right.businessReviewId ?? 0));
  // A historical cycle's next review is its boundary. Do not replace a past or
  // completed boundary with an unrelated review from a later coaching cycle.
  const candidates = selectedCycle ? following.slice(0, 1) : following;
  for (const cycle of candidates) {
    const review = await client.from('business_reviews').select('id,meeting_id,review_date,status')
      .eq('id', cycle.businessReviewId).eq('user_id', userId).maybeSingle();
    if (review.error) throw review.error;
    if (!review.data || review.data.status !== 'draft') continue;
    let upcoming: Omit<UpcomingBusinessReview, 'isToday'> = {
      reviewId: Number(review.data.id), meetingId: null, date: review.data.review_date,
      startsAt: null, timezone: 'America/Edmonton', title: null,
    };
    if (review.data.meeting_id !== null) {
      const meeting = await client.from('meetings').select('id,date,title,starts_at,meeting_timezone,ghl_status')
        .eq('id', review.data.meeting_id).maybeSingle();
      if (meeting.error) throw meeting.error;
      if (!meeting.data || isCancelledGhlStatus(meeting.data.ghl_status)) continue;
      upcoming = { ...upcoming, meetingId: Number(meeting.data.id), date: meeting.data.date,
        startsAt: meeting.data.starts_at, timezone: reviewTimezone(meeting.data.meeting_timezone), title: meeting.data.title };
    }
    // A saved date-only manual review is an explicit scheduled record. Merely
    // having nextAuditDate in the cycle summary never creates a placeholder card.
    const today = implementationLocalDate(upcoming.timezone, now);
    if (upcoming.date >= today) return { ...upcoming, isToday: upcoming.date === today };
  }
  return null;
}
