import { NextRequest, NextResponse } from 'next/server';

import { getAdminClient } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hasValidCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(
    cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`,
  );
}

export async function GET(request: NextRequest) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await getAdminClient().rpc('maintain_discovery_analytics');
  if (error) {
    console.error('[discovery-maintenance]', error);
    return NextResponse.json({ error: 'Discovery maintenance failed.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, report: data });
}
