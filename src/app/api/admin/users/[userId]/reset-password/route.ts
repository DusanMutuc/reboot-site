import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type Params = { params: Promise<{ userId?: string | string[] | undefined }> };

async function resolveUserId(context: Params) {
  const rawParams = await context.params;
  const value = Array.isArray(rawParams?.userId) ? rawParams?.userId[0] : rawParams?.userId;
  return typeof value === 'string' ? value : null;
}

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(request: NextRequest, context: Params) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const userId = await resolveUserId(context);
  if (!userId || !isUuid(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const supa = getAdminClient();

  const { data, error } = await supa.auth.admin.getUserById(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const email = data.user?.email;
  if (!email) {
    return NextResponse.json({ error: 'User has no email on record' }, { status: 400 });
  }

  const { error: resetErr } = await supa.auth.resetPasswordForEmail(email);
  if (resetErr) {
    return NextResponse.json({ error: resetErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
