import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCoachingCycles } from '@/lib/coachingCycles';
import { isCancelledGhlStatus } from '@/lib/businessReviews';
import { loadImplementationGuides } from '@/lib/implementationGuidesServer';
import { implementationLocalDate, selectImplementationMeeting } from '@/lib/implementationMeetingSelection';
import { loadUpcomingBusinessReview } from '@/lib/upcomingBusinessReview';
import { loadImplementationBookingCoaches } from '@/lib/implementationBookingCoaches';
import { getContentNodeHref } from '@/lib/contentNodeLinks';
import { invalidImplementationRequest, isImplementationAdmin } from '@/lib/implementationApi';
import type { ImplementationGuideAudience, ImplementationGuideStep } from '@/types/implementationGuides';
import type { ImplementationAction, ImplementationSession, ImplementationWorkspaceResponse } from '@/types/implementationWorkspace';
import type { ActionStepStatus } from '@/types/coaching';

type SessionRow = {
  id: string; note_id: number; meeting_id: number; status: 'open' | 'completed'; revision: number;
  started_at: string; updated_at: string; completed_at: string | null; notes: string; commitments: string;
  progress_snapshot: ImplementationAction[]; next_meeting_booked: boolean;
};

export async function canAccessImplementationWorkspace(client: SupabaseClient, actorId: string, roles: readonly string[], userId: string) {
  if (isImplementationAdmin(roles)) return true;
  if (!roles.some((role) => ['coach', 'implementation_coach'].includes(role))) return false;
  const pair = await client.from('user_coaches').select('id').eq('coach_id', actorId).eq('user_id', userId)
    .eq('is_active', true).or(`ended_at.is.null,ended_at.gt.${new Date().toISOString()}`).limit(1);
  if (pair.error) throw pair.error;
  return Boolean(pair.data.length);
}

export async function loadImplementationWorkspace(client: SupabaseClient, userId: string, requestedNoteId?: number): Promise<ImplementationWorkspaceResponse> {
  const [cycles, attendance, sessionResult, meetingTypes, bookingCoaches] = await Promise.all([
    loadCoachingCycles(client, userId),
    client.from('meeting_attendance_base').select('meeting_id,attended').eq('user_id', userId),
    client.from('implementation_meeting_sessions').select('*').eq('user_id', userId),
    client.from('meeting_types').select('id').eq('code', 'IMPLEMENTATION_MEETING'),
    loadImplementationBookingCoaches(client, userId),
  ]);
  for (const result of [attendance, sessionResult, meetingTypes]) if (result.error) throw result.error;
  const cycle = requestedNoteId ? cycles.cycles.find((item) => item.noteId === requestedNoteId)
    : cycles.cycles.find((item) => item.id === cycles.activeCycleId);
  if (requestedNoteId && !cycle) invalidImplementationRequest('This coaching cycle does not belong to the member.');
  const empty = { ...cycles, selectedNoteId: null, cycleEndDate: null, meetings: [], upcomingBusinessReview: null, bookingCoaches, suggestedMeetingId: null, latestSessionId: null, actions: [], stepNotes: [], resources: [] };
  if (!cycle) return { ...empty, upcomingBusinessReview: await loadUpcomingBusinessReview(client, userId, cycles.cycles, null) };
  const cycleEndDate = cycles.cycles.filter((item) => !item.cancelled
    && (item.cycleDate > cycle.cycleDate || (cycle.kind === 'business_audit' && item.kind === 'business_audit'
      && item.cycleDate === cycle.cycleDate && (item.businessReviewId ?? 0) > (cycle.businessReviewId ?? 0)))
    && (cycle.kind === 'm2' || item.kind === 'business_audit')).sort((a, b) => a.cycleDate.localeCompare(b.cycleDate))[0]?.cycleDate ?? null;
  const allSessions = sessionResult.data as SessionRow[];
  const sessions = allSessions.filter((session) => Number(session.note_id) === cycle.noteId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id));
  const latestSession = sessions[0];
  const meetingIds = [...new Set([...attendance.data!.map((row) => Number(row.meeting_id)), ...sessions.map((session) => Number(session.meeting_id))])];
  const [meetingRows, actionRows, upcomingBusinessReview] = await Promise.all([
    meetingIds.length ? client.from('meetings').select('id,date,title,starts_at,meeting_timezone,ghl_status,meeting_type_id').in('id', meetingIds)
      .in('meeting_type_id', meetingTypes.data!.map((row) => row.id)) : Promise.resolve({ data: [], error: null }),
    client.from('coaching_note_action_steps').select('id,label,status,library_item_id').eq('coaching_note_id', cycle.noteId).order('id'),
    loadUpcomingBusinessReview(client, userId, cycles.cycles, cycle),
  ]);
  if (meetingRows.error) throw meetingRows.error;
  if (actionRows.error) throw actionRows.error;
  const actionIds = actionRows.data.map((row) => Number(row.id));
  const libraryItemIds = [...new Set(actionRows.data.filter((row) => row.library_item_id != null).map((row) => Number(row.library_item_id)))];
  const [pins, priorities, guides, notes, libraryItems] = await Promise.all([
    actionIds.length ? client.from('implementation_action_checklists').select('action_step_id,guide_revision,steps,progress').in('action_step_id', actionIds) : Promise.resolve({ data: [], error: null }),
    actionIds.length ? client.from('business_review_system_priorities').select('action_step_id,system_id,position').in('action_step_id', actionIds) : Promise.resolve({ data: [], error: null }),
    loadImplementationGuides(client),
    sessions.length ? client.from('implementation_step_notes').select('id,session_id,action_step_id,step_id,body,author_id,created_at').in('session_id', sessions.map((row) => row.id)).order('created_at') : Promise.resolve({ data: [], error: null }),
    libraryItemIds.length ? client.from('content_nodes').select('id,title,slug,node_type').in('id', libraryItemIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [pins, priorities, notes, libraryItems]) if (result.error) throw result.error;
  const systemIds = priorities.data!.map((row) => Number(row.system_id));
  const [systemRows, templates] = await Promise.all([
    systemIds.length ? client.from('system_scorecard_systems').select('id,key,template_key').in('id', systemIds) : Promise.resolve({ data: [], error: null }),
    client.from('system_scorecard_templates').select('key,audience'),
  ]);
  if (systemRows.error) throw systemRows.error;
  if (templates.error) throw templates.error;
  const withLibraryLink = (action: ImplementationAction): ImplementationAction => {
    const stored = actionRows.data.find((row) => Number(row.id) === action.actionStepId);
    const itemId = stored?.library_item_id == null ? null : Number(stored.library_item_id);
    const item = libraryItems.data!.find((row) => Number(row.id) === itemId);
    return { ...action, libraryItemId: itemId, libraryItemTitle: item?.title ?? null,
      libraryItemHref: item ? getContentNodeHref({ id: Number(item.id), slug: item.slug, node_type: item.node_type }) : null };
  };
  const buildActions = (preview: boolean): ImplementationAction[] => actionRows.data.map((row) => {
    const priority = priorities.data!.find((item) => Number(item.action_step_id) === Number(row.id));
    const system = systemRows.data.find((item) => Number(item.id) === Number(priority?.system_id));
    const audience = templates.data.find((item) => item.key === system?.template_key)?.audience as ImplementationGuideAudience | undefined;
    const guide = audience && system ? guides.get(`${audience}:${system.key}`) : null;
    const pin = pins.data!.find((item) => Number(item.action_step_id) === Number(row.id));
    return withLibraryLink({ actionStepId: Number(row.id), label: row.label, status: row.status as ActionStepStatus,
      priorityPosition: priority?.position ?? null, systemKey: system?.key ?? null, audience: audience ?? null,
      guideRevision: pin?.guide_revision ?? (preview && guide?.steps.length ? guide.revision : null),
      steps: (pin?.steps ?? (preview ? guide?.steps : null) ?? []) as ImplementationGuideStep[],
      progress: pin?.progress ?? {} });
  }).sort((a, b) => (a.priorityPosition ?? 999) - (b.priorityPosition ?? 999) || a.actionStepId - b.actionStepId);
  const actions = buildActions(true);
  const liveActions = buildActions(false);
  const mapSession = (row: SessionRow): ImplementationSession => ({
    id: row.id, noteId: Number(row.note_id), meetingId: Number(row.meeting_id), status: row.status, revision: row.revision,
    startedAt: row.started_at, updatedAt: row.updated_at, completedAt: row.completed_at, notes: row.notes,
    commitments: row.commitments, nextMeetingBooked: row.next_meeting_booked,
    actions: row.id === latestSession?.id && row.status === 'open' ? liveActions : row.progress_snapshot.map(withLibraryLink),
  });
  const meetings = meetingRows.data.filter((meeting) => {
    if (sessions.some((session) => Number(session.meeting_id) === Number(meeting.id))) return true;
    return !cycle.cancelled && !isCancelledGhlStatus(meeting.ghl_status)
      && !allSessions.some((session) => Number(session.meeting_id) === Number(meeting.id))
      && meeting.date >= cycle.cycleDate && (!cycleEndDate || meeting.date < cycleEndDate);
  }).map((row) => {
    const timezone = row.meeting_timezone || 'America/Edmonton';
    const today = implementationLocalDate(timezone);
    const session = sessions.find((item) => Number(item.meeting_id) === Number(row.id));
    return { id: Number(row.id), date: row.date, title: row.title, startsAt: row.starts_at, timezone,
      attended: attendance.data!.find((item) => Number(item.meeting_id) === Number(row.id))?.attended ?? false,
      cancelled: isCancelledGhlStatus(row.ghl_status), isToday: row.date === today, isFuture: row.date > today,
      session: session ? mapSession(session) : null };
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.startsAt ?? '').localeCompare(b.startsAt ?? '') || a.id - b.id);
  const resourceIds = [...new Set([...actions, ...sessions.flatMap((session) => session.progress_snapshot)]
    .flatMap((action) => action.steps.flatMap((step) => step.resources.map((source) => source.resourceId))))];
  const resources = resourceIds.length ? await client.from('resources').select('id,title,type').in('id', resourceIds) : { data: [], error: null };
  if (resources.error) throw resources.error;
  return { ...cycles, selectedNoteId: cycle.noteId, cycleEndDate, meetings, upcomingBusinessReview, bookingCoaches,
    suggestedMeetingId: selectImplementationMeeting(meetings, new Date(), latestSession?.id ?? null), latestSessionId: latestSession?.id ?? null, actions,
    stepNotes: notes.data!.map((row) => ({ id: row.id, sessionId: row.session_id, actionStepId: Number(row.action_step_id),
      stepId: row.step_id, body: row.body, authorId: row.author_id, createdAt: row.created_at })), resources: resources.data };
}
