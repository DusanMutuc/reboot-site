import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/requireUser';
import { isMemberDiscoveryEnabled } from '@/lib/discoveryFlags';

type PreferenceRequest = {
  resourceId?: unknown;
  preference?: unknown;
};

export async function POST(request: NextRequest) {
  if (!isMemberDiscoveryEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  let body: PreferenceRequest;
  try {
    body = (await request.json()) as PreferenceRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid recommendation feedback.' }, { status: 400 });
  }

  const resourceId =
    typeof body.resourceId === 'number' &&
    Number.isSafeInteger(body.resourceId) &&
    body.resourceId > 0
      ? body.resourceId
      : null;
  const preference =
    body.preference === 'finished' || body.preference === 'not_interested'
      ? body.preference
      : null;

  if (!resourceId || !preference) {
    return NextResponse.json({ error: 'Invalid recommendation feedback.' }, { status: 400 });
  }

  const { error } = await guard.supabase.from('user_resource_discovery_preferences').upsert(
    {
      user_id: guard.user.id,
      resource_id: resourceId,
      preference,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,resource_id' },
  );

  if (error) {
    console.error('[discovery-preferences] feedback write failed', error);
    return NextResponse.json({ error: 'Could not save that feedback.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
