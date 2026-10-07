import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { isUuid, parsePositiveInteger } from '@/lib/businessReviews';
import { implementationActorClient, implementationError, invalidImplementationRequest } from '@/lib/implementationApi';
import { canAccessImplementationWorkspace, loadImplementationWorkspace } from '@/lib/implementationWorkspaceServer';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    const note = request.nextUrl.searchParams.get('noteId');
    const noteId = note ? parsePositiveInteger(note) : undefined;
    if (!userId || !isUuid(userId) || (note && !noteId)) invalidImplementationRequest('A valid member and coaching cycle are required.');
    const admin = getAdminClient();
    if (!await canAccessImplementationWorkspace(admin, guard.user.id, guard.roleCodes, userId)) {
      return NextResponse.json({ error: 'You do not have access to this implementation workspace.' }, { status: 403 });
    }
    return NextResponse.json(await loadImplementationWorkspace(admin, userId, noteId ?? undefined));
  } catch (error) { return implementationError(error); }
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  try {
    const body = await request.json().catch(() => invalidImplementationRequest('A JSON request is required.'));
    if (!body || typeof body.userId !== 'string' || !isUuid(body.userId)
      || !Number.isSafeInteger(body.noteId) || body.noteId <= 0 || !Number.isSafeInteger(body.meetingId) || body.meetingId <= 0
      || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0
      || !['start', 'save_notes', 'toggle_step', 'add_step_note', 'complete_meeting', 'reopen_meeting', 'set_attendance', 'set_action_status', 'set_next_meeting_booked'].includes(body.operation)
      || (body.payload != null && (typeof body.payload !== 'object' || Array.isArray(body.payload)))) {
      invalidImplementationRequest('A valid meeting, operation and current revision are required.');
    }
    if (body.operation === 'set_next_meeting_booked' && (!body.payload || typeof body.payload.booked !== 'boolean'
      || Object.keys(body.payload).some((key) => key !== 'booked'))) {
      invalidImplementationRequest('Booking status must contain only a booked boolean.');
    }
    const admin = getAdminClient();
    if (!await canAccessImplementationWorkspace(admin, guard.user.id, guard.roleCodes, body.userId)) {
      return NextResponse.json({ error: 'You do not have access to this implementation workspace.' }, { status: 403 });
    }
    // Bind the supplied note to the authorized member before invoking the RPC.
    const note = await admin.from('coaching_notes').select('id').eq('id', body.noteId).eq('user_id', body.userId).maybeSingle();
    if (note.error) throw note.error;
    if (!note.data) invalidImplementationRequest('This coaching cycle does not belong to the member.');
    const { error } = await implementationActorClient(request, guard).rpc('mutate_implementation_workspace', {
      _note_id: body.noteId, _meeting_id: body.meetingId, _operation: body.operation,
      _payload: body.payload ?? {}, _expected_revision: body.expectedRevision,
    });
    if (error) throw error;
    return NextResponse.json(await loadImplementationWorkspace(admin, body.userId, body.noteId));
  } catch (error) { return implementationError(error); }
}
