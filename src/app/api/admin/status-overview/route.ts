import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminStatusOverviewRows } from '@/lib/statusOverviewData';
import type { StatusOverviewResponse } from '@/lib/statusOverviewTypes';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const items = await getAdminStatusOverviewRows();
    return NextResponse.json({ items } satisfies StatusOverviewResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load status overview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
