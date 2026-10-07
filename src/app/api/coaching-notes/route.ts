import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { isUuid } from '@/lib/businessReviews';
import { implementationActorClient, implementationError, invalidImplementationRequest } from '@/lib/implementationApi';
import { canAccessImplementationWorkspace } from '@/lib/implementationWorkspaceServer';
import { loadCoachingNotes } from '@/lib/coachingNotesServer';
import { COACHING_NOTE_MAX_LENGTH } from '@/types/coachingNotes';

export const dynamic = 'force-dynamic';

function coachingNotesError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code ?? '')) {
    return NextResponse.json({ error: 'The coaching notes database update has not been applied yet.' }, { status: 503 });
  }
  return implementationError(error);
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId || !isUuid(userId)) invalidImplementationRequest('A valid member is required.');
    const admin = getAdminClient();
    if (!await canAccessImplementationWorkspace(admin, guard.user.id, guard.roleCodes, userId)) {
      return NextResponse.json({ error: 'You do not have access to these coaching notes.' }, { status: 403 });
    }
    return NextResponse.json(await loadCoachingNotes(admin, userId));
  } catch (error) { return coachingNotesError(error); }
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  try {
    const input = await request.json().catch(() => invalidImplementationRequest('A JSON request is required.'));
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => !['userId', 'body', 'requestId'].includes(key))
      || typeof input.userId !== 'string' || !isUuid(input.userId)
      || typeof input.requestId !== 'string' || !isUuid(input.requestId)
      || typeof input.body !== 'string' || !input.body.trim() || input.body.trim().length > COACHING_NOTE_MAX_LENGTH) {
      invalidImplementationRequest(`A member, unique request ID and note of 1–${COACHING_NOTE_MAX_LENGTH} characters are required.`);
    }
    const admin = getAdminClient();
    if (!await canAccessImplementationWorkspace(admin, guard.user.id, guard.roleCodes, input.userId)) {
      return NextResponse.json({ error: 'You do not have access to these coaching notes.' }, { status: 403 });
    }
    const { error } = await implementationActorClient(request, guard).rpc('add_general_coaching_note', {
      _user_id: input.userId, _body: input.body.trim(), _request_id: input.requestId,
    });
    if (error) throw error;
    return NextResponse.json(await loadCoachingNotes(admin, input.userId));
  } catch (error) { return coachingNotesError(error); }
}
