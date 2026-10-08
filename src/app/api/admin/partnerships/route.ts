import { NextRequest, NextResponse } from 'next/server';
import { invalidateAdminUserDirectory } from '@/lib/adminUserDirectory';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/requireAdmin';
import { savePartnership } from '@/lib/partnershipMutation';

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

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error';
}

async function buildPartnershipsWithMembers(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  rows: PartnershipRow[],
): Promise<Partnership[]> {
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

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;
    const supabaseAdmin = getAdminClient();

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
    const items = await buildPartnershipsWithMembers(supabaseAdmin, baseRows);

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
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;
    const changes: unknown = await req.json().catch(() => null);
    const result = await savePartnership(getAdminClient(), null, changes);
    if (!result.ok) return result.response;
    invalidateAdminUserDirectory();
    return NextResponse.json(result.data, { status: 201 });
  } catch (err: unknown) {
    console.error('partnerships POST unexpected error', err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
