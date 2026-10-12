import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { buildCoachHome } from '@/lib/coachHome';
import { coachHomeRange } from '@/lib/coachHomeShared';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  if (!guard.roleCodes.some((role) => role === 'coach' || role === 'implementation_coach')) {
    return NextResponse.json({ error: 'Coach access required.' }, { status: 403 });
  }
  let range;
  try {
    range = coachHomeRange(request.nextUrl.searchParams.get('tz') || 'UTC', request.nextUrl.searchParams.get('week'));
  } catch {
    return NextResponse.json({ error: 'Choose a valid timezone and week (YYYY-MM-DD).' }, { status: 400 });
  }
  try {
    return NextResponse.json(await buildCoachHome(guard.user.id, guard.roleCodes, range), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'The coaching dashboard could not be loaded. Please retry.' }, { status: 500 });
  }
}
