import { NextRequest, NextResponse } from 'next/server';

import { invalidateAdminUserDirectory } from '@/lib/adminUserDirectory';
import { fetchCoachingWorkspaceUserIdSet } from '@/lib/currentMembers';
import { activePause, loadMemberPauses } from '@/lib/memberPauses';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type Context = { params: Promise<{ userId: string }> };

async function readUserId(context: Context): Promise<string | null> {
  const { userId } = await context.params;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    ? userId
    : null;
}

export async function POST(request: NextRequest, context: Context) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;
  const userId = await readUserId(context);
  if (!userId) return NextResponse.json({ error: 'Invalid member id.' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const reasonValue = body && typeof body === 'object' && 'reason' in body
    ? (body as { reason: unknown }).reason
    : null;
  if (reasonValue !== null && typeof reasonValue !== 'string') {
    return NextResponse.json({ error: 'Reason must be text.' }, { status: 400 });
  }
  const reason = reasonValue?.trim() || null;
  if (reason && reason.length > 1000) {
    return NextResponse.json({ error: 'Reason must be 1000 characters or fewer.' }, { status: 400 });
  }

  try {
    const client = getAdminClient();
    const eligibleMembers = await fetchCoachingWorkspaceUserIdSet(client);
    if (!eligibleMembers.has(userId)) {
      return NextResponse.json({ error: 'Only current coaching members can be paused.' }, { status: 400 });
    }
    const { data, error } = await client
      .from('member_pauses')
      .insert({ user_id: userId, reason, started_by: guard.user.id })
      .select('id, user_id, started_at, ended_at, reason')
      .single();
    if (error) {
      return NextResponse.json(
        { error: error.code === '23505' ? 'This member is already paused.' : error.message },
        { status: error.code === '23505' ? 409 : 400 },
      );
    }
    invalidateAdminUserDirectory();
    return NextResponse.json({ pause: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not pause member.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;
  const userId = await readUserId(context);
  if (!userId) return NextResponse.json({ error: 'Invalid member id.' }, { status: 400 });

  try {
    const client = getAdminClient();
    const pauseMap = await loadMemberPauses(client, [userId], true);
    const pause = activePause(pauseMap.get(userId));
    if (!pause) return NextResponse.json({ error: 'This member is not paused.' }, { status: 409 });
    const { data, error } = await client
      .from('member_pauses')
      .update({ ended_at: new Date().toISOString(), ended_by: guard.user.id })
      .eq('id', pause.id)
      .is('ended_at', null)
      .select('id')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: 'This member was already resumed.' }, { status: 409 });
    invalidateAdminUserDirectory();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not resume member.' }, { status: 500 });
  }
}
