import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingCoach, ImplementationBookingCoaches } from '@/types/implementationWorkspace';

const PROGRAM_COURSE_ID = 2;

function safeBookingUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw || !/^https?:\/\//i.test(raw) || /[\u0000-\u001f\u007f\\]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

// The workspace route authorizes access to this member before resolving links.
// Resolve assignments for the selected member, never the signed-in coach.
export async function loadImplementationBookingCoaches(
  client: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<ImplementationBookingCoaches> {
  const assignmentFor = async (relationship: 'implementation' | 'primary'): Promise<string | null> => {
    for (const courseId of [PROGRAM_COURSE_ID, null]) {
      let query = client.from('user_coaches').select('coach_id')
        .eq('user_id', userId).eq('relationship_type', relationship).eq('is_active', true)
        .or(`ended_at.is.null,ended_at.gt.${now.toISOString()}`)
        .order('assigned_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(1);
      query = courseId === null ? query.is('course_id', null) : query.eq('course_id', courseId);
      const result = await query;
      if (result.error) throw result.error;
      if (result.data?.[0]) return result.data[0].coach_id;
    }
    return null;
  };
  const [implementationId, businessReviewId] = await Promise.all([
    assignmentFor('implementation'), assignmentFor('primary'),
  ]);
  const coachIds = [...new Set([implementationId, businessReviewId].filter((id): id is string => id !== null))];
  if (!coachIds.length) return { implementation: null, businessReview: null };
  const [profiles, bookingProfiles] = await Promise.all([
    client.from('profiles').select('id,first_name,last_name').in('id', coachIds),
    client.from('coach_profiles').select('user_id,impl_booking_url,m2_booking_url').in('user_id', coachIds),
  ]);
  if (profiles.error) throw profiles.error;
  if (bookingProfiles.error) throw bookingProfiles.error;
  const coach = (coachId: string | null, field: 'impl_booking_url' | 'm2_booking_url'): BookingCoach | null => {
    if (coachId === null) return null;
    const profile = profiles.data?.find((row) => row.id === coachId);
    const bookingProfile = bookingProfiles.data?.find((row) => row.user_id === coachId);
    return { coachId, name: [profile?.first_name?.trim(), profile?.last_name?.trim()].filter(Boolean).join(' ') || 'Assigned coach',
      url: safeBookingUrl(bookingProfile?.[field]) };
  };
  return { implementation: coach(implementationId, 'impl_booking_url'), businessReview: coach(businessReviewId, 'm2_booking_url') };
}
