import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';

/** Serve the guide behind the same authenticated admin boundary as the tools. */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  try {
    const guide = await readFile(
      path.join(process.cwd(), 'docs', 'discovery-admin-quickref.html'),
      'utf8',
    );
    return new NextResponse(guide, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'private, no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    });
  } catch (error) {
    console.error('[discovery-guide] could not read guide', error);
    return NextResponse.json({ error: 'The admin guide is unavailable.' }, { status: 500 });
  }
}
