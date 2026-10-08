import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Past members may still recover their password and visit the ambassador hub.
  // Merged accounts are denied independently by requireUser.
  const guard = await requireUser(request, { allowPastMember: true, allowPendingSetup: true });
  if (!guard.ok) return guard.res;
  return NextResponse.json({ ok: true, setup_required: guard.user.app_metadata?.must_reset_password === true }, { headers: { 'Cache-Control': 'no-store' } });
}
