import { NextRequest, NextResponse } from 'next/server';
import { fetchCurrentMemberUserIdSet } from '@/lib/currentMembers';
import { fetchLegendUserIdSet } from '@/lib/legendMembers';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type CoachAssignmentRow = {
  user_id: string;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

function buildFullName(profile: ProfileRow | undefined, email: string): string {
  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim();
  return name || email || 'Unnamed student';
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const supa = getAdminClient();

  try {
    const { data: assignmentRows, error: assignmentError } = await supa
      .from('user_coaches')
      .select('user_id')
      .eq('coach_id', guard.user.id)
      .eq('is_active', true);

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 400 });
    }

    const assignedUserIds = Array.from(
      new Set(((assignmentRows ?? []) as CoachAssignmentRow[]).map((row) => row.user_id)),
    );
    const currentMemberUserIdSet = await fetchCurrentMemberUserIdSet(supa);
    const userIds = assignedUserIds.filter((userId) => currentMemberUserIdSet.has(userId));

    if (userIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const [
      { data: profiles, error: profileError },
      legendUserIdSet,
    ] = await Promise.all([
      supa
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', userIds),
      fetchLegendUserIdSet(supa, userIds),
    ]);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    const profileById = new Map(
      ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
    );
    const emailMap = new Map<string, string>();
    const userIdSet = new Set(userIds);
    const perPage = 1000;

    for (let page = 1; ; page += 1) {
      const { data, error } = await supa.auth.admin.listUsers({ page, perPage });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      for (const user of data.users) {
        if (userIdSet.has(user.id)) {
          emailMap.set(user.id, (user.email || '').toLowerCase());
        }
      }

      if (data.users.length < perPage) break;
    }

    const items = userIds
      .map((userId) => {
        const email = emailMap.get(userId) ?? '';

        return {
          id: userId,
          full_name: buildFullName(profileById.get(userId), email),
          email: email || null,
          is_legend: legendUserIdSet.has(userId),
        };
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load students.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
