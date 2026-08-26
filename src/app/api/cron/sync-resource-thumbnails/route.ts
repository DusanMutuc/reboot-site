import { NextRequest, NextResponse } from 'next/server';

import { syncNativeResourceThumbnails } from '@/lib/resourceThumbnailSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

  try {
    const report = await syncNativeResourceThumbnails();
    return NextResponse.json({ ok: true, ...report });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Thumbnail synchronization failed.';
    console.error('[resource thumbnails]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
