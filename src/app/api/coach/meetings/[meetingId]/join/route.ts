import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { coachHomeRange } from '@/lib/coachHomeShared';
import { loadCoachAssignments, loadCoachSchedule } from '@/lib/coachSchedule';
import { resolveCoachMeetingJoinUrl } from '@/lib/coachMeetingJoin';

export const dynamic = 'force-dynamic';

function unavailable(status: number) {
  return new NextResponse('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Call link unavailable</title><body style="font:16px system-ui;max-width:36rem;margin:4rem auto;padding:1rem"><h1>Call link unavailable</h1><p>Please try again or check your coaching calendar for the call link.</p><a href="/coach">Back to coaching home</a></body></html>', {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ meetingId: string }> }) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  if (!guard.roleCodes.some((role) => role === 'coach' || role === 'implementation_coach')) {
    return NextResponse.json({ error: 'Coach access required.' }, { status: 403 });
  }
  const { meetingId } = await context.params;
  const id = Number(meetingId);
  if (!/^\d+$/.test(meetingId) || !Number.isSafeInteger(id) || id <= 0) return unavailable(404);
  try {
    const client = getAdminClient();
    const assignments = await loadCoachAssignments(client, guard.user.id);
    const meetings = await loadCoachSchedule(client, guard.user.id, assignments, coachHomeRange('UTC'), id);
    const appointmentId = meetings[0]?.meeting.ghl_appointment_id;
    if (!appointmentId) return unavailable(404);
    const url = await resolveCoachMeetingJoinUrl(appointmentId);
    if (!url) return unavailable(404);
    const response = NextResponse.redirect(url, 303);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return unavailable(503);
  }
}
