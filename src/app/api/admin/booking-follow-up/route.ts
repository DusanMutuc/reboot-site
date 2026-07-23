import { NextRequest, NextResponse } from 'next/server';

import { buildBookingFollowUp } from '@/lib/bookingFollowUp';
import { requireAdmin } from '@/lib/requireAdmin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  try {
    const result = await buildBookingFollowUp();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[booking-follow-up] Admin report failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not build booking follow-up.' },
      { status: 500 },
    );
  }
}
