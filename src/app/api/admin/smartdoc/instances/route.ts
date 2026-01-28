import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type Body = {
  user_id?: string;
  course_id?: number;
  only_submitted?: boolean;
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.user_id || !body?.course_id) {
    return NextResponse.json({ error: 'user_id and course_id are required' }, { status: 400 });
  }

  const adminClient = getAdminClient();
  const { data, error } = await adminClient.rpc('list_user_smartdoc_instances', {
    _user_id: body.user_id,
    _course_id: body.course_id,
    _only_submitted: body.only_submitted ?? false,
  });

  if (error) {
    return NextResponse.json({ error: 'Admin instances fetch failed', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
