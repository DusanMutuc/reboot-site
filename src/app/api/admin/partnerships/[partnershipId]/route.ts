import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/requireAdmin';

const supabaseAdmin = getAdminClient();

type PartnershipRow = {
  id: string;
  name: string | null;
  shared_kpis: boolean;
  shared_attendance: boolean;
  shared_notes: boolean;
  is_active: boolean;
  created_at: string;
};

type PartnershipUserRow = {
  partnership_id: string;
  user_id: string;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type AuthUserRow = {
  id: string;
  email: string | null;
};

type PartnershipMember = {
  user_id: string;
  full_name: string;
  email: string;
};

type Partnership = PartnershipRow & {
  members: PartnershipMember[];
};

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error';
}

async function buildPartnershipWithMembers(row: PartnershipRow): Promise<Partnership> {
  const { data: membershipRows, error: membershipError } = await supabaseAdmin
    .from('partnership_users')
    .select('partnership_id, user_id')
    .eq('partnership_id', row.id);

  if (membershipError) {
    console.error('partnership_users fetch error', membershipError);
    throw new Error('Failed to load partnership members');
  }

  const membership = (membershipRows ?? []) as PartnershipUserRow[];
  if (membership.length === 0) {
    return { ...row, members: [] };
  }

  const userIds = Array.from(new Set(membership.map((m) => m.user_id)));

  // Names
  const { data: profileRows, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', userIds);

  if (profileError) {
    console.error('profiles fetch error', profileError);
    throw new Error('Failed to load partnership member profiles');
  }

  // Emails
  const { data: authRows, error: authError } = await supabaseAdmin
    .schema('auth')
    .from('users')
    .select('id, email')
    .in('id', userIds);

  if (authError) {
    console.warn('auth.users fetch warning', authError);
  }

  const profiles = (profileRows ?? []) as ProfileRow[];
  const profileMap = new Map<string, ProfileRow>(profiles.map((p) => [p.id, p]));
  const emails = (authRows ?? []) as AuthUserRow[];
  const emailMap = new Map<string, string>(
    emails.map((u) => [u.id, (u.email ?? '').toLowerCase()])
  );

  const members: PartnershipMember[] = membership.map((m) => {
    const profile = profileMap.get(m.user_id);
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
    const email = emailMap.get(m.user_id) || '';
    return {
      user_id: m.user_id,
      full_name: fullName || email || m.user_id,
      email,
    };
  });

  return { ...row, members };
}

export async function PATCH(
  request: Request,
  context: { params: Record<string, string> },
) {
  try {
    await requireAdmin();
    const id = context.params.partnershipId;

    const raw = (await request.json().catch(() => ({} as unknown))) ?? {};
    const body = raw as Record<string, unknown>;

    const name =
      typeof body.name === 'string' && body.name.trim().length > 0
        ? body.name.trim()
        : null;

    const shared_kpis =
      typeof body.shared_kpis === 'boolean' ? body.shared_kpis : undefined;
    const shared_attendance =
      typeof body.shared_attendance === 'boolean'
        ? body.shared_attendance
        : undefined;
    const shared_notes =
      typeof body.shared_notes === 'boolean' ? body.shared_notes : undefined;
    const is_active =
      typeof body.is_active === 'boolean' ? body.is_active : undefined;

    const user_ids: string[] = Array.isArray(body.user_ids)
      ? (body.user_ids as unknown[]).filter((uid): uid is string => typeof uid === 'string')
      : [];

    const updatePayload: Partial<PartnershipRow> = {};
    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      updatePayload.name = name;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'shared_kpis') &&
      shared_kpis !== undefined
    ) {
      updatePayload.shared_kpis = shared_kpis;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'shared_attendance') &&
      shared_attendance !== undefined
    ) {
      updatePayload.shared_attendance = shared_attendance;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'shared_notes') &&
      shared_notes !== undefined
    ) {
      updatePayload.shared_notes = shared_notes;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'is_active') &&
      is_active !== undefined
    ) {
      updatePayload.is_active = is_active;
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('partnerships')
        .update(updatePayload)
        .eq('id', id);

      if (updateError) {
        console.error('partnerships PATCH update error', updateError);
        return NextResponse.json(
          { error: 'Failed to update partnership' },
          { status: 500 },
        );
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'user_ids')) {
      const { data: currentRows, error: currentError } = await supabaseAdmin
        .from('partnership_users')
        .select('user_id')
        .eq('partnership_id', id);

      if (currentError) {
        console.error('partnership_users fetch error', currentError);
        return NextResponse.json(
          { error: 'Failed to load current members' },
          { status: 500 },
        );
      }

      const existingIds = new Set(
        ((currentRows ?? []) as PartnershipUserRow[]).map((r) => r.user_id),
      );
      const desiredIds = new Set(user_ids);

      const toAdd: string[] = [];
      const toRemove: string[] = [];

      for (const uid of desiredIds) if (!existingIds.has(uid)) toAdd.push(uid);
      for (const uid of existingIds) if (!desiredIds.has(uid)) toRemove.push(uid);

      if (toRemove.length > 0) {
        const { error: deleteError } = await supabaseAdmin
          .from('partnership_users')
          .delete()
          .eq('partnership_id', id)
          .in('user_id', toRemove);

        if (deleteError) {
          console.error('partnership_users delete error', deleteError);
          return NextResponse.json(
            { error: 'Failed to remove members from partnership' },
            { status: 500 },
          );
        }
      }

      if (toAdd.length > 0) {
        const memberRows = toAdd.map((uid) => ({
          partnership_id: id,
          user_id: uid,
        }));

        const { error: addError } = await supabaseAdmin
          .from('partnership_users')
          .insert(memberRows);

        if (addError) {
          console.error('partnership_users add error', addError);
          return NextResponse.json(
            {
              error:
                addError.message ||
                'Failed to add members to partnership. Check for overlapping active partnerships.',
            },
            { status: 400 },
          );
        }
      }
    }

    const { data: row, error: fetchError } = await supabaseAdmin
      .from('partnerships')
      .select(
        'id, name, shared_kpis, shared_attendance, shared_notes, is_active, created_at',
      )
      .eq('id', id)
      .single();

    if (fetchError || !row) {
      console.error('partnerships PATCH fetch error', fetchError);
      return NextResponse.json(
        { error: 'Partnership not found after update' },
        { status: 404 },
      );
    }

    const full = await buildPartnershipWithMembers(row as PartnershipRow);
    return NextResponse.json(full);
  } catch (err: unknown) {
    console.error('partnerships PATCH unexpected error', err);
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Record<string, string> },
) {
  try {
    await requireAdmin();
    const id = context.params.partnershipId;

    const { data, error } = await supabaseAdmin
      .from('partnerships')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('partnerships DELETE error', error);
      return NextResponse.json(
        { error: 'Failed to delete partnership' },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Partnership not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('partnerships DELETE unexpected error', err);
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}
