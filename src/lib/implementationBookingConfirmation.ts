import type { ImplementationMeeting, ImplementationWorkspaceResponse } from '@/types/implementationWorkspace';

export type BookingConfirmationTarget = {
  userId: string;
  noteId: number;
  meetingId: number;
  sessionId: string | null;
};

type BookingConfirmationResult = {
  status: 'saved' | 'waiting_for_session';
  workspace: ImplementationWorkspaceResponse;
};

class BookingConfirmationError extends Error {
  constructor(message: string, readonly retryable = false) { super(message); }
}

const SAVE_ERROR = 'The booking confirmation could not be saved. Please retry saving the confirmation.';

function targetMeeting(workspace: ImplementationWorkspaceResponse, target: BookingConfirmationTarget): ImplementationMeeting {
  if (!workspace || workspace.selectedNoteId !== target.noteId || !Array.isArray(workspace.meetings)) {
    throw new BookingConfirmationError('The booking confirmation belongs to a different coaching cycle.');
  }
  const matches = workspace.meetings.filter(meeting => meeting?.id === target.meetingId);
  if (matches.length !== 1) throw new BookingConfirmationError('The original implementation meeting could not be found.');
  const meeting = matches[0];
  if (meeting.cancelled !== false) throw new BookingConfirmationError('This implementation meeting is cancelled; its booking confirmation cannot be changed.');
  const session = meeting.session;
  if (target.sessionId !== null && session?.id !== target.sessionId) {
    throw new BookingConfirmationError('The original implementation meeting session has changed.');
  }
  if (session && (typeof session.id !== 'string' || !session.id || session.noteId !== target.noteId
    || session.meetingId !== target.meetingId || !Number.isSafeInteger(session.revision) || session.revision < 0
    || typeof session.nextMeetingBooked !== 'boolean')) {
    throw new BookingConfirmationError('The original implementation meeting session could not be verified.');
  }
  return meeting;
}

async function readWorkspace(response: Response): Promise<ImplementationWorkspaceResponse> {
  if (response.redirected || response.status === 401) {
    throw new BookingConfirmationError('Your session expired. Sign in again, then retry saving the booking confirmation.');
  }
  if (response.status === 403) throw new BookingConfirmationError('You no longer have access to save this meeting’s booking confirmation.');
  if (!response.ok) throw new BookingConfirmationError(SAVE_ERROR, response.status === 409 || response.status >= 500);
  try { return await response.json() as ImplementationWorkspaceResponse; }
  catch { throw new BookingConfirmationError(SAVE_ERROR, true); }
}

/** Save a confirmed embed booking against its original meeting, without changing notes or attendance. */
export async function saveImplementationBookingConfirmation(
  originalTarget: BookingConfirmationTarget,
  request: typeof fetch = fetch,
): Promise<BookingConfirmationResult> {
  // Keep the event's source fixed even if the caller navigates while a request is in flight.
  const target = { ...originalTarget };
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(target.userId)
    || !Number.isSafeInteger(target.noteId) || target.noteId < 1
    || !Number.isSafeInteger(target.meetingId) || target.meetingId < 1
    || (target.sessionId !== null && (typeof target.sessionId !== 'string' || !target.sessionId))) {
    throw new BookingConfirmationError('A valid original member, coaching cycle, and implementation meeting are required.');
  }
  const query = new URLSearchParams({ userId: target.userId, noteId: String(target.noteId) });
  const reload = async () => {
    let response: Response;
    try { response = await request(`/api/implementation-workspace?${query}`, { cache: 'no-store' }); }
    catch { throw new BookingConfirmationError(SAVE_ERROR); }
    const workspace = await readWorkspace(response);
    targetMeeting(workspace, target);
    return workspace;
  };
  let workspace = await reload();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const meeting = targetMeeting(workspace, target);
    if (!meeting.session) return { status: 'waiting_for_session', workspace };
    if (meeting.session.nextMeetingBooked) return { status: 'saved', workspace };
    // An initially unstarted meeting can acquire a session. Pin it before the first write.
    target.sessionId ??= meeting.session.id;
    try {
      const response = await request('/api/implementation-workspace', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: target.userId, noteId: target.noteId, meetingId: target.meetingId,
          operation: 'set_next_meeting_booked', expectedRevision: meeting.session.revision, payload: { booked: true } }),
      });
      const savedWorkspace = await readWorkspace(response);
      const savedMeeting = targetMeeting(savedWorkspace, target);
      if (savedMeeting.session?.nextMeetingBooked) return { status: 'saved', workspace: savedWorkspace };
    } catch (error) {
      if (error instanceof BookingConfirmationError && !error.retryable) throw error;
      // A lost acknowledgement can still mean the write committed. Read before sending again.
    }
    workspace = await reload();
    if (targetMeeting(workspace, target).session?.nextMeetingBooked) return { status: 'saved', workspace };
  }
  throw new BookingConfirmationError(SAVE_ERROR);
}
