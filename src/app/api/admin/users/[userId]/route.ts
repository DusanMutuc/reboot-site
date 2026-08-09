import { NextRequest, NextResponse } from 'next/server';

import { invalidateAdminUserDirectory } from '@/lib/adminUserDirectory';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { fetchUserRoleCodes, hasRoleCode } from '@/lib/userRoles';

type Params = { params: Promise<{ userId?: string | string[] | undefined }> };

type EditableUserPayload = Partial<{
  first_name: string;
  last_name: string;
  phone: string | null;
  ghl_user_id: string | null;
  introduced_at: string | null;
  is_legend: boolean;
  is_past_member: boolean;
}>;

async function resolveUserId(context: Params) {
  const rawParams = await context.params;
  const value = Array.isArray(rawParams?.userId) ? rawParams.userId[0] : rawParams?.userId;
  return typeof value === 'string' ? value : null;
}

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

async function fetchUserPayload(userId: string) {
  const supa = getAdminClient();

  const [
    { data: profile, error: profileErr },
    { data: authData, error: authErr },
  ] = await Promise.all([
    supa
      .from('profiles')
      .select('first_name, last_name, ghl_user_id, introduced_at')
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

  let roleCodes: string[];
  try {
    roleCodes = await fetchUserRoleCodes(supa, userId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load user roles';
    return { error: message, status: 400 } as const;
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
      ghl_user_id: profile.ghl_user_id?.trim() ?? '',
      introduced_at: profile.introduced_at ?? null,
      is_legend: hasRoleCode(roleCodes, 'legend'),
      is_past_member: hasRoleCode(roleCodes, 'past_member'),
    },
  } as const;
}

async function getRoleIdByCode(code: string) {
  const supa = getAdminClient();
  const { data, error } = await supa.from('roles').select('id').eq('code', code).maybeSingle();

  if (error) {
    return { error: error.message, id: null } as const;
  }

  return { error: null, id: data?.id ?? null } as const;
}

async function syncRoleAssignment(userId: string, roleCode: string, enabled: boolean) {
  const supa = getAdminClient();
  const { id: roleId, error: roleError } = await getRoleIdByCode(roleCode);

  if (roleError) {
    return { error: roleError } as const;
  }

  if (!roleId) {
    return { error: `${roleCode} role not found` } as const;
  }

  if (enabled) {
    const { error } = await supa
      .from('user_roles')
      .upsert({ user_id: userId, role_id: roleId }, { onConflict: 'user_id,role_id', ignoreDuplicates: true });

    return { error: error?.message ?? null } as const;
  }

  const { error } = await supa
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role_id', roleId);

  return { error: error?.message ?? null } as const;
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

  const payload = body as EditableUserPayload;
  const {
    first_name,
    last_name,
    phone,
    ghl_user_id,
    introduced_at,
    is_legend,
    is_past_member,
  } = payload;

  const profileUpdates: Record<string, string | null> = {};

  if (typeof first_name === 'string') {
    profileUpdates.first_name = first_name.trim();
  }

  if (typeof last_name === 'string') {
    profileUpdates.last_name = last_name.trim();
  }

  if (typeof ghl_user_id === 'string') {
    const trimmed = ghl_user_id.trim();
    profileUpdates.ghl_user_id = trimmed === '' ? null : trimmed;
  } else if (ghl_user_id === null) {
    profileUpdates.ghl_user_id = null;
  }

  if (typeof introduced_at === 'string') {
    const trimmed = introduced_at.trim();
    profileUpdates.introduced_at = trimmed === '' ? null : trimmed;
  } else if (introduced_at === null) {
    profileUpdates.introduced_at = null;
  }

  const supa = getAdminClient();

  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await supa.from('profiles').update(profileUpdates).eq('id', userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  if (typeof phone === 'string' || phone === null) {
    const nextPhone = phone === null ? '' : phone.trim();
    const { error } = await supa.auth.admin.updateUserById(userId, { phone: nextPhone });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const updatesRoleFlags =
    Object.prototype.hasOwnProperty.call(payload, 'is_legend') ||
    Object.prototype.hasOwnProperty.call(payload, 'is_past_member');

  let existingRoleCodes: string[] = [];
  if (updatesRoleFlags) {
    try {
      existingRoleCodes = await fetchUserRoleCodes(supa, userId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load user roles';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'is_legend')) {
    if (typeof is_legend !== 'boolean') {
      return NextResponse.json({ error: 'is_legend must be a boolean' }, { status: 400 });
    }

    const result = await syncRoleAssignment(userId, 'legend', is_legend);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'is_past_member')) {
    if (typeof is_past_member !== 'boolean') {
      return NextResponse.json({ error: 'is_past_member must be a boolean' }, { status: 400 });
    }

    if (!hasRoleCode(existingRoleCodes, 'user')) {
      return NextResponse.json(
        { error: 'past_member can only be assigned to member accounts.' },
        { status: 400 },
      );
    }

    const result = await syncRoleAssignment(userId, 'past_member', is_past_member);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  invalidateAdminUserDirectory();

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
    const { data: dbErr, error: rpcErr } = await supa.rpc('try_delete_user_db', { p_user_id: userId });

    if (rpcErr) {
      return NextResponse.json(
        { error: `deleteUser failed: ${res.error.message} | rpc failed: ${rpcErr.message}` },
        { status: 400 },
      );
    }

    if (dbErr) {
      return NextResponse.json(
        { error: `deleteUser failed: ${res.error.message} | db: ${dbErr}` },
        { status: 400 },
      );
    }

    invalidateAdminUserDirectory();
    return NextResponse.json({ ok: true, via: 'db_fallback' });
  }

  invalidateAdminUserDirectory();
  return NextResponse.json({ ok: true, via: 'gotrue' });
}
