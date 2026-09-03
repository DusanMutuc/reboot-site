import { NextRequest, NextResponse } from 'next/server';
import { fetchCoachingWorkspaceUserIdSet } from '@/lib/currentMembers';
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
  ghl_contact_id: string | null;
  ghl_user_id: string | null;
};

function buildFullName(profile: ProfileRow | undefined, email: string): string {
  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim();
  return name || email || 'Unnamed student';
}

function resolveRequestedUserId(
  requestedId: string | null,
  userIds: string[],
  profiles: ProfileRow[],
): string | null {
  if (!requestedId) return null;
  if (userIds.includes(requestedId)) return requestedId;

  const matches = profiles.filter((profile) =>
    [profile.ghl_contact_id, profile.ghl_user_id].some(
      (ghlId) => ghlId?.trim() === requestedId,
    ),
  );

  return matches.length === 1 ? matches[0].id : null;
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const supa = getAdminClient();
  const requestedId = request.nextUrl.searchParams.get('requestedId')?.trim() || null;

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
    const coachingWorkspaceUserIdSet = await fetchCoachingWorkspaceUserIdSet(supa);
    const userIds = assignedUserIds.filter((userId) => coachingWorkspaceUserIdSet.has(userId));

    if (userIds.length === 0) {
      return NextResponse.json({ items: [], resolved_user_id: null });
    }

    const [
      { data: profiles, error: profileError },
      legendUserIdSet,
    ] = await Promise.all([
      supa
        .from('profiles')
        .select('id, first_name, last_name, ghl_contact_id, ghl_user_id')
        .in('id', userIds),
      fetchLegendUserIdSet(supa, userIds),
    ]);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    const profileRows = (profiles ?? []) as ProfileRow[];
    const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
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

    return NextResponse.json({
      items,
      resolved_user_id: resolveRequestedUserId(requestedId, userIds, profileRows),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load students.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
