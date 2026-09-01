import { NextRequest, NextResponse } from 'next/server';

import { invalidateAdminUserDirectory } from '@/lib/adminUserDirectory';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type Params = { params: Promise<{ userId?: string | string[] | undefined }> };

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(request: NextRequest, context: Params) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const rawParams = await context.params;
  const userId = Array.isArray(rawParams?.userId) ? rawParams.userId[0] : rawParams?.userId;
  if (!userId || !isUuid(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const { data, error } = await getAdminClient().rpc('promote_ninety_day_user', {
    p_user_id: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  invalidateAdminUserDirectory();
  return NextResponse.json({ ok: true, changed: data === true, user_id: userId });
}
