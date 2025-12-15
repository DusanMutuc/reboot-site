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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id
  );
}

type SupabaseAdminErrorLike = {
  message: string;
  status?: number;
  code?: string;
  details?: string;
  hint?: string;
  name?: string;
  cause?: unknown;
};

function formatAdminError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Unknown error';

  const e = err as SupabaseAdminErrorLike;

  const parts = [
    e.message ?? 'Unknown error',
    typeof e.status === 'number' ? `status=${e.status}` : null,
    typeof e.code === 'string' && e.code ? `code=${e.code}` : null,
    typeof e.details === 'string' && e.details ? `details=${e.details}` : null,
    typeof e.hint === 'string' && e.hint ? `hint=${e.hint}` : null,
    typeof e.name === 'string' && e.name ? `name=${e.name}` : null,
  ].filter((x): x is string => Boolean(x));

  return parts.join(' | ');
}

async function fetchUserPayload(userId: string) {
  const supa = getAdminClient();

  const [{ data: profile, error: profileErr }, { data: authData, error: authErr }] =
    await Promise.all([
      supa
        .from('profiles')
        .select('first_name, last_name, looker_link, ghl_user_id')
        .eq('id', userId)
        .maybeSingle(),
      supa.auth.admin.getUserById(userId),
    ]);

  if (profileErr) {
    return { error: profileErr.message, status: 400 } as const;
  }
  if (authErr) {
    return { error: authErr.message, status: 400 } as const;
  }

  const user = authData.user;
  if (!profile || !user) {
    return { error: 'User not found', status: 404 } as const;
  }

  return {
    payload: {
      id: userId,
      email: (user.email || '').toLowerCase(),
      phone: user.phone && user.phone.trim().length > 0 ? user.phone : null,
      first_name: profile.first_name ?? '',
      last_name: profile.last_name ?? '',
      looker_link: profile.looker_link?.trim() ?? '',
      ghl_user_id: profile.ghl_user_id?.trim() ?? '',
    },
  } as const;
}

export async function GET(request: NextRequest, context: Params) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const userId = await resolveUserId(context);
  if (!userId || !isUuid(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const result = await fetchUserPayload(userId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.payload);
}

export async function PATCH(request: NextRequest, context: Params) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const userId = await resolveUserId(context);
  if (!userId || !isUuid(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { first_name, last_name, looker_link, phone, ghl_user_id } = body as Partial<{
    first_name: string;
    last_name: string;
    looker_link: string | null;
    phone: string | null;
    ghl_user_id: string | null;
  }>;

  const profileUpdates: Record<string, string | null> = {};

  if (typeof first_name === 'string') {
    profileUpdates.first_name = first_name.trim();
  }
  if (typeof last_name === 'string') {
    profileUpdates.last_name = last_name.trim();
  }
  if (typeof looker_link === 'string') {
    profileUpdates.looker_link = looker_link.trim();
  } else if (looker_link === null) {
    profileUpdates.looker_link = '';
  }

  if (typeof ghl_user_id === 'string') {
    const trimmed = ghl_user_id.trim();
    profileUpdates.ghl_user_id = trimmed === '' ? null : trimmed;
  } else if (ghl_user_id === null) {
    profileUpdates.ghl_user_id = null;
  }

  const supa = getAdminClient();

  if (Object.keys(profileUpdates).length > 0) {
    const { error: updateErr } = await supa.from('profiles').update(profileUpdates).eq('id', userId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }
  }

  if (typeof phone === 'string' || phone === null) {
    const nextPhone = phone === null ? '' : phone.trim();
    const { error: phoneErr } = await supa.auth.admin.updateUserById(userId, {
      phone: nextPhone,
    });
    if (phoneErr) {
      return NextResponse.json({ error: phoneErr.message }, { status: 400 });
    }
  }

  const result = await fetchUserPayload(userId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.payload);
}

export async function DELETE(request: NextRequest, context: Params) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const userId = await resolveUserId(context);
  if (!userId || !isUuid(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const supa = getAdminClient();

  const res = await supa.auth.admin.deleteUser(userId);

  if (res.error) {
    console.error('deleteUser failed', { userId, error: res.error });
    return NextResponse.json({ error: formatAdminError(res.error) }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
