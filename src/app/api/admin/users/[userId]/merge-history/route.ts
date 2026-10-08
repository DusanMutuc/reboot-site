import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getAdminUserDirectoryUser } from '@/lib/adminUserDirectory';
import { currentAccountId, fetchAdminAccountMerges, type AdminAccountMergeHistory } from '@/lib/adminAccountMerges';

export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;
  const { userId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  try {
    const supa = getAdminClient();
    const [profile, merges] = await Promise.all([getAdminUserDirectoryUser(userId), fetchAdminAccountMerges(supa)]);
    if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const sourceMerge = merges.find((merge) => merge.source_user_id === userId);
    const currentId = currentAccountId(userId, merges);
    const relevant = merges.filter((merge) => currentAccountId(merge.dest_user_id, merges) === currentId);
    const actorIds = [...new Set(relevant.flatMap((merge) => merge.actor_user_id ? [merge.actor_user_id] : []))];
    const actors = new Map(await Promise.all(actorIds.map(async (id) => {
      const [profileResult, authResult] = await Promise.all([
        supa.from('profiles').select('first_name, last_name').eq('id', id).maybeSingle(),
        supa.auth.admin.getUserById(id),
      ]);
      if (profileResult.error) throw new Error(profileResult.error.message);
      if (authResult.error && authResult.error.status !== 404) throw new Error(authResult.error.message);
      const email = authResult.data?.user?.email ?? '';
      const name = `${profileResult.data?.first_name ?? ''} ${profileResult.data?.last_name ?? ''}`.trim() || email || 'Former administrator';
      return [id, { id, name, email }] as const;
    })));
    const history = relevant.map<AdminAccountMergeHistory>((merge) => ({
      source_user_id: merge.source_user_id,
      source_name: `${merge.source_snapshot?.profile?.first_name ?? ''} ${merge.source_snapshot?.profile?.last_name ?? ''}`.trim(),
      source_email: merge.source_email ?? '',
      source_ghl_user_id: merge.source_snapshot?.profile?.ghl_user_id ?? null,
      source_ghl_contact_id: merge.source_snapshot?.profile?.ghl_contact_id ?? null,
      dest_user_id: merge.dest_user_id,
      dest_email: merge.dest_email ?? '',
      merged_at: merge.merged_at,
      actor: merge.actor_user_id ? actors.get(merge.actor_user_id) ?? null : null,
      execution_actor: !merge.actor_user_id && merge.source_snapshot?.execution_actor === 'system' ? 'system' : 'administrator',
    })).sort((a, b) => b.merged_at.localeCompare(a.merged_at));
    const destination = currentId === userId ? null : await getAdminUserDirectoryUser(currentId);
    if (currentId !== userId && !destination) throw new Error('Current account could not be loaded.');

    return NextResponse.json({
      profile: sourceMerge ? {
        ...profile, merged_at: sourceMerge.merged_at, merged_into_user_id: sourceMerge.dest_user_id,
        is_current_member: false, is_ninety_day_user: false, is_past_member: false, is_legend: false,
        email: sourceMerge.source_email ?? profile.email,
      } : profile,
      current_account: destination ? {
        id: destination.id,
        name: `${destination.first_name} ${destination.last_name}`.trim() || destination.email,
        email: destination.email,
      } : null,
      history,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load account history.' }, { status: 500 });
  }
}
