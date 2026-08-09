import { NextRequest, NextResponse } from 'next/server';
import { invalidateAdminUserDirectory } from '@/lib/adminUserDirectory';
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
  email: string;
};

type PartnershipMember = {
  user_id: string;
  full_name: string;
  email: string;
};

type Partnership = PartnershipRow & {
  members: PartnershipMember[];
};

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error';
}

async function buildPartnershipsWithMembers(rows: PartnershipRow[]): Promise<Partnership[]> {
  if (rows.length === 0) return [];

  const partnershipIds = rows.map((p) => p.id);

  // 1) membership rows
  const { data: membershipRows, error: membershipError } = await supabaseAdmin
    .from('partnership_users')
    .select('partnership_id, user_id')
    .in('partnership_id', partnershipIds);

  if (membershipError) {
    console.error('partnership_users fetch error', membershipError);
    throw new Error('Failed to load partnership members');
  }

  const membership = (membershipRows ?? []) as PartnershipUserRow[];
  if (membership.length === 0) {
    return rows.map((p) => ({ ...p, members: [] }));
  }

  const userIds = Array.from(new Set(membership.map((m) => m.user_id)));

  // 2) profiles (names)
  const { data: profileRows, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', userIds);

  if (profileError) {
    console.error('profiles fetch error', profileError);
    throw new Error('Failed to load partnership member profiles');
  }

  // 3) emails (auth.users, service role only)
  const { data: authRows, error: authError } = await supabaseAdmin
    .schema('auth')
    .from('users')
    .select('id, email')
    .in('id', userIds);

  if (authError) {
    // Not fatal; we’ll just show blank emails
    console.warn('auth.users fetch warning', authError);
  }

  const profiles = (profileRows ?? []) as ProfileRow[];
  const profileMap = new Map<string, ProfileRow>(profiles.map((p) => [p.id, p]));
  const emails = (authRows ?? []) as AuthUserRow[];
  const emailMap = new Map<string, string>(emails.map((u) => [u.id, (u.email ?? '').toLowerCase()]));

  const membersByPartnership = new Map<string, PartnershipMember[]>();
  membership.forEach((m) => {
    const profile = profileMap.get(m.user_id);
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
    const email = emailMap.get(m.user_id) || '';
    const member: PartnershipMember = {
      user_id: m.user_id,
      full_name: fullName || email || m.user_id,
      email,
    };
    const list = membersByPartnership.get(m.partnership_id) ?? [];
    list.push(member);
    membersByPartnership.set(m.partnership_id, list);
  });

  return rows.map((p) => ({
    ...p,
    members: membersByPartnership.get(p.id) ?? [],
  }));
}

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();

    const { data, error } = await supabaseAdmin
      .from('partnerships')
      .select(
        'id, name, shared_kpis, shared_attendance, shared_notes, is_active, created_at',
      )
      .order('created_at', { ascending: false });

    if (error) {
      console.error('partnerships GET error', error);
      return NextResponse.json(
        { error: 'Failed to load partnerships' },
        { status: 500 },
      );
    }

    const baseRows = (data ?? []) as PartnershipRow[];
    const items = await buildPartnershipsWithMembers(baseRows);

    return NextResponse.json({ items });
  } catch (err: unknown) {
    console.error('partnerships GET unexpected error', err);
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const raw = (await req.json().catch(() => ({} as unknown))) ?? {};
    const body = raw as Record<string, unknown>;

    const name =
      typeof body.name === 'string' && body.name.trim().length > 0
        ? body.name.trim()
        : null;

    const shared_kpis = Boolean(body['shared_kpis']);
    const shared_attendance = Boolean(body['shared_attendance']);
    const shared_notes = Boolean(body['shared_notes']);
    const is_active =
      typeof body['is_active'] === 'boolean' ? (body['is_active'] as boolean) : true;

    const user_ids = toStringArray(body['user_ids']);

    // Insert partnership
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('partnerships')
      .insert({
        name,
        shared_kpis,
        shared_attendance,
        shared_notes,
        is_active,
      })
      .select(
        'id, name, shared_kpis, shared_attendance, shared_notes, is_active, created_at',
      )
      .single();

    if (insertError || !inserted) {
      console.error('partnerships POST insert error', insertError);
      return NextResponse.json(
        { error: 'Failed to create partnership' },
        { status: 500 },
      );
    }

    const base = inserted as PartnershipRow;

    // Insert members (if any) — DB trigger will reject overlaps
    if (user_ids.length > 0) {
      const memberRows = user_ids.map((uid) => ({
        partnership_id: base.id,
        user_id: uid,
      }));
      const { error: membersError } = await supabaseAdmin
        .from('partnership_users')
        .insert(memberRows);

      if (membersError) {
        console.error('partnership_users insert error', membersError);
        return NextResponse.json(
          {
            error:
              membersError.message ||
              'Failed to add members to partnership. Check for overlapping active partnerships.',
          },
          { status: 400 },
        );
      }
    }

    const [withMembers] = await buildPartnershipsWithMembers([base]);
    invalidateAdminUserDirectory();
    return NextResponse.json(withMembers, { status: 201 });
  } catch (err: unknown) {
    console.error('partnerships POST unexpected error', err);
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}
