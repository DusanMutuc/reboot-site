import { NextRequest, NextResponse } from 'next/server';
import { resolveAmbassadorHubUrl } from '@/lib/ambassadorHub';
import { requireUser } from '@/lib/requireUser';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const result = await resolveAmbassadorHubUrl(guard.user);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ url: result.url });
}
