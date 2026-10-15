import { NextRequest, NextResponse } from 'next/server';

import { buildBookingFollowUp } from '@/lib/bookingFollowUp';
import { requireUser } from '@/lib/requireUser';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const isCoach = guard.roleCodes.some(
    (roleCode) => roleCode === 'coach' || roleCode === 'implementation_coach',
  );
  if (!isCoach) {
    return NextResponse.json({ error: 'Coach access required.' }, { status: 403 });
  }

  const meetingType = request.nextUrl.searchParams.get('meetingType');
  if (meetingType && meetingType !== 'business-review') {
    return NextResponse.json({ error: 'Choose a valid follow-up meeting type.' }, { status: 400 });
  }

  try {
    const result = await buildBookingFollowUp({ coachId: guard.user.id, businessReviewOnly: meetingType === 'business-review' });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[booking-follow-up] Coach report failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not build booking follow-up.' },
      { status: 500 },
    );
  }
}
