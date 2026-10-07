import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { isIsoDate, isUuid } from '@/lib/businessReviews';
import { implementationActorClient, implementationError, invalidImplementationRequest } from '@/lib/implementationApi';
import { canAccessImplementationWorkspace, loadImplementationWorkspace } from '@/lib/implementationWorkspaceServer';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  try {
    const body = await request.json().catch(() => invalidImplementationRequest('A JSON request is required.'));
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !['userId', 'noteId', 'meetingDate', 'requestId'].includes(key))
      || typeof body.userId !== 'string' || !isUuid(body.userId)
      || !Number.isSafeInteger(body.noteId) || body.noteId <= 0
      || typeof body.meetingDate !== 'string' || !isIsoDate(body.meetingDate)
      || typeof body.requestId !== 'string' || !isUuid(body.requestId)) {
      invalidImplementationRequest('A valid member, coaching cycle, meeting date and unique request ID are required.');
    }
    const admin = getAdminClient();
    if (!await canAccessImplementationWorkspace(admin, guard.user.id, guard.roleCodes, body.userId)) {
      return NextResponse.json({ error: 'You do not have access to this implementation workspace.' }, { status: 403 });
    }
    const note = await admin.from('coaching_notes').select('id').eq('id', body.noteId).eq('user_id', body.userId).maybeSingle();
    if (note.error) throw note.error;
    if (!note.data) invalidImplementationRequest('This coaching cycle does not belong to the member.');
    const { data, error } = await implementationActorClient(request, guard).rpc('create_implementation_meeting', {
      _user_id: body.userId, _note_id: body.noteId, _meeting_date: body.meetingDate, _request_id: body.requestId,
    });
    if (error) throw error;
    if (!data || Array.isArray(data) || !Number.isSafeInteger(data.meeting_id) || data.meeting_id <= 0 || typeof data.created !== 'boolean') {
      throw new Error('Implementation meeting creation returned an invalid result.');
    }
    return NextResponse.json({ meetingId: data.meeting_id, created: data.created,
      ...(await loadImplementationWorkspace(admin, body.userId, body.noteId)) });
  } catch (error) { return implementationError(error); }
}
