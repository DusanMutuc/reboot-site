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

  try {
    const result = await buildBookingFollowUp({ coachId: guard.user.id });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[booking-follow-up] Coach report failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not build booking follow-up.' },
      { status: 500 },
    );
  }
}
